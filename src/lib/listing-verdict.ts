import type { AddressDetailTransaction } from "../types/data";
import {
  assessAskingPrice,
  findComparableTransactions,
  type AskingPriceAssessment,
  type ComparableQuery,
} from "./transaction-analysis";
import { computeConfidence, type ConfidenceResult } from "./listing-confidence";
import { generateCaveats, type Caveat } from "./listing-caveats";

export type { AskingPriceAssessment, ConfidenceResult, Caveat };

export type ListingCheckResult = {
  assessment: AskingPriceAssessment;
  confidence: ConfidenceResult;
  caveats: Caveat[];
};

export type ListingCheckParams = {
  askingPrice: number;
  floorAreaSqm: number | null;
  transactions: ReadonlyArray<AddressDetailTransaction>;
  comparableQuery: ComparableQuery;
  leaseCommenceYear?: number;
  referenceMonth?: string;
};

/**
 * Performs a full listing price check: finds comparable transactions,
 * assesses the asking price, computes confidence, and generates caveats.
 *
 * All computation is deterministic and client-side only. No AI, no
 * predictions, no external API calls.
 */
export function performListingCheck(
  params: ListingCheckParams,
): ListingCheckResult | null {
  const {
    askingPrice,
    floorAreaSqm,
    transactions,
    comparableQuery,
    leaseCommenceYear,
    referenceMonth,
  } = params;

  // Find comparable transactions using the same logic as AskingPriceCheck
  const comparables = findComparableTransactions(transactions, comparableQuery);

  // Assess the asking price against comparables
  const assessment = assessAskingPrice({
    askingPrice,
    floorAreaSqm,
    comparables,
  });

  if (!assessment) {
    return null;
  }

  // Compute confidence
  const confidence = computeConfidence(comparables, referenceMonth);

  // Collect lease commence years from comparables for caveat generation
  const comparableLeaseYears: number[] = [];
  for (const tx of comparables) {
    if (Number.isFinite(tx.leaseCommenceDate)) {
      comparableLeaseYears.push(tx.leaseCommenceDate);
    }
  }

  // Generate caveats
  const caveats = generateCaveats({
    assessment,
    confidence,
    leaseCommenceYear,
    comparableLeaseYears,
    referenceMonth,
  });

  return { assessment, confidence, caveats };
}
