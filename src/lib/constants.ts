import type { FilterState } from "@/types/data";

export const DATA_BASE_PATH = "/data";
export const SHORTLIST_STORAGE_KEY = "hdb-resale-visualizer.shortlist.v1";
export const HEADER_DISMISSED_STORAGE_KEY = "hdb-resale-visualizer.header-dismissed.v1";
export const QUERY_VERSION = "1";
export const ONEMAP_TILE_URL = "https://www.onemap.gov.sg/maps/tiles/GreyLite/{z}/{x}/{y}.png";
export const ONEMAP_NIGHT_TILE_URL = "https://www.onemap.gov.sg/maps/tiles/Night/{z}/{x}/{y}.png";
export const ONEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.onemap.gov.sg/home">OneMap</a> contributors';
export const DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS = 1200;

export const DEFAULT_FILTERS: FilterState = {
  search: "",
  town: "",
  flatType: "",
  flatModel: "",
  budgetMin: 300000, // Sensible default: S$300K
  budgetMax: 800000, // Sensible default: S$800K
  areaMin: null,
  areaMax: null,
  remainingLeaseMin: 60, // Sensible default: 60 years minimum
  startMonth: null,
  endMonth: null,
  mrtMax: null,
  selectedAddressKey: null,
};
