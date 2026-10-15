/**
 * Per-run OneMap HTTP attempt budget for the manual Neon publisher (`scripts/sync-neon.ts`).
 *
 * OneMap geocoding and routing are optional enrichments of a refresh, not part of reading the official datasets.
 * A run makes OneMap requests only when the operator gives it an explicit, bounded budget; the default is zero,
 * so a run without budgets (and every run without OneMap credentials) sends no OneMap request at all.
 *
 * The budget counts physical HTTP attempts, retries included. It is installed at `waitForUpstreamSlot`, which runs
 * immediately before every OneMap attempt (`fetchWithRetry`'s `beforeAttempt` for search, token and routing), so
 * an exhausted budget prevents the attempt itself and ends that request's retries. Callers also allocate work from
 * what remains before starting it, so work the budget cannot cover is deferred and reported instead of started.
 */
import type { GeocodeCacheFile } from "../pipeline";
import { searchOneMapAddress } from "./geocode";
import {
  OneMapBudgetExhaustedError,
  installOneMapRequestBudget,
  type OneMapBudgetCategory,
  type OneMapBudgetGate,
} from "./rate-limits";
import { fetchWalkingRoute, resolveOneMapToken, routeMissingPairs } from "./routing";

export { OneMapBudgetExhaustedError };

/**
 * Hard ceiling on the OneMap HTTP attempts one run may be budgeted: search + routing + the single token attempt,
 * retries included. At the default pacing of one OneMap attempt per second this is about ten minutes, half the
 * run's deadline.
 */
export const MAX_ONEMAP_HTTP_ATTEMPTS_PER_RUN = 600;

export type OneMapBudgetLimits = { search: number; routing: number };

/** Physical OneMap HTTP attempts admitted (`used`) and refused before sending (`refused`), per kind. */
export class OneMapRequestBudget implements OneMapBudgetGate {
  readonly limits: Readonly<Record<OneMapBudgetCategory, number>>;
  readonly used: Record<OneMapBudgetCategory, number> = { auth: 0, search: 0, routing: 0 };
  readonly refused: Record<OneMapBudgetCategory, number> = { auth: 0, search: 0, routing: 0 };

  constructor(readonly requested: Readonly<OneMapBudgetLimits>) {
    for (const [name, value] of Object.entries(requested))
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error(`Invalid OneMap ${name} budget; expected a whole number of HTTP attempts`);
    // One token attempt at most (no retry), and only when some OneMap work is budgeted at all.
    const auth = requested.search + requested.routing > 0 ? 1 : 0;
    if (requested.search + requested.routing + auth > MAX_ONEMAP_HTTP_ATTEMPTS_PER_RUN)
      throw new Error(
        `OneMap budgets exceed the per-run maximum of ${MAX_ONEMAP_HTTP_ATTEMPTS_PER_RUN} HTTP attempts`,
      );
    this.limits = { auth, search: requested.search, routing: requested.routing };
  }

  remaining(category: OneMapBudgetCategory): number {
    return this.limits[category] - this.used[category];
  }

  /** Admits one HTTP attempt, or refuses it (it must then not be sent). */
  acquire(category: OneMapBudgetCategory): void {
    if (this.used[category] >= this.limits[category]) {
      this.refused[category] += 1;
      throw new OneMapBudgetExhaustedError(category);
    }
    this.used[category] += 1;
  }
}

