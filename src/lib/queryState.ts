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

  return {
    search: params.get("search") ?? DEFAULT_FILTERS.search,
    town: params.get("town") ?? DEFAULT_FILTERS.town,
    flatType: params.get("flatType") ?? DEFAULT_FILTERS.flatType,
    flatModel: params.get("flatModel") ?? DEFAULT_FILTERS.flatModel,
    budgetMin: parseNumber(params.get("budgetMin")),
    budgetMax: parseNumber(params.get("budgetMax")),
    areaMin: parseNumber(params.get("areaMin")),
    areaMax: parseNumber(params.get("areaMax")),
    leaseMin: parseNumber(params.get("leaseMin")),
    leaseMax: parseNumber(params.get("leaseMax")),
    startMonth: params.get("startMonth"),
    endMonth: params.get("endMonth"),
    mrtMax: parseNumber(params.get("mrtMax")),
    selectedAddressKey: params.get("selected"),
  };
}

export function serializeFilters(filters: FilterState): string {
  const params = new URLSearchParams();
  params.set("v", QUERY_VERSION);

  for (const [key, value] of Object.entries(filters)) {
    if (value === null || value === "") {
      continue;
    }

    params.set(key === "selectedAddressKey" ? "selected" : key, String(value));
  }

  const search = params.toString();
  return search ? `?${search}` : "";
}
