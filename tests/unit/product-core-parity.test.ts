import { beforeEach, describe, expect, it } from "vite-plus/test";
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
import {
  evaluateBlockForProfile,
  isProfileVisibilityActive,
} from "../../shared/product/search-profile";
import {
  matchesFilter,
  resolveGeographicSearchIntent,
  matchesGeographicSearchIntent,
  getEffectiveMedianPrice,
  createFilterEvaluationContext,
  resetFilteringCachesForTests,
} from "../../shared/product/filtering";
import type { AddressDetailTransaction, BlockSummary, FilterState } from "../../shared/data-types";
import type { SearchProfile } from "../../shared/product/search-profile";

const DEFAULT_FILTERS: FilterState = {
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
  compareTown: "",
  affordable: "",
  sort: "",
};

const EMPTY_PROFILE: SearchProfile = {
  version: 1,
  mainFlatType: "",
  alternativeFlatTypes: [],
  maxBudget: null,
  commuteAnchorLabel: "",
  commuteAnchorMrt: null,
  maxComfortableCommuteMinutes: null,
  commuteStretchMinutes: 10,
  minimumRemainingLeaseYears: null,
  budgetStretchPercent: 5,
  showStretchOptions: true,
  showAllBlocks: false,
  age: null,
  coApplicantAge: null,
  cpfOABalance: null,
  monthlyIncome: null,
};

