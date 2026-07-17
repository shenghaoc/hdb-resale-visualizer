/**
 * Cloudflare Worker compatibility clock helpers.
 *
 * The repo uses the standard Date API throughout. These helpers keep Date
 * usage consolidated for the Worker environment and maintain a single
 * import surface for clock operations.
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
