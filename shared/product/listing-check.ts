import type { AddressDetailTransaction } from "../data-types";
import {
  computeConfidence as computeEvidenceConfidence,
  type ConfidenceInput,
  type ConfidenceLevel,
} from "../confidence-system";
import { generateCaveats as generateEvidenceCaveats } from "../caveat-codes";
import {
  assessAskingPrice,
  findComparableTransactions,
  monthDiff,
  type AskingPriceAssessment,
  type ComparableQuery,
} from "./transaction-analysis";

export type { AskingPriceAssessment, ComparableQuery };

export type ListingConfidenceResult = {
  level: ConfidenceLevel;
  comparableCount: number;
  newestComparableMonth: string | null;
  reason: string;
};

export type Caveat = {
  severity: "info" | "warning";
  message: string;
};

function findNewestMonth(comparables: ReadonlyArray<AddressDetailTransaction>): string | null {
  let newest: string | null = null;
  for (const tx of comparables) {
    if (!newest || tx.month > newest) newest = tx.month;
  }
  return newest;
}

function listingConfidenceInput(count: number, ageMonths: number | null): ConfidenceInput {
  return {
    comparableCount: count,
    sameBlockCount: count,
    sameStreetCount: 0,
    sameTownCount: 0,
    newestComparableAgeMonths: ageMonths,
    flatTypeMatchCount: count,
    floorAreaMatchCount: count,
    storeyMatchCount: count,
    timeAdjustmentApplied: false,
    trendSampleSize: null,
  };
}

export function computeListingConfidence(
  comparables: ReadonlyArray<AddressDetailTransaction>,
  referenceMonth?: string,
): ListingConfidenceResult {
  const newestComparableMonth = findNewestMonth(comparables);
  const ageMonths =
    referenceMonth && newestComparableMonth
      ? Math.max(0, monthDiff(newestComparableMonth, referenceMonth))
      : null;
  const assessment = computeEvidenceConfidence(
    listingConfidenceInput(comparables.length, ageMonths),
  );

  return {
    level: assessment.level,
    comparableCount: comparables.length,
    newestComparableMonth,
    reason: assessment.summary,
  };
}

export function generateListingCaveats(params: {
  assessment: AskingPriceAssessment;
  confidence: ListingConfidenceResult;
  leaseCommenceYear?: number;
  comparableLeaseYears: number[];
  referenceMonth?: string;
}): Caveat[] {
  const ageMonths =
    params.referenceMonth && params.confidence.newestComparableMonth
      ? Math.max(0, monthDiff(params.confidence.newestComparableMonth, params.referenceMonth))
      : null;
  const confidenceAssessment = computeEvidenceConfidence(
    listingConfidenceInput(params.confidence.comparableCount, ageMonths),
  );

  return generateEvidenceCaveats({
    confidence: confidenceAssessment,
    percentileAmongComparables: params.assessment.percentileAmongComparables,
    leaseCommenceYear: params.leaseCommenceYear,
    comparableLeaseYears: params.comparableLeaseYears,
  }).map((caveat) => ({
    severity: caveat.severity === "critical" ? "warning" : caveat.severity,
    message: caveat.message,
  }));
}

export type ListingCheckResult = {
  assessment: AskingPriceAssessment;
  confidence: ListingConfidenceResult;
  caveats: Caveat[];
  comparables: ReadonlyArray<AddressDetailTransaction>;
};

export type ListingCheckParams = {
  askingPrice: number;
  floorAreaSqm: number | null;
  transactions: ReadonlyArray<AddressDetailTransaction>;
  comparableQuery: ComparableQuery;
  leaseCommenceYear?: number;
  referenceMonth?: string;
};

export function performListingCheck(params: ListingCheckParams): ListingCheckResult | null {
  const comparables = findComparableTransactions(params.transactions, params.comparableQuery);
  const assessment = assessAskingPrice({
    askingPrice: params.askingPrice,
    floorAreaSqm: params.floorAreaSqm,
    comparables,
  });

  if (!assessment) return null;

  const confidence = computeListingConfidence(comparables, params.referenceMonth);
  const comparableLeaseYears = comparables
    .filter((tx) => Number.isFinite(tx.leaseCommenceDate))
    .map((tx) => tx.leaseCommenceDate);
  const caveats = generateListingCaveats({
    assessment,
    confidence,
    leaseCommenceYear: params.leaseCommenceYear,
    comparableLeaseYears,
    referenceMonth: params.referenceMonth,
  });

  return { assessment, confidence, caveats, comparables };
}