/** `undefined` is the default budget, zero; anything else must be a plain whole number. */
export function parseOneMapBudget(value: string | undefined, flag: string): number {
  if (value === undefined) return 0;
  if (!/^\d{1,4}$/.test(value)) throw new Error(`${flag} must be a whole number of HTTP attempts`);
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
 * - `resolved`: a token is available for the budgeted attempts.
 * - `unavailable`: a token was requested and could not be obtained (its single attempt is not retried).
 */
export type OneMapTokenStatus = "not-configured" | "not-requested" | "resolved" | "unavailable";

/**
 * Logical lookups for one purpose. Every candidate lands in exactly one of `deferredByBudget`,
 * `notAttemptedWithoutToken` or `started`, and every started lookup in exactly one outcome: `resolved`,
 * `noResult` (both successful operations), `failed` (HTTP or provider failure after its attempts) or
 * `refusedByBudget` (an attempt, first or retry, was refused and the lookup stopped).
 */
export type OneMapLookupStats = {
  candidates: number;
  deferredByBudget: number;
  notAttemptedWithoutToken: number;
  started: number;
  resolved: number;
  noResult: number;
  failed: number;
  refusedByBudget: number;
};

/** Logical routes, partitioned as for lookups; `routed` is the successful outcome. */
export type OneMapRoutingStats = {
  /** Uncached block → exit pairs offered for routing (only counted when a token is available). */
  missingPairs: number;
  deferredByBudget: number;
  started: number;
  routed: number;
  failed: number;
  refusedByBudget: number;
};

const emptyLookupStats = (): OneMapLookupStats => ({
  candidates: 0,
  deferredByBudget: 0,
  notAttemptedWithoutToken: 0,
  started: 0,
  resolved: 0,
  noResult: 0,
  failed: 0,
  refusedByBudget: 0,
});

export type OneMapRunDependencies = {
  resolveToken?: typeof resolveOneMapToken;
  search?: typeof searchOneMapAddress;
  routeMissingPairs?: typeof routeMissingPairs;
  fetchWalkingRoute?: typeof fetchWalkingRoute;
};

type GeocodeEntry = GeocodeCacheFile["entries"][string];

/** One run's OneMap access: its attempt budget (installed at the choke point), its token and per-purpose counts. */
export class OneMapRun {
  readonly blockGeocoding = emptyLookupStats();
  readonly amenityGeocoding = emptyLookupStats();
  readonly routing: OneMapRoutingStats = {
    missingPairs: 0,
    deferredByBudget: 0,
    started: 0,
    routed: 0,
    failed: 0,
    refusedByBudget: 0,
  };
  private closed = false;

  private constructor(
    readonly budget: OneMapRequestBudget,
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
      fetchWalkingRoute: deps.fetchWalkingRoute ?? fetchWalkingRoute,
    };
    const { budget } = options;
    installOneMapRequestBudget(budget);
    const credentialMode = oneMapCredentialMode(options.env);
    const anyBudget = budget.limits.search + budget.limits.routing > 0;
    let token: string | null = null;
    let tokenStatus: OneMapTokenStatus = "not-configured";
    if (credentialMode !== "none" && !anyBudget) tokenStatus = "not-requested";
    else if (credentialMode !== "none") {
      // A configured token is used as is (no request); email and password cost the run's one token attempt.
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
    return new OneMapRun(budget, credentialMode, tokenStatus, token, resolved);
  }

  /** The token for this run's budgeted attempts, or `null` when no OneMap request may be made. */
  get routingToken(): string | null {
    return this.token;
  }

  private notAttempted(stats: OneMapLookupStats, count: number) {
    if (this.tokenStatus === "not-requested") stats.deferredByBudget += count;
    else stats.notAttemptedWithoutToken += count;
  }

  /**
   * Splits block addresses without a cached geocode into those this run starts and those it does not: at most one
   * per remaining search attempt. Retries can spend more, in which case later lookups are refused and counted.
   * Nothing outside `attempt` is requested; the rest stay unresolved and are counted, never given coordinates.
   */
  allocateBlockGeocoding<T>(missing: readonly T[]): { attempt: T[] } {
    const stats = this.blockGeocoding;
    stats.candidates += missing.length;
    if (!this.token) {
      this.notAttempted(stats, missing.length);
      return { attempt: [] };
    }
    const allowed = Math.min(missing.length, Math.max(0, this.budget.remaining("search")));
    stats.deferredByBudget += missing.length - allowed;
    return { attempt: missing.slice(0, allowed) };
  }

  /** Lookup for the allocated block addresses: errors propagate so the caller counts them as failures. */
  readonly geocodeBlockAddress = (searchValue: string, endpoint: URL) =>
    this.lookup(this.blockGeocoding, searchValue, endpoint);

  /**
   * Lookup for amenity rows, which are only known one row at a time: a row is started only while a search attempt
   * remains; otherwise it returns `null` without a request (the amenity is skipped and counted).
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
    return this.lookup(stats, searchValue, endpoint);
  };

  private async lookup(
    stats: OneMapLookupStats,
    searchValue: string,
    endpoint: URL,
  ): Promise<GeocodeEntry | null> {
    if (!this.token) throw new Error("OneMap lookup without an allocated token");
    stats.started += 1;
    try {
      const result = await this.deps.search(searchValue, endpoint, this.token);
      if (result) stats.resolved += 1;
      else stats.noResult += 1;
      return result;
    } catch (error) {
      if (error instanceof OneMapBudgetExhaustedError) stats.refusedByBudget += 1;
      else stats.failed += 1;
      throw error;
    }
  }

  /**
   * Drop-in for `routeMissingPairs`: starts at most one route per remaining routing attempt and defers the rest.
   * An empty routing cache therefore costs the budget, never one request per block and exit.
   */
  readonly routeMissingPairs: typeof routeMissingPairs = async (options, deps) => {
    const missing = options.pairs.filter((pair) => options.cache.entries[pair.key] === undefined);
    const allowed = Math.min(missing.length, Math.max(0, this.budget.remaining("routing")));
    this.routing.missingPairs += missing.length;
    this.routing.deferredByBudget += missing.length - allowed;
    this.routing.started += allowed;
    const route = deps?.fetchWalkingRouteFn ?? this.deps.fetchWalkingRoute;
    let refused = 0;
    const result = await this.deps.routeMissingPairs(
      { ...options, pairs: missing.slice(0, allowed) },
      {
        // routeMissingPairs counts every thrown route as failed; budget refusals are told apart here.
        fetchWalkingRouteFn: async (...args) => {
          try {
            return await route(...args);
          } catch (error) {
            if (error instanceof OneMapBudgetExhaustedError) refused += 1;
            throw error;
          }
        },
      },
    );
    this.routing.routed += result.routedCount;
    this.routing.refusedByBudget += refused;
    this.routing.failed += result.failedCount - refused;
    return result;
  };

  report() {
    const searches = [this.blockGeocoding, this.amenityGeocoding];
    return {
      credentialMode: this.credentialMode,
      tokenStatus: this.tokenStatus,
      limits: { ...this.budget.limits },
      maxHttpAttemptsPerRun: MAX_ONEMAP_HTTP_ATTEMPTS_PER_RUN,
      /** Physical HTTP attempts sent, retries included. */
      httpAttempts: { ...this.budget.used },
      /** Attempts refused before sending because the budget was spent. */
      budgetRefusals: { ...this.budget.refused },
      /** Logical operations that completed: a token obtained by request, lookups answered, routes found. */
      successfulOperations: {
        auth: this.credentialMode === "email-password" && this.token ? 1 : 0,
        search: searches.reduce((sum, stats) => sum + stats.resolved + stats.noResult, 0),
        routing: this.routing.routed,
      },
      blockGeocoding: { ...this.blockGeocoding },
      amenityGeocoding: { ...this.amenityGeocoding },
      routing: { ...this.routing },
    };
  }

  /** Removes the run's budget from the request choke point. Idempotent. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    installOneMapRequestBudget(null);
  }
}

/** The receipt shape before any OneMap work started (for runs that stop earlier). */
export function oneMapNotStarted(budget: OneMapRequestBudget) {
  return {
    started: false,
    limits: { ...budget.limits },
    maxHttpAttemptsPerRun: MAX_ONEMAP_HTTP_ATTEMPTS_PER_RUN,
    httpAttempts: { ...budget.used },
    budgetRefusals: { ...budget.refused },
  };
}