describe("shared product core golden parity", () => {
  beforeEach(() => resetFilteringCachesForTests());

  it("keeps budget and lease-to-95 outcomes stable for representative blocks", () => {
    for (const scenario of golden.scenarios) {
      const block = scenario.block as unknown as BlockSummary;
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
      computeAffordabilityVerdict(
        { monthlyIncome: 9000, cpfOABalance: 180000, age: 35, coApplicantAge: null },
        620000,
      ),
    ).toMatchObject({ status: "stretch", maxAffordablePrice: 720000 });
    expect(
      computeAffordabilityVerdict(
        { monthlyIncome: 4500, cpfOABalance: 60000, age: 55, coApplicantAge: null },
        620000,
      ).status,
    ).toBe("over");
  });

  // ── Search profile parity ──────────────────────────────────────────────

  it("keeps search profile tier outcomes stable", () => {
    for (const scenario of golden.searchProfileScenarios) {
      const block = scenario.block as unknown as BlockSummary;
      const profile: SearchProfile = {
        ...EMPTY_PROFILE,
        mainFlatType: scenario.profile.mainFlatType ?? "",
        maxBudget: scenario.profile.maxBudget ?? null,
        maxComfortableCommuteMinutes: scenario.profile.maxComfortableCommuteMinutes ?? null,
        minimumRemainingLeaseYears: scenario.profile.minimumRemainingLeaseYears ?? null,
        budgetStretchPercent: scenario.profile.budgetStretchPercent ?? 5,
        commuteStretchMinutes: scenario.profile.commuteStretchMinutes ?? 10,
      };
      const result = evaluateBlockForProfile(block, profile, scenario.currentYear);
      expect(result.tier).toBe(scenario.expectedTier);
    }
  });

  it("keeps stretch budget dimension stable", () => {
    for (const scenario of golden.stretchBudgetScenarios) {
      const block = {
        medianPrice: scenario.blockMedianPrice,
        flatTypes: ["4 ROOM"],
      } as unknown as BlockSummary;
      const profile: SearchProfile = {
        ...EMPTY_PROFILE,
        mainFlatType: "4 ROOM",
        maxBudget: scenario.maxBudget,
        budgetStretchPercent: scenario.budgetStretchPercent,
      };
      const result = evaluateBlockForProfile(block, profile, 2026);
      expect(result.budget).toBe(scenario.expectedDimension);
    }
  });

  it("keeps commute proxy dimension stable", () => {
    for (const scenario of golden.commuteProxyScenarios) {
      const block = {
        flatTypes: ["4 ROOM"],
        medianPrice: 500000,
        leaseCommenceRange: [2020, 2020] as [number, number],
        nearestMrt:
          scenario.distanceMeters !== null
            ? {
                stationName: "X",
                distanceMeters: scenario.distanceMeters,
                walkingTimeSeconds: scenario.distanceMeters * 0.8,
              }
            : null,
        nearbyMrts: [],
      } as unknown as BlockSummary;
      const profile: SearchProfile = {
        ...EMPTY_PROFILE,
        maxComfortableCommuteMinutes: scenario.maxCommuteMinutes,
        commuteStretchMinutes: scenario.stretchMinutes,
      };
      const result = evaluateBlockForProfile(block, profile, 2026);
      expect(result.commute).toBe(scenario.expectedDimension);
    }
  });

  // ── Filter parity ──────────────────────────────────────────────────────

  it("keeps filter predicate outcomes stable", () => {
    for (const scenario of golden.filterScenarios) {
      const s = scenario as Record<string, unknown>;
      const block: Partial<BlockSummary> = {
        addressKey: "test",
        town: (s.blockTown as string) ?? "BEDOK",
        block: "1",
        streetName: "TEST",
        coordinates: { lat: 1.35, lng: 103.8 },
        medianPrice: (s.blockMedianPrice as number) ?? 500000,
        pricePerSqmMedian: 5500,
        transactionCount: 5,
        floorAreaRange: [80, 100],
        leaseCommenceRange: (s.blockLeaseCommenceRange as [number, number]) ?? [2000, 2000],
        latestMonth: "2026-01",
        availableDateRange: ["2024-01", "2026-01"],
        flatTypes: (s.blockFlatTypes as string[]) ?? ["4 ROOM"],
        flatModels: ["MODEL A"],
        nearestMrt:
          s.blockNearestMrtDistance !== undefined && s.blockNearestMrtDistance !== null
            ? {
                stationName: "X",
                distanceMeters: s.blockNearestMrtDistance as number,
                walkingTimeSeconds: (s.blockNearestMrtDistance as number) * 0.8,
              }
            : s.blockNearestMrtDistance === null
              ? null
              : { stationName: "X", distanceMeters: 400, walkingTimeSeconds: 320 },
        postalCode: null,
      };

      const filters: FilterState = {
        ...DEFAULT_FILTERS,
        town: (s.filterTown as string) ?? "",
        flatType: (s.filterFlatType as string) ?? "",
        budgetMin: (s.filterBudgetMin as number | undefined) ?? null,
        budgetMax: (s.filterBudgetMax as number | undefined) ?? null,
        remainingLeaseMin: (s.filterRemainingLeaseMin as number | undefined) ?? null,
        mrtMax: (s.filterMrtMax as number | undefined) ?? null,
      };

      const ctx = s.currentYear
        ? createFilterEvaluationContext(s.currentYear as number)
        : undefined;
      expect(
        matchesFilter(block as unknown as BlockSummary, filters, undefined, undefined, ctx),
      ).toBe(s.expected);
    }
  });

  it("keeps remaining lease filtering deterministic across explicit years", () => {
    for (const scenario of golden.leaseDeterminismScenarios) {
      const block: BlockSummary = {
        addressKey: scenario.name,
        town: "BEDOK",
        block: "1",
        streetName: "TEST",
        coordinates: { lat: 1.35, lng: 103.8 },
        medianPrice: 500000,
        pricePerSqmMedian: 5500,
        transactionCount: 5,
        floorAreaRange: [80, 100],
        leaseCommenceRange: [
          scenario.blockLeaseCommenceRange[0]!,
          scenario.blockLeaseCommenceRange[1]!,
        ],
        latestMonth: "2026-01",
        availableDateRange: ["2024-01", "2026-01"],
        flatTypes: ["4 ROOM"],
        flatModels: ["MODEL A"],
        nearestMrt: { stationName: "X", distanceMeters: 400, walkingTimeSeconds: 320 },
        postalCode: null,
      };
      const filters: FilterState = {
        ...DEFAULT_FILTERS,
        remainingLeaseMin: scenario.filterRemainingLeaseMin,
      };

      for (const [yearText, expected] of Object.entries(scenario.expectedByYear)) {
        const ctx = createFilterEvaluationContext(Number(yearText));

        expect(matchesFilter(block, filters, undefined, undefined, ctx)).toBe(expected);
      }
    }
  });

  // ── Geographic search parity ───────────────────────────────────────────

  it("keeps geographic search intent stable", () => {
    const baseFields = {
      town: "BEDOK",
      block: "101",
      streetName: "BEDOK NTH AVE 4",
      coordinates: { lat: 1.3339, lng: 103.9372 },
      medianPrice: 500000,
      pricePerSqmMedian: 5500,
      transactionCount: 5,
      floorAreaRange: [80, 100] as [number, number],
      leaseCommenceRange: [2000, 2000] as [number, number],
      latestMonth: "2026-01",
      availableDateRange: ["2024-01", "2026-01"] as [string, string],
      flatTypes: ["4 ROOM"],
      flatModels: ["MODEL A"],
      postalCode: null,
    };

    // Provide a corpus of blocks with all stations so intent resolution works
    const corpusBlocks: BlockSummary[] = [
      {
        ...baseFields,
        addressKey: "bedok-block",
        coordinates: { lat: 1.3339, lng: 103.9372 },
        nearestMrt: {
          stationName: "BEDOK MRT STATION",
          distanceMeters: 400,
          walkingTimeSeconds: 320,
        },
        nearbyMrts: [
          { stationName: "BEDOK MRT STATION", distanceMeters: 400, walkingTimeSeconds: 320 },
        ],
      },
      {
        ...baseFields,
        addressKey: "jurong-block",
        coordinates: { lat: 1.333, lng: 103.74 },
        nearestMrt: {
          stationName: "JURONG EAST MRT STATION",
          distanceMeters: 400,
          walkingTimeSeconds: 320,
        },
        nearbyMrts: [
          { stationName: "JURONG EAST MRT STATION", distanceMeters: 400, walkingTimeSeconds: 320 },
        ],
      },
    ];

    for (const scenario of golden.geographicSearchScenarios) {
      const s = scenario as Record<string, unknown>;

      // Resolve intent using the corpus (so station names are discoverable)
      const intent = resolveGeographicSearchIntent(
        scenario.query,
        corpusBlocks,
        scenario.radiusMeters,
      );
      expect(intent?.type).toBe(scenario.expectedIntentType);

      if (!intent) continue;

      // Build a test block matching the scenario's MRT or coordinates
      const mrt = s.blockNearestMrt as BlockSummary["nearestMrt"];
      const testBlock: BlockSummary = {
        ...baseFields,
        addressKey: "test-block",
        nearestMrt: mrt ?? corpusBlocks[0]!.nearestMrt,
        nearbyMrts: mrt ? [mrt] : [],
        coordinates: (s.blockCoordinates as BlockSummary["coordinates"]) ?? baseFields.coordinates,
      };

      expect(matchesGeographicSearchIntent(testBlock, intent)).toBe(scenario.expectedMatch);
    }
  });

  // ── Effective price parity ─────────────────────────────────────────────

  it("keeps effective median price selection stable", () => {
    for (const scenario of golden.effectivePriceScenarios) {
      const block = {
        medianPrice: scenario.blockMedianPrice,
        medianPriceByFlatType: scenario.blockMedianPriceByFlatType,
      } as unknown as BlockSummary;
      expect(getEffectiveMedianPrice(block, scenario.filterFlatType)).toBe(
        scenario.expectedEffectivePrice,
      );
    }
  });

  // ── Profile visibility parity ─────────────────────────────────────────

  it("keeps profile visibility semantics stable", () => {
    // No active profile → visibility inactive
    expect(isProfileVisibilityActive(EMPTY_PROFILE)).toBe(false);

    // Active profile with one dimension → visibility active
    expect(isProfileVisibilityActive({ ...EMPTY_PROFILE, maxBudget: 700000 })).toBe(true);

    // showAllBlocks overrides everything
    expect(
      isProfileVisibilityActive({ ...EMPTY_PROFILE, mainFlatType: "4 ROOM", showAllBlocks: true }),
    ).toBe(false);
  });
});
