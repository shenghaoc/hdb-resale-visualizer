import { describe, expect, it } from "vitest";
import {
  isBlockAgeEligible,
  maxLoanFor,
  minRequiredRemainingLease,
} from "@/lib/affordability";
import {
  HDB_CONCESSIONARY_ANNUAL_RATE,
  HDB_LOAN_TENURE_MONTHS,
  HDB_MAX_BUYER_AGE,
  HDB_MORTGAGE_SERVICING_RATIO,
  getCurrentYear,
} from "@/lib/constants";
import type { BlockSummary } from "@/types/data";

function makeBlock(overrides: Partial<BlockSummary> = {}): BlockSummary {
  return {
    addressKey: "test-block",
    town: "BEDOK",
    block: "100",
    streetName: "BEDOK NORTH AVE 4",
    coordinates: { lat: 1.33, lng: 103.93 },
    medianPrice: 600000,
    pricePerSqmMedian: 9000,
    transactionCount: 10,
    floorAreaRange: [65, 120],
    leaseCommenceRange: [1990, 1990],
    latestMonth: "2024-06",
    availableDateRange: ["2021-01", "2024-06"],
    flatTypes: ["3 ROOM"],
    flatModels: ["NEW GENERATION"],
    nearestMrt: { stationName: "Bedok", distanceMeters: 500 },
    nearbyMrts: [{ stationName: "Bedok", distanceMeters: 500 }],
    postalCode: "460100",
    ...overrides,
  };
}

describe("maxLoanFor", () => {
  it("returns 0 for non-positive or non-finite incomes", () => {
    expect(maxLoanFor(0)).toBe(0);
    expect(maxLoanFor(-1000)).toBe(0);
    expect(maxLoanFor(Number.NaN)).toBe(0);
    expect(maxLoanFor(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("matches the standard PV-of-annuity formula at 30% MSR over 25 years", () => {
    const monthlyIncome = 8000;
    const monthlyRate = HDB_CONCESSIONARY_ANNUAL_RATE / 12;
    const expected = Math.floor(
      monthlyIncome *
        HDB_MORTGAGE_SERVICING_RATIO *
        ((1 - Math.pow(1 + monthlyRate, -HDB_LOAN_TENURE_MONTHS)) / monthlyRate),
    );
    expect(maxLoanFor(monthlyIncome)).toBe(expected);
  });

  it("scales linearly with monthly income", () => {
    const base = maxLoanFor(5000);
    const doubled = maxLoanFor(10000);
    expect(doubled).toBeCloseTo(base * 2, -1);
  });

  it("is deterministic for the same input", () => {
    expect(maxLoanFor(6500)).toBe(maxLoanFor(6500));
  });
});

describe("minRequiredRemainingLease", () => {
  it("applies the 95 - age formula", () => {
    expect(minRequiredRemainingLease(40)).toBe(HDB_MAX_BUYER_AGE - 40);
    expect(minRequiredRemainingLease(40)).toBe(55);
    expect(minRequiredRemainingLease(65)).toBe(30);
    expect(minRequiredRemainingLease(35)).toBe(60);
  });

  it("monotonically decreases with age", () => {
    const a = minRequiredRemainingLease(30);
    const b = minRequiredRemainingLease(45);
    const c = minRequiredRemainingLease(70);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });
});

describe("isBlockAgeEligible", () => {
  it("accepts a brand-new block for any working-age applicant", () => {
    const currentYear = getCurrentYear();
    const block = makeBlock({ leaseCommenceRange: [currentYear, currentYear] });
    expect(isBlockAgeEligible(block, 25)).toBe(true);
    expect(isBlockAgeEligible(block, 65)).toBe(true);
  });

  it("rejects a block whose newest commencement leaves too little lease for the buyer", () => {
    const currentYear = getCurrentYear();
    // A 35-year-old needs 95 - 35 = 60 years remaining. A block whose newest
    // unit commenced 50 years ago has 49 years remaining and should fail.
    const block = makeBlock({
      leaseCommenceRange: [currentYear - 60, currentYear - 50],
    });
    expect(isBlockAgeEligible(block, 35)).toBe(false);
  });

  it("uses the newest commencement year in the block, not the oldest", () => {
    const currentYear = getCurrentYear();
    // Oldest commencement 60y ago would fail, but newest is recent — block passes.
    const block = makeBlock({
      leaseCommenceRange: [currentYear - 60, currentYear - 5],
    });
    expect(isBlockAgeEligible(block, 35)).toBe(true);
  });

  it("is deterministic given the same inputs", () => {
    const block = makeBlock({ leaseCommenceRange: [1995, 2000] });
    expect(isBlockAgeEligible(block, 40)).toBe(isBlockAgeEligible(block, 40));
  });
});
