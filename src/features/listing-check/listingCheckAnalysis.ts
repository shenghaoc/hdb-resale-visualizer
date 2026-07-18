import {
  assessAskingPrice,
  type AskingPriceAssessment,
} from "@/entities/transaction/transaction-analysis";
import {
  computeConfidence,
  type ConfidenceAssessment,
  type ConfidenceInput,
} from "../../../shared/confidence-system";
import { generateCaveats, type Caveat } from "../../../shared/caveat-codes";
import type { AddressDetail, AddressDetailTransaction } from "@/types/data";
import type {
  ListingComparableSet,
  ComparableTransaction,
} from "../../../shared/comparable-engine";
import type { AdjustmentLabel, TimeAdjustedComparable } from "../../../shared/data-types";
import {
  getComparableSetQualityTag,
  type ComparableQualityTag,
} from "@/shared/lib/listing-quality";

// ── Types ───────────────────────────────────────────────────────────────────

export type ListingAdjustmentInfo = {
  adjustedResalePrice: number | null;
  adjustedPricePerSqm: number | null;
  adjustmentLabel: AdjustmentLabel | null;
};

export type ListingAdjustmentMeta = {
  adjustmentApplied: boolean;
  adjustmentCaveats: string[];
  adjustmentMap: Map<string, ListingAdjustmentInfo>;
};

export type ListingComparableResponse = ListingComparableSet & {
  comparables?: Array<ComparableTransaction & Partial<TimeAdjustedComparable>>;
  adjustmentApplied?: boolean;
  adjustmentCaveats?: string[];
};

export type DisplayComparable = ComparableTransaction & {
  rawResalePrice?: number;
  rawPricePerSqm?: number;
};

export type ComparablePayload = {
  comparableTransactions: AddressDetailTransaction[];
  sameBlockCount: number;
  sameStreetCount: number;
  sameTownCount: number;
  flatTypeMatchCount: number;
  floorAreaMatchCount: number;
  storeyMatchCount: number;
  comparableLeaseYears: number[];
};

/** Derived assessment + confidence + caveats for the listing-check panel. */
export type ListingCheckAnalysisResult = {
  assessment: AskingPriceAssessment;
  confidence: ConfidenceAssessment;
  caveats: Caveat[];
};

export type ListingCheckAnalysisInput = {
  comparableSet: ListingComparableSet | null;
  detail: AddressDetail | null;
  askingPrice: number | null;
  floorAreaSqm: number | null;
  leaseCommenceYear: number | null;
  adjustmentMeta: ListingAdjustmentMeta | null;
};

export type ListingComparableRequestBody = {
  town: string;
  block: string;
  streetName: string;
  flatType: string;
  storeyRange: string;
  floorAreaSqm: number;
  leaseCommenceYear: number | null;
  referenceMonth: string;
};

// ── Pure helpers ────────────────────────────────────────────────────────────

/**
 * Build assessment transactions from a comparable set, optionally substituting
 * time-adjusted prices so the verdict/median/percentiles match the UI caveat.
 */
export function buildComparablePayload(
  comparableSet: ListingComparableSet,
  detail: AddressDetail,
  adjustmentMap?: ReadonlyMap<string, ListingAdjustmentInfo> | null,
): ComparablePayload {
  let sameBlockCount = 0;
  let sameStreetCount = 0;
  let sameTownCount = 0;
  let flatTypeMatchCount = 0;
  let floorAreaMatchCount = 0;
  let storeyMatchCount = 0;

  const comparableTransactions: AddressDetailTransaction[] = [];
  const comparableLeaseYears: number[] = [];

  for (const tx of comparableSet.comparables) {
    const adjusted = adjustmentMap?.get(tx.transactionId);
    comparableTransactions.push({
      id: tx.transactionId,
      month: tx.month,
      flatType: tx.flatType,
      storeyRange: tx.storeyRange,
      floorAreaSqm: tx.floorAreaSqm,
      flatModel: "",
      leaseCommenceDate: tx.leaseCommenceDate ?? 0,
      remainingLease: "",
      resalePrice: adjusted?.adjustedResalePrice ?? tx.resalePrice,
      pricePerSqm: adjusted?.adjustedPricePerSqm ?? tx.pricePerSqm,
      pricePerSqft: null,
    });

    if (tx.block === detail.summary.block && tx.town === detail.summary.town) {
      sameBlockCount += 1;
    }
    if (tx.streetName === detail.summary.streetName) {
      sameStreetCount += 1;
    }
    if (tx.town === detail.summary.town) {
      sameTownCount += 1;
    }
    if (tx.matchReasons?.includes("Same flat type")) {
      flatTypeMatchCount += 1;
    }
    if (tx.matchReasons?.some((reason) => reason.startsWith("Similar floor area"))) {
      floorAreaMatchCount += 1;
    }
    if (tx.matchReasons?.includes("Similar storey")) {
      storeyMatchCount += 1;
    }

    if (tx.leaseCommenceDate != null) {
      comparableLeaseYears.push(tx.leaseCommenceDate);
    }
  }

  return {
    comparableTransactions,
    sameBlockCount,
    sameStreetCount,
    sameTownCount,
    flatTypeMatchCount,
    floorAreaMatchCount,
    storeyMatchCount,
    comparableLeaseYears,
  };
}

