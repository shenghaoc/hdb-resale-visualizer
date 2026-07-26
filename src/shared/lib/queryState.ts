import {
  AFFORDABILITY_MODES,
  BLOCK_SORT_MODES,
  DEFAULT_FILTERS,
  MAX_SEARCH_QUERY_LENGTH,
  QUERY_VERSION,
} from "./constants";
import {
  MAX_BUDGET_SGD,
  MAX_FLOOR_AREA_SQM,
  MAX_LEASE_DURATION_YEARS,
  MAX_MRT_DISTANCE_METERS,
  clampNullableNumber,
  orderNullableNumberRange,
} from "../../../shared/search-bounds";
import { isYearMonth } from "../../../shared/yearMonth";
import type { AffordabilityMode, BlockSortMode, FilterState } from "../../types/data";

const FILTER_QUERY_KEYS = [
  "search",
  "town",
  "flatType",
  "flatModel",
  "budgetMin",
  "budgetMax",
  "areaMin",
  "areaMax",
  "remainingLeaseMin",
  "startMonth",
  "endMonth",
  "mrtMax",
  "selected",
  "compareTown",
  "affordable",
  "sort",
  "v",
] as const;

/**
 * Force the numeric filters into the range the search API accepts.
 *
 * Applied to every filter value the app holds, from whatever source — typed
 * input, a restored deep link, or a shared URL. Without this an out-of-range
 * value produces a 400 that the app surfaces as a fatal, reload-persistent
 * error screen with no controls left to correct it.
 */
export function clampFilterRanges(filters: FilterState): FilterState {
  const budgetMin = clampNullableNumber(filters.budgetMin, 0, MAX_BUDGET_SGD);
  const budgetMax = clampNullableNumber(filters.budgetMax, 0, MAX_BUDGET_SGD);
  const areaMin = clampNullableNumber(filters.areaMin, 0, MAX_FLOOR_AREA_SQM);
  const areaMax = clampNullableNumber(filters.areaMax, 0, MAX_FLOOR_AREA_SQM);
  const startMonth = isYearMonth(filters.startMonth) ? filters.startMonth : null;
  const endMonth = isYearMonth(filters.endMonth) ? filters.endMonth : null;
  const monthInverted = Boolean(startMonth && endMonth && startMonth > endMonth);

  return {
    ...filters,
    budgetMin,
    budgetMax,
    areaMin,
    areaMax,
    remainingLeaseMin: clampNullableNumber(filters.remainingLeaseMin, 0, MAX_LEASE_DURATION_YEARS),
    startMonth: monthInverted ? endMonth : startMonth,
    endMonth: monthInverted ? startMonth : endMonth,
    mrtMax: clampNullableNumber(filters.mrtMax, 0, MAX_MRT_DISTANCE_METERS),
  };
}

/**
 * Normalize numeric range order for evaluation without moving a value between
 * controlled inputs while the user is typing.
 */
export function normalizeNumericFilterRangeOrder(filters: FilterState): FilterState {
  const [budgetMin, budgetMax] = orderNullableNumberRange(filters.budgetMin, filters.budgetMax);
  const [areaMin, areaMax] = orderNullableNumberRange(filters.areaMin, filters.areaMax);

  if (
    budgetMin === filters.budgetMin &&
    budgetMax === filters.budgetMax &&
    areaMin === filters.areaMin &&
    areaMax === filters.areaMax
  ) {
    return filters;
  }

  return { ...filters, budgetMin, budgetMax, areaMin, areaMax };
}

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

/** Town names are canonical upper-case; compare case- and whitespace-insensitively. */
export function isSameTown(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

function parseEnum<Allowed extends string>(
  value: string | null,
  allowlist: readonly Allowed[],
  defaultValue: Allowed,
): Allowed {
  if (value === null) return defaultValue;
  return (allowlist as readonly string[]).includes(value) ? (value as Allowed) : defaultValue;
}

export function parseFilters(search: string): FilterState {
  const params = new URLSearchParams(search);

  const budgetMin = parseNumber(params.get("budgetMin"));
  const budgetMax = parseNumber(params.get("budgetMax"));
  const areaMin = parseNumber(params.get("areaMin"));
  const areaMax = parseNumber(params.get("areaMax"));
  const startMonth = safeParamNullable(params.get("startMonth"));
  const endMonth = safeParamNullable(params.get("endMonth"));
  const town = safeParam(params.get("town"), DEFAULT_FILTERS.town);
  const rawCompareTown = safeParam(params.get("compareTown"), DEFAULT_FILTERS.compareTown);
  // Require a primary town anchor; ignore a compareTown that matches the primary.
  // Case/whitespace-insensitive so deep links like ?town=BEDOK&compareTown=bedok
  // don't bypass the same-town guard and trigger a redundant compare fetch.
  const compareTown =
    town && !isSameTown(rawCompareTown, town) ? rawCompareTown : DEFAULT_FILTERS.compareTown;

  return clampFilterRanges(
    normalizeNumericFilterRangeOrder({
      search: safeParam(params.get("search"), DEFAULT_FILTERS.search),
      town,
      flatType: safeParam(params.get("flatType"), DEFAULT_FILTERS.flatType),
      flatModel: safeParam(params.get("flatModel"), DEFAULT_FILTERS.flatModel),
      budgetMin,
      budgetMax,
      areaMin,
      areaMax,
      remainingLeaseMin: parseNumber(params.get("remainingLeaseMin")),
      startMonth,
      endMonth,
      mrtMax: parseNumber(params.get("mrtMax")),
      selectedAddressKey: safeParamNullable(params.get("selected")),
      compareTown,
      affordable: parseEnum<AffordabilityMode>(
        params.get("affordable"),
        AFFORDABILITY_MODES,
        DEFAULT_FILTERS.affordable,
      ),
      sort: parseEnum<BlockSortMode>(params.get("sort"), BLOCK_SORT_MODES, DEFAULT_FILTERS.sort),
    }),
  );
}

export function serializeFilters(filters: FilterState): string {
  const params = new URLSearchParams();
  let hasNonDefaultParams = false;

  // Strip compareTown when it has no primary anchor or when it duplicates the primary town.
  const effectiveCompareTown =
    filters.town && filters.compareTown && !isSameTown(filters.compareTown, filters.town)
      ? filters.compareTown
      : "";

  for (const [key, value] of Object.entries(filters)) {
    const defaultValue = DEFAULT_FILTERS[key as keyof FilterState];
    const normalizedValue = key === "compareTown" ? effectiveCompareTown : (value ?? "");
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

/**
 * Replace only filter-owned URL parameters with the canonical filter state.
 *
 * Listing Check and campaign deep links share the same URL with block filters.
 * Replacing the entire query string when a filter changes would silently erase
 * those unrelated parameters; retaining the raw filter parameters, on the
 * other hand, leaves invalid or retired values in links users copy. This merge
 * keeps the two concerns independent.
 */
export function mergeFiltersIntoSearch(currentSearch: string, filters: FilterState): string {
  const merged = new URLSearchParams(currentSearch);
  for (const key of FILTER_QUERY_KEYS) {
    merged.delete(key);
  }

  const canonical = new URLSearchParams(serializeFilters(filters));
  for (const [key, value] of canonical) {
    merged.set(key, value);
  }

  const search = merged.toString();
  return search ? `?${search}` : "";
}
