const ISO_INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2})(?::(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?([Zz]|([+-])(\d{2})(?::?(\d{2}))?)$/;

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) {
    return 29;
  }
  return DAYS_PER_MONTH[month - 1] ?? 0;
}

/**
 * Parses the ISO instant forms previously accepted at persisted-data
 * boundaries without falling back to Date's permissive string parser.
 *
 * The parser accepts `T` or a space, `Z`, and numeric offsets in `+08`,
 * `+0800`, or `+08:00` form. Calendar-invalid dates and out-of-range time or
 * offset components are rejected. Leap-second `:60` is constrained to `:59`,
 * matching the former Temporal instant behavior.
 */
export function parseIsoInstantMilliseconds(value: string): number | null {
  const match = ISO_INSTANT_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5] ?? "0");
  const second = Number(match[6] ?? "0");
  const millisecond = Number((match[7] ?? "").padEnd(3, "0").slice(0, 3));
  const offsetHour = Number(match[10] ?? "0");
  const offsetMinute = Number(match[11] ?? "0");

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 60 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, Math.min(second, 59), millisecond);

  const offsetSign = match[9] === "+" ? 1 : match[9] === "-" ? -1 : 0;
  const offsetMilliseconds = offsetSign * (offsetHour * 60 + offsetMinute) * 60 * 1000;
  const epochMilliseconds = date.getTime() - offsetMilliseconds;

  return Number.isFinite(epochMilliseconds) ? epochMilliseconds : null;
}

export function isIsoInstant(value: unknown): value is string {
  return typeof value === "string" && parseIsoInstantMilliseconds(value) !== null;
}
