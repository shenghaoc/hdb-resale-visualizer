import { PilotHttpError } from "./evidence";

/**
 * SQL-free readiness settle for a just-deployed isolated Worker.
 *
 * A freshly enabled workers.dev route can answer from the platform edge (HTML 404) before the Worker
 * is routable. Two earlier pilots sent their first request 42-43 ms after Wrangler's subdomain POST
 * returned and both received the same platform page; a later probe that waited several seconds was
 * served. Retry exactly that signature, inside the caller's planned readiness reservation. Anything
 * else (Worker JSON/plain 404, 403, 409, redirects, transport failures) stops immediately.
 */
export const ROUTING_SETTLE_WINDOW_MS = 28_000;
export const ROUTING_SETTLE_INTERVAL_MS = 1_000;

export type RoutingSettleClock = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};
export type RoutingSettleResult<T> = {
  result: T;
  /** Platform HTML 404 responses observed before the Worker answered. */
  platformNotFoundAttempts: number;
  platformNotFoundSHA256: (string | null)[];
  waitedMs: number;
};

/** The platform page is HTML. Every Worker-originated 404 in the pilot control plane is JSON/text. */
export function isPlatformRouteNotFound(error: unknown): boolean {
  return (
    error instanceof PilotHttpError &&
    error.receipt.status === 404 &&
    error.receipt.contentType === "text/html"
  );
}

export async function settleRouting<T>(
  attempt: () => Promise<T>,
  clock: RoutingSettleClock,
  windowMs: number = ROUTING_SETTLE_WINDOW_MS,
  intervalMs: number = ROUTING_SETTLE_INTERVAL_MS,
): Promise<RoutingSettleResult<T>> {
  const started = clock.now();
  const maximumAttempts = Math.floor(windowMs / intervalMs) + 1;
  const platformNotFoundSHA256: (string | null)[] = [];
  for (;;) {
    try {
      const result = await attempt();
      return {
        result,
        platformNotFoundAttempts: platformNotFoundSHA256.length,
        platformNotFoundSHA256,
        waitedMs: clock.now() - started,
      };
    } catch (error) {
      if (!isPlatformRouteNotFound(error)) throw error;
      platformNotFoundSHA256.push((error as PilotHttpError).receipt.responseSHA256);
      // Never sleep past the reserved window, and never loop on a clock that fails to advance.
      const exhausted = platformNotFoundSHA256.length >= maximumAttempts;
      if (exhausted || clock.now() - started + intervalMs > windowMs) throw error;
      await clock.sleep(intervalMs);
    }
  }
}
