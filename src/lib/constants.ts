import type { FilterState } from "@/types/data";

export const DATA_BASE_PATH = "/data";
export const SHORTLIST_STORAGE_KEY = "hdb-resale-visualizer.shortlist.v1";
export const QUERY_VERSION = "1";
export const ONEMAP_TILE_URL = "https://www.onemap.gov.sg/maps/tiles/GreyLite/{z}/{x}/{y}.png";
export const ONEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.onemap.gov.sg/home">OneMap</a> contributors';
export const DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS = 1200;

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
