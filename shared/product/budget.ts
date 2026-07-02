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

const NEAR_THRESHOLD_PERCENT = 0.1;

export function getBudgetMatchSignal(
  medianPrice: number,
  budgetMin: number | null,
  budgetMax: number | null,
): BudgetMatchResult {
  if (!Number.isFinite(medianPrice) || (budgetMin === null && budgetMax === null)) {
    return { status: "no-budget", diffAmount: null };
  }

  const effectiveMin = budgetMin ?? 0;
  const effectiveMax = budgetMax ?? Number.POSITIVE_INFINITY;

  if (medianPrice >= effectiveMin && medianPrice <= effectiveMax) {
    return { status: "within", diffAmount: null };
  }

  if (medianPrice > effectiveMax) {
    const diff = medianPrice - effectiveMax;
    return {
      status: diff <= effectiveMax * NEAR_THRESHOLD_PERCENT ? "near-above" : "above-max",
      diffAmount: diff,
    };
  }

  const diff = effectiveMin - medianPrice;
  return {
    status: diff <= effectiveMin * NEAR_THRESHOLD_PERCENT ? "near-below" : "below-min",
    diffAmount: diff,
  };
}
