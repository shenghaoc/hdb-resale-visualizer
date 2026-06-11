import { describe, expect, it } from "vite-plus/test";
import {
  buildComparableSet,
  MIN_COMPARABLES,
  MAX_COMPARABLES,
  type CandidateListing,
  type TransactionRow,
} from "../../shared/comparable-engine";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<CandidateListing> = {}): CandidateListing {
  return {
    town: "ANG MO KIO",
    block: "123A",
    streetName: "ANG MO KIO AVE 1",
    flatType: "4 ROOM",
    storeyRange: "07 TO 09",
    floorAreaSqm: 93,
    leaseCommenceYear: 2015,
    referenceMonth: "2026-05",
    ...overrides,
  };
}

function makeRow(overrides: Partial<TransactionRow> & { id: string }): TransactionRow {
  return {
    id: overrides.id,
    month: overrides.month ?? "2026-03",
    town: overrides.town ?? "ANG MO KIO",
    block: overrides.block ?? "123A",
    streetName: overrides.streetName ?? "ANG MO KIO AVE 1",
    addressKey: overrides.addressKey ?? "ang-mo-kio-123a-ang-mo-kio-ave-1",
    flatType: overrides.flatType ?? "4 ROOM",
    storeyRange: overrides.storeyRange ?? "07 TO 09",
    storeyMidpoint: overrides.storeyMidpoint ?? 8,
    floorAreaSqm: overrides.floorAreaSqm ?? 93,
    leaseCommenceDate: overrides.leaseCommenceDate ?? 2015,
    resalePrice: overrides.resalePrice ?? 600000,
    pricePerSqm: overrides.pricePerSqm ?? 6451.6,
    flatModel: overrides.flatModel ?? "MODEL A",
  };
}

function padMonth(n: number): string {
  return String(n).padStart(2, "0");
}

function makeRows(
  count: number,
  base: Partial<TransactionRow> & { block?: string; streetName?: string; town?: string },
): TransactionRow[] {
  return Array.from({ length: count }, (_, i) =>
    makeRow({
      id: `tx-${base.block ?? "123A"}-${i}`,
      month: `2026-${padMonth((i % 12) + 1)}`,
      ...base,
    }),
  );
}

// ---------------------------------------------------------------------------
// buildComparableSet — widening logic
// ---------------------------------------------------------------------------

