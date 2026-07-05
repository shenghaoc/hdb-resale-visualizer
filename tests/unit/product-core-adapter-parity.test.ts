/**
 * Adapter-vs-shared parity tests.
 *
 * Verifies that the web adapter modules in `src/` produce identical results
 * to calling the shared product core directly with explicit parameters.
 * Prevents adapter drift: if someone changes the shared core logic or
 * adds a new parameter, these tests catch the divergence.
 */

import { beforeEach, describe, expect, it } from "vite-plus/test";
import golden from "../fixtures/platform-parity/product-core-golden.json";
import { DEFAULT_FILTERS, getCurrentYear } from "@/shared/lib/constants";
import type { AffordabilityProfile } from "@/shared/lib/affordability";
import type { BlockSummary, FilterState } from "@shared/data-types";
import type { SearchProfile } from "@shared/product/search-profile";

// ── Shared core (canonical logic) ────────────────────────────────────────
import {
  evaluateBlockForProfile as sharedEvaluateBlockForProfile,
  applyProfileVisibility as sharedApplyProfileVisibility,
  createProfileEvaluator as sharedCreateProfileEvaluator,
} from "@shared/product/search-profile";
import {
  matchesFilter as sharedMatchesFilter,
  resolveGeographicSearchIntent as sharedResolveGeographicSearchIntent,
  createFilterEvaluationContext as sharedCreateFilterEvaluationContext,
  resetFilteringCachesForTests,
} from "@shared/product/filtering";
import { passesAffordabilityMode as sharedPassesAffordabilityMode } from "@shared/product/affordability";

// ── Web adapters ─────────────────────────────────────────────────────────
import {
  evaluateBlockForProfile as adapterEvaluateBlockForProfile,
  applyProfileVisibility as adapterApplyProfileVisibility,
  createProfileEvaluator as adapterCreateProfileEvaluator,
} from "@/features/search-profile/matchProfile";
import {
  matchesFilter as adapterMatchesFilter,
  resolveGeographicSearchIntent as adapterResolveGeographicSearchIntent,
  createFilterEvaluationContext as adapterCreateFilterEvaluationContext,
} from "@/shared/lib/filtering";

// ── Test constants ───────────────────────────────────────────────────────

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

function makeProfile(overrides: Partial<SearchProfile> = {}): SearchProfile {
  return { ...EMPTY_PROFILE, ...overrides };
}

const BASE_BLOCK: BlockSummary = {
  addressKey: "test-block",
  town: "BEDOK",
  block: "1",
  streetName: "TEST",
  displayName: null,
  coordinates: { lat: 1.35, lng: 103.8 },
  medianPrice: 500000,
  pricePerSqmMedian: 5500,
  transactionCount: 5,
  floorAreaRange: [80, 100],
  leaseCommenceRange: [2000, 2000],
  latestMonth: "2026-01",
  availableDateRange: ["2024-01", "2026-01"],
  flatTypes: ["4 ROOM"],
  flatModels: ["MODEL A"],
  nearestMrt: { stationName: "X", distanceMeters: 400, walkingTimeSeconds: 320 },
  nearbyMrts: [],
  postalCode: null,
};

type BlockFixtureInput = Partial<
  Omit<BlockSummary, "availableDateRange" | "floorAreaRange" | "leaseCommenceRange">
> & {
  availableDateRange?: readonly string[];
  floorAreaRange?: readonly number[];
  leaseCommenceRange?: readonly number[];
};

function numberPair(
  value: readonly number[] | undefined,
  fallback: [number, number],
): [number, number] {
  return value && value.length >= 2 ? [value[0]!, value[1]!] : fallback;
}

function stringPair(
  value: readonly string[] | undefined,
  fallback: [string, string],
): [string, string] {
  return value && value.length >= 2 ? [value[0]!, value[1]!] : fallback;
}

function makeBlock(overrides: BlockFixtureInput = {}): BlockSummary {
  const { availableDateRange, floorAreaRange, leaseCommenceRange, ...rest } = overrides;
  return {
    ...BASE_BLOCK,
    ...rest,
    availableDateRange: stringPair(availableDateRange, BASE_BLOCK.availableDateRange),
    floorAreaRange: numberPair(floorAreaRange, BASE_BLOCK.floorAreaRange),
    leaseCommenceRange: numberPair(leaseCommenceRange, BASE_BLOCK.leaseCommenceRange),
  };
}

