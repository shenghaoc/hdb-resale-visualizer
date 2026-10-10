import { privateJsonResponse } from "./d1";
import {
  HYPERDRIVE_FREE_DAILY_STATEMENTS,
  NEARBY_DAILY_STATEMENT_CEILING,
  NEARBY_RATE_LIMIT_PERIOD_SEC,
  NEARBY_STATEMENTS_PER_MISS,
} from "../../shared/nearby-limits";

/** The slice of `D1Database` this module uses, so a test can put SQLite behind it. */
export type NearbyBudgetDatabase = {
  prepare(sql: string): {
    bind(...values: unknown[]): { run(): Promise<{ meta?: { changes?: number } }> };
  };
};

/** How long the counter may take before the request is refused instead of waiting on it. */
const RESERVE_TIMEOUT_MS = 2_000;

/**
 * Takes `?2` statements from the day's allowance `?3` in ONE atomic statement and reports through the number of
 * rows changed: 1 = granted (the day's row was created or incremented), 0 = refused because it would pass the
 * ceiling. D1 serialises writes, so concurrent Workers in every location draw on the same counter. The SELECT has
 * a WHERE clause on purpose: SQLite cannot tell an UPSERT's ON from a join's ON without one.
 */
const RESERVE_SQL = `INSERT INTO nearby_statement_budget (day, statements)
SELECT ?1, ?2 WHERE ?2 <= ?3
ON CONFLICT (day) DO UPDATE SET statements = statements + ?2 WHERE statements + ?2 <= ?3`;

export const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

/** Seconds to the next 00:00 UTC, when Hyperdrive's daily allowance (and so this one) starts again. */
export function secondsUntilUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(NEARBY_RATE_LIMIT_PERIOD_SEC, Math.ceil((next - now.getTime()) / 1000));
}

/**
 * The ceiling in force: the shipped constant unless `NEARBY_DAILY_STATEMENT_CEILING` is set in the Worker's vars.
 * A value that is present but not a whole number within the Free allowance is a deployment mistake, reported as
 * `null` so the route fails closed instead of guessing.
 */
export function nearbyStatementCeiling(configured: string | undefined): number | null {
  if (configured === undefined) return NEARBY_DAILY_STATEMENT_CEILING;
  if (!/^[1-9]\d{0,5}$/.test(configured)) return null;
  const ceiling = Number(configured);
  return ceiling <= HYPERDRIVE_FREE_DAILY_STATEMENTS ? ceiling : null;
}

const unavailable = (error: string, headers?: HeadersInit) =>
  privateJsonResponse({ error }, { status: 503, headers });

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("statement budget timed out")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The global daily guard in front of Hyperdrive's shared allowance. Call it immediately before a cache miss is
 * allowed to send its statement(s); it takes `NEARBY_STATEMENTS_PER_MISS` from today's allowance and answers:
 *
 * - `null`   the statements are reserved, go ahead;
 * - `503`    refused. Every way of not knowing is a refusal (FAIL CLOSED): no D1 binding, a ceiling that is
 *            configured wrongly, a D1 error or timeout, or an answer that is neither "granted" nor "refused".
 *            Only a counted reservation lets a request through.
 *
 * Cached answers never get here, so they keep being served after the ceiling is reached. A reservation that was
 * granted is never given back, even if the statement then fails, so the count can only over-state the day's spend.
 */
export async function reserveNearbyStatements(
  db: NearbyBudgetDatabase | undefined,
  configuredCeiling: string | undefined,
  now: Date = new Date(),
): Promise<Response | null> {
  if (!db) return unavailable("Nearby search is not configured");
  const ceiling = nearbyStatementCeiling(configuredCeiling);
  if (ceiling === null) {
    console.error("Nearby daily statement ceiling is misconfigured, refusing request");
    return unavailable("Nearby search is not configured");
  }
  try {
    const result = await withTimeout(
      db.prepare(RESERVE_SQL).bind(utcDay(now), NEARBY_STATEMENTS_PER_MISS, ceiling).run(),
      RESERVE_TIMEOUT_MS,
    );
    const changes = result.meta?.changes;
    if (changes === 1) return null;
    if (changes === 0) {
      return unavailable("Nearby search has reached its daily limit; try again after 00:00 UTC", {
        "Retry-After": String(secondsUntilUtcMidnight(now)),
      });
    }
    console.error("Nearby statement budget gave an unexpected answer, refusing request");
  } catch (error) {
    console.error("Nearby statement budget failed, refusing request:", error);
  }
  return unavailable("Nearby search is temporarily unavailable", {
    "Retry-After": String(NEARBY_RATE_LIMIT_PERIOD_SEC),
  });
}
