import { DEFAULT_FILTERS, QUERY_VERSION } from "@/lib/constants";
import type { FilterState } from "@/types/data";

function parseNumber(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFilters(search: string): FilterState {
  const params = new URLSearchParams(search);

  const budgetMin = parseNumber(params.get("budgetMin"));
  const budgetMax = parseNumber(params.get("budgetMax"));
  const areaMin = parseNumber(params.get("areaMin"));
  const areaMax = parseNumber(params.get("areaMax"));
  const startMonth = params.get("startMonth");
  const endMonth = params.get("endMonth");

  return {
    search: params.get("search") ?? DEFAULT_FILTERS.search,
    town: params.get("town") ?? DEFAULT_FILTERS.town,
    flatType: params.get("flatType") ?? DEFAULT_FILTERS.flatType,
    flatModel: params.get("flatModel") ?? DEFAULT_FILTERS.flatModel,
    // Normalize inverted ranges so min ≤ max invariants always hold.
    budgetMin: budgetMin !== null && budgetMax !== null && budgetMin > budgetMax ? budgetMax : budgetMin,
    budgetMax: budgetMin !== null && budgetMax !== null && budgetMin > budgetMax ? budgetMin : budgetMax,
    areaMin: areaMin !== null && areaMax !== null && areaMin > areaMax ? areaMax : areaMin,
    areaMax: areaMin !== null && areaMax !== null && areaMin > areaMax ? areaMin : areaMax,
    remainingLeaseMin: parseNumber(params.get("remainingLeaseMin")),
    startMonth: startMonth && endMonth && startMonth > endMonth ? endMonth : startMonth,
    endMonth: startMonth && endMonth && startMonth > endMonth ? startMonth : endMonth,
    mrtMax: parseNumber(params.get("mrtMax")),
    selectedAddressKey: params.get("selected"),
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
