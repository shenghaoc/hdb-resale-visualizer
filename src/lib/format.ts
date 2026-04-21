import type { Locale } from "@/lib/i18n";

const DEFAULT_LOCALE: Locale = "en-SG";

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

export function formatMeters(value: number, locale?: Locale): string {
  if (value >= 1000) {
    return `${formatNumber(value / 1000, 1, locale)} km`;
  }

  return `${formatNumber(value, 0, locale)} m`;
}

export function formatMonth(month: string, locale?: Locale): string {
  const [year, monthPart] = month.split("-");
  const date = new Date(Number(year), Number(monthPart) - 1, 1);

  return new Intl.DateTimeFormat(resolveLocale(locale), {
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatRemainingLease(leaseCommenceRange: [number, number]): string {
  const currentYear = new Date().getFullYear();
  const minLease = 99 - (currentYear - leaseCommenceRange[0]);
  const maxLease = 99 - (currentYear - leaseCommenceRange[1]);
  if (minLease === maxLease) {
    return `${maxLease} yrs`;
  }
  return `${minLease} - ${maxLease} yrs`;
}

export function formatDateTime(value: string, locale?: Locale): string {
  return new Intl.DateTimeFormat(resolveLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
