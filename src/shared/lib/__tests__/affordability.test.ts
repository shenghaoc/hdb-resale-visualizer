import { afterEach, describe, expect, it } from "vitest";
import {
  affordabilityHeadroom,
  affordabilityProfileFingerprint,
  computeAffordabilityVerdict,
  computeLoanTenureYears,
  isAffordabilityProfileComplete,
  isBlockAgeEligible,
  maxAffordablePrice,
  maxLoanFor,
  minRequiredRemainingLease,
  passesAffordabilityMode,
  resetAffordabilityCacheForTests,
  COMFORTABLE_AFFORDABILITY_RATIO,
} from "../affordability";
import {
  HDB_CONCESSIONARY_ANNUAL_RATE,
  HDB_LOAN_TENURE_MONTHS,
  HDB_MAX_BUYER_AGE,
  HDB_MORTGAGE_SERVICING_RATIO,
  getCurrentYear,
} from "../constants";
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
    nearestMrt: { stationName: "Bedok", distanceMeters: 500, walkingTimeSeconds: 400 },
    nearbyMrts: [{ stationName: "Bedok", distanceMeters: 500, walkingTimeSeconds: 400 }],
    postalCode: "460100",
    ...overrides,
  };
}

function makeProfile(overrides: {
  monthlyIncome?: number | null;
  cpfOABalance?: number | null;
  age?: number | null;
  coApplicantAge?: number | null;
} = {}) {
  return {
    monthlyIncome: null as number | null,
    cpfOABalance: null as number | null,
    age: null as number | null,
    coApplicantAge: null as number | null,
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

  it("accepts custom tenure in months", () => {
    const result25 = maxLoanFor(8000, 300);
    const result15 = maxLoanFor(8000, 180);
    expect(result15).toBeLessThan(result25);
    expect(result15).toBeGreaterThan(0);
  });

  it("returns 0 for zero tenure", () => {
    expect(maxLoanFor(8000, 0)).toBe(0);
  });
});

describe("computeLoanTenureYears", () => {
  it("caps at 25 years for younger applicants", () => {
    expect(computeLoanTenureYears(30)).toBe(25);
    expect(computeLoanTenureYears(35)).toBe(25);
    expect(computeLoanTenureYears(40)).toBe(25);
  });

  it("reduces linearly for age 40+", () => {
    expect(computeLoanTenureYears(45)).toBe(20);
    expect(computeLoanTenureYears(55)).toBe(10);
    expect(computeLoanTenureYears(60)).toBe(5);
  });

  it("floors at 0 for age >= 65", () => {
    expect(computeLoanTenureYears(65)).toBe(0);
    expect(computeLoanTenureYears(70)).toBe(0);
    expect(computeLoanTenureYears(80)).toBe(0);
  });

  it("defaults to 25 when age is null", () => {
    expect(computeLoanTenureYears(null)).toBe(25);
  });
});

