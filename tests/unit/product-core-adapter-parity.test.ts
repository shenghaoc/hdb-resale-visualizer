/**
 * Adapter-vs-shared parity tests.
 *
 * Proves that the web adapter modules in `src/` produce identical results
 * to calling the shared product core directly with explicit parameters.
 * This is the cross-language contract for a future Swift macOS port:
 * if these tests pass, the adapters have not drifted from the canonical logic.
 */

import { beforeEach, describe, expect, it } from "vite-plus/test";
import golden from "../fixtures/platform-parity/product-core-golden.json";
import type { BlockSummary, FilterState } from "../../shared/data-types";
import type { SearchProfile } from "../../shared/product/search-profile";

// ── Shared core (canonical logic) ────────────────────────────────────────
import {
  evaluateBlockForProfile as sharedEvaluateBlockForProfile,
  isProfileVisibilityActive as sharedIsProfileVisibilityActive,
  applyProfileVisibility as sharedApplyProfileVisibility,
  createProfileEvaluator as sharedCreateProfileEvaluator,
} from "../../shared/product/search-profile";
import {
  matchesFilter as sharedMatchesFilter,
  resolveGeographicSearchIntent as sharedResolveGeographicSearchIntent,
  matchesGeographicSearchIntent as sharedMatchesGeographicSearchIntent,
  getEffectiveMedianPrice as sharedGetEffectiveMedianPrice,
  createFilterEvaluationContext as sharedCreateFilterEvaluationContext,
  resetFilteringCachesForTests,
} from "../../shared/product/filtering";

// ── Web adapters (thin wrappers) ─────────────────────────────────────────
import {
  evaluateBlockForProfile as adapterEvaluateBlockForProfile,
  isProfileVisibilityActive as adapterIsProfileVisibilityActive,
  applyProfileVisibility as adapterApplyProfileVisibility,
  createProfileEvaluator as adapterCreateProfileEvaluator,
} from "../../src/features/search-profile/matchProfile";
import {
  matchesFilter as adapterMatchesFilter,
  resolveGeographicSearchIntent as adapterResolveGeographicSearchIntent,
  matchesGeographicSearchIntent as adapterMatchesGeographicSearchIntent,
  getEffectiveMedianPrice as adapterGetEffectiveMedianPrice,
  createFilterEvaluationContext as adapterCreateFilterEvaluationContext,
} from "../../src/shared/lib/filtering";

// ── Shared fixtures ──────────────────────────────────────────────────────

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

// ── Tests ────────────────────────────────────────────────────────────────

