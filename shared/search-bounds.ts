/**
 * Accepted ranges for the coarse search request.
 *
 * These are the single source of truth for both sides of the wire: the Pages
 * Function rejects anything outside them with a 400, and the client clamps to
 * them so it can never send a request the server will reject. Keeping the
 * numbers in one place is what stops the two from drifting apart — a client
 * that allowed a wider range than the server would turn an ordinary filter
 * entry into a failed request.
 */

export const MAX_LEASE_DURATION_YEARS = 99;
export const MAX_MRT_DISTANCE_METERS = 20_000;

/** Largest value the price inputs accept; well above any real resale price. */
export const MAX_BUDGET_SGD = 100_000_000;

/** Largest value the floor-area inputs accept; well above any real HDB flat. */
export const MAX_FLOOR_AREA_SQM = 100_000;

/** Clamp `value` into [min, max], preserving null and rejecting non-finite input. */
export function clampNullableNumber(value: number | null, min: number, max: number): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.min(Math.max(value, min), max);
}
