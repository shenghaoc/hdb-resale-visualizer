import type { FilterState } from "@/types/data";

/**
 * Shared numeric constants used across the codebase.
 */
export const MAX_LEASE_DURATION = 99;

/**
 * Returns the current Gregorian year. Using a function ensures the value is fresh for each
 * operation (e.g., a filter pass) while avoiding repeated `new Date()` allocations inside hot loops.
 */
export const getCurrentYear = (): number => new Date().getFullYear();

/**
 * Storage keys for local persistence.
 */
export const SHORTLIST_STORAGE_KEY = "hdb_resale_shortlist_v1";
export const HEADER_DISMISSED_STORAGE_KEY = "hdb_resale_header_dismissed_v1";

/**
 * API and Data paths.
 */
export const DATA_BASE_PATH = "/data";

/**
 * Map configuration.
 */
export const ONEMAP_TILE_URL = "https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png";
export const ONEMAP_ATTRIBUTION = '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&copy;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
export const DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS = 1000;

/**
 * Query state configuration.
 */
export const QUERY_VERSION = "1";

/**
 * Default filter state for the application.
 */
export const DEFAULT_FILTERS: FilterState = {
  search: "",
  town: "",
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
};
