export function nowIsoString(): string {
  return Temporal.Now.instant().toString({ fractionalSecondDigits: 3 });
}

export function epochIsoString(): string {
  return Temporal.Instant.fromEpochMilliseconds(0).toString({ fractionalSecondDigits: 3 });
}

export function currentIsoYear(): number {
  return Temporal.Now.plainDateISO().year;
}

export function monthDistance(laterMonth: string, earlierMonth: string): number {
  const later = Temporal.PlainYearMonth.from(laterMonth);
  const earlier = Temporal.PlainYearMonth.from(earlierMonth);
  return Math.max(0, earlier.until(later, { largestUnit: "months" }).months);
}
