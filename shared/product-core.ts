import type { AddressDetailTransaction, BlockSummary } from "./data-types";
import { parseStoreyMidpoint } from "./comparable-engine";
import {
  computeConfidence as computeEvidenceConfidence,
  type ConfidenceInput,
  type ConfidenceLevel,
} from "./confidence-system";
import { generateCaveats as generateEvidenceCaveats } from "./caveat-codes";

export const MAX_LEASE_DURATION = 99;
export const HDB_MAX_LTV_RATIO = 0.75;
export const HDB_MAX_BUYER_AGE = 95;
export const HDB_LOAN_TENURE_MONTHS = 25 * 12;
export const HDB_CONCESSIONARY_ANNUAL_RATE = 0.026;
export const HDB_MORTGAGE_SERVICING_RATIO = 0.3;
export const COMFORTABLE_AFFORDABILITY_RATIO = 0.8;

export type AffordabilityProfile = {
  monthlyIncome: number | null;
  cpfOABalance: number | null;
  age: number | null;
  coApplicantAge?: number | null;
};

export type AffordabilityStatus = "comfortable" | "stretch" | "over" | "unknown";

export type AffordabilityVerdict = {
  maxAffordablePrice: number;
  monthlyRepayment: number;
  cashOutlay: number;
  downPaymentFromCpf: number;
  loanAmount: number;
  status: AffordabilityStatus;
};

export function computeLoanTenureYears(age: number | null): number {
  if (age === null) return 25;
  return Math.min(25, Math.max(0, 65 - age));
}

export function maxLoanFor(monthlyIncome: number, tenureMonths?: number): number {
  if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) return 0;
  const months = tenureMonths ?? HDB_LOAN_TENURE_MONTHS;
  if (months <= 0) return 0;
  const maxMonthlyPayment = monthlyIncome * HDB_MORTGAGE_SERVICING_RATIO;
  const monthlyRate = HDB_CONCESSIONARY_ANNUAL_RATE / 12;
  const discount = (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;
  return Math.floor(maxMonthlyPayment * discount);
}

export function maxAffordablePrice(profile: AffordabilityProfile): number {
  const cpf = profile.cpfOABalance ?? 0;
  const income = profile.monthlyIncome ?? 0;
  const tenureYears = computeLoanTenureYears(profile.age);
  const maxLoan = income > 0 && tenureYears > 0 ? maxLoanFor(income, tenureYears * 12) : 0;
  if (maxLoan <= 0) return Math.floor(cpf);
  const totalFundsConstraint = maxLoan + cpf;
  const downpaymentConstraint = cpf > 0 ? cpf / (1 - HDB_MAX_LTV_RATIO) : 0;
  return Math.floor(Math.min(totalFundsConstraint, downpaymentConstraint));
}

