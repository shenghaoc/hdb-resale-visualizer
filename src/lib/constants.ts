import type { FilterState } from "@/types/data";
import type { ColorSpecification, DataDrivenPropertyValueSpecification } from "@maplibre/maplibre-gl-style-spec";

/**
 * Shared numeric constants used across the codebase.
 */
export const MAX_LEASE_DURATION = 99;
export const DEFAULT_TRANSACTION_WINDOW_YEARS = 3;
export const NEAR_ME_SEARCH_QUERY = "near me";

/**
 * Returns the current Gregorian year using the Temporal API.
 */
export const getCurrentYear = (): number => Temporal.Now.plainDateISO().year;

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function getDefaultTransactionStartMonth(minMonth: string, maxMonth: string): string | null {
  const hasValidMinMonth = YEAR_MONTH_PATTERN.test(minMonth);
  const hasValidMaxMonth = YEAR_MONTH_PATTERN.test(maxMonth);

  if (!hasValidMinMonth && !hasValidMaxMonth) {
    return null;
  }

  if (!hasValidMinMonth) {
    return maxMonth;
  }

  if (!hasValidMaxMonth) {
    return minMonth;
  }

  const [maxYearRaw, maxMonthRaw] = maxMonth.split("-");
  const maxYear = Number(maxYearRaw);
  const month = Number(maxMonthRaw);

  const defaultStart = `${maxYear - DEFAULT_TRANSACTION_WINDOW_YEARS}-${String(month).padStart(2, "0")}`;
  return defaultStart < minMonth ? minMonth : defaultStart;
}

/**
 * Storage keys for local persistence.
 */
export const SHORTLIST_STORAGE_KEY = "hdb_resale_shortlist_v1";

/**
 * Maximum number of properties that can be saved to the shortlist.
 */
export const MAX_SHORTLIST_ITEMS = 20;

/**
 * Security guardrail: reject oversized share payloads early to avoid expensive
 * base64 decoding/JSON parsing from attacker-crafted URLs.
 */
export const MAX_SHORTLIST_SHARE_PAYLOAD_LENGTH = 10_000;
export const HEADER_DISMISSED_STORAGE_KEY = "hdb_resale_header_dismissed_v1";

/**
 * API and Data paths.
 */
export const DATA_BASE_PATH = "/data";

/**
 * Map configuration.
 */
export const PRIMARY_BLUE = "#2563eb";
export const ONEMAP_DEFAULT_TILE_URL = "https://www.onemap.gov.sg/maps/tiles/Default/{z}/{x}/{y}.png";
export const ONEMAP_NIGHT_TILE_URL = "https://www.onemap.gov.sg/maps/tiles/Night/{z}/{x}/{y}.png";
export const MAP_GLYPHS_URL = "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf";
export const ONEMAP_ATTRIBUTION = '<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" style="height:20px;width:20px;"/>&nbsp;<a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a>&nbsp;&copy;&nbsp;contributors&nbsp;&copy;&nbsp;<a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>';
export const DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS = 1000;
export const MEDIAN_PRICE_COLOR_STOPS = [
  { price: 400000, color: "#3a8a6f" },
  { price: 600000, color: "#9bb368" },
  { price: 800000, color: "#d4a44e" },
  { price: 1000000, color: "#d97757" },
  { price: 1300000, color: "#a83232" },
] as const;
export const MEDIAN_PRICE_COLOR_EXPRESSION: DataDrivenPropertyValueSpecification<ColorSpecification> = [
  "interpolate",
  ["linear"],
  ["get", "median_price"],
  ...MEDIAN_PRICE_COLOR_STOPS.flatMap(({ price, color }) => [price, color]),
];
export const MEDIAN_PRICE_LEGEND_GRADIENT = `linear-gradient(90deg, ${MEDIAN_PRICE_COLOR_STOPS.map(({ color }) => color).join(", ")})`;

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
