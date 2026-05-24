import type { FilterState } from "@/types/data";
import { serializeFilters } from "./queryState";

/**
 * Builds the full deep-link URL for sharing a specific block.
 * Uses the existing `serializeFilters` to ensure consistent encoding.
 */
export function buildBlockShareUrl(filters: FilterState, baseUrl: string): string {
  const target: FilterState = {
    ...filters,
    // Keep only town + selected; drop all other filters for a clean block URL.
    search: "",
    flatType: "",
    flatModel: "",
    budgetMin: null,
    budgetMax: null,
    areaMin: null,
    areaMax: null,
    remainingLeaseMin: null,
    startMonth: null,
    endMonth: null,
    mrtMax: null,
    compareTown: "",
    affordable: "",
    sort: "",
  };
  return `${baseUrl}${serializeFilters(target)}`;
}

/**
 * Builds the full deep-link URL for sharing a town comparison.
 */
export function buildCompareShareUrl(filters: FilterState, baseUrl: string): string {
  const target: FilterState = {
    ...filters,
    search: "",
    flatType: "",
    flatModel: "",
    budgetMin: null,
    budgetMax: null,
    areaMin: null,
    areaMax: null,
    remainingLeaseMin: null,
    startMonth: null,
    endMonth: null,
    mrtMax: null,
    selectedAddressKey: null,
    affordable: "",
    sort: "",
  };
  return `${baseUrl}${serializeFilters(target)}`;
}

/**
 * Builds the full deep-link URL for the current filter set.
 * Passes through all active filters via `serializeFilters`.
 */
export function buildFilterShareUrl(filters: FilterState, baseUrl: string): string {
  return `${baseUrl}${serializeFilters(filters)}`;
}

/**
 * Builds a shortlist share URL by appending the encoded shortlist param
 * to the current URL, preserving any existing filter params.
 */
export function buildShortlistShareUrl(
  encodedShortlist: string,
  currentSearch: string,
  origin: string,
  pathname: string,
): string {
  const params = new URLSearchParams(currentSearch);
  params.set("shortlist", encodedShortlist);
  return `${origin}${pathname}?${params.toString()}`;
}
