import type { AskingPriceAssessment } from "./transaction-analysis";
import type { ConfidenceResult } from "./listing-confidence";
import {
  computeConfidence as computeConfidenceV2,
  type ConfidenceInput,
} from "@shared/confidence-system";
import {
  generateCaveats as generateCaveatsV2,
} from "@shared/caveat-codes";

export type Caveat = {
  severity: "info" | "warning";
  message: string;
};

export type GenerateCaveatsParams = {
  assessment: AskingPriceAssessment;
  confidence: ConfidenceResult;
  leaseCommenceYear?: number;
  comparableLeaseYears: number[];
  referenceMonth?: string;
};

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

export function generateCaveats(params: GenerateCaveatsParams): Caveat[] {
  const { assessment, confidence, leaseCommenceYear, comparableLeaseYears, referenceMonth } = params;

  let ageMonths: number | null = null;
  if (referenceMonth && confidence.newestComparableMonth) {
    ageMonths = Math.max(0, monthDiff(confidence.newestComparableMonth, referenceMonth));
  }

  const input: ConfidenceInput = {
    comparableCount: confidence.comparableCount,
    sameBlockCount: confidence.comparableCount,
    sameStreetCount: 0,
    sameTownCount: 0,
    newestComparableAgeMonths: ageMonths,
    flatTypeMatchCount: confidence.comparableCount,
    floorAreaMatchCount: confidence.comparableCount,
    storeyMatchCount: confidence.comparableCount,
    timeAdjustmentApplied: false,
    trendSampleSize: null,
  };

  const confidenceAssessment = computeConfidenceV2(input);

  const v2Caveats = generateCaveatsV2({
    confidence: confidenceAssessment,
    percentileAmongComparables: assessment.percentileAmongComparables,
    leaseCommenceYear,
    comparableLeaseYears,
  });

  return v2Caveats.map((c) => ({
    severity: c.severity === "critical" ? "warning" as const : c.severity,
    message: c.message,
  }));
}
