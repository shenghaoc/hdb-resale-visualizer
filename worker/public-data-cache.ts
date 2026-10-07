import { parseSearchRequest, validateSearchRequest } from "../functions/_lib/search";
import { parseSuggestRequest } from "../functions/_lib/suggest";
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

async function versionOf(json: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function responseWithStatus(response: Response, status: string): Response {
  const result = new Response(response.body, response);
  result.headers.set("x-data-cache", status);
  if (status.startsWith("HIT"))
    result.headers.set("cache-control", "public, max-age=60, s-maxage=3600");
  return result;
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
    if (!before) return respond();
    const version = await versionOf(before.json);
    // A stale pointer MISS must discover the CURRENT version before labeling new data.
    const currentHit = await cache.match(dataKey(version));
    const response = currentHit ?? (await respond(version));
    fetched = response;
    const after = currentHit
      ? before
      : await db.prepare("SELECT json FROM manifest WHERE id = 1").first();
    const cacheControl = response.headers.get("cache-control") ?? "";
    if (
      response.status === 200 &&
      !response.headers.has("set-cookie") &&
      /\bpublic\b/i.test(cacheControl) &&
      !/\b(?:private|no-store)\b/i.test(cacheControl) &&
      before.json === after?.json
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
    return responseWithStatus(response, currentHit ? "HIT-AFTER-VERSION-READ" : "MISS");
  } catch {
    // Cache failure cannot make data unavailable; do not log requests, headers or private state.
    return fetched ?? respond();
  }
}