describe("adapter-vs-shared parity", () => {
  beforeEach(() => resetFilteringCachesForTests());

  // ── Search profile evaluation tier ──────────────────────────────────────

  it("search profile tier matches shared core for all golden scenarios", () => {
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
      const year = scenario.currentYear;

      const sharedResult = sharedEvaluateBlockForProfile(block, profile, year);
      const adapterResult = adapterEvaluateBlockForProfile(block, profile, year);

      expect(adapterResult.tier).toBe(sharedResult.tier);
      expect(adapterResult.flatType).toBe(sharedResult.flatType);
      expect(adapterResult.lease).toBe(sharedResult.lease);
      expect(adapterResult.budget).toBe(sharedResult.budget);
      expect(adapterResult.commute).toBe(sharedResult.commute);
    }
  });

  it("search profile evaluator factory matches shared core", () => {
    const scenario = golden.searchProfileScenarios[0]!;
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
    const year = scenario.currentYear;

    const sharedEval = sharedCreateProfileEvaluator(profile, year);
    const adapterEval = adapterCreateProfileEvaluator(profile, year);

    const sharedResult = sharedEval(block);
    const adapterResult = adapterEval(block);

    expect(adapterResult.tier).toBe(sharedResult.tier);
    expect(adapterResult.flatType).toBe(sharedResult.flatType);
    expect(adapterResult.lease).toBe(sharedResult.lease);
    expect(adapterResult.budget).toBe(sharedResult.budget);
    expect(adapterResult.commute).toBe(sharedResult.commute);
  });

  // ── Profile visibility filtering ───────────────────────────────────────

  it("isProfileVisibilityActive matches shared core", () => {
    const profiles: SearchProfile[] = [
      EMPTY_PROFILE,
      { ...EMPTY_PROFILE, maxBudget: 700000 },
      { ...EMPTY_PROFILE, mainFlatType: "4 ROOM", showAllBlocks: true },
      { ...EMPTY_PROFILE, mainFlatType: "4 ROOM", maxBudget: 700000 },
    ];

    for (const profile of profiles) {
      expect(adapterIsProfileVisibilityActive(profile)).toBe(
        sharedIsProfileVisibilityActive(profile),
      );
    }
  });

  it("applyProfileVisibility matches shared core", () => {
    const blocks = golden.searchProfileScenarios.map((s) => s.block as unknown as BlockSummary);
    const profile: SearchProfile = {
      ...EMPTY_PROFILE,
      mainFlatType: "4 ROOM",
      maxBudget: 700000,
      budgetStretchPercent: 5,
      maxComfortableCommuteMinutes: 30,
      commuteStretchMinutes: 10,
    };
    const year = 2026;

    const sharedResult = sharedApplyProfileVisibility(blocks, profile, year);
    const adapterResult = adapterApplyProfileVisibility(blocks, profile, year);

    expect(adapterResult.map((b) => b.addressKey)).toEqual(sharedResult.map((b) => b.addressKey));
  });

  // ── Town/budget filtering ──────────────────────────────────────────────

  it("town and budget filter matches shared core for all golden scenarios", () => {
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

      // For remaining lease scenarios, provide explicit year context
      const ctx = s.currentYear
        ? sharedCreateFilterEvaluationContext(s.currentYear as number)
        : undefined;

      const sharedResult = sharedMatchesFilter(
        block as unknown as BlockSummary,
        filters,
        undefined,
        undefined,
        ctx,
      );

      // Adapter needs explicit evaluation context for remaining lease
      const adapterCtx = s.currentYear ? adapterCreateFilterEvaluationContext() : undefined;
      const adapterResult = adapterMatchesFilter(
        block as unknown as BlockSummary,
        filters,
        undefined,
        undefined,
        undefined,
        adapterCtx,
      );

      expect(adapterResult).toBe(sharedResult);
    }
  });

  // ── Remaining lease filtering determinism ──────────────────────────────

  it("remaining lease filtering is deterministic with explicit current year", () => {
    const block: Partial<BlockSummary> = {
      addressKey: "lease-test",
      town: "BEDOK",
      block: "1",
      streetName: "TEST",
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
      postalCode: null,
    };

    // MAX_LEASE_DURATION=99, remaining=99-(year-2000)
    // At 2026: 99-26=73, at 2025: 99-25=74
    // Use threshold=74 so 2026 fails (73<74) and 2025 passes (74≥74)
    const filters: FilterState = {
      ...DEFAULT_FILTERS,
      remainingLeaseMin: 74,
    };

    // Call shared core with explicit year
    const ctx2026 = sharedCreateFilterEvaluationContext(2026);
    const result1 = sharedMatchesFilter(
      block as unknown as BlockSummary,
      filters,
      undefined,
      undefined,
      ctx2026,
    );
    const result2 = sharedMatchesFilter(
      block as unknown as BlockSummary,
      filters,
      undefined,
      undefined,
      ctx2026,
    );

    // Deterministic: same year => same result
    expect(result1).toBe(result2);

    // Different year => different result
    const ctx2025 = sharedCreateFilterEvaluationContext(2025);
    const result3 = sharedMatchesFilter(
      block as unknown as BlockSummary,
      filters,
      undefined,
      undefined,
      ctx2025,
    );

    // 2026: 73<74 => fail, 2025: 74>=74 => pass
    expect(result1).toBe(false);
    expect(result3).toBe(true);

    // Verify adapter produces same result for 2026
    const adapterResult = adapterMatchesFilter(
      block as unknown as BlockSummary,
      filters,
      undefined,
      undefined,
      undefined,
      ctx2026,
    );
    expect(adapterResult).toBe(result1);
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
      const s = scenario as Record<string, unknown>;

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

      // Both should resolve to the same intent type
      expect(adapterIntent?.type).toBe(sharedIntent?.type);

      if (!sharedIntent || !adapterIntent) continue;

      // Build a test block for matching
      const mrt = s.blockNearestMrt as BlockSummary["nearestMrt"];
      const testBlock: BlockSummary = {
        ...baseFields,
        addressKey: "test-block",
        nearestMrt: mrt ?? corpusBlocks[0]!.nearestMrt,
        nearbyMrts: mrt ? [mrt] : [],
        coordinates: (s.blockCoordinates as BlockSummary["coordinates"]) ?? baseFields.coordinates,
      };

      // Both should match/not-match identically
      expect(adapterMatchesGeographicSearchIntent(testBlock, adapterIntent)).toBe(
        sharedMatchesGeographicSearchIntent(testBlock, sharedIntent),
      );
    }
  });

  // ── Effective median price ──────────────────────────────────────────────

  it("effective median price selection matches shared core", () => {
    for (const scenario of golden.effectivePriceScenarios) {
      const block = {
        medianPrice: scenario.blockMedianPrice,
        medianPriceByFlatType: scenario.blockMedianPriceByFlatType,
      } as unknown as BlockSummary;

      expect(adapterGetEffectiveMedianPrice(block, scenario.filterFlatType)).toBe(
        sharedGetEffectiveMedianPrice(block, scenario.filterFlatType),
      );
    }
  });

  // ── Stretch budget dimension ───────────────────────────────────────────

  it("stretch budget dimension matches shared core", () => {
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

      const sharedResult = sharedEvaluateBlockForProfile(block, profile, 2026);
      const adapterResult = adapterEvaluateBlockForProfile(block, profile, 2026);

      expect(adapterResult.budget).toBe(sharedResult.budget);
    }
  });

  // ── Commute proxy dimension ────────────────────────────────────────────

  it("commute proxy dimension matches shared core", () => {
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

      const sharedResult = sharedEvaluateBlockForProfile(block, profile, 2026);
      const adapterResult = adapterEvaluateBlockForProfile(block, profile, 2026);

      expect(adapterResult.commute).toBe(sharedResult.commute);
    }
  });
});
