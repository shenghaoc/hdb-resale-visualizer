import type { FilterState } from "@/types/data";
import { serializeFilters } from "./queryState";
import { townToFilename } from "./utils";

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

/**
 * Shares a URL using the Web Share API (mobile) with clipboard fallback
 * (desktop). AbortError (user cancelled) is silently swallowed. Returns
 * `"shared"` on success, `"copied"` on clipboard fallback, and throws on
 * real failure so the caller can show an error.
 */
export async function shareViaNavigator(
  url: string,
  title: string,
  text?: string,
): Promise<"shared" | "copied"> {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return "shared"; // User cancelled — treat as success.
      }
      // Fall through to clipboard on real failure.
    }
  }

  await navigator.clipboard.writeText(url);
  return "copied";
}

export function buildBlockOgImageUrl(addressKey: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/og/block/${encodeURIComponent(addressKey)}.png`;
}

export function buildCompareOgImageUrl(townA: string, townB: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/og/compare/${encodeURIComponent(townToFilename(townA))}/${encodeURIComponent(townToFilename(townB))}.png`;
}
