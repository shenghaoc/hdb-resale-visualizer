import type { Locale, Translator } from "@/lib/i18n";

const DEFAULT_LOCALE: Locale = "en-SG";

// Optimization: Cache current year to avoid instantiating new Date() during list rendering
const CURRENT_YEAR = new Date().getFullYear();

function resolveLocale(locale?: Locale) {
  return locale ?? DEFAULT_LOCALE;
}

export function formatCurrency(value: number, locale?: Locale): string {
  return new Intl.NumberFormat(resolveLocale(locale), {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactCurrency(value: number, locale?: Locale): string {
  return new Intl.NumberFormat(resolveLocale(locale), {
    style: "currency",
    currency: "SGD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatNumber(value: number, maximumFractionDigits = 0, locale?: Locale): string {
  return new Intl.NumberFormat(resolveLocale(locale), { maximumFractionDigits }).format(value);
}

export function formatMeters(value: number, t: Translator, locale?: Locale): string {
  if (value >= 1000) {
    return t("unit.km", { value: formatNumber(value / 1000, 1, locale) });
  }

  return t("unit.m", { value: formatNumber(value, 0, locale) });
}

export function formatSqm(value: number, t: Translator, locale?: Locale): string {
  return t("unit.sqm", { value: formatNumber(value, 0, locale) });
}

export function formatMonth(month: string, locale?: Locale): string {
  const [year, monthPart] = month.split("-");
  const date = new Date(Number(year), Number(monthPart) - 1, 1);

  return new Intl.DateTimeFormat(resolveLocale(locale), {
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatRemainingLease(leaseCommenceRange: [number, number], t: Translator): string {
  const minLease = 99 - (CURRENT_YEAR - leaseCommenceRange[0]);
  const maxLease = 99 - (CURRENT_YEAR - leaseCommenceRange[1]);
  if (minLease === maxLease) {
    return t("unit.years", { value: maxLease });
  }
  return t("unit.yearsRange", { min: minLease, max: maxLease });
}

export function formatDateTime(value: string, locale?: Locale): string {
  return new Intl.DateTimeFormat(resolveLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
