/**
 * Per-run OneMap request budget for the manual Neon publisher (`scripts/sync-neon.ts`).
 *
 * OneMap geocoding and routing are optional enrichments of a refresh, not part of reading the official datasets.
 * A run makes OneMap requests only when the operator gives it an explicit, bounded budget; the default is zero,
 * so a run without budgets (and every run without OneMap credentials) makes no OneMap request at all.
 *
 * Two layers hold the bound:
 * - the budget is installed at `waitForUpstreamSlot`, which every OneMap request passes (search, token and
 *   routing), so no helper can exceed it, and
 * - callers allocate work from what remains before starting, so work beyond the budget is deferred and reported
 *   rather than attempted and refused.
 *
 * A request counts once. The shared fetch helper may retry the same request on HTTP 429 or 5xx (at most six
 * attempts); those retries are not separate budget units.
 */
import type { GeocodeCacheFile } from "../pipeline";
import { searchOneMapAddress } from "./geocode";
import {
  OneMapBudgetExhaustedError,
  installOneMapRequestBudget,
  type OneMapBudgetCategory,
  type OneMapBudgetGate,
} from "./rate-limits";
import { resolveOneMapToken, routeMissingPairs } from "./routing";

export { OneMapBudgetExhaustedError };

/**
 * Hard ceiling on all OneMap requests one run may be budgeted (search + routing + the single token request).
 * At the default pacing of one OneMap request per second this is about ten minutes, half the run's deadline.
 */
export const MAX_ONEMAP_REQUESTS_PER_RUN = 600;

export type OneMapBudgetLimits = { search: number; routing: number };

export class OneMapRequestBudget implements OneMapBudgetGate {
  readonly limits: Readonly<Record<OneMapBudgetCategory, number>>;
  readonly used: Record<OneMapBudgetCategory, number> = { auth: 0, search: 0, routing: 0 };
  readonly refused: Record<OneMapBudgetCategory, number> = { auth: 0, search: 0, routing: 0 };

  constructor(readonly requested: Readonly<OneMapBudgetLimits>) {
    const limits = requested;
    for (const [name, value] of Object.entries(limits))
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`Invalid OneMap ${name} budget; expected a whole number of requests`);
    // One token request at most, and only when some OneMap work is budgeted at all.
    const auth = limits.search + limits.routing > 0 ? 1 : 0;
    if (limits.search + limits.routing + auth > MAX_ONEMAP_REQUESTS_PER_RUN)
      throw new Error(
        `OneMap budgets exceed the per-run maximum of ${MAX_ONEMAP_REQUESTS_PER_RUN} requests`,
      );
    this.limits = { auth, search: limits.search, routing: limits.routing };
  }

  remaining(category: OneMapBudgetCategory): number {
    return this.limits[category] - this.used[category];
  }

  acquire(category: OneMapBudgetCategory, count = 1): void {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid OneMap request count");
    if (this.used[category] + count > this.limits[category]) {
      this.refused[category] += count;
      throw new OneMapBudgetExhaustedError(category);
    }
    this.used[category] += count;
  }

  report() {
    return {
      limits: { ...this.limits },
      used: { ...this.used },
      refused: { ...this.refused },
      maxRequestsPerRun: MAX_ONEMAP_REQUESTS_PER_RUN,
    };
  }
}

/** `undefined` is the default budget, zero; anything else must be a plain whole number. */
export function parseOneMapBudget(value: string | undefined, flag: string): number {
  if (value === undefined) return 0;
  if (!/^\d{1,4}$/.test(value)) throw new Error(`${flag} must be a whole number of requests`);
  return Number(value);
}

export type OneMapCredentialMode = "token" | "email-password" | "none";

export function oneMapCredentialMode(env: NodeJS.ProcessEnv): OneMapCredentialMode {
  if (env.ONEMAP_TOKEN?.trim()) return "token";
  if (env.ONEMAP_EMAIL && env.ONEMAP_PASSWORD) return "email-password";
  return "none";
}

