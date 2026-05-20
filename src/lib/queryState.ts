import { DEFAULT_FILTERS, MAX_SEARCH_QUERY_LENGTH, QUERY_VERSION } from "./constants";
import type { FilterState } from "../types/data";

function parseNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeParam(value: string | null, defaultValue: string): string {
  return safeParamNullable(value) ?? defaultValue;
}

function safeParamNullable(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  if (value.length > MAX_SEARCH_QUERY_LENGTH) {
    return value.slice(0, MAX_SEARCH_QUERY_LENGTH);
  }
  return value;
}

export function parseFilters(search: string): FilterState {
  const params = new URLSearchParams(search);

  const budgetMin = parseNumber(params.get("budgetMin"));
  const budgetMax = parseNumber(params.get("budgetMax"));
  const areaMin = parseNumber(params.get("areaMin"));
  const areaMax = parseNumber(params.get("areaMax"));
  const startMonth = safeParamNullable(params.get("startMonth"));
  const endMonth = safeParamNullable(params.get("endMonth"));

  // Normalize inverted ranges so min <= max invariants always hold.
  const budgetInverted = budgetMin !== null && budgetMax !== null && budgetMin > budgetMax;
  const areaInverted = areaMin !== null && areaMax !== null && areaMin > areaMax;
  const monthInverted = Boolean(startMonth && endMonth && startMonth > endMonth);

  return {
    search: safeParam(params.get("search"), DEFAULT_FILTERS.search),
    town: safeParam(params.get("town"), DEFAULT_FILTERS.town),
    flatType: safeParam(params.get("flatType"), DEFAULT_FILTERS.flatType),
    flatModel: safeParam(params.get("flatModel"), DEFAULT_FILTERS.flatModel),
    budgetMin: budgetInverted ? budgetMax : budgetMin,
    budgetMax: budgetInverted ? budgetMin : budgetMax,
    areaMin: areaInverted ? areaMax : areaMin,
    areaMax: areaInverted ? areaMin : areaMax,
    remainingLeaseMin: parseNumber(params.get("remainingLeaseMin")),
    startMonth: monthInverted ? endMonth : startMonth,
    endMonth: monthInverted ? startMonth : endMonth,
    mrtMax: parseNumber(params.get("mrtMax")),
    selectedAddressKey: safeParamNullable(params.get("selected")),
  };
}

export function serializeFilters(filters: FilterState): string {
  const params = new URLSearchParams();
  let hasNonDefaultParams = false;

  for (const [key, value] of Object.entries(filters)) {
    const defaultValue = DEFAULT_FILTERS[key as keyof FilterState];
    const normalizedValue = value ?? "";
    if (normalizedValue === (defaultValue ?? "")) {
      continue;
    }

    params.set(key === "selectedAddressKey" ? "selected" : key, String(normalizedValue));
    hasNonDefaultParams = true;
  }

  // Only add version parameter if there are actual filter parameters
  if (hasNonDefaultParams) {
    params.set("v", QUERY_VERSION);
  }

  const search = params.toString();
  return search ? `?${search}` : "";
}
