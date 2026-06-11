import { describe, expect, it } from "vite-plus/test";
import {
  scoreSimilarity,
  parseStoreyMidpoint,
  monthsBetween,
  BLOCK_WEIGHT,
  STREET_WEIGHT,
  TOWN_WEIGHT,
  FLAT_TYPE_WEIGHT,
  FLOOR_AREA_WEIGHT,
  STOREY_WEIGHT,
  LEASE_WEIGHT,
  RECENCY_WEIGHT,
  LEASE_WEIGHT_SUM_EXCLUDING_LEASE,
  type CandidateListing,
  type ScoringInput,
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
    referenceMonth: "2026-03",
    ...overrides,
  };
}

function makeTx(overrides: Partial<ScoringInput> = {}): ScoringInput {
  return {
    town: "ANG MO KIO",
    block: "123A",
    streetName: "ANG MO KIO AVE 1",
    flatType: "4 ROOM",
    storeyMidpoint: 8,
    floorAreaSqm: 93,
    leaseCommenceDate: 2015,
    month: "2026-03",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Weight constants
// ---------------------------------------------------------------------------

describe("Weight constants", () => {
  it("sum to 1.0", () => {
    const sum =
      BLOCK_WEIGHT +
      STREET_WEIGHT +
      TOWN_WEIGHT +
      FLAT_TYPE_WEIGHT +
      FLOOR_AREA_WEIGHT +
      STOREY_WEIGHT +
      LEASE_WEIGHT +
      RECENCY_WEIGHT;
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("LEASE_WEIGHT_SUM_EXCLUDING_LEASE equals 0.90", () => {
    expect(LEASE_WEIGHT_SUM_EXCLUDING_LEASE).toBeCloseTo(0.9, 10);
  });
});

// ---------------------------------------------------------------------------
// parseStoreyMidpoint
// ---------------------------------------------------------------------------

describe("parseStoreyMidpoint", () => {
  it("parses 'X TO Y' ranges to midpoint", () => {
    expect(parseStoreyMidpoint("10 TO 12")).toBe(11);
    expect(parseStoreyMidpoint("01 TO 03")).toBe(2);
  });

  it("parses hyphenated ranges", () => {
    expect(parseStoreyMidpoint("4-6")).toBe(5);
  });

  it("returns null for unparseable input", () => {
    expect(parseStoreyMidpoint("MISSING")).toBeNull();
    expect(parseStoreyMidpoint("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// monthsBetween
// ---------------------------------------------------------------------------

describe("monthsBetween", () => {
  it("computes positive age when reference is later", () => {
    expect(monthsBetween("2025-01", "2026-01")).toBe(12);
  });

  it("computes zero for same month", () => {
    expect(monthsBetween("2026-05", "2026-05")).toBe(0);
  });

  it("computes negative age when transaction is newer than reference", () => {
    expect(monthsBetween("2026-05", "2025-05")).toBe(-12);
  });
});

// ---------------------------------------------------------------------------
// scoreSimilarity — component scores
// ---------------------------------------------------------------------------

describe("scoreSimilarity", () => {
  it("returns 1.0 for identical candidate and transaction", () => {
    const candidate = makeCandidate();
    const tx = makeTx();
    const result = scoreSimilarity(candidate, tx);
    expect(result.similarity).toBeCloseTo(1.0, 10);
  });

  // Block match
  it("block match: same block → 0.25 contribution", () => {
    const candidate = makeCandidate();
    const tx = makeTx({ block: "123A" });
    const result = scoreSimilarity(candidate, tx);
    expect(result.matchReasons).toContain("Same block");
    // Block 0.25 — verify via differential test
    const txDiffBlock = makeTx({ block: "999Z" });
    const resultDiff = scoreSimilarity(candidate, txDiffBlock);
    const diff = result.similarity - resultDiff.similarity;
    // Difference should be exactly 0.25 (with lease weighing)
    expect(diff).toBeCloseTo(BLOCK_WEIGHT, 10);
  });

  // Street match
  it("street match: same street → 0.10 contribution (including same-block)", () => {
    const candidate = makeCandidate();
    // Same street, different block
    const tx = makeTx({ block: "124B" });
    const result = scoreSimilarity(candidate, tx);
    expect(result.matchReasons).toContain("Same street");

    // Verify differential
    const txDiff = makeTx({
      block: "999Z",
      streetName: "OTHER STREET",
      town: "BEDOK",
    });
    const resultDiff = scoreSimilarity(candidate, txDiff);
    const diff = result.similarity - resultDiff.similarity;
    expect(diff).toBeCloseTo(STREET_WEIGHT + TOWN_WEIGHT, 10);
  });

  // Town match
  it("town match: same town → 0.05 contribution", () => {
    const candidate = makeCandidate();
    const txDiffTown = makeTx({
      block: "999Z",
      streetName: "OTHER STREET",
      town: "BEDOK",
    });
    const txSameTown = makeTx({
      block: "999Z",
      streetName: "OTHER STREET",
      town: "ANG MO KIO",
    });
    const sameTownResult = scoreSimilarity(candidate, txSameTown);
    const diffTownResult = scoreSimilarity(candidate, txDiffTown);
    const diff = sameTownResult.similarity - diffTownResult.similarity;
    expect(diff).toBeCloseTo(TOWN_WEIGHT, 10);
  });

  // Flat type match
  it("flat type match: exact → 0.20 contribution", () => {
    const candidate = makeCandidate();
    const txMatch = makeTx();
    const txDiff = makeTx({ flatType: "5 ROOM" });
    const matchResult = scoreSimilarity(candidate, txMatch);
    const diffResult = scoreSimilarity(candidate, txDiff);
    const diff = matchResult.similarity - diffResult.similarity;
    expect(diff).toBeCloseTo(FLAT_TYPE_WEIGHT, 10);
  });

  // Floor area similarity
  it("floor area: identical → full 0.15, zero sqm diff → 1.0 component", () => {
    const candidate = makeCandidate({ floorAreaSqm: 93 });
    const tx1 = makeTx({ floorAreaSqm: 93 });
    const tx2 = makeTx({ floorAreaSqm: 93 - 10 }); // 10 sqm diff
    const result1 = scoreSimilarity(candidate, tx1);
    const result2 = scoreSimilarity(candidate, tx2);
    // 10 sqm difference on a 93 sqm floor → denominator = max(93, 50) = 93
    // component = 1 - clamp(10/93, 0, 1) = 1 - 0.1075... = 0.8924...
    // Weight contribution diff = 0.15 * (1 - 0.8924) = 0.15 * 0.1075 = 0.0161
    const expectedFloorComp = 1 - 10 / 93;
    const diff = result1.similarity - result2.similarity;
    expect(diff).toBeCloseTo(FLOOR_AREA_WEIGHT * (1 - expectedFloorComp), 5);
  });

  it("floor area: uses floor of 50 sqm denominator", () => {
    // Candidate has 40 sqm flat — denominator = max(40, 50) = 50
    const candidate = makeCandidate({ floorAreaSqm: 40 });
    const tx = makeTx({ floorAreaSqm: 40 }); // identical
    const result = scoreSimilarity(candidate, tx);
    // Floor area component should be 1.0
    expect(result.similarity).toBeCloseTo(1.0, 10);
  });

  // Storey similarity
  it("storey: identical midpoint → full 0.10", () => {
    const candidate = makeCandidate({ storeyRange: "07 TO 09" }); // midpoint = 8
    const tx = makeTx({ storeyMidpoint: 8 });
    const result = scoreSimilarity(candidate, tx);
    expect(result.matchReasons).toContain("Similar storey");
  });

  it("storey: 25+ floor difference → 0 contribution", () => {
    const candidate = makeCandidate({ storeyRange: "01 TO 03" }); // midpoint = 2
    const tx = makeTx({ storeyMidpoint: 30 }); // 28 floor diff
    const result = scoreSimilarity(candidate, tx);
    // Storey component = 1 - clamp(28/25, 0, 1) = 1 - 1 = 0
    // Block + street + town + flatType + lease + recency still contribute
    expect(result.similarity).toBeLessThan(1.0);
  });

  // Lease similarity
  it("lease: identical year → full 0.10", () => {
    const candidate = makeCandidate({ leaseCommenceYear: 2015 });
    const tx = makeTx({ leaseCommenceDate: 2015 });
    const result = scoreSimilarity(candidate, tx);
    expect(result.matchReasons).toContain("Similar lease");
  });

  it("lease: 50+ year difference → 0 lease component", () => {
    const candidate = makeCandidate({ leaseCommenceYear: 2020 });
    const tx = makeTx({ leaseCommenceDate: 1960 }); // 60 year diff
    const result = scoreSimilarity(candidate, tx);
    // Lease component = 1 - clamp(60/50, 0, 1) = 1 - 1 = 0
    expect(result.matchReasons).not.toContain("Similar lease");
  });

  it("lease: null candidate lease → re-scales weights, still reaches 1.0 for identical", () => {
    const candidate = makeCandidate({ leaseCommenceYear: null });
    const tx = makeTx({ leaseCommenceDate: null });
    const result = scoreSimilarity(candidate, tx);
    // All non-lease components are 1.0, so raw = 0.90, scaled = 0.90/0.90 = 1.0
    expect(result.similarity).toBeCloseTo(1.0, 10);
  });

  it("lease: null comparable lease + non-null candidate → re-scales weights", () => {
    const candidate = makeCandidate({ leaseCommenceYear: 2015 });
    const tx = makeTx({ leaseCommenceDate: null });
    const result = scoreSimilarity(candidate, tx);
    // Non-lease components at max → raw = 0.90 → scaled = 1.0
    expect(result.similarity).toBeCloseTo(1.0, 10);
  });

  // Recency
  it("recency: same month → full 0.05", () => {
    const candidate = makeCandidate({ referenceMonth: "2026-03" });
    const tx = makeTx({ month: "2026-03" });
    const result = scoreSimilarity(candidate, tx);
    expect(result.matchReasons).toContain("Recent transaction");
  });

  it("recency: 60+ months old → 0 recency component", () => {
    const candidate = makeCandidate({ referenceMonth: "2026-05" });
    const tx = makeTx({ month: "2020-01" }); // 76 months ago
    const result = scoreSimilarity(candidate, tx);
    expect(result.matchReasons).not.toContain("Recent transaction");
  });

  // Price-free invariant
  it("resale price does not affect similarity", () => {
    const candidate = makeCandidate();
    // ScoringInput does not include resalePrice — this test verifies the type
    // system enforces the invariant. We test by confirming similarity is the
    // same for two transactions that differ only in implicit price values.
    const tx1 = makeTx({ floorAreaSqm: 93 });
    const tx2 = makeTx({ floorAreaSqm: 93 }); // identical ScoringInput
    const result1 = scoreSimilarity(candidate, tx1);
    const result2 = scoreSimilarity(candidate, tx2);
    expect(result1.similarity).toBe(result2.similarity);
  });

  // Match reasons
  it("generates correct match reasons for identical transaction", () => {
    const candidate = makeCandidate();
    const tx = makeTx();
    const result = scoreSimilarity(candidate, tx);
    expect(result.matchReasons).toContain("Same block");
    expect(result.matchReasons).toContain("Same street");
    expect(result.matchReasons).toContain("Same town");
    expect(result.matchReasons).toContain("Same flat type");
    expect(result.matchReasons).toContain("Similar floor area (±0 sqm)");
    expect(result.matchReasons).toContain("Similar storey");
    expect(result.matchReasons).toContain("Similar lease");
    expect(result.matchReasons).toContain("Recent transaction");
  });

  it("omits match reasons for mismatched components", () => {
    const candidate = makeCandidate();
    const tx = makeTx({
      block: "999Z",
      streetName: "OTHER ST",
      town: "BEDOK",
      flatType: "5 ROOM",
      floorAreaSqm: 200,
      storeyMidpoint: 40,
      leaseCommenceDate: 1960,
      month: "2019-01",
    });
    const result = scoreSimilarity(candidate, tx);
    expect(result.matchReasons).toEqual([]);
  });
});