/**
 * Parse time-adjustment metadata from a comparable-transactions API response.
 * Does not mutate the response object.
 */
export function buildListingAdjustmentMeta(
  response: ListingComparableResponse,
): ListingAdjustmentMeta | null {
  const comparables = response.comparables ?? [];
  if (comparables.length === 0) {
    return null;
  }

  const adjustmentMap = new Map<string, ListingAdjustmentInfo>();

  for (const c of comparables) {
    if (c.transactionId && c.adjustedResalePrice !== undefined) {
      adjustmentMap.set(c.transactionId, {
        adjustedResalePrice: c.adjustedResalePrice ?? null,
        adjustedPricePerSqm: c.adjustedPricePerSqm ?? null,
        adjustmentLabel: c.adjustmentLabel ?? null,
      });
    }
  }

  return {
    adjustmentApplied: response.adjustmentApplied ?? false,
    adjustmentCaveats: response.adjustmentCaveats ?? [],
    adjustmentMap,
  };
}

/**
 * Mirror time-adjusted prices into display rows when adjustment was applied,
 * preserving raw prices for the evidence table.
 */
export function buildDisplayComparables(
  comparableSet: ListingComparableSet | null,
  adjustmentMeta: ListingAdjustmentMeta | null,
): DisplayComparable[] {
  const raw = comparableSet?.comparables ?? [];
  if (!adjustmentMeta?.adjustmentApplied) return raw;
  return raw.map((c) => {
    const adjusted = adjustmentMeta.adjustmentMap.get(c.transactionId);
    if (!adjusted || adjusted.adjustedResalePrice == null) {
      return { ...c, rawResalePrice: c.resalePrice, rawPricePerSqm: c.pricePerSqm };
    }
    return {
      ...c,
      resalePrice: adjusted.adjustedResalePrice,
      pricePerSqm: adjusted.adjustedPricePerSqm ?? c.pricePerSqm,
      rawResalePrice: c.resalePrice,
      rawPricePerSqm: c.pricePerSqm,
    };
  });
}

/**
 * Derive the full listing-check result (assessment, confidence, caveats)
 * from comparable set + listing facts. Returns null when evidence is incomplete.
 */
export function deriveListingCheckResult(
  input: ListingCheckAnalysisInput,
): ListingCheckAnalysisResult | null {
  const { comparableSet, detail, askingPrice, floorAreaSqm, leaseCommenceYear, adjustmentMeta } =
    input;

  if (!comparableSet || comparableSet.comparables.length === 0 || askingPrice == null || !detail) {
    return null;
  }

  const adjustmentMap = adjustmentMeta?.adjustmentApplied ? adjustmentMeta.adjustmentMap : null;
  const comparablePayload = buildComparablePayload(comparableSet, detail, adjustmentMap);

  const assessment = assessAskingPrice({
    askingPrice,
    floorAreaSqm,
    comparables: comparablePayload.comparableTransactions,
  });

  if (!assessment) return null;

  const confidenceInput: ConfidenceInput = {
    comparableCount: comparableSet.comparables.length,
    sameBlockCount: comparablePayload.sameBlockCount,
    sameStreetCount: comparablePayload.sameStreetCount,
    sameTownCount: comparablePayload.sameTownCount,
    newestComparableAgeMonths: comparableSet.newestComparableAgeMonths,
    flatTypeMatchCount: comparablePayload.flatTypeMatchCount,
    floorAreaMatchCount: comparablePayload.floorAreaMatchCount,
    storeyMatchCount: comparablePayload.storeyMatchCount,
    timeAdjustmentApplied: adjustmentMeta?.adjustmentApplied ?? false,
    trendSampleSize: null,
  };

  const confidence = computeConfidence(confidenceInput);

  const caveats = generateCaveats({
    confidence,
    percentileAmongComparables: assessment.percentileAmongComparables,
    leaseCommenceYear: leaseCommenceYear ?? undefined,
    comparableLeaseYears: comparablePayload.comparableLeaseYears,
    apiCaveats: [...comparableSet.caveats, ...(adjustmentMeta?.adjustmentCaveats ?? [])],
  });

  return {
    assessment,
    confidence,
    caveats,
  };
}