/**
 * - `not-configured`: no OneMap credentials; nothing is requested (the supported default today).
 * - `not-requested`: credentials exist but no OneMap work is budgeted, so no token is requested either.
 * - `resolved`: a token is available for the budgeted requests.
 * - `unavailable`: a token was requested and could not be obtained.
 */
export type OneMapTokenStatus = "not-configured" | "not-requested" | "resolved" | "unavailable";

/** Why an address was not looked up, or what happened when it was. Every candidate lands in exactly one count. */
export type OneMapLookupStats = {
  candidates: number;
  attempted: number;
  resolved: number;
  noResult: number;
  failed: number;
  deferredByBudget: number;
  notAttemptedWithoutToken: number;
};

export type OneMapRoutingStats = {
  /** Uncached block → exit pairs offered for routing (only counted when a token is available). */
  missingPairs: number;
  attempted: number;
  routed: number;
  failed: number;
  deferredByBudget: number;
};

const emptyLookupStats = (): OneMapLookupStats => ({
  candidates: 0,
  attempted: 0,
  resolved: 0,
  noResult: 0,
  failed: 0,
  deferredByBudget: 0,
  notAttemptedWithoutToken: 0,
});

export type OneMapRunDependencies = {
  resolveToken?: typeof resolveOneMapToken;
  search?: typeof searchOneMapAddress;
  routeMissingPairs?: typeof routeMissingPairs;
};

type GeocodeEntry = GeocodeCacheFile["entries"][string];

/**
 * One run's OneMap access. The run allocates its budget before each piece of work (`budget`), and an independent
 * ceiling with the same limits is installed at the request choke point (`requestsSent`): it records every request
 * that actually reaches the network layer and refuses any beyond the limits, whichever helper sends it.
 */
export class OneMapRun {
  readonly blockGeocoding = emptyLookupStats();
  readonly amenityGeocoding = emptyLookupStats();
  readonly routing: OneMapRoutingStats = {
    missingPairs: 0,
    attempted: 0,
    routed: 0,
    failed: 0,
    deferredByBudget: 0,
  };
  private closed = false;

  private constructor(
    readonly budget: OneMapRequestBudget,
    readonly ceiling: OneMapRequestBudget,
    readonly credentialMode: OneMapCredentialMode,
    readonly tokenStatus: OneMapTokenStatus,
    private readonly token: string | null,
    private readonly deps: Required<OneMapRunDependencies>,
  ) {}

  static async start(
    options: { budget: OneMapRequestBudget; env: NodeJS.ProcessEnv; tokenEndpoint: URL },
    deps: OneMapRunDependencies = {},
  ): Promise<OneMapRun> {
    const resolved: Required<OneMapRunDependencies> = {
      resolveToken: deps.resolveToken ?? resolveOneMapToken,
      search: deps.search ?? searchOneMapAddress,
      routeMissingPairs: deps.routeMissingPairs ?? routeMissingPairs,
    };
    const { budget } = options;
    const ceiling = new OneMapRequestBudget(budget.requested);
    installOneMapRequestBudget(ceiling);
    const credentialMode = oneMapCredentialMode(options.env);
    const anyBudget = budget.limits.search + budget.limits.routing > 0;
    let token: string | null = null;
    let tokenStatus: OneMapTokenStatus = "not-configured";
    if (credentialMode !== "none" && !anyBudget) tokenStatus = "not-requested";
    else if (credentialMode !== "none") {
      // A configured token is used as is; email and password cost the run's single token request.
      if (credentialMode === "email-password") budget.acquire("auth");
      try {
        token = await resolved.resolveToken({
          email: options.env.ONEMAP_EMAIL,
          password: options.env.ONEMAP_PASSWORD,
          token: options.env.ONEMAP_TOKEN,
          tokenEndpoint: options.tokenEndpoint,
        });
      } catch {
        token = null;
      }
      tokenStatus = token ? "resolved" : "unavailable";
    }
    return new OneMapRun(budget, ceiling, credentialMode, tokenStatus, token, resolved);
  }

  /** The token for this run's budgeted requests, or `null` when no OneMap request may be made. */
  get routingToken(): string | null {
    return this.token;
  }

