export type BudgetMatchStatus =
  | "within"
  | "above-max"
  | "below-min"
  | "near-above"
  | "near-below"
  | "no-budget";

export type BudgetMatchResult = {
  status: BudgetMatchStatus;
  diffAmount: number | null;
};

const NEAR_THRESHOLD_PERCENT = 0.1; // 10% threshold for "near" indicators

export function getBudgetMatchSignal(
  medianPrice: number,
  budgetMin: number | null,
  budgetMax: number | null,
): BudgetMatchResult {
  if (!Number.isFinite(medianPrice)) {
    return { status: "no-budget", diffAmount: null };
  }

  // No budget filters active
  if (budgetMin === null && budgetMax === null) {
    return { status: "no-budget", diffAmount: null };
  }

  const effectiveMin = budgetMin ?? 0;
  const effectiveMax = budgetMax ?? Number.POSITIVE_INFINITY;

  // Within budget range
  if (medianPrice >= effectiveMin && medianPrice <= effectiveMax) {
    return { status: "within", diffAmount: null };
  }

  // Above max budget
  if (medianPrice > effectiveMax) {
    const diff = medianPrice - effectiveMax;
    const nearThreshold = effectiveMax * NEAR_THRESHOLD_PERCENT;

    if (diff <= nearThreshold) {
      return { status: "near-above", diffAmount: diff };
    }
    return { status: "above-max", diffAmount: diff };
  }

  // Below min budget
  const diff = effectiveMin - medianPrice;
  const nearThreshold = effectiveMin * NEAR_THRESHOLD_PERCENT;

  if (diff <= nearThreshold) {
    return { status: "near-below", diffAmount: diff };
  }
  return { status: "below-min", diffAmount: diff };
}