/**
 * Quality tag for the comparable set, or null when no result is available.
 */
export function deriveComparableQualityTag(
  result: ListingCheckAnalysisResult | null,
  comparableSet: ListingComparableSet | null,
): ComparableQualityTag | null {
  if (!result || !comparableSet) {
    return null;
  }
  return getComparableSetQualityTag({
    confidence: result.confidence,
    widenedSearch: comparableSet.widenedSearch,
    newestComparableAgeMonths: comparableSet.newestComparableAgeMonths,
    caveatCodes: result.caveats.map((c) => c.code),
  });
}

/**
 * Caveat messages for the evidence table: structured caveats when a full
 * result exists, otherwise the union of API + adjustment caveat strings.
 */
export function deriveEvidenceCaveats(
  result: ListingCheckAnalysisResult | null,
  comparableSet: ListingComparableSet | null,
  adjustmentMeta: ListingAdjustmentMeta | null,
): string[] {
  if (result) {
    return result.caveats.map((c) => c.message);
  }
  return Array.from(
    new Set([...(comparableSet?.caveats ?? []), ...(adjustmentMeta?.adjustmentCaveats ?? [])]),
  );
}

/**
 * Flat-type options derived from address detail recent transactions.
 */
export function deriveFlatTypeOptions(detail: AddressDetail | null): string[] {
  if (!detail) return [];
  return Array.from(new Set(detail.recentTransactions.map((tx) => tx.flatType)));
}

/**
 * Storey-range options derived from address detail recent transactions.
 */
export function deriveStoreyOptions(detail: AddressDetail | null): string[] {
  if (!detail) return [];
  return Array.from(new Set(detail.recentTransactions.map((tx) => tx.storeyRange))).sort();
}

/**
 * Median floor-area midpoint fallback when the user has not entered a value.
 */
export function deriveFallbackFloorArea(detail: AddressDetail): number | null {
  if (detail.summary.floorAreaRange[0] != null && detail.summary.floorAreaRange[1] != null) {
    return (detail.summary.floorAreaRange[0] + detail.summary.floorAreaRange[1]) / 2;
  }
  return null;
}

/**
 * Build the comparable-transactions request body, or null when required
 * fields are missing (floor area / reference month).
 */
export function buildComparableRequestBody(options: {
  detail: AddressDetail;
  flatType: string;
  storeyRange: string;
  floorAreaSqm: number | null;
  leaseCommenceYear: number | null;
  referenceMonth?: string;
}): ListingComparableRequestBody | null {
  const { detail, flatType, storeyRange, floorAreaSqm, leaseCommenceYear, referenceMonth } =
    options;

  const effectiveFloorArea = floorAreaSqm ?? deriveFallbackFloorArea(detail);
  const effectiveReferenceMonth = referenceMonth ?? detail.summary.latestMonth;

  if (effectiveFloorArea == null || effectiveFloorArea <= 0 || !effectiveReferenceMonth) {
    return null;
  }

  return {
    town: detail.summary.town,
    block: detail.summary.block,
    streetName: detail.summary.streetName,
    flatType,
    storeyRange,
    floorAreaSqm: effectiveFloorArea,
    leaseCommenceYear: leaseCommenceYear ?? null,
    referenceMonth: effectiveReferenceMonth,
  };
}