  private notAttempted(stats: OneMapLookupStats, count: number) {
    if (this.tokenStatus === "not-requested") stats.deferredByBudget += count;
    else stats.notAttemptedWithoutToken += count;
  }

  /**
   * Splits block addresses without a cached geocode into those this run will look up and those it will not, and
   * allocates the search budget for the former. Nothing outside `attempt` is requested; the rest stay unresolved
   * and are counted, never given coordinates.
   */
  allocateBlockGeocoding<T>(missing: readonly T[]): { attempt: T[] } {
    const stats = this.blockGeocoding;
    stats.candidates += missing.length;
    if (!this.token) {
      this.notAttempted(stats, missing.length);
      return { attempt: [] };
    }
    const allowed = Math.min(missing.length, Math.max(0, this.budget.remaining("search")));
    this.budget.acquire("search", allowed);
    stats.deferredByBudget += missing.length - allowed;
    return { attempt: missing.slice(0, allowed) };
  }

  /** Lookup for the allocated block addresses: errors propagate so the caller counts them as failures. */
  readonly geocodeBlockAddress = (searchValue: string, endpoint: URL) =>
    this.lookup(this.blockGeocoding, searchValue, endpoint);

  /**
   * Lookup for amenity rows, which are only known one row at a time: each call allocates one search request from
   * what remains, or returns `null` without a request (the amenity is skipped and counted).
   */
  readonly geocodeAmenityAddress = async (searchValue: string, endpoint: URL) => {
    const stats = this.amenityGeocoding;
    stats.candidates += 1;
    if (!this.token) {
      this.notAttempted(stats, 1);
      return null;
    }
    if (this.budget.remaining("search") <= 0) {
      stats.deferredByBudget += 1;
      return null;
    }
    this.budget.acquire("search");
    return this.lookup(stats, searchValue, endpoint);
  };

  private async lookup(
    stats: OneMapLookupStats,
    searchValue: string,
    endpoint: URL,
  ): Promise<GeocodeEntry | null> {
    if (!this.token) throw new Error("OneMap lookup without an allocated token");
    stats.attempted += 1;
    try {
      const result = await this.deps.search(searchValue, endpoint, this.token);
      if (result) stats.resolved += 1;
      else stats.noResult += 1;
      return result;
    } catch (error) {
      if (error instanceof OneMapBudgetExhaustedError) {
        // Refused by the ceiling before any request was sent: deferred, not failed.
        stats.attempted -= 1;
        stats.deferredByBudget += 1;
      } else stats.failed += 1;
      throw error;
    }
  }

  /**
   * Drop-in for `routeMissingPairs`: allocates at most what remains of the routing budget and defers the rest. An
   * empty routing cache therefore costs the budget, never one request per block and exit.
   */
  readonly routeMissingPairs: typeof routeMissingPairs = async (options, deps) => {
    const missing = options.pairs.filter((pair) => options.cache.entries[pair.key] === undefined);
    const allowed = Math.min(missing.length, Math.max(0, this.budget.remaining("routing")));
    this.budget.acquire("routing", allowed);
    this.routing.missingPairs += missing.length;
    this.routing.deferredByBudget += missing.length - allowed;
    this.routing.attempted += allowed;
    const result = await this.deps.routeMissingPairs(
      { ...options, pairs: missing.slice(0, allowed) },
      deps,
    );
    this.routing.routed += result.routedCount;
    this.routing.failed += result.failedCount;
    return result;
  };

  report() {
    return {
      credentialMode: this.credentialMode,
      tokenStatus: this.tokenStatus,
      budget: this.budget.report(),
      /** Requests that reached the shared network layer, as recorded by the ceiling. */
      requestsSent: { used: { ...this.ceiling.used }, refused: { ...this.ceiling.refused } },
      blockGeocoding: { ...this.blockGeocoding },
      amenityGeocoding: { ...this.amenityGeocoding },
      routing: { ...this.routing },
    };
  }

  /** Removes the run's ceiling from the request choke point. Idempotent. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    installOneMapRequestBudget(null);
  }
}