describe("buildComparableSet", () => {
  it("pass 1: ≥ MIN_COMPARABLES same-block results → no widening", () => {
    const candidate = makeCandidate();
    const sameBlock = makeRows(MIN_COMPARABLES, { block: "123A" });
    const result = buildComparableSet({
      candidate,
      sameBlockRows: sameBlock,
      sameStreetRows: [],
      sameTownRows: [],
    });

    expect(result.widenedSearch).toBe(false);
    expect(result.caveats).toEqual([]);
    expect(result.comparables).toHaveLength(MIN_COMPARABLES);
    expect(result.sameBlockCount).toBe(MIN_COMPARABLES);
  });

  it("pass 1: < MIN_COMPARABLES same-block → widens to same street", () => {
    const candidate = makeCandidate();
    const sameBlock = makeRows(3, { block: "123A" });
    const sameStreet = makeRows(MIN_COMPARABLES, {
      block: "124B",
      streetName: "ANG MO KIO AVE 1",
    });
    const result = buildComparableSet({
      candidate,
      sameBlockRows: sameBlock,
      sameStreetRows: sameStreet,
      sameTownRows: [],
    });

    expect(result.widenedSearch).toBe(true);
    expect(result.caveats).toContain(
      "Few comparable transactions in the same block — search widened to the same street.",
    );
    expect(result.comparables.length).toBeGreaterThanOrEqual(MIN_COMPARABLES);
  });

  it("pass 2: < MIN_COMPARABLES same-street → widens to same town", () => {
    const candidate = makeCandidate();
    const sameBlock = makeRows(2, { block: "123A" });
    const sameStreet = makeRows(3, {
      block: "124B",
      streetName: "ANG MO KIO AVE 1",
    });
    const sameTown = makeRows(MIN_COMPARABLES, {
      block: "500C",
      streetName: "ANG MO KIO AVE 5",
      town: "ANG MO KIO",
    });
    const result = buildComparableSet({
      candidate,
      sameBlockRows: sameBlock,
      sameStreetRows: sameStreet,
      sameTownRows: sameTown,
    });

    expect(result.widenedSearch).toBe(true);
    expect(result.caveats).toContain(
      "Few comparable transactions in the same block — search widened to the same street.",
    );
    expect(result.caveats).toContain(
      "Few comparable transactions on the same street — search widened to the entire town.",
    );
  });

  it("pass 3: 0 results → empty set with caveat", () => {
    const candidate = makeCandidate();
    const result = buildComparableSet({
      candidate,
      sameBlockRows: [],
      sameStreetRows: [],
      sameTownRows: [],
    });

    expect(result.comparables).toHaveLength(0);
    expect(result.caveats).toContain("No comparable transactions found for this listing.");
    expect(result.widenedSearch).toBe(false);
  });

  it("sameBlockCount, sameStreetCount, sameTownCount reflect actual counts", () => {
    const candidate = makeCandidate();
    const sameBlock = makeRows(3, { block: "123A" });
    const sameStreet = makeRows(7, {
      block: "124B",
      streetName: "ANG MO KIO AVE 1",
    });
    const sameTown = makeRows(50, {
      block: "500C",
      streetName: "ANG MO KIO AVE 5",
      town: "ANG MO KIO",
    });

    const result = buildComparableSet({
      candidate,
      sameBlockRows: sameBlock,
      sameStreetRows: sameStreet,
      sameTownRows: sameTown,
    });

    expect(result.sameBlockCount).toBe(3);
    expect(result.sameStreetCount).toBe(7);
    expect(result.sameTownCount).toBe(50);
  });

  it("top-N cap: > MAX_COMPARABLES results → only top MAX_COMPARABLES returned", () => {
    const candidate = makeCandidate();
    const sameBlock = makeRows(MAX_COMPARABLES + 10, { block: "123A" });

    const result = buildComparableSet({
      candidate,
      sameBlockRows: sameBlock,
      sameStreetRows: [],
      sameTownRows: [],
    });

    expect(result.comparables).toHaveLength(MAX_COMPARABLES);
  });

  it("sorts comparables by similarity descending", () => {
    const candidate = makeCandidate();
    // Create rows with varying similarity: one identical, one very different
    const rows: TransactionRow[] = [
      makeRow({
        id: "tx-diff",
        block: "999Z",
        streetName: "OTHER ST",
        town: "BEDOK",
        flatType: "5 ROOM",
        floorAreaSqm: 200,
        storeyMidpoint: 40,
        leaseCommenceDate: 1960,
        month: "2019-01",
      }),
      makeRow({ id: "tx-same", block: "123A" }),
      makeRow({ id: "tx-sim", block: "124B", streetName: "ANG MO KIO AVE 1" }),
    ];

    const result = buildComparableSet({
      candidate,
      sameBlockRows: rows,
      sameStreetRows: [],
      sameTownRows: [],
    });

    expect(result.comparables).toHaveLength(3);
    // First should be the same-block (highest similarity)
    expect(result.comparables[0].transactionId).toBe("tx-same");
    // Last should be the most different (lowest similarity)
    expect(result.comparables[2].transactionId).toBe("tx-diff");
  });

  it("low sample caveat when count < LOW_SAMPLE_THRESHOLD", () => {
    const candidate = makeCandidate();
    const sameBlock = makeRows(3, { block: "123A" });

    const result = buildComparableSet({
      candidate,
      sameBlockRows: sameBlock,
      sameStreetRows: [],
      sameTownRows: [],
    });

    expect(result.comparables).toHaveLength(3);
    expect(result.caveats.some((c) => c.includes("Only 3 comparable transactions"))).toBe(true);
  });

  it("newestComparableAgeMonths reflects the newest comparable", () => {
    const candidate = makeCandidate({ referenceMonth: "2026-05" });
    const rows = [
      makeRow({ id: "tx-1", month: "2026-03" }),
      makeRow({ id: "tx-2", month: "2025-06" }),
    ];

    const result = buildComparableSet({
      candidate,
      sameBlockRows: rows,
      sameStreetRows: [],
      sameTownRows: [],
    });

    // Newest is 2026-03, reference is 2026-05 → 2 months old
    expect(result.newestComparableAgeMonths).toBe(2);
  });

  it("all passes below MIN_COMPARABLES: uses narrowest pass with data (block)", () => {
    const candidate = makeCandidate();
    const sameBlock = makeRows(3, { block: "123A" });
    const sameStreet = makeRows(5, {
      block: "124B",
      streetName: "ANG MO KIO AVE 1",
    });
    const sameTown = makeRows(6, {
      block: "500C",
      streetName: "ANG MO KIO AVE 5",
      town: "ANG MO KIO",
    });

    const result = buildComparableSet({
      candidate,
      sameBlockRows: sameBlock,
      sameStreetRows: sameStreet,
      sameTownRows: sameTown,
    });

    // All passes below MIN_COMPARABLES (8), so narrowest pass (block)
    // should be used without widening.
    expect(result.comparables).toHaveLength(3);
    expect(result.widenedSearch).toBe(false);
    expect(result.sameBlockCount).toBe(3);
    expect(result.sameStreetCount).toBe(5);
    expect(result.sameTownCount).toBe(6);
  });
});
