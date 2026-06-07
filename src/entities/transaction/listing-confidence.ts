import type { AddressDetailTransaction } from "@/types/data";
import {
  computeConfidence as computeConfidenceV2,
  type ConfidenceLevel,
  type ConfidenceInput,
} from "@shared/confidence-system";

export type { ConfidenceLevel };

export type ConfidenceResult = {
  level: ConfidenceLevel;
  comparableCount: number;
  newestComparableMonth: string | null;
  reason: string;
};

function findNewestMonth(
  comparables: ReadonlyArray<AddressDetailTransaction>,
): string | null {
  let newest: string | null = null;
  for (const tx of comparables) {
    if (!newest || tx.month > newest) {
      newest = tx.month;
    }
  }
  return newest;
}

function monthDiff(
  txMonth: string,
  referenceMonth: string,
): number {
  const txYear = Number(txMonth.slice(0, 4));
  const txMon = Number(txMonth.slice(5, 7));
  const refYear = Number(referenceMonth.slice(0, 4));
  const refMon = Number(referenceMonth.slice(5, 7));
  return (refYear - txYear) * 12 + (refMon - txMon);
}

export function computeConfidence(
  comparables: ReadonlyArray<AddressDetailTransaction>,
  referenceMonth?: string,
): ConfidenceResult {
  const count = comparables.length;
  const newestMonth = findNewestMonth(comparables);

  let ageMonths: number | null = null;
  if (referenceMonth && newestMonth) {
    ageMonths = Math.max(0, monthDiff(newestMonth, referenceMonth));
  }

  const input: ConfidenceInput = {
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

  const assessment = computeConfidenceV2(input);

  return {
    level: assessment.level,
    comparableCount: count,
    newestComparableMonth: newestMonth,
    reason: assessment.summary,
  };
}
