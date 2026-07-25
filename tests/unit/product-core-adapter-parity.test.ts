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
  createProfileEvaluator as adapterCreateProfileEvaluator,
} from "@/features/search-profile/matchProfile";
import {
  matchesFilter as adapterMatchesFilter,
  resolveGeographicSearchIntent as adapterResolveGeographicSearchIntent,
  createFilterEvaluationContext as adapterCreateFilterEvaluationContext,
} from "@/shared/lib/filtering";

// ── Test constants ───────────────────────────────────────────────────────

const EMPTY_PROFILE: SearchProfile = {
  version: 3,
  mainFlatType: "",
  maxBudget: null,
  minimumRemainingLeaseYears: null,
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

type FilterGoldenScenario = {
  blockTown?: string;
  filterTown?: string;
  blockFlatTypes?: string[];
  filterFlatType?: string;
  blockMedianPrice?: number;
  filterBudgetMin?: number | null;
  filterBudgetMax?: number | null;
  blockLeaseCommenceRange?: [number, number];
  filterRemainingLeaseMin?: number;
  currentYear?: number;
  blockNearestMrtDistance?: number | null;
  filterMrtMax?: number;
  expected: boolean;
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
        minimumRemainingLeaseYears: scenario.profile.minimumRemainingLeaseYears ?? null,
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
        minimumRemainingLeaseYears: scenario.profile.minimumRemainingLeaseYears ?? null,
      });
      const year = scenario.currentYear;

      const sharedEval = sharedCreateProfileEvaluator(profile, year);
      const adapterEval = adapterCreateProfileEvaluator(profile, year);

      expect(adapterEval(block)).toEqual(sharedEval(block));
    }
  });

  it("MRT data does not add a hidden profile-matching dimension", () => {
    const block = makeBlock({
      addressKey: "mrt-independent-test",
      medianPrice: 600000,
      pricePerSqmMedian: 6300,
      transactionCount: 10,
      floorAreaRange: [90, 100],
      leaseCommenceRange: [2000, 2000],
      latestMonth: "2026-01",
      availableDateRange: ["2024-01", "2026-01"],
      flatTypes: ["4 ROOM"],
      flatModels: ["MODEL A"],
      nearestMrt: { stationName: "X", distanceMeters: 400, walkingTimeSeconds: 320 },
      nearbyMrts: [],
      postalCode: null,
    });

    const profile = makeProfile({
      mainFlatType: "4 ROOM",
      maxBudget: 700_000,
      minimumRemainingLeaseYears: 60,
    });

    const sharedResult = sharedEvaluateBlockForProfile(block, profile, 2026);
    const adapterResult = adapterEvaluateBlockForProfile(block, profile, 2026);

    expect(adapterResult).toEqual(sharedResult);
    expect(adapterResult).not.toHaveProperty("commute");
    expect(adapterResult.tier).toBe("strong");
  });

  // ── Town/budget filtering ──────────────────────────────────────────────

  it("town and budget filter matches shared core for all golden scenarios", () => {
    for (const scenario of golden.filterScenarios) {
      const s = scenario as FilterGoldenScenario;
      const block = makeBlock({
        addressKey: "test",
        town: s.blockTown ?? "BEDOK",
        block: "1",
        streetName: "TEST",
        coordinates: { lat: 1.35, lng: 103.8 },
        medianPrice: s.blockMedianPrice ?? 500000,
        pricePerSqmMedian: 5500,
        transactionCount: 5,
        floorAreaRange: [80, 100],
        leaseCommenceRange: s.blockLeaseCommenceRange ?? [2000, 2000],
        latestMonth: "2026-01",
        availableDateRange: ["2024-01", "2026-01"],
        flatTypes: s.blockFlatTypes ?? ["4 ROOM"],
        flatModels: ["MODEL A"],
        nearestMrt: buildNearestMrt(s.blockNearestMrtDistance),
        postalCode: null,
      });

      const filters: FilterState = {
        ...DEFAULT_FILTERS,
        town: s.filterTown ?? "",
        flatType: s.filterFlatType ?? "",
        budgetMin: s.filterBudgetMin ?? null,
        budgetMax: s.filterBudgetMax ?? null,
        remainingLeaseMin: s.filterRemainingLeaseMin ?? null,
        mrtMax: s.filterMrtMax ?? null,
      };

      // Use sharedCreateFilterEvaluationContext with fixture year to avoid
      // getCurrentYear() drift — the adapter's 0-arg version defaults to
      // the runtime year, which would diverge from the fixture in 2027+.
      const ctx = s.currentYear ? sharedCreateFilterEvaluationContext(s.currentYear) : undefined;

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
