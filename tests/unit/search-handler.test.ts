import { describe, expect, it } from "vitest";
import { onRequestGet } from "../../functions/api/search";

describe("/api/search handler", () => {
  it("returns truncated flag when rows exceed cap", async () => {
    const rows = Array.from({ length: 2001 }, (_, i) => ({
      address_key: `k-${i}`,
      town: "BEDOK", block: "1", street_name: "A", display_name: null,
      lat: 1.3, lng: 103.9, median_price: 500000, price_per_sqm_median: 5000, transaction_count: 1,
      floor_area_min: 90, floor_area_max: 100, lease_commence_year: 1990,
      latest_month: "2024-12", available_min_month: "2020-01", available_max_month: "2024-12",
      flat_types_json: '["4 ROOM"]', flat_models_json: '["Model A"]',
      median_price_by_flat_type_json: null, median_price_per_sqm_by_flat_type_json: null,
      nearest_mrt_json: null, nearby_mrts_json: '[]', postal_code: null,
    }));
    const ctx = {
      request: new Request("http://localhost/api/search?town=BEDOK"),
      env: { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }) } },
    } as unknown as Record<string, unknown>;
    const resp = await onRequestGet(ctx);
    const body = await resp.json() as unknown as Record<string, unknown>;
    expect(body.truncated).toBe(true);
    expect(body.blocks).toHaveLength(2000);
  });
});
