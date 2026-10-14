/**
 * Upstream API pacing for the sync-data pipeline.
 *
 * The sync pipeline prefers doing normalization work between fetches so most
 * spacing comes from real CPU time rather than idle sleeps. When geocode,
 * routing, or upstream timestamps are already cached, those gaps shrink and
 * this module's minimum interval becomes the primary pacing guard. It only
 * adds a wait when the next request would arrive sooner than the documented
 * minimum (elapsed processing time counts toward that interval).
 *
 * data.gov.sg (official):
 * - Limits reset every 10 seconds.
 * - https://guide.data.gov.sg/developer-guide/api-overview/api-rate-limits
 *     Dataset Downloads: 2 / 10s (no key), 4 / 10s (dev key), 10 / 10s (prod key)
 *     v2 Realtime API:   6 / 10s (no key), 12 / 10s (dev key), 30 / 10s (prod key)
 * - Download guide also warns ~5 requests/minute without a key:
 *   https://guide.data.gov.sg/developer-guide/dataset-apis/download-dataset
 *
 * OneMap: docs only document HTTP 429 when limits are exceeded; no published
 * requests-per-second figure. Default ONEMAP_REQUEST_INTERVAL_MS=1000 unless set.
 * https://www.onemap.gov.sg/apidocs/search/
 */

export type DataGovApiTier = "anonymous" | "dev" | "prod";

export type UpstreamService =
  | "data-gov-dataset-download"
  | "data-gov-v2-realtime"
  | "onemap-search"
  | "onemap-routing";

const DATA_GOV_LIMITS_PER_10_SECONDS = {
  "data-gov-dataset-download": { anonymous: 2, dev: 4, prod: 10 },
  "data-gov-v2-realtime": { anonymous: 6, dev: 12, prod: 30 },
} as const;

/** Download-dataset guide: ~5 requests/minute without an API key. */
const DATA_GOV_ANONYMOUS_DOWNLOADS_PER_MINUTE = 5;

const lastRequestAt = new Map<UpstreamService, number>();

function resolveDataGovApiTier(): DataGovApiTier {
  if (!process.env.DATA_GOV_API_KEY) {
    return "anonymous";
  }
  const tier = process.env.DATA_GOV_API_KEY_TIER?.trim().toLowerCase();
  if (tier === "prod" || tier === "production") {
    return "prod";
  }
  return "dev";
}

function intervalFromPer10Seconds(maxCallsPer10Seconds: number): number {
  return Math.ceil(10_000 / maxCallsPer10Seconds);
}

export function upstreamIntervalMs(service: UpstreamService): number {
  if (service === "onemap-search" || service === "onemap-routing") {
    const raw = process.env.ONEMAP_REQUEST_INTERVAL_MS;
    const parsed = raw ? Number(raw) : 1000;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1000;
  }

  const tier = resolveDataGovApiTier();
  const per10s = DATA_GOV_LIMITS_PER_10_SECONDS[service][tier];
  const per10sInterval = intervalFromPer10Seconds(per10s);

  if (service === "data-gov-dataset-download" && tier === "anonymous") {
    const perMinuteInterval = Math.ceil(60_000 / DATA_GOV_ANONYMOUS_DOWNLOADS_PER_MINUTE);
    return Math.max(per10sInterval, perMinuteInterval);
  }

  return per10sInterval;
}

export function classifyUpstreamService(url: string): UpstreamService | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname.endsWith("data.gov.sg")) {
    if (parsed.pathname.includes("/collections/") || parsed.pathname.includes("/v2/public/api/")) {
      return "data-gov-v2-realtime";
    }
    return "data-gov-dataset-download";
  }

  if (parsed.hostname.endsWith("onemap.gov.sg")) {
    if (parsed.pathname.includes("/route")) {
      return "onemap-routing";
    }
    return "onemap-search";
  }

  return null;
}

export async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** The three kinds of OneMap request a run can be budgeted for. */
export type OneMapBudgetCategory = "auth" | "search" | "routing";

/** A request refused because the run's OneMap budget for that kind is spent. It carries no credentials. */
export class OneMapBudgetExhaustedError extends Error {
  constructor(readonly category: OneMapBudgetCategory) {
    super(`OneMap ${category} request budget exhausted for this run`);
    this.name = "OneMapBudgetExhaustedError";
  }
}

/** Anything that can admit or refuse one OneMap request; `acquire` throws `OneMapBudgetExhaustedError`. */
export type OneMapBudgetGate = { acquire(category: OneMapBudgetCategory): void };

let oneMapBudgetGate: OneMapBudgetGate | null = null;

/**
 * Every OneMap request passes `waitForUpstreamSlot`, so a gate installed here bounds a whole run, whichever helper
 * makes the request. Nothing is installed by default: `sync-data` keeps its existing behaviour.
 */
export function installOneMapRequestBudget(gate: OneMapBudgetGate | null): void {
  oneMapBudgetGate = gate;
}

export function oneMapBudgetCategory(service: UpstreamService, url?: string): OneMapBudgetCategory {
  if (service === "onemap-routing") return "routing";
  return url && new URL(url).pathname.startsWith("/api/auth/") ? "auth" : "search";
}

export async function waitForUpstreamSlot(service: UpstreamService, url?: string): Promise<void> {
  // The budget is checked before a pacing slot is reserved: a refused request neither waits nor delays others.
  if (oneMapBudgetGate && (service === "onemap-search" || service === "onemap-routing"))
    oneMapBudgetGate.acquire(oneMapBudgetCategory(service, url));
  const intervalMs = upstreamIntervalMs(service);
  const now = Date.now();
  const last = lastRequestAt.get(service) ?? 0;
  // Reserve the next slot before sleeping so concurrent workers cannot all
  // read the same `last` and burst past the documented rate limit.
  const nextAllowed = Math.max(now, last + intervalMs);
  lastRequestAt.set(service, nextAllowed);

  const waitMs = nextAllowed - now;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

export function resetUpstreamThrottleForTests(): void {
  lastRequestAt.clear();
  oneMapBudgetGate = null;
}
