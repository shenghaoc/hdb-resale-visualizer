import { parseSearchRequest, validateSearchRequest } from "../functions/_lib/search";
import { parseSuggestRequest } from "../functions/_lib/suggest";
import { manifestVersion, readPublicationState } from "../shared/publication-state";
/** Shared Cache API is per data center. The pointer intentionally bounds freshness to 60s. */
const POINTER_TTL_SECONDS = 60;
const DATA_TTL_SECONDS = 3600;
const PUBLIC_PATH =
  /^\/api\/(?:manifest|block-summaries|blocks\/[^/]+|details\/[^/]+|comparisons\/[^/]+|trends\/town-flat-type|mrt-stations|mrt-exits|search|suggest)\/?$/;

type SharedCache = {
  match: (request: Request) => Promise<Response | undefined>;
  put: (request: Request, response: Response) => Promise<void>;
};
type VersionDb = { prepare: (sql: string) => { first: () => Promise<{ json: string } | null> } };

function responseWithStatus(response: Response, status: string): Response {
  const result = new Response(response.body, response);
  result.headers.set("x-data-cache", status);
  if (status.startsWith("HIT"))
    result.headers.set("cache-control", "public, max-age=60, s-maxage=3600");
  // Computed while the tables may be half replaced, from no usable manifest, or after the cache layer itself
  // failed: nothing downstream, browsers included, should keep it either.
  else if (status.startsWith("BYPASS") || status === "ERROR")
    result.headers.set("cache-control", "no-store");
  return result;
}

/**
 * A degraded cache layer must be visible to operators, but must not flood the logs: each fixed message is
 * logged at most once per isolate per interval. Messages never carry request, header or user data.
 */
const WARN_INTERVAL_MS = 10 * 60 * 1000;
const lastWarned = new Map<string, number>();
function warnThrottled(message: string): void {
  const now = Date.now();
  const last = lastWarned.get(message);
  if (last !== undefined && now - last < WARN_INTERVAL_MS) return;
  lastWarned.set(message, now);
  console.warn(message);
}
export function resetPublicDataCacheWarningsForTests(): void {
  lastWarned.clear();
}

export async function withPublicDataCache(
  request: Request,
  db: VersionDb,
  cache: SharedCache | null,
  respond: (version?: string) => Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url);
  if (
    !cache ||
    request.method !== "GET" ||
    !PUBLIC_PATH.test(url.pathname) ||
    url.href.length > 2048 ||
    request.headers.has("authorization") ||
    request.headers.has("cookie")
  )
    return respond();
  const canonical = new URL(url);
  canonical.search = "";
  if (/\/search\/?$/.test(url.pathname)) {
    const parsed = parseSearchRequest(url);
    if (!parsed.ok || validateSearchRequest(parsed.request)) return respond();
    canonical.searchParams.set("request", JSON.stringify(parsed.request));
    if (parsed.request.remainingLeaseMin !== null)
      canonical.searchParams.set("year", String(new Date().getUTCFullYear()));
  } else if (/\/suggest\/?$/.test(url.pathname)) {
    const parsed = parseSuggestRequest(url);
    if (!parsed.ok) return respond();
    canonical.searchParams.set("q", parsed.normalizedQuery);
  }
  const pointerKey = new Request(`${url.origin}/__public-data-cache/v1/pointer`);
  const dataKey = (version: string) => {
    const key = new URL(canonical);
    key.pathname = `/__public-data-cache/v1/${version}${url.pathname}`;
    key.searchParams.sort(); // Stable sorting preserves the order of repeated parameters.
    return new Request(key);
  };
  let fetched: Response | undefined;
  try {
    // Both cache lookups precede EVERY D1 read, including version discovery.
    const pointer = await cache.match(pointerKey);
    if (pointer) {
      const version = await pointer.text();
      if (/^[a-f0-9]{64}$/.test(version)) {
        const hit = await cache.match(dataKey(version));
        if (hit) return responseWithStatus(hit, "HIT");
      }
    }
    const before = await db.prepare("SELECT json FROM manifest WHERE id = 1").first();
    if (!before) {
      // Nothing to label a generation with (no manifest has ever been published, or the row was lost), so what
      // the tables hold now cannot be stored or kept by anyone downstream.
      warnThrottled("public data cache: there is no stored manifest, so nothing is cached");
      fetched = await respond();
      return responseWithStatus(fetched, "BYPASS-NO-MANIFEST");
    }
    const publication = readPublicationState(before.json);
    if (publication.inProgress) {
      // The publisher is replacing the generated tables under a manifest that still describes the previous
      // generation, so nothing computed now may be labeled with a version. Store nothing, and keep serving the
      // previous generation for as long as it stays cached: it is still one consistent generation.
      const unreadable = publication.reason === "unreadable";
      warnThrottled(
        unreadable
          ? "public data cache: the stored manifest is not a JSON object, so nothing is cached from it"
          : "public data cache: a D1 publication is marked in progress, so nothing is cached until a sync-data run completes",
      );
      const previous = publication.baseVersion
        ? await cache.match(dataKey(publication.baseVersion))
        : undefined;
      if (previous) return responseWithStatus(previous, "HIT-STALE");
      fetched = await respond();
      return responseWithStatus(fetched, unreadable ? "BYPASS-UNREADABLE" : "BYPASS");
    }
    const version = await manifestVersion(before.json);
    // A stale pointer MISS must discover the CURRENT version before labeling new data.
    const currentHit = await cache.match(dataKey(version));
    const response = currentHit ?? (await respond(version));
    fetched = response;
    const after = currentHit
      ? before
      : await db.prepare("SELECT json FROM manifest WHERE id = 1").first();
    const cacheControl = response.headers.get("cache-control") ?? "";
    // A manifest that changed while the handler ran means a publication started or finished mid-request, so the
    // response may mix generations.
    const stable = before.json === after?.json;
    if (
      response.status === 200 &&
      !response.headers.has("set-cookie") &&
      /\bpublic\b/i.test(cacheControl) &&
      !/\b(?:private|no-store)\b/i.test(cacheControl) &&
      stable
    ) {
      if (!currentHit) {
        const stored = response.clone();
        stored.headers.set("cache-control", `public, max-age=${DATA_TTL_SECONDS}`);
        await cache.put(dataKey(version), stored);
      }
      await cache.put(
        pointerKey,
        new Response(version, {
          headers: { "cache-control": `public, max-age=${POINTER_TTL_SECONDS}` },
        }),
      );
    }
    return responseWithStatus(
      response,
      !stable ? "BYPASS-UNSTABLE" : currentHit ? "HIT-AFTER-VERSION-READ" : "MISS",
    );
  } catch (error) {
    // Cache failure cannot make data unavailable. Say that it happened (the error's name only: never requests,
    // headers or private state) and label the response, so it is not mistaken for exempt traffic.
    warnThrottled(
      `public data cache: falling back to the origin after ${error instanceof Error ? error.name : "an unknown error"}`,
    );
    return responseWithStatus(fetched ?? (await respond()), "ERROR");
  }
}
