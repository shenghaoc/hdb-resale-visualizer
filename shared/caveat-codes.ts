import type { ConfidenceAssessment, ConfidenceInput } from "./confidence-system";

export type CaveatCode =
  | "LOW_SAMPLE"
  | "VERY_LOW_SAMPLE"
  | "NO_COMPARABLES"
  | "STALE_DATA"
  | "NO_SAME_BLOCK"
  | "NO_SAME_STREET"
  | "WIDENED_TO_STREET"
  | "WIDENED_TO_TOWN"
  | "FLAT_TYPE_MISMATCH"
  | "FLOOR_AREA_MISMATCH"
  | "STOREY_MISMATCH"
  | "LEASE_MISMATCH"
  | "EXTREME_OUTLIER_LOW"
  | "EXTREME_OUTLIER_HIGH"
  | "TIME_ADJUSTMENT_APPLIED"
  | "SMALL_TREND_SAMPLE";

export type CaveatSeverity = "info" | "warning" | "critical";

export type Caveat = {
  code: CaveatCode;
  severity: CaveatSeverity;
  message: string;
};

export type GenerateCaveatsParams = {
  confidence: ConfidenceAssessment;
  percentileAmongComparables?: number;
  leaseCommenceYear?: number;
  comparableLeaseYears: number[];
  apiCaveats?: string[];
};

const WIDENED_STREET_PATTERN = /widened to the same street/i;
const WIDENED_TOWN_PATTERN = /widened to the entire town/i;

function mapApiCaveat(msg: string): CaveatCode | null {
  if (WIDENED_STREET_PATTERN.test(msg)) return "WIDENED_TO_STREET";
  if (WIDENED_TOWN_PATTERN.test(msg)) return "WIDENED_TO_TOWN";
  return null;
}

export function generateCaveats(params: GenerateCaveatsParams): Caveat[] {
  const {
    confidence,
    percentileAmongComparables,
    leaseCommenceYear,
    comparableLeaseYears,
    apiCaveats,
  } = params;
  const inp: ConfidenceInput = confidence.input;

  const seen = new Set<CaveatCode>();
  const caveats: Caveat[] = [];

  function add(code: CaveatCode, severity: CaveatSeverity, message: string): void {
    if (seen.has(code)) return;
    seen.add(code);
    caveats.push({ code, severity, message });
  }

  // --- Sample size ---
  if (inp.comparableCount === 0) {
    add(
      "NO_COMPARABLES",
      "critical",
      "No comparable transactions found — a verdict cannot be produced.",
    );
  } else if (inp.comparableCount < 3) {
    add(
      "VERY_LOW_SAMPLE",
      "warning",
      `Only ${inp.comparableCount} comparable transaction${inp.comparableCount === 1 ? "" : "s"} found — this assessment is unreliable.`,
    );
  } else if (inp.comparableCount < 5) {
    add(
      "LOW_SAMPLE",
      "warning",
      `Only ${inp.comparableCount} comparable transactions found — this assessment is directional only.`,
    );
  }

  // --- Recency ---
  if (
    inp.newestComparableAgeMonths != null &&
    inp.newestComparableAgeMonths > 12
  ) {
    add(
      "STALE_DATA",
      "warning",
      "No comparable transaction within the last 12 months — the market may have moved since the most recent data point.",
    );
  }

  // --- Scope proximity ---
  if (inp.comparableCount > 0 && inp.sameBlockCount === 0) {
    if (inp.sameStreetCount === 0) {
      add(
        "NO_SAME_STREET",
        "warning",
        "No comparable transactions from the same block or street — comparisons are drawn from the wider town.",
      );
    } else {
      add(
        "NO_SAME_BLOCK",
        "info",
        "No comparable transactions from the same block — comparisons are drawn from nearby blocks on the same street.",
      );
    }
  }

  // --- API-level widening caveats ---
  if (apiCaveats) {
    for (const msg of apiCaveats) {
      const code = mapApiCaveat(msg);
      if (code === "WIDENED_TO_STREET") {
        add(
          "WIDENED_TO_STREET",
          "info",
          "Few comparable transactions in the same block — search widened to the same street.",
        );
      } else if (code === "WIDENED_TO_TOWN") {
        add(
          "WIDENED_TO_TOWN",
          "warning",
          "Few comparable transactions on the same street — search widened to the entire town.",
        );
      }
    }
  }

  // --- Match quality ---
  if (inp.comparableCount > 0) {
    const ratio = (count: number) => count / inp.comparableCount;

    if (ratio(inp.flatTypeMatchCount) < 0.5) {
      add(
        "FLAT_TYPE_MISMATCH",
        "warning",
        "Fewer than half of the comparables match the flat type — price differences may reflect unit size rather than market conditions.",
      );
    }

    if (ratio(inp.floorAreaMatchCount) < 0.5) {
      add(
        "FLOOR_AREA_MISMATCH",
        "info",
        "Fewer than half of the comparables have a similar floor area — per-sqm prices may be more relevant than absolute prices.",
      );
    }

    if (ratio(inp.storeyMatchCount) < 0.5) {
      add(
        "STOREY_MISMATCH",
        "info",
        "Fewer than half of the comparables are on a similar storey — higher floors typically command a premium.",
      );
    }
  }

  // --- Lease mismatch ---
  if (leaseCommenceYear != null && comparableLeaseYears.length > 0) {
    const sorted = [...comparableLeaseYears].sort((a, b) => a - b);
    const medianLeaseYear = sorted[Math.floor(sorted.length / 2)];
    if (Math.abs(leaseCommenceYear - medianLeaseYear) > 10) {
      add(
        "LEASE_MISMATCH",
        "warning",
        `Your flat's lease began in ${leaseCommenceYear}, but most comparable transactions have leases starting around ${medianLeaseYear} (>10 year difference). The historical median may overstate or understate fair value for this specific flat.`,
      );
    }
  }

  // --- Extreme outliers ---
  if (percentileAmongComparables === 0) {
    add(
      "EXTREME_OUTLIER_LOW",
      "info",
      "The asking price is below all comparable transactions in the dataset — verify the listing details are correct.",
    );
  } else if (percentileAmongComparables === 100) {
    add(
      "EXTREME_OUTLIER_HIGH",
      "info",
      "The asking price exceeds all comparable transactions in the dataset — this may be an unrealistic or aspirational listing.",
    );
  }

  // --- Time adjustment ---
  if (inp.timeAdjustmentApplied) {
    add(
      "TIME_ADJUSTMENT_APPLIED",
      "info",
      "Comparable prices have been time-adjusted to reflect recent market trends.",
    );
  }

  // --- Trend sample ---
  if (inp.trendSampleSize != null && inp.trendSampleSize < 6) {
    add(
      "SMALL_TREND_SAMPLE",
      "warning",
      `Time adjustment is based on only ${inp.trendSampleSize} data point${inp.trendSampleSize === 1 ? "" : "s"} — the trend estimate may be unreliable.`,
    );
  }

  return caveats;
}