describe("maxAffordablePrice", () => {
  it("combines loan and CPF constraints — typical young buyer", () => {
    // Income $8,000, CPF $100k, age 35 → max loan ≈ $513,082, tenure 25y
    // Total funds constraint = 513,082 + 100,000 = 613,082
    // Downpayment constraint = 100k / 0.25 = $400,000
    // Downpayment constraint is tighter → $400,000
    const price = maxAffordablePrice(makeProfile({
      monthlyIncome: 8000,
      cpfOABalance: 100000,
      age: 35,
    }));
    expect(price).toBe(400000);
  });

  it("total funds constraint dominates when CPF is high", () => {
    // Income $6,000, CPF $500k, age 30
    // maxLoan ≈ $384,811
    // totalFundsConstraint = 384,811 + 500,000 = 884,811
    // downpaymentConstraint = 500k / 0.25 = 2,000,000
    // Total funds constraint is tighter
    const price = maxAffordablePrice(makeProfile({
      monthlyIncome: 6000,
      cpfOABalance: 500000,
      age: 30,
    }));
    const expectedTotalFunds = Math.floor(maxLoanFor(6000) + 500000);
    expect(price).toBe(expectedTotalFunds);
  });

  it("returns 0 when CPF is 0", () => {
    const price = maxAffordablePrice(makeProfile({
      monthlyIncome: 8000,
      cpfOABalance: 0,
      age: 35,
    }));
    expect(price).toBe(0);
  });

  it("returns 0 when CPF is null (treated as 0)", () => {
    const price = maxAffordablePrice(makeProfile({
      monthlyIncome: 8000,
      cpfOABalance: null,
      age: 35,
    }));
    expect(price).toBe(0);
  });

  it("CPF-only when income is missing (no loan eligibility)", () => {
    // No income → maxLoan is 0 → returns CPF balance directly
    const price = maxAffordablePrice(makeProfile({
      monthlyIncome: null,
      cpfOABalance: 100000,
      age: 35,
    }));
    expect(price).toBe(100000);
  });

  it("returns 0 when both income and CPF are missing", () => {
    const price = maxAffordablePrice(makeProfile({
      monthlyIncome: null,
      cpfOABalance: null,
      age: 35,
    }));
    expect(price).toBe(0);
  });

  it("age > 65 results in zero loan → max price is CPF only", () => {
    // Age 70, CPF 200k, income 8k — no HDB loan available.
    // Max price is CPF balance since buyer must pay entirely from own funds.
    const price = maxAffordablePrice(makeProfile({
      monthlyIncome: 8000,
      cpfOABalance: 200000,
      age: 70,
    }));
    expect(price).toBe(200000);
  });

  it("shorter tenure from older age reduces loan capacity", () => {
    // Age 55 → tenure = 10 years → maxLoan smaller → lower price ceiling
    const price55 = maxAffordablePrice(makeProfile({
      monthlyIncome: 8000,
      cpfOABalance: 100000,
      age: 55,
    }));
    const price35 = maxAffordablePrice(makeProfile({
      monthlyIncome: 8000,
      cpfOABalance: 100000,
      age: 35,
    }));
    expect(price55).toBeLessThan(price35);
    expect(price55).toBeGreaterThan(0);
  });
});

