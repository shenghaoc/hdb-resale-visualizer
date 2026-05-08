const temporal = globalThis.Temporal;

export function nowIsoString(): string {
  if (temporal) {
    return temporal.Now.instant().toString();
  }

  return new Date().toISOString();
}

export function epochIsoString(): string {
  if (temporal) {
    return temporal.Instant.fromEpochMilliseconds(0).toString();
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
    const deltaYears = later.year - earlier.year;
    const deltaMonths = later.month - earlier.month;
    return Math.max(0, deltaYears * 12 + deltaMonths);
  }

  const laterMonthDate = new Date(`${laterMonth}-01`);
  const earlierMonthDate = new Date(`${earlierMonth}-01`);

  return Math.max(
    0,
    (laterMonthDate.getFullYear() - earlierMonthDate.getFullYear()) * 12 +
      (laterMonthDate.getMonth() - earlierMonthDate.getMonth()),
  );
}
