import {
  getCurrentYear,
  HDB_CONCESSIONARY_ANNUAL_RATE,
  HDB_LOAN_TENURE_MONTHS,
  HDB_MAX_BUYER_AGE,
  HDB_MAX_LTV_RATIO,
  HDB_MORTGAGE_SERVICING_RATIO,
  MAX_LEASE_DURATION,
} from "@/lib/constants";
import type { BlockSummary } from "@/types/data";

/**
 * HDB concessionary loan tenure cap: min(25 years, 65 - age).
 * If age is unknown or the cap computes negative, the floor is 0.
 */
export function computeLoanTenureYears(age: number | null): number {
  if (age === null) return 25;
  return Math.min(25, Math.max(0, 65 - age));
}

/**
 * Maximum HDB concessionary loan size implied by a household's gross monthly
 * income, capped by the HDB Mortgage Servicing Ratio (MSR) of 30%.
 *
 * Computes the standard PV-of-annuity over the given tenure (defaults to
 * 25 years at the prevailing 2.6% concessionary rate). Returns 0 for
 * non-positive inputs or zero tenure so callers can treat "no income
 * provided" / "no loan eligibility" as "no loan headroom".
 */
export function maxLoanFor(monthlyIncome: number, tenureMonths?: number): number {
  if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) return 0;
  const months = tenureMonths ?? HDB_LOAN_TENURE_MONTHS;
  if (months <= 0) return 0;
  const maxMonthlyPayment = monthlyIncome * HDB_MORTGAGE_SERVICING_RATIO;
  const monthlyRate = HDB_CONCESSIONARY_ANNUAL_RATE / 12;
  const discount = (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;
  return Math.floor(maxMonthlyPayment * discount);
}

/**
 * Maximum affordable purchase price given CPF OA balance, monthly income, and
 * age under HDB concessionary loan rules.
 *
 * Two constraints:
 *  1. Total funds: purchase price cannot exceed maxLoan + CPF balance.
 *  2. Minimum down-payment: CPF OA must cover at least 25% of purchase price
 *     (i.e. price <= CPF / 0.25).
 *
 * Returns 0 when neither constraint is binding (no usable data), or when
 * the CPF down-payment constraint alone yields 0 (no CPF balance).
 */
export function maxAffordablePrice(profile: {
  monthlyIncome: number | null;
  cpfOABalance: number | null;
  age: number | null;
  /** coApplicantAge is collected in the wizard but not yet used in affordability calculations. */
}): number {
  const cpf = profile.cpfOABalance ?? 0;
  const income = profile.monthlyIncome ?? 0;
  const tenureYears = computeLoanTenureYears(profile.age);

  const maxLoan = (income > 0 && tenureYears > 0) ? maxLoanFor(income, tenureYears * 12) : 0;

  if (maxLoan <= 0) {
    // No loan eligibility: Max price is limited to CPF balance (assuming no cash data).
    return Math.floor(cpf);
  }

  // The maximum price is constrained by two factors:
  // 1. Total funds available: Price <= maxLoan + CPF
  // 2. Minimum downpayment: Price <= CPF / (1 - LTV)
  const totalFundsConstraint = maxLoan + cpf;
  const downpaymentConstraint = cpf > 0 ? cpf / (1 - HDB_MAX_LTV_RATIO) : 0;

  return Math.floor(Math.min(totalFundsConstraint, downpaymentConstraint));
}

// ── Affordability verdict ──────────────────────────────────────────────

/**
 * The fraction of max-affordable-price below which a block is considered
 * comfortably affordable (as opposed to a stretch).
 */
export const COMFORTABLE_AFFORDABILITY_RATIO = 0.8;

export type AffordabilityStatus = "comfortable" | "stretch" | "over" | "unknown";

export type AffordabilityVerdict = {
  /** Max affordable purchase price (the ceiling). */
  maxAffordablePrice: number;
  /** Estimated monthly repayment for the given block's median price. */
  monthlyRepayment: number;
  /** Cash outlay required for the down payment (after CPF OA contribution). */
  cashOutlay: number;
  /** CPF OA amount applied toward the 25% down-payment portion. */
  downPaymentFromCpf: number;
  /** Loan amount (75% of the block's median price). */
  loanAmount: number;
  /** Affordability classification. */
  status: AffordabilityStatus;
};

/**
 * Compute an affordability verdict for a block given the user's profile.
 *
 * When monthly income has not been provided (null) the verdict returns
 * status "unknown" and zeroed financial figures — callers should suppress
 * the affordability signal entirely in that case. A zero-income profile
 * (e.g. retiree) still yields a verdict based on CPF OA balance alone.
 *
 * NOTE: coApplicantAge is collected in the wizard but not yet used here.
 * HDB caps loan tenure at 65 minus the older applicant's age, so a younger
 * co-applicant can extend the tenure. This will be addressed in a future phase.
 */
export function computeAffordabilityVerdict(
  profile: {
    monthlyIncome: number | null;
    cpfOABalance: number | null;
    age: number | null;
  },
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
    // No loan eligibility: buyer pays full price from own funds.
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

  let status: AffordabilityStatus;
  if (ceiling <= 0) {
    status = "over";
  } else if (medianPrice <= ceiling * COMFORTABLE_AFFORDABILITY_RATIO) {
    status = "comfortable";
  } else if (medianPrice <= ceiling) {
    status = "stretch";
  } else {
    status = "over";
  }

  return {
    maxAffordablePrice: ceiling,
    monthlyRepayment,
    cashOutlay,
    downPaymentFromCpf,
    loanAmount,
    status,
  };
}

/**
 * Minimum remaining lease (in years) that an applicant of the given age needs
 * for the flat to cover them to HDB_MAX_BUYER_AGE (currently 95).
 *
 * HDB's "lease-to-95" rule: remaining lease >= 95 - age.
 */
export function minRequiredRemainingLease(age: number): number {
  return Math.max(0, HDB_MAX_BUYER_AGE - age);
}

/**
 * Whether a block's newest lease-commence year is recent enough that the
 * remaining lease covers an applicant of the given age to HDB_MAX_BUYER_AGE.
 *
 * Uses leaseCommenceRange[1] (the newest commencement in the block) so the
 * check passes when *any* unit in the block satisfies the rule.
 */
export function isBlockAgeEligible(block: BlockSummary, age: number): boolean {
  const remainingLease = MAX_LEASE_DURATION - (getCurrentYear() - block.leaseCommenceRange[1]);
  return remainingLease >= minRequiredRemainingLease(age);
}