/** Build a nearestMrt from fixture distance data. */
function buildNearestMrt(distance: unknown): BlockSummary["nearestMrt"] {
  if (distance === null) return null;
  if (typeof distance === "number") {
    return {
      stationName: "X",
      distanceMeters: distance,
      // avg walking speed ~1.25 m/s => seconds
      walkingTimeSeconds: distance * 0.8,
    };
  }
  return { stationName: "X", distanceMeters: 400, walkingTimeSeconds: 320 };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("adapter-vs-shared parity", () => {
  beforeEach(() => resetFilteringCachesForTests());

  // ── Search profile evaluation tier ──────────────────────────────────────

  it("search profile tier matches shared core for all golden scenarios", () => {
    for (const scenario of golden.searchProfileScenarios) {
      const block = makeBlock(scenario.block);
      const profile = makeProfile({
        mainFlatType: scenario.profile.mainFlatType ?? "",
        maxBudget: scenario.profile.maxBudget ?? null,
        maxComfortableCommuteMinutes: scenario.profile.maxComfortableCommuteMinutes ?? null,
        minimumRemainingLeaseYears: scenario.profile.minimumRemainingLeaseYears ?? null,
        budgetStretchPercent: scenario.profile.budgetStretchPercent ?? 5,
        commuteStretchMinutes: scenario.profile.commuteStretchMinutes ?? 10,
      });
      const year = scenario.currentYear;

      const sharedResult = sharedEvaluateBlockForProfile(block, profile, year);
      const adapterResult = adapterEvaluateBlockForProfile(block, profile, year);

      expect(adapterResult).toEqual(sharedResult);
    }
  });

  it("search profile evaluator factory matches shared core for all scenarios", () => {
    for (const scenario of golden.searchProfileScenarios) {
      const block = makeBlock(scenario.block);
      const profile = makeProfile({
        mainFlatType: scenario.profile.mainFlatType ?? "",
        maxBudget: scenario.profile.maxBudget ?? null,
        maxComfortableCommuteMinutes: scenario.profile.maxComfortableCommuteMinutes ?? null,
        minimumRemainingLeaseYears: scenario.profile.minimumRemainingLeaseYears ?? null,
        budgetStretchPercent: scenario.profile.budgetStretchPercent ?? 5,
        commuteStretchMinutes: scenario.profile.commuteStretchMinutes ?? 10,
      });
      const year = scenario.currentYear;

      const sharedEval = sharedCreateProfileEvaluator(profile, year);
      const adapterEval = adapterCreateProfileEvaluator(profile, year);

      expect(adapterEval(block)).toEqual(sharedEval(block));
    }
  });

  it("alternative flat types produce stretch match via adapter", () => {
    const block = makeBlock({
      addressKey: "alt-test",
      medianPrice: 600000,
      pricePerSqmMedian: 6300,
      transactionCount: 10,
      floorAreaRange: [90, 100],
      leaseCommenceRange: [2000, 2000],
      latestMonth: "2026-01",
      availableDateRange: ["2024-01", "2026-01"],
      flatTypes: ["5 ROOM"],
      flatModels: ["MODEL A"],
      nearestMrt: { stationName: "X", distanceMeters: 400, walkingTimeSeconds: 320 },
      nearbyMrts: [],
      postalCode: null,
    });

    const profile = makeProfile({
      mainFlatType: "4 ROOM",
      alternativeFlatTypes: ["5 ROOM"],
    });

    const sharedResult = sharedEvaluateBlockForProfile(block, profile, 2026);
    const adapterResult = adapterEvaluateBlockForProfile(block, profile, 2026);

    expect(adapterResult).toEqual(sharedResult);
    expect(adapterResult.flatType).toBe("stretch");
    expect(adapterResult.tier).toBe("stretch");
  });

  // ── Profile visibility filtering ───────────────────────────────────────

  it("profile visibility filtering matches shared core across visibility states", () => {
    const blocks = [
      makeBlock({ addressKey: "pass", flatTypes: ["4 ROOM"], medianPrice: 600000 }),
      makeBlock({ addressKey: "stretch", flatTypes: ["4 ROOM"], medianPrice: 720000 }),
      makeBlock({ addressKey: "weak", flatTypes: ["3 ROOM"], medianPrice: 600000 }),
    ];
    const profiles = [
      makeProfile(),
      makeProfile({ maxBudget: 700000 }),
      makeProfile({ mainFlatType: "4 ROOM", maxBudget: 700000 }),
      makeProfile({ mainFlatType: "4 ROOM", maxBudget: 700000, showStretchOptions: false }),
      makeProfile({ mainFlatType: "4 ROOM", maxBudget: 700000, showAllBlocks: true }),
    ];
    const year = 2026;

    for (const profile of profiles) {
      const sharedResult = sharedApplyProfileVisibility(blocks, profile, year);
      const adapterResult = adapterApplyProfileVisibility(blocks, profile, year);

      expect(adapterResult.map((b) => b.addressKey)).toEqual(sharedResult.map((b) => b.addressKey));
    }
  });

  it("applyProfileVisibility matches shared core", () => {
    const blocks = golden.searchProfileScenarios.map((s) => makeBlock(s.block));
    const profile = makeProfile({
      mainFlatType: "4 ROOM",
      maxBudget: 700000,
      budgetStretchPercent: 5,
      maxComfortableCommuteMinutes: 30,
      commuteStretchMinutes: 10,
    });
    const year = 2026;

    const sharedResult = sharedApplyProfileVisibility(blocks, profile, year);
    const adapterResult = adapterApplyProfileVisibility(blocks, profile, year);

    expect(adapterResult.map((b) => b.addressKey)).toEqual(sharedResult.map((b) => b.addressKey));
  });

  // ── Town/budget filtering ──────────────────────────────────────────────

  it("town and budget filter matches shared core for all golden scenarios", () => {
    for (const scenario of golden.filterScenarios) {
      const s = scenario as Record<string, unknown>;
      const block = makeBlock({
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
        nearestMrt: buildNearestMrt(s.blockNearestMrtDistance),
        postalCode: null,
      });

      const filters: FilterState = {
        ...DEFAULT_FILTERS,
        town: (s.filterTown as string) ?? "",
        flatType: (s.filterFlatType as string) ?? "",
        budgetMin: (s.filterBudgetMin as number | undefined) ?? null,
        budgetMax: (s.filterBudgetMax as number | undefined) ?? null,
        remainingLeaseMin: (s.filterRemainingLeaseMin as number | undefined) ?? null,
        mrtMax: (s.filterMrtMax as number | undefined) ?? null,
      };

      // Use sharedCreateFilterEvaluationContext with fixture year to avoid
      // getCurrentYear() drift — the adapter's 0-arg version defaults to
      // the runtime year, which would diverge from the fixture in 2027+.
      const ctx = s.currentYear
        ? sharedCreateFilterEvaluationContext(s.currentYear as number)
        : undefined;

      const sharedResult = sharedMatchesFilter(block, filters, undefined, undefined, ctx);

      const adapterResult = adapterMatchesFilter(
        block,
        filters,
        undefined,
        undefined,
        undefined,
        ctx,
      );

      expect(adapterResult).toBe(sharedResult);
    }
  });

  // ── Remaining lease filtering determinism ──────────────────────────────

  it("remaining lease filtering uses explicit-year golden scenarios", () => {
    for (const scenario of golden.leaseDeterminismScenarios) {
      const block = makeBlock({
        addressKey: scenario.name,
        leaseCommenceRange: scenario.blockLeaseCommenceRange,
      });
      const filters: FilterState = {
        ...DEFAULT_FILTERS,
        remainingLeaseMin: scenario.filterRemainingLeaseMin,
      };

      for (const [yearText, expected] of Object.entries(scenario.expectedByYear)) {
        const ctx = sharedCreateFilterEvaluationContext(Number(yearText));

        const sharedResult = sharedMatchesFilter(block, filters, undefined, undefined, ctx);
        const adapterResult = adapterMatchesFilter(
          block,
          filters,
          undefined,
          undefined,
          undefined,
          ctx,
        );

        expect(sharedResult).toBe(expected);
        expect(adapterResult).toBe(expected);
      }
    }
  });

  it("filter evaluation context adapter matches the shared current-year context", () => {
    expect(adapterCreateFilterEvaluationContext()).toEqual(
      sharedCreateFilterEvaluationContext(getCurrentYear()),
    );
  });

  // ── Geographic intent ──────────────────────────────────────────────────

  it("geographic search intent resolution matches shared core", () => {
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
      // Resolve intent using shared core
      const sharedIntent = sharedResolveGeographicSearchIntent(
        scenario.query,
        corpusBlocks,
        scenario.radiusMeters,
      );

      // Resolve intent using adapter
      const adapterIntent = adapterResolveGeographicSearchIntent(
        scenario.query,
        corpusBlocks,
        scenario.radiusMeters,
      );

      // Both should resolve to the same intent
      expect(adapterIntent).toEqual(sharedIntent);
    }
  });

  // ── Stretch budget dimension ───────────────────────────────────────────

  it("stretch budget dimension matches shared core", () => {
    for (const scenario of golden.stretchBudgetScenarios) {
      const block = makeBlock({
        medianPrice: scenario.blockMedianPrice,
        flatTypes: ["4 ROOM"],
      });
      const profile = makeProfile({
        mainFlatType: "4 ROOM",
        maxBudget: scenario.maxBudget,
        budgetStretchPercent: scenario.budgetStretchPercent,
      });

      const sharedResult = sharedEvaluateBlockForProfile(block, profile, 2026);
      const adapterResult = adapterEvaluateBlockForProfile(block, profile, 2026);

      expect(adapterResult.budget).toBe(sharedResult.budget);
    }
  });

  // ── Commute proxy dimension ────────────────────────────────────────────

  it("commute proxy dimension matches shared core", () => {
    for (const scenario of golden.commuteProxyScenarios) {
      const block = makeBlock({
        flatTypes: ["4 ROOM"],
        medianPrice: 500000,
        leaseCommenceRange: [2020, 2020],
        nearestMrt:
          scenario.distanceMeters !== null
            ? {
                stationName: "X",
                distanceMeters: scenario.distanceMeters,
                // avg walking speed ~1.25 m/s => seconds
                walkingTimeSeconds: scenario.distanceMeters * 0.8,
              }
            : null,
        nearbyMrts: [],
      });
      const profile = makeProfile({
        maxComfortableCommuteMinutes: scenario.maxCommuteMinutes,
        commuteStretchMinutes: scenario.stretchMinutes,
      });

      const sharedResult = sharedEvaluateBlockForProfile(block, profile, 2026);
      const adapterResult = adapterEvaluateBlockForProfile(block, profile, 2026);

      expect(adapterResult.commute).toBe(sharedResult.commute);
    }
  });

  it("commute proxy with anchor MRT matches shared core", () => {
    const block = makeBlock({
      addressKey: "anchor-test",
      medianPrice: 600000,
      pricePerSqmMedian: 6300,
      transactionCount: 10,
      floorAreaRange: [90, 100],
      leaseCommenceRange: [2020, 2020],
      latestMonth: "2026-01",
      availableDateRange: ["2024-01", "2026-01"],
      flatTypes: ["4 ROOM"],
      flatModels: ["MODEL A"],
      nearestMrt: {
        stationName: "OTHER MRT STATION",
        distanceMeters: 5000,
        walkingTimeSeconds: 4000,
      },
      nearbyMrts: [
        { stationName: "BEDOK MRT STATION", distanceMeters: 400, walkingTimeSeconds: 320 },
        { stationName: "OTHER MRT STATION", distanceMeters: 5000, walkingTimeSeconds: 4000 },
      ],
      postalCode: null,
    });

    const profile = makeProfile({
      maxComfortableCommuteMinutes: 30,
      commuteAnchorMrt: "BEDOK MRT STATION",
    });

    const sharedResult = sharedEvaluateBlockForProfile(block, profile, 2026);
    const adapterResult = adapterEvaluateBlockForProfile(block, profile, 2026);

    expect(adapterResult).toEqual(sharedResult);
    expect(adapterResult.commute).toBe("pass");
  });

  // ── Affordability integration ──────────────────────────────────────────

  it("affordable filter adapter computes verdict before delegating to shared core", () => {
    const block = makeBlock({
      addressKey: "afford-test",
      medianPrice: 900000,
    });
    const affordabilityProfile: AffordabilityProfile = {
      monthlyIncome: 4000,
      cpfOABalance: 50000,
      age: 35,
      coApplicantAge: null,
    };

    const filters: FilterState = {
      ...DEFAULT_FILTERS,
      affordable: "comfortable",
    };

    const passesAffordability = sharedPassesAffordabilityMode(
      block,
      affordabilityProfile,
      filters.affordable,
    );
    const sharedResult = sharedMatchesFilter(
      block,
      filters,
      undefined,
      undefined,
      undefined,
      passesAffordability,
    );
    const adapterResult = adapterMatchesFilter(block, filters, undefined, affordabilityProfile);

    expect(passesAffordability).toBe(false);
    expect(adapterResult).toBe(sharedResult);
    expect(adapterResult).toBe(false);
  });
});