export function computeAffordabilityVerdict(
  profile: AffordabilityProfile,
  medianPrice: number,
): AffordabilityVerdict {
  if (profile.monthlyIncome === null) {
    return {
      maxAffordablePrice: maxAffordablePrice(profile),
      monthlyRepayment: 0,
      cashOutlay: 0,
      downPaymentFromCpf: 0,
      loanAmount: 0,
      status: "unknown",
    };
  }

  const income = profile.monthlyIncome;
  const cpf = profile.cpfOABalance ?? 0;
  const tenureYears = computeLoanTenureYears(profile.age);
  const ceiling = maxAffordablePrice(profile);
  let downPaymentFromCpf: number;
  let cashOutlay: number;
  let loanAmount: number;
  let monthlyRepayment = 0;

  if (tenureYears <= 0) {
    loanAmount = 0;
    downPaymentFromCpf = Math.min(cpf, medianPrice);
    cashOutlay = Math.max(0, medianPrice - downPaymentFromCpf);
  } else {
    const maxLoan = maxLoanFor(income, tenureYears * 12);
    const requiredLoan = HDB_MAX_LTV_RATIO * medianPrice;
    loanAmount = Math.floor(Math.min(requiredLoan, maxLoan));
    const totalRequiredFromOwnFunds = medianPrice - loanAmount;
    downPaymentFromCpf = Math.min(cpf, totalRequiredFromOwnFunds);
    cashOutlay = Math.max(0, totalRequiredFromOwnFunds - downPaymentFromCpf);
    const months = tenureYears * 12;
    const monthlyRate = HDB_CONCESSIONARY_ANNUAL_RATE / 12;
    if (months > 0 && loanAmount > 0) {
      const discount = (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;
      monthlyRepayment = Math.ceil(loanAmount / discount);
    }
  }

  const status: AffordabilityStatus =
    ceiling <= 0
      ? "over"
      : medianPrice <= ceiling * COMFORTABLE_AFFORDABILITY_RATIO
        ? "comfortable"
        : medianPrice <= ceiling
          ? "stretch"
          : "over";

  return {
    maxAffordablePrice: ceiling,
    monthlyRepayment,
    cashOutlay,
    downPaymentFromCpf,
    loanAmount,
    status,
  };
}

export function minRequiredRemainingLease(age: number): number {
  return Math.max(0, HDB_MAX_BUYER_AGE - age);
}

export function remainingLeaseYears(leaseCommenceYear: number, currentYear: number): number {
  return MAX_LEASE_DURATION - (currentYear - leaseCommenceYear);
}

export function isBlockAgeEligible(
  block: Pick<BlockSummary, "leaseCommenceRange">,
  age: number,
  currentYear: number,
): boolean {
  return (
    remainingLeaseYears(block.leaseCommenceRange[1], currentYear) >= minRequiredRemainingLease(age)
  );
}

export type BudgetMatchStatus =
  | "within"
  | "above-max"
  | "below-min"
  | "near-above"
  | "near-below"
  | "no-budget";
export type BudgetMatchResult = { status: BudgetMatchStatus; diffAmount: number | null };
const NEAR_THRESHOLD_PERCENT = 0.1;

export function getBudgetMatchSignal(
  medianPrice: number,
  budgetMin: number | null,
  budgetMax: number | null,
): BudgetMatchResult {
  if (!Number.isFinite(medianPrice) || (budgetMin === null && budgetMax === null))
    return { status: "no-budget", diffAmount: null };
  const effectiveMin = budgetMin ?? 0;
  const effectiveMax = budgetMax ?? Number.POSITIVE_INFINITY;
  if (medianPrice >= effectiveMin && medianPrice <= effectiveMax)
    return { status: "within", diffAmount: null };
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

export function monthDiff(
  txMonth: string | undefined | null,
  referenceMonth: string | undefined | null,
): number {
  if (!txMonth || !referenceMonth || txMonth.length < 7 || referenceMonth.length < 7) return 0;
  const txYear = Number(txMonth.slice(0, 4));
  const txMon = Number(txMonth.slice(5, 7));
  const refYear = Number(referenceMonth.slice(0, 4));
  const refMon = Number(referenceMonth.slice(5, 7));
  if (Number.isNaN(txYear) || Number.isNaN(txMon) || Number.isNaN(refYear) || Number.isNaN(refMon))
    return 0;
  return (refYear - txYear) * 12 + (refMon - txMon);
}

export type TrendRangeKey = "2y" | "5y" | "10y" | "max";
export const TREND_RANGE_MONTHS: Record<TrendRangeKey, number | null> = {
  "2y": 24,
  "5y": 60,
  "10y": 120,
  max: null,
};

export type ComparableTolerances = { storey: number; sqm: number };
export type ComparableQuery = {
  flatType: string | null;
  storeyMidpoint: number | null;
  floorAreaSqm: number | null;
  tolerances?: ComparableTolerances;
};
const DEFAULT_TOLERANCES: ComparableTolerances = { storey: 3, sqm: 5 };

export function findComparableTransactions(
  transactions: ReadonlyArray<AddressDetailTransaction>,
  query: ComparableQuery,
): AddressDetailTransaction[] {
  const tol = query.tolerances ?? DEFAULT_TOLERANCES;
  return transactions.filter((tx) => {
    if (query.flatType && tx.flatType !== query.flatType) return false;
    if (query.storeyMidpoint != null) {
      const mid = parseStoreyMidpoint(tx.storeyRange);
      if (mid == null || Math.abs(mid - query.storeyMidpoint) > tol.storey) return false;
    }
    return query.floorAreaSqm == null || Math.abs(tx.floorAreaSqm - query.floorAreaSqm) <= tol.sqm;
  });
}

export function percentile(sorted: ReadonlyArray<number>, p: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (1 - (idx - lo)) + sorted[hi] * (idx - lo);
}

export const RECENT_TRANSACTION_OUTLIER_MIN_SAMPLE_SIZE = 6;
export const RECENT_TRANSACTION_OUTLIER_IQR_MULTIPLIER = 1.5;
export const RECENT_TRANSACTION_OUTLIER_MEDIAN_PCT_THRESHOLD = 20;
export type RecentTransactionOutlierDirection = "high" | "low";
export type RecentTransactionOutlier = {
  id: string;
  flatType: string;
  direction: RecentTransactionOutlierDirection;
  medianPrice: number;
  percentFromMedian: number;
};
export function detectRecentTransactionOutliers(
  transactions: ReadonlyArray<AddressDetailTransaction>,
): Map<string, RecentTransactionOutlier> {
  const byFlatType = new Map<string, AddressDetailTransaction[]>();
  for (const tx of transactions) {
    const bucket = byFlatType.get(tx.flatType) ?? [];
    bucket.push(tx);
    byFlatType.set(tx.flatType, bucket);
  }
  const outliers = new Map<string, RecentTransactionOutlier>();
  for (const [flatType, group] of byFlatType) {
    if (group.length < RECENT_TRANSACTION_OUTLIER_MIN_SAMPLE_SIZE) continue;
    const prices = group.map((tx) => tx.resalePrice).sort((a, b) => a - b);
    const medianPrice = percentile(prices, 0.5);
    if (!Number.isFinite(medianPrice) || medianPrice <= 0) continue;
    const q1 = percentile(prices, 0.25);
    const q3 = percentile(prices, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - iqr * RECENT_TRANSACTION_OUTLIER_IQR_MULTIPLIER;
    const upperFence = q3 + iqr * RECENT_TRANSACTION_OUTLIER_IQR_MULTIPLIER;
    for (const tx of group) {
      const percentFromMedian = ((tx.resalePrice - medianPrice) / medianPrice) * 100;
      const isHigh =
        tx.resalePrice > upperFence &&
        percentFromMedian >= RECENT_TRANSACTION_OUTLIER_MEDIAN_PCT_THRESHOLD;
      const isLow =
        tx.resalePrice < lowerFence &&
        percentFromMedian <= -RECENT_TRANSACTION_OUTLIER_MEDIAN_PCT_THRESHOLD;
      if (!isHigh && !isLow) continue;
      outliers.set(tx.id, {
        id: tx.id,
        flatType,
        direction: isHigh ? "high" : "low",
        medianPrice,
        percentFromMedian,
      });
    }
  }
  return outliers;
}

export type ComparableSummary = {
  count: number;
  medianPrice: number;
  medianPricePerSqm: number;
  p25Price: number;
  p75Price: number;
  minPrice: number;
  maxPrice: number;
  latestMonth: string | null;
};
export function summarizeComparables(
  comparables: ReadonlyArray<AddressDetailTransaction>,
): ComparableSummary | null {
  if (comparables.length === 0) return null;
  const prices = comparables.map((t) => t.resalePrice).sort((a, b) => a - b);
  const psm = comparables.map((t) => t.pricePerSqm).sort((a, b) => a - b);
  let latestMonth: string | null = null;
  for (const t of comparables) if (!latestMonth || t.month > latestMonth) latestMonth = t.month;
  return {
    count: comparables.length,
    medianPrice: percentile(prices, 0.5),
    medianPricePerSqm: percentile(psm, 0.5),
    p25Price: percentile(prices, 0.25),
    p75Price: percentile(prices, 0.75),
    minPrice: prices[0],
    maxPrice: prices[prices.length - 1],
    latestMonth,
  };
}

export type AskingPriceAssessment = {
  comparableCount: number;
  summary: ComparableSummary;
  deltaVsMedian: number;
  deltaVsMedianPct: number;
  deltaVsP75: number;
  deltaVsP75Pct: number;
  deltaVsMax: number;
  deltaVsMaxPct: number;
  percentileAmongComparables: number;
  askingPricePerSqm: number | null;
  pricePerSqmDeltaPct: number | null;
  verdict: "well_below" | "below" | "fair" | "above" | "well_above";
};
export function assessAskingPrice(params: {
  askingPrice: number;
  floorAreaSqm: number | null;
  comparables: ReadonlyArray<AddressDetailTransaction>;
}): AskingPriceAssessment | null {
  const summary = summarizeComparables(params.comparables);
  if (!summary) return null;
  const deltaVsMedian = params.askingPrice - summary.medianPrice;
  const deltaVsP75 = params.askingPrice - summary.p75Price;
  const deltaVsMax = params.askingPrice - summary.maxPrice;
  let belowCount = 0;
  for (const t of params.comparables) if (t.resalePrice < params.askingPrice) belowCount++;
  const askingPricePerSqm =
    params.floorAreaSqm && params.floorAreaSqm > 0
      ? params.askingPrice / params.floorAreaSqm
      : null;
  const pricePerSqmDeltaPct =
    askingPricePerSqm != null && summary.medianPricePerSqm > 0
      ? ((askingPricePerSqm - summary.medianPricePerSqm) / summary.medianPricePerSqm) * 100
      : null;
  const pctVsMedian = (deltaVsMedian / summary.medianPrice) * 100;
  const verdict: AskingPriceAssessment["verdict"] =
    pctVsMedian <= -10
      ? "well_below"
      : pctVsMedian < -3
        ? "below"
        : pctVsMedian <= 3
          ? "fair"
          : pctVsMedian < 10
            ? "above"
            : "well_above";
  return {
    comparableCount: params.comparables.length,
    summary,
    deltaVsMedian,
    deltaVsMedianPct: pctVsMedian,
    deltaVsP75,
    deltaVsP75Pct: (deltaVsP75 / summary.p75Price) * 100,
    deltaVsMax,
    deltaVsMaxPct: (deltaVsMax / summary.maxPrice) * 100,
    percentileAmongComparables: (belowCount / params.comparables.length) * 100,
    askingPricePerSqm,
    pricePerSqmDeltaPct,
    verdict,
  };
}

export type ListingConfidenceResult = {
  level: ConfidenceLevel;
  comparableCount: number;
  newestComparableMonth: string | null;
  reason: string;
};
export type Caveat = { severity: "info" | "warning"; message: string };
function newestMonth(comparables: ReadonlyArray<AddressDetailTransaction>): string | null {
  let newest: string | null = null;
  for (const tx of comparables) if (!newest || tx.month > newest) newest = tx.month;
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
  const newestComparableMonth = newestMonth(comparables);
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
  }).map((c) => ({
    severity: c.severity === "critical" ? "warning" : c.severity,
    message: c.message,
  }));
}

export type ListingCheckResult = {
  assessment: AskingPriceAssessment;
  confidence: ListingConfidenceResult;
  caveats: Caveat[];
  comparables: ReadonlyArray<AddressDetailTransaction>;
};
export function performListingCheck(params: {
  askingPrice: number;
  floorAreaSqm: number | null;
  transactions: ReadonlyArray<AddressDetailTransaction>;
  comparableQuery: ComparableQuery;
  leaseCommenceYear?: number;
  referenceMonth?: string;
}): ListingCheckResult | null {
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
