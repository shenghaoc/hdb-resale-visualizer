import type { AddressDetailTransaction } from "../types/data";

export type ConfidenceLevel = "high" | "medium" | "low";

export type ConfidenceResult = {
  level: ConfidenceLevel;
  comparableCount: number;
  newestComparableMonth: string | null;
  reason: string;
};

/**
 * Computes a confidence level based on comparable transaction count and data
 * recency. The reference month (e.g. `manifest.dataWindow.maxMonth`) is used
 * to detect stale data. When omitted, no recency downgrade is applied.
 */
export function computeConfidence(
  comparables: ReadonlyArray<AddressDetailTransaction>,
  referenceMonth?: string,
): ConfidenceResult {
  const count = comparables.length;

  let newestMonth: string | null = null;
  for (const tx of comparables) {
    if (!newestMonth || tx.month > newestMonth) {
      newestMonth = tx.month;
    }
  }

  // Determine base level from sample size
  let level: ConfidenceLevel;
  if (count >= 12) {
    level = "high";
  } else if (count >= 5) {
    level = "medium";
  } else {
    level = "low";
  }

  // Recency downgrade: if reference month is provided and the newest
  // comparable is more than 12 months older than the reference, downgrade
  // one tier.
  if (referenceMonth && newestMonth) {
    const refYear = Number(referenceMonth.slice(0, 4));
    const refMon = Number(referenceMonth.slice(5, 7));
    const newestYear = Number(newestMonth.slice(0, 4));
    const newestMon = Number(newestMonth.slice(5, 7));
    const ageInMonths = (refYear - newestYear) * 12 + (refMon - newestMon);

    if (ageInMonths > 12) {
      if (level === "high") level = "medium";
      else if (level === "medium") level = "low";
      // "low" stays "low" even with stale data
    }
  }

  const reason = buildConfidenceReason(level, count, newestMonth, referenceMonth);

  return {
    level,
    comparableCount: count,
    newestComparableMonth: newestMonth,
    reason,
  };
}

function buildConfidenceReason(
  _level: ConfidenceLevel,
  count: number,
  newestMonth: string | null,
  referenceMonth?: string,
): string {
  const countPhrase =
    count === 0
      ? "No comparable transactions"
      : count === 1
        ? "1 comparable transaction"
        : `${count} comparable transactions`;

  let recencyNote = "";
  if (newestMonth && referenceMonth) {
    const refYear = Number(referenceMonth.slice(0, 4));
    const refMon = Number(referenceMonth.slice(5, 7));
    const newestYear = Number(newestMonth.slice(0, 4));
    const newestMon = Number(newestMonth.slice(5, 7));
    const ageInMonths = (refYear - newestYear) * 12 + (refMon - newestMon);
    if (ageInMonths > 12) {
      recencyNote = " with no recent data";
    } else {
      recencyNote = " with recent data";
    }
  }

  return `${countPhrase}${recencyNote}`;
}
