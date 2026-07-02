import { describe, expect, it } from "vite-plus/test";
import golden from "../fixtures/platform-parity/product-core-golden.json";
import {
  assessAskingPrice,
  computeAffordabilityVerdict,
  computeListingConfidence,
  findComparableTransactions,
  getBudgetMatchSignal,
  isBlockAgeEligible,
  minRequiredRemainingLease,
  performListingCheck,
  remainingLeaseYears,
  summarizeComparables,
} from "../../shared/product";
import type { AddressDetailTransaction, BlockSummary } from "../../shared/data-types";

describe("shared product core golden parity", () => {
  it("keeps budget and lease-to-95 outcomes stable for representative blocks", () => {
    for (const scenario of golden.scenarios) {
      const block = scenario.block as BlockSummary;
      expect(
        getBudgetMatchSignal(block.medianPrice, scenario.budget.min, scenario.budget.max).status,
      ).toBe(scenario.budget.expectedStatus);
      expect(
        isBlockAgeEligible(
          block,
          scenario.ageEligibility.buyerAge,
          scenario.ageEligibility.currentYear,
        ),
      ).toBe(scenario.ageEligibility.expectedEligible);
    }
    expect(minRequiredRemainingLease(55)).toBe(40);
    expect(remainingLeaseYears(1968, 2026)).toBe(41);
    expect(isBlockAgeEligible({ leaseCommenceRange: [2026 - 60, 2026 - 5] }, 35, 2026)).toBe(true);
  });

  it("keeps comparable selection, summaries, verdicts, and caveats stable", () => {
    const transactions = golden.transactions as AddressDetailTransaction[];
    const comparables = findComparableTransactions(transactions, {
      flatType: "4 ROOM",
      storeyMidpoint: 11,
      floorAreaSqm: 93,
    });
    expect(comparables.map((tx) => tx.id)).toEqual(["t1", "t2", "t3"]);
    expect(summarizeComparables(comparables)).toMatchObject({
      count: 3,
      medianPrice: 625000,
      p25Price: 617500,
      p75Price: 632500,
      latestMonth: "2026-03",
    });
    expect(assessAskingPrice({ askingPrice: 720000, floorAreaSqm: 93, comparables })).toMatchObject(
      {
        verdict: "well_above",
        comparableCount: 3,
      },
    );
    expect(computeListingConfidence(comparables, "2026-04")).toMatchObject({
      comparableCount: 3,
      newestComparableMonth: "2026-03",
    });
    const result = performListingCheck({
      askingPrice: 720000,
      floorAreaSqm: 93,
      transactions,
      comparableQuery: { flatType: "4 ROOM", storeyMidpoint: 11, floorAreaSqm: 93 },
      leaseCommenceYear: 2017,
      referenceMonth: "2026-04",
    });
    expect(result?.assessment.verdict).toBe("well_above");
    expect(result?.caveats.map((c) => c.code)).toContain("EXTREME_OUTLIER_HIGH");
  });

  it("keeps affordability calculations deterministic for budget-match scenarios", () => {
    expect(
      computeAffordabilityVerdict({ monthlyIncome: 9000, cpfOABalance: 180000, age: 35 }, 620000),
    ).toMatchObject({ status: "stretch", maxAffordablePrice: 720000 });
    expect(
      computeAffordabilityVerdict({ monthlyIncome: 4500, cpfOABalance: 60000, age: 55 }, 620000)
        .status,
    ).toBe("over");
  });
});
