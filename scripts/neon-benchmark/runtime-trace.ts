/** Minimized public request telemetry. Never returns headers, bodies or client identity. */
import { parseSearchRequest, validateSearchRequest } from "../../functions/_lib/search";
import { parseSuggestRequest } from "../../functions/_lib/suggest";
import { canonicalFlatType } from "../../shared/filter-options";

export type PublicTraceAllowlist = {
  addresses: ReadonlySet<string>;
  townSlugs: ReadonlySet<string>;
  towns: ReadonlySet<string>;
  flatTypes: ReadonlySet<string>;
  flatModels: ReadonlySet<string>;
  suggestionQueries: ReadonlySet<string>;
};
export type ReplayEvent = { path: string; query: string; offsetMs: number; pop?: string };
const PUBLIC_FIXED = new Set([
  "/api/manifest",
  "/api/block-summaries",
  "/api/trends/town-flat-type",
  "/api/mrt-stations",
  "/api/mrt-exits",
  "/api/search",
  "/api/suggest",
]);
function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
export function minimizePublicTailEvent(
  raw: unknown,
  allow: PublicTraceAllowlist,
  startMs: number,
): { ok: true; event: ReplayEvent } | { ok: false; reason: string } {
  const root = object(raw),
    event = object(root?.event),
    request = object(event?.request);
  if (!request || request.method !== "GET") return { ok: false, reason: "non-public-get" };
  const headers = object(request.headers);
  if (!headers) return { ok: false, reason: "unknown-header-eligibility" };
  if (Object.keys(headers).some((name) => ["cookie", "authorization"].includes(name.toLowerCase())))
    return { ok: false, reason: "cookie-or-authorization" };
  if (typeof request.url !== "string" || request.url.length > 2048)
    return { ok: false, reason: "invalid-url" };
  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return { ok: false, reason: "invalid-url" };
  }
  if (url.protocol !== "https:" || url.username || url.password)
    return { ok: false, reason: "invalid-origin" };
  const path = url.pathname.replace(/\/$/, "");
  const dynamic = /^\/api\/(blocks|details|comparisons)\/([^/]+)$/.exec(path);
  if (
    !PUBLIC_FIXED.has(path) &&
    !(
      dynamic &&
      (dynamic[1] === "blocks"
        ? allow.townSlugs.has(dynamic[2].replace(/\.json$/, ""))
        : allow.addresses.has(dynamic[2].replace(/\.json$/, "")))
    )
  )
    return { ok: false, reason: "private-or-unapproved-path" };
  const params = new URLSearchParams();
  if (path === "/api/suggest") {
    const parsed = parseSuggestRequest(url);
    if (!parsed.ok || !allow.suggestionQueries.has(parsed.normalizedQuery))
      return { ok: false, reason: "unapproved-suggestion-query" };
    params.set("q", parsed.normalizedQuery);
  } else if (path === "/api/search") {
    const parsed = parseSearchRequest(url);
    if (!parsed.ok || validateSearchRequest(parsed.request))
      return { ok: false, reason: "invalid-search" };
    const r = parsed.request;
    if (
      (r.town && !allow.towns.has(r.town.toUpperCase())) ||
      (r.flatType && !allow.flatTypes.has(canonicalFlatType(r.flatType))) ||
      (r.flatModel && !allow.flatModels.has(r.flatModel.toUpperCase()))
    )
      return { ok: false, reason: "unapproved-search-value" };
    if (
      (r.budgetMin ?? 0) > 100_000_000 ||
      (r.budgetMax ?? 0) > 100_000_000 ||
      (r.areaMin ?? 0) > 1000 ||
      (r.areaMax ?? 0) > 1000
    )
      return { ok: false, reason: "unapproved-search-range" };
    // Use the same normalized request as the existing cache key; retain no ignored parameters.
    for (const [key, value] of Object.entries(r))
      if (value !== null && value !== "") params.set(key, String(value));
  }
  const timestamp = root?.eventTimestamp;
  if (
    typeof timestamp !== "number" ||
    !Number.isSafeInteger(timestamp) ||
    timestamp < startMs ||
    timestamp > startMs + 3_600_000
  )
    return { ok: false, reason: "invalid-or-outside-timestamp" };
  params.sort();
  const cf = object(request.cf);
  const pop = typeof cf?.colo === "string" && /^[A-Z]{3}$/.test(cf.colo) ? cf.colo : undefined;
  return {
    ok: true,
    event: {
      path: url.pathname,
      query: params.toString(),
      offsetMs: timestamp - startMs,
      ...(pop ? { pop } : {}),
    },
  };
}

export type TraceGroup = {
  path: string;
  query: string;
  pop?: string;
  buckets: { offsetSecond: number; count: number }[];
};
export class PublicTraceCollector {
  readonly groups: TraceGroup[] = [];
  readonly rejected: Record<string, number> = {};
  eligible = 0;
  stopReason: string | null = null;
  constructor(
    readonly allow: PublicTraceAllowlist,
    readonly startMs: number,
    readonly limits = { maximumEligible: 500, maximumBytes: 1_048_576, maximumMs: 3_600_000 },
  ) {}
  snapshot() {
    return {
      eligible: this.eligible,
      groups: this.groups,
      rejected: this.rejected,
      cadencePrecisionMs: 1000,
      stopReason: this.stopReason,
    };
  }
  accept(raw: unknown, elapsedMs: number): boolean {
    if (this.stopReason) return false;
    if (elapsedMs >= this.limits.maximumMs) {
      this.stopReason = "time-limit";
      return false;
    }
    const result = minimizePublicTailEvent(raw, this.allow, this.startMs);
    if (!result.ok) {
      this.rejected[result.reason] = (this.rejected[result.reason] ?? 0) + 1;
      return false;
    }
    const { offsetMs, ...key } = result.event;
    let group = this.groups.find(
      (g) => g.path === key.path && g.query === key.query && g.pop === key.pop,
    );
    if (!group) {
      group = { ...key, buckets: [] };
      this.groups.push(group);
    }
    const second = Math.floor(offsetMs / 1000);
    let bucket = group.buckets.find((b) => b.offsetSecond === second);
    if (!bucket) {
      bucket = { offsetSecond: second, count: 0 };
      group.buckets.push(bucket);
    }
    bucket.count++;
    this.eligible++;
    // Reserve 1 KiB for final stop/metadata. Never persist a candidate above the byte ceiling.
    if (
      new TextEncoder().encode(JSON.stringify(this.snapshot())).length + 1024 >
      this.limits.maximumBytes
    ) {
      bucket.count--;
      this.eligible--;
      if (!bucket.count) group.buckets.splice(group.buckets.indexOf(bucket), 1);
      if (!group.buckets.length) this.groups.splice(this.groups.indexOf(group), 1);
      this.stopReason = "output-byte-limit";
      return false;
    }
    if (this.eligible >= this.limits.maximumEligible) this.stopReason = "eligible-limit";
    return true;
  }
}
