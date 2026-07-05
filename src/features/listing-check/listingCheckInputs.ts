import { getMaxLeaseCommenceYear, MIN_LEASE_COMMENCE_YEAR } from "@/shared/lib/constants";

const POSITIVE_DECIMAL_INPUT_PATTERN =
  /^\s*(?:S\$|\$)?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d*)?)\s*(?:sqm|sq m|m2)?\s*$/i;
const LEASE_COMMENCE_YEAR_PATTERN = /^\d{4}$/;

export function parsePositiveDecimalInput(raw: string | null): number | null {
  if (!raw) return null;
  const match = POSITIVE_DECIMAL_INPUT_PATTERN.exec(raw);
  if (!match) return null;
  const cleaned = match[1]!.replaceAll(",", "");
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parseLeaseCommenceYearInput(raw: string | null): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!LEASE_COMMENCE_YEAR_PATTERN.test(trimmed)) return null;

  const year = Number(trimmed);
  return year >= MIN_LEASE_COMMENCE_YEAR && year <= getMaxLeaseCommenceYear() ? year : null;
}
