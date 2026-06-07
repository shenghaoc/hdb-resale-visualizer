import type { AskingPriceAssessment } from "./transaction-analysis";
import type { ConfidenceResult } from "./listing-confidence";

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

/**
 * Generates plain-English caveats for a listing check result.
 *
 * Caveats are additive and do not duplicate. They warn the user about
 * data limitations that might affect the verdict's reliability.
 */
export function generateCaveats(params: GenerateCaveatsParams): Caveat[] {
  const { assessment, confidence, leaseCommenceYear, comparableLeaseYears, referenceMonth } = params;
  const caveats: Caveat[] = [];
  const messagesSeen = new Set<string>();

  function add(severity: Caveat["severity"], message: string): void {
    if (!messagesSeen.has(message)) {
      messagesSeen.add(message);
      caveats.push({ severity, message });
    }
  }

  // Low sample count
  if (confidence.comparableCount < 5) {
    if (confidence.comparableCount === 0) {
      add("warning", "No comparable transactions found — a verdict cannot be produced.");
    } else {
      add(
        "warning",
        `Only ${confidence.comparableCount} comparable transaction${confidence.comparableCount === 1 ? "" : "s"} found — this assessment is directional only and should not be treated as precise.`,
      );
    }
  }

  // Stale data
  if (confidence.newestComparableMonth) {
    const newestYear = Number(confidence.newestComparableMonth.slice(0, 4));
    const newestMon = Number(confidence.newestComparableMonth.slice(5, 7));

    let ageInMonths: number;
    if (referenceMonth) {
      const refYear = Number(referenceMonth.slice(0, 4));
      const refMon = Number(referenceMonth.slice(5, 7));
      ageInMonths = (refYear - newestYear) * 12 + (refMon - newestMon);
    } else {
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      ageInMonths = (currentYear - newestYear) * 12 + (currentMonth - newestMon);
    }

    if (ageInMonths > 12) {
      add(
        "warning",
        "No comparable transaction within the last 12 months — the market may have moved since the most recent data point.",
      );
    }
  }

  // Lease mismatch: user's lease commence year deviates from comparable median
  if (leaseCommenceYear != null && comparableLeaseYears.length > 0) {
    const sorted = [...comparableLeaseYears].sort((a, b) => a - b);
    const medianLeaseYear = sorted[Math.floor(sorted.length / 2)];
    const diff = Math.abs(leaseCommenceYear - medianLeaseYear);

    if (diff > 10) {
      add(
        "warning",
        `Your flat's lease began in ${leaseCommenceYear}, but most comparable transactions have leases starting around ${medianLeaseYear} (>10 year difference). The historical median may overstate or understate fair value for this specific flat.`,
      );
    }
  }

  // Extreme outlier: asking price at the extremes of the comparable range
  if (assessment.percentileAmongComparables === 0) {
    add(
      "info",
      "The asking price is below all comparable transactions in the dataset — verify the listing details are correct.",
    );
  } else if (assessment.percentileAmongComparables === 100) {
    add(
      "info",
      "The asking price exceeds all comparable transactions in the dataset — this may be an unrealistic or aspirational listing.",
    );
  }

  return caveats;
}
