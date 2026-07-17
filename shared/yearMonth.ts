const YEAR_MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Converts a strict `YYYY-MM` value to a monotonically increasing month index.
 * Returns `null` for partial or calendar-invalid inputs.
 */
export function yearMonthIndex(value: string): number | null {
  const match = YEAR_MONTH_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

export function isYearMonth(value: unknown): value is string {
  return typeof value === "string" && YEAR_MONTH_PATTERN.test(value);
}