describe("computeAffordabilityVerdict", () => {
  it("comfortable when price is well below ceiling", () => {
    const verdict = computeAffordabilityVerdict(
      makeProfile({ monthlyIncome: 8000, cpfOABalance: 200000, age: 35 }),
      500000, // well below the ceiling
    );
    expect(verdict.status).toBe("comfortable");
    expect(verdict.monthlyRepayment).toBeGreaterThan(0);
    expect(verdict.cashOutlay).toBe(0); // CPF (200k) covers full 25% down (125k)
    expect(verdict.loanAmount).toBe(375000); // 75% of 500k
  });

  it("stretch when price is near ceiling (< 100% but > 80%)", () => {
    // CPF = 100k → ceiling = 400k (100k / 0.25)
    // 360k is 90% of ceiling → stretch
    const verdict = computeAffordabilityVerdict(
      makeProfile({ monthlyIncome: 8000, cpfOABalance: 100000, age: 35 }),
      360000,
    );
    expect(verdict.status).toBe("stretch");
  });

  it("over when price exceeds ceiling", () => {
    const verdict = computeAffordabilityVerdict(
      makeProfile({ monthlyIncome: 8000, cpfOABalance: 100000, age: 35 }),
      600000, // above ceiling of 400k
    );
    expect(verdict.status).toBe("over");
  });

  it("boundary: exactly at comfortable/stretch threshold", () => {
    const profile = makeProfile({ monthlyIncome: 8000, cpfOABalance: 100000, age: 35 });
    const ceiling = maxAffordablePrice(profile);
    const threshold = Math.floor(ceiling * COMFORTABLE_AFFORDABILITY_RATIO);

    const comfortableVerdict = computeAffordabilityVerdict(profile, threshold);
    expect(comfortableVerdict.status).toBe("comfortable");

    const stretchVerdict = computeAffordabilityVerdict(profile, threshold + 1);
    expect(stretchVerdict.status).toBe("stretch");
  });

  it("boundary: exactly at stretch/over threshold", () => {
    const profile = makeProfile({ monthlyIncome: 8000, cpfOABalance: 100000, age: 35 });
    const ceiling = maxAffordablePrice(profile);

    const stretchVerdict = computeAffordabilityVerdict(profile, ceiling);
    expect(stretchVerdict.status).toBe("stretch");

    const overVerdict = computeAffordabilityVerdict(profile, ceiling + 1);
    expect(overVerdict.status).toBe("over");
  });

  it("returns unknown when income is missing", () => {
    const verdict = computeAffordabilityVerdict(
      makeProfile({ monthlyIncome: null, cpfOABalance: 100000, age: 35 }),
      500000,
    );
    expect(verdict.status).toBe("unknown");
    expect(verdict.monthlyRepayment).toBe(0);
    expect(verdict.loanAmount).toBe(0);
  });

  it("zero-income buyer (e.g. retiree) still gets a verdict from CPF balance", () => {
    // monthlyIncome 0 (explicitly set, not null) → no loan but CPF can cover price.
    // ceiling = CPF = 200k, medianPrice 150k < 200k * 0.8 = 160k → comfortable.
    const verdict = computeAffordabilityVerdict(
      makeProfile({ monthlyIncome: 0, cpfOABalance: 200000, age: 35 }),
      150000,
    );
    expect(verdict.status).toBe("comfortable");
    expect(verdict.loanAmount).toBe(0);
    expect(verdict.monthlyRepayment).toBe(0);
    expect(verdict.downPaymentFromCpf).toBe(150000);
    expect(verdict.cashOutlay).toBe(0);
    expect(verdict.maxAffordablePrice).toBe(200000);
  });

  it("zero-income buyer with insufficient CPF — status over", () => {
    // monthlyIncome 0, CPF 100k, medianPrice 150k → ceiling = 100k, cashOutlay = 50k.
    const verdict = computeAffordabilityVerdict(
      makeProfile({ monthlyIncome: 0, cpfOABalance: 100000, age: 35 }),
      150000,
    );
    expect(verdict.status).toBe("over");
    expect(verdict.loanAmount).toBe(0);
    expect(verdict.downPaymentFromCpf).toBe(100000);
    expect(verdict.cashOutlay).toBe(50000);
  });

  it("cash outlay when CPF covers full 25% down-payment", () => {
    // Price = 500k, down payment = 125k (25%), CPF 200k covers full 125k, cash = 0
    const verdict = computeAffordabilityVerdict(
      makeProfile({ monthlyIncome: 8000, cpfOABalance: 200000, age: 35 }),
      500000,
    );
    expect(verdict.downPaymentFromCpf).toBe(125000);
    expect(verdict.cashOutlay).toBe(0);
  });

  it("cash outlay when CPF is insufficient for full 25%", () => {
    // Price = 500k, down payment = 125k (25%), CPF only has 30k → CPF covers 30k, cash = 95k
    const verdict = computeAffordabilityVerdict(
      makeProfile({ monthlyIncome: 8000, cpfOABalance: 30000, age: 35 }),
      500000,
    );
    expect(verdict.downPaymentFromCpf).toBe(30000);
    expect(verdict.cashOutlay).toBe(95000);
  });

  it("age >= 65 has zero loan tenure — CPF covers full price, comfortable", () => {
    // Age 70, CPF 200k, median 150k → ceiling = CPF = 200k
    // 150k < 200k * 0.8 = 160k → comfortable
    const verdict = computeAffordabilityVerdict(
      makeProfile({ monthlyIncome: 8000, cpfOABalance: 200000, age: 70 }),
      150000,
    );
    expect(verdict.status).toBe("comfortable");
    expect(verdict.loanAmount).toBe(0);
    expect(verdict.monthlyRepayment).toBe(0);
    expect(verdict.downPaymentFromCpf).toBe(150000);
    expect(verdict.cashOutlay).toBe(0);
  });

  it("age >= 65 — CPF falls short, status over", () => {
    // Age 70, CPF 100k, median 150k → ceiling = 100k
    // 150k > 100k → over
    const verdict = computeAffordabilityVerdict(
      makeProfile({ monthlyIncome: 8000, cpfOABalance: 100000, age: 70 }),
      150000,
    );
    expect(verdict.status).toBe("over");
    expect(verdict.loanAmount).toBe(0);
    expect(verdict.monthlyRepayment).toBe(0);
    expect(verdict.downPaymentFromCpf).toBe(100000);
    expect(verdict.cashOutlay).toBe(50000);
  });

  it("age >= 65 — CPF covers full price, stretch", () => {
    // Age 70, CPF 200k, median 180k → ceiling = 200k
    // 180k > 200k * 0.8 = 160k but <= 200k → stretch
    const verdict = computeAffordabilityVerdict(
      makeProfile({ monthlyIncome: 8000, cpfOABalance: 200000, age: 70 }),
      180000,
    );
    expect(verdict.status).toBe("stretch");
    expect(verdict.loanAmount).toBe(0);
    expect(verdict.monthlyRepayment).toBe(0);
    expect(verdict.downPaymentFromCpf).toBe(180000);
    expect(verdict.cashOutlay).toBe(0);
  });

  it("monthly repayment for an older buyer (shorter tenure)", () => {
    // Age 55 → 10-year tenure → higher monthly for same loan amount
    const youngVerdict = computeAffordabilityVerdict(
      makeProfile({ monthlyIncome: 8000, cpfOABalance: 200000, age: 35 }),
      500000,
    );
    const oldVerdict = computeAffordabilityVerdict(
      makeProfile({ monthlyIncome: 8000, cpfOABalance: 200000, age: 55 }),
      500000,
    );
    // Same loan amount, but shorter tenure → higher monthly
    expect(oldVerdict.monthlyRepayment).toBeGreaterThan(youngVerdict.monthlyRepayment);
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

  it("floors at 0 for age > 95", () => {
    expect(minRequiredRemainingLease(96)).toBe(0);
    expect(minRequiredRemainingLease(100)).toBe(0);
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

describe("isAffordabilityProfileComplete", () => {
  it("returns true when income, CPF and age are all set", () => {
    expect(
      isAffordabilityProfileComplete(
        makeProfile({ monthlyIncome: 8000, cpfOABalance: 100000, age: 35 }),
      ),
    ).toBe(true);
  });

  it("returns false when any of income, CPF or age is null", () => {
    expect(
      isAffordabilityProfileComplete(
        makeProfile({ monthlyIncome: null, cpfOABalance: 100000, age: 35 }),
      ),
    ).toBe(false);
    expect(
      isAffordabilityProfileComplete(
        makeProfile({ monthlyIncome: 8000, cpfOABalance: null, age: 35 }),
      ),
    ).toBe(false);
    expect(
      isAffordabilityProfileComplete(
        makeProfile({ monthlyIncome: 8000, cpfOABalance: 100000, age: null }),
      ),
    ).toBe(false);
  });

  it("treats explicit zero values as set, not missing", () => {
    expect(
      isAffordabilityProfileComplete(
        makeProfile({ monthlyIncome: 0, cpfOABalance: 0, age: 35 }),
      ),
    ).toBe(true);
  });
});

describe("affordabilityProfileFingerprint", () => {
  it("changes when any input field changes", () => {
    const base = makeProfile({
      monthlyIncome: 8000,
      cpfOABalance: 100000,
      age: 35,
      coApplicantAge: 33,
    });
    const initial = affordabilityProfileFingerprint(base);
    expect(affordabilityProfileFingerprint({ ...base, monthlyIncome: 9000 })).not.toBe(initial);
    expect(affordabilityProfileFingerprint({ ...base, cpfOABalance: 50000 })).not.toBe(initial);
    expect(affordabilityProfileFingerprint({ ...base, age: 40 })).not.toBe(initial);
    expect(affordabilityProfileFingerprint({ ...base, coApplicantAge: 30 })).not.toBe(initial);
  });

  it("is stable when nothing changes", () => {
    const profile = makeProfile({ monthlyIncome: 8000, cpfOABalance: 100000, age: 35 });
    expect(affordabilityProfileFingerprint(profile)).toBe(
      affordabilityProfileFingerprint({ ...profile }),
    );
  });
});

describe("passesAffordabilityMode", () => {
  const block = makeBlock({ medianPrice: 360000 }); // stretch vs the comfortable-profile below
  const profile = makeProfile({ monthlyIncome: 8000, cpfOABalance: 100000, age: 35 });
  // ceiling = 400_000, comfortable threshold = 320_000.
  // block at 360_000 → stretch.

  afterEach(() => {
    resetAffordabilityCacheForTests();
  });

  it("passes everything when mode is off, regardless of verdict", () => {
    expect(passesAffordabilityMode(block, profile, "")).toBe(true);
    const overBlock = makeBlock({ medianPrice: 800000 });
    expect(passesAffordabilityMode(overBlock, profile, "")).toBe(true);
  });

  it("comfortable mode rejects stretch and over blocks", () => {
    const comfortableBlock = makeBlock({ medianPrice: 200000 });
    const overBlock = makeBlock({ medianPrice: 800000 });

    expect(passesAffordabilityMode(comfortableBlock, profile, "comfortable")).toBe(true);
    expect(passesAffordabilityMode(block, profile, "comfortable")).toBe(false);
    expect(passesAffordabilityMode(overBlock, profile, "comfortable")).toBe(false);
  });

  it("stretch mode accepts comfortable AND stretch, rejects over", () => {
    const comfortableBlock = makeBlock({ medianPrice: 200000 });
    const overBlock = makeBlock({ medianPrice: 800000 });

    expect(passesAffordabilityMode(comfortableBlock, profile, "stretch")).toBe(true);
    expect(passesAffordabilityMode(block, profile, "stretch")).toBe(true);
    expect(passesAffordabilityMode(overBlock, profile, "stretch")).toBe(false);
  });

  it("incomplete profile disables the filter (passes everything through)", () => {
    const incompleteProfile = makeProfile({ monthlyIncome: 8000, cpfOABalance: null, age: 35 });
    const overBlock = makeBlock({ medianPrice: 800000 });
    expect(passesAffordabilityMode(overBlock, incompleteProfile, "comfortable")).toBe(true);
    expect(passesAffordabilityMode(overBlock, incompleteProfile, "stretch")).toBe(true);
  });

  it("invalidates the cache when the profile fingerprint changes", () => {
    // First call with a tight profile — block is over budget.
    const tightProfile = makeProfile({ monthlyIncome: 3000, cpfOABalance: 50000, age: 35 });
    const targetBlock = makeBlock({ medianPrice: 360000 });
    expect(passesAffordabilityMode(targetBlock, tightProfile, "comfortable")).toBe(false);

    // Same block, now with a much more generous profile — must not return the
    // cached "over" verdict.
    const looseProfile = makeProfile({ monthlyIncome: 10000, cpfOABalance: 200000, age: 30 });
    expect(passesAffordabilityMode(targetBlock, looseProfile, "comfortable")).toBe(true);
  });
});

describe("affordabilityHeadroom", () => {
  afterEach(() => {
    resetAffordabilityCacheForTests();
  });

  it("returns null when the profile is incomplete (not 0)", () => {
    const block = makeBlock({ medianPrice: 400000 });
    expect(
      affordabilityHeadroom(block, makeProfile({ monthlyIncome: null, cpfOABalance: 100000, age: 35 })),
    ).toBeNull();
    expect(
      affordabilityHeadroom(block, makeProfile({ monthlyIncome: 8000, cpfOABalance: null, age: 35 })),
    ).toBeNull();
    expect(
      affordabilityHeadroom(block, makeProfile({ monthlyIncome: 8000, cpfOABalance: 100000, age: null })),
    ).toBeNull();
  });

  it("is positive when the block sits under the ceiling", () => {
    // Ceiling: 400_000, block: 300_000 → headroom = +100_000.
    const block = makeBlock({ medianPrice: 300000 });
    const headroom = affordabilityHeadroom(
      block,
      makeProfile({ monthlyIncome: 8000, cpfOABalance: 100000, age: 35 }),
    );
    expect(headroom).toBe(100000);
  });

  it("is negative when the block sits over the ceiling", () => {
    // Ceiling: 400_000, block: 600_000 → headroom = -200_000.
    const block = makeBlock({ medianPrice: 600000 });
    const headroom = affordabilityHeadroom(
      block,
      makeProfile({ monthlyIncome: 8000, cpfOABalance: 100000, age: 35 }),
    );
    expect(headroom).toBe(-200000);
  });

  it("is zero when the block sits exactly at the ceiling", () => {
    // Ceiling computed from CPF/0.25 = 400_000 exactly.
    const block = makeBlock({ medianPrice: 400000 });
    const headroom = affordabilityHeadroom(
      block,
      makeProfile({ monthlyIncome: 8000, cpfOABalance: 100000, age: 35 }),
    );
    expect(headroom).toBe(0);
  });
});
