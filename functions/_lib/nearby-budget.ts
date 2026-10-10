import { privateJsonResponse } from "./d1";
import {
  NEARBY_DAILY_STATEMENT_CEILING,
  NEARBY_RATE_LIMIT_PERIOD_SEC,
} from "../../shared/nearby-limits";

/**
 * One call on a dedicated, narrowly privileged Neon/Hyperdrive connection.
 * The existing HDB_PUBLIC_NEON reader stays transaction-read-only; its role cannot call this function.
 */
export type NearbyBudgetQuery = (
  sql: string,
  params: readonly unknown[],
) => Promise<Record<string, unknown>[]>;

export const NEARBY_RESERVE_SQL = "SELECT public.reserve_nearby_statement($1::integer) AS granted";

/** A network timeout may have committed a reservation: never retry it. */
const RESERVE_TIMEOUT_MS = 2_000;

export const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

export function secondsUntilUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(NEARBY_RATE_LIMIT_PERIOD_SEC, Math.ceil((next - now.getTime()) / 1000));
}

/** The database function also enforces the 10,000 maximum; a Worker override can only lower it. */
export function nearbyStatementCeiling(configured: string | undefined): number | null {
  if (configured === undefined) return NEARBY_DAILY_STATEMENT_CEILING;
  if (!/^[1-9]\d{0,4}$/.test(configured)) return null;
  const ceiling = Number(configured);
  return ceiling <= NEARBY_DAILY_STATEMENT_CEILING ? ceiling : null;
}

const unavailable = (error: string, headers?: HeadersInit) =>
  privateJsonResponse({ error }, { status: 503, headers });

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("PostgreSQL budget request timed out")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reserve capacity for one spatial SELECT using the atomic PostgreSQL UPSERT in
 * sql/neon/002_nearby_daily_budget.sql. No D1 database or table is involved.
 *
 * A granted reservation may be wasted if the spatial SELECT subsequently fails. That is intentional:
 * refunds after ambiguous outcomes would allow an underestimate. A refused reservation does consume
 * one Hyperdrive statement because the counter is itself in Neon; therefore this limits admitted
 * spatial searches, not all Hyperdrive traffic. Cloudflare's account-wide hard quota still applies.
 */
export async function reserveNearbyStatements(
  query: NearbyBudgetQuery | undefined,
  configuredCeiling: string | undefined,
  now: Date = new Date(),
): Promise<Response | null> {
  if (!query) return unavailable("Nearby search is not configured");
  const ceiling = nearbyStatementCeiling(configuredCeiling);
  if (ceiling === null) {
    console.error("Nearby PostgreSQL statement ceiling is misconfigured");
    return unavailable("Nearby search is not configured");
  }
  try {
    const rows = await withTimeout(query(NEARBY_RESERVE_SQL, [ceiling]), RESERVE_TIMEOUT_MS);
    if (rows.length === 1 && rows[0].granted === true) return null;
    if (rows.length === 1 && rows[0].granted === false)
      return unavailable("Nearby search has reached its daily limit; try again after 00:00 UTC", {
        "Retry-After": String(secondsUntilUtcMidnight(now)),
      });
    console.error("Nearby PostgreSQL budget gave an unexpected answer");
  } catch (error) {
    // The shared Neon transport sanitises driver errors; never print connection strings or raw query input.
    console.error(
      "Nearby PostgreSQL budget unavailable:",
      error instanceof Error ? error.name : "unknown",
    );
  }
  return unavailable("Nearby search is temporarily unavailable", {
    "Retry-After": String(NEARBY_RATE_LIMIT_PERIOD_SEC),
  });
}
