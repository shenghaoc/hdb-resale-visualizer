/**
 * Cloudflare Worker compatibility clock helpers.
 *
 * The broader repo prefers Temporal, but Worker-side code cannot rely on that
 * runtime surface being present everywhere we execute. Keep the `Date` fallback
 * isolated here so the rest of the app can stay Temporal-first.
 */

export function workerNowEpochMilliseconds(): number {
  return Date.now();
}

export function workerNowIsoTimestamp(): string {
  return new Date(workerNowEpochMilliseconds()).toISOString();
}

export function workerCurrentUtcYear(): number {
  return new Date(workerNowEpochMilliseconds()).getUTCFullYear();
}

export function workerIsoTimestampFromEpochMilliseconds(epochMilliseconds: number): string {
  return new Date(epochMilliseconds).toISOString();
}
