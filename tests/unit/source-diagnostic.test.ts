import { describe, expect, it } from "vite-plus/test";
import { compareSourceOccurrences } from "../../scripts/neon-benchmark/source-diagnostic";
import type { TransactionRow } from "../../scripts/lib/schemas";
const fact: TransactionRow = {
  month: "2026-08",
  town: "BEDOK",
  block: "1",
  street_name: "BEDOK RD",
  address_key: "bedok-1-bedok-rd",
  flat_type: "4 ROOM",
  storey_range: "04 TO 06",
  floor_area_sqm: 90,
  lease_commence_year: 1990,
  resale_price: 500000,
  flat_model: "MODEL A",
};
describe("offline source discrepancy evidence", () => {
  it("preserves legitimate duplicate multiplicity despite source ordering", () => {
    const other = { ...fact, resale_price: 600000 };
    const result = compareSourceOccurrences(
      [
        { ...fact, id: 1 },
        { ...other, id: 2 },
        { ...fact, id: 3 },
      ],
      [other, fact, fact],
    );
    expect(result.missingOccurrences).toEqual([]);
    expect(result.unmatchedIncomingOccurrenceCount).toBe(0);
  });
  it("reports one absent duplicate occurrence with the planner's stable consumption order", () => {
    const result = compareSourceOccurrences(
      [
        { ...fact, id: 1 },
        { ...fact, id: 2 },
      ],
      [fact],
    );
    expect(result.missingOccurrences.map((row) => row.id)).toEqual([2]);
    expect(result.oneFieldCandidates[0].candidates).toEqual([]);
  });
  it("retains every exact one-field candidate without selecting an inferred correction", () => {
    const result = compareSourceOccurrences(
      [{ ...fact, id: 7 }],
      [
        { ...fact, resale_price: 510000 },
        { ...fact, resale_price: 520000 },
      ],
    );
    expect(result.oneFieldCandidates[0].candidates.map((candidate) => candidate.newValue)).toEqual([
      510000, 520000,
    ]);
    expect(result.missingOccurrences[0]).toEqual({ ...fact, id: 7 });
  });
  it("does not create a fuzzy candidate when two fields differ", () => {
    const result = compareSourceOccurrences(
      [{ ...fact, id: 7 }],
      [{ ...fact, resale_price: 510000, floor_area_sqm: 91 }],
    );
    expect(result.oneFieldCandidates[0].candidates).toEqual([]);
    expect(result.unmatchedIncomingOccurrenceCount).toBe(1);
  });
  it("keeps null and zero distinct and reports incoming multiplicity", () => {
    const result = compareSourceOccurrences(
      [{ ...fact, id: 7, lease_commence_year: null }],
      [
        { ...fact, lease_commence_year: 0 },
        { ...fact, lease_commence_year: 0 },
      ],
    );
    expect(result.oneFieldCandidates[0].candidates[0]).toMatchObject({
      changedField: "lease_commence_year",
      oldValue: null,
      newValue: 0,
      incomingMultiplicity: 2,
    });
  });
});
