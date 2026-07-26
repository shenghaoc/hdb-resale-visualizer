import { describe, expect, it } from "vite-plus/test";
import { normalizeResaleRows } from "../../scripts/lib/sync/normalization";

describe("resale sync normalization", () => {
  it("canonicalizes legacy multi-generation flat-type spellings before ingestion", () => {
    const base = {
      month: "2026-01",
      town: "BEDOK",
      block: "1",
      street_name: "EXAMPLE ROAD",
      storey_range: "01 TO 03",
      floor_area_sqm: "120",
      flat_model: "MODEL A",
      lease_commence_date: "1990",
      resale_price: "800000",
      remaining_lease: "63 years",
    };

    const transactions = normalizeResaleRows([
      { ...base, flat_type: "MULTI GENERATION" },
      { ...base, flat_type: " multi-generation " },
    ]);

    expect(transactions.map((transaction) => transaction.flatType)).toEqual([
      "MULTI-GENERATION",
      "MULTI-GENERATION",
    ]);
  });
});
