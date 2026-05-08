const temporal = globalThis.Temporal;

export function nowIsoString(): string {
  if (temporal) {
    return temporal.Now.instant().toString({ fractionalSecondDigits: 3 });
  }

  return new Date().toISOString();
}

export function epochIsoString(): string {
  if (temporal) {
    return temporal.Instant.fromEpochMilliseconds(0).toString({ fractionalSecondDigits: 3 });
  }

  return new Date(0).toISOString();
}

export function currentIsoYear(): number {
  if (temporal) {
    return temporal.Now.plainDateISO().year;
  }

  return new Date().getFullYear();
}

export function monthDistance(laterMonth: string, earlierMonth: string): number {
  if (temporal) {
    const later = temporal.PlainYearMonth.from(laterMonth);
    const earlier = temporal.PlainYearMonth.from(earlierMonth);
    return Math.max(0, earlier.until(later, { largestUnit: "months" }).months);
  }

  const [laterYear, laterMonthNum] = laterMonth.split("-").map(Number);
  const [earlierYear, earlierMonthNum] = earlierMonth.split("-").map(Number);

  return Math.max(0, (laterYear - earlierYear) * 12 + (laterMonthNum - earlierMonthNum));
}
