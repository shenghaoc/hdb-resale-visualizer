export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatNumber(value: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat("en-SG", { maximumFractionDigits }).format(value);
}

export function formatMeters(value: number): string {
  if (value >= 1000) {
    return `${formatNumber(value / 1000, 1)} km`;
  }

  return `${formatNumber(value)} m`;
}

export function formatMonth(month: string): string {
  const [year, monthPart] = month.split("-");
  const date = new Date(Number(year), Number(monthPart) - 1, 1);

  return new Intl.DateTimeFormat("en-SG", {
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

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
