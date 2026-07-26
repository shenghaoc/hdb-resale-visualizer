import type { AffordabilityMode, BlockSummary } from "../data-types";
import { getCohortAlignedMedianPrice } from "./filtering";

export const HDB_MAX_LTV_RATIO = 0.75;
export const HDB_LOAN_TENURE_MONTHS = 25 * 12;
export const HDB_CONCESSIONARY_ANNUAL_RATE = 0.026;
export const HDB_MORTGAGE_SERVICING_RATIO = 0.3;
export const COMFORTABLE_AFFORDABILITY_RATIO = 0.8;

export type AffordabilityProfile = {
  monthlyIncome: number | null;
  cpfOABalance: number | null;
  age: number | null;
  coApplicantAge: number | null;
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

/**
 * Indicative HDB-loan age cap.
 *
 * HDB uses the applicants' average age for the `65 - age` limit. Keeping the
 * optional co-applicant in this calculation prevents the setup field from
 * being collected without affecting the estimate.
 */
export function computeLoanTenureYears(
  age: number | null,
  coApplicantAge: number | null = null,
): number {
  if (age === null) return 25;
  const averageAge = coApplicantAge === null ? age : (age + coApplicantAge) / 2;
  return Math.min(25, Math.max(0, 65 - averageAge));
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
  const tenureYears = computeLoanTenureYears(profile.age, profile.coApplicantAge);
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
  if (!isAffordabilityProfileComplete(profile)) {
    return {
      maxAffordablePrice: maxAffordablePrice(profile),
      monthlyRepayment: 0,
      cashOutlay: 0,
      downPaymentFromCpf: 0,
      loanAmount: 0,
      status: "unknown",
    };
  }

  const income = profile.monthlyIncome ?? 0;
  const cpf = profile.cpfOABalance ?? 0;
  const tenureYears = computeLoanTenureYears(profile.age, profile.coApplicantAge);
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

/**
 * Profile completeness gate for the local affordability filter. Positive
 * income and CPF OA are required because the model has no available-cash
 * input. Treating an explicit zero as complete would create a zero ceiling
 * and falsely label every home as unaffordable.
 */
export function isAffordabilityProfileComplete(profile: AffordabilityProfile): boolean {
  return (
    profile.monthlyIncome !== null &&
    profile.monthlyIncome > 0 &&
    profile.cpfOABalance !== null &&
    profile.cpfOABalance > 0 &&
    profile.age !== null
  );
}

/**
 * Predicate for the affordability filter. Returns true (i.e. pass) when:
 *  - mode is off ("");
 *  - the profile is incomplete (filter is disabled — never silently hide);
 *  - the verdict status matches the active mode.
 *
 * "comfortable" mode keeps only comfortable blocks. "stretch" mode keeps
 * both comfortable + stretch (= everything except over/unknown).
 */
export function passesAffordabilityMode(
  block: BlockSummary,
  profile: AffordabilityProfile,
  mode: AffordabilityMode,
  flatType = "",
): boolean {
  if (mode === "") return true;
  if (!isAffordabilityProfileComplete(profile)) return true;
  const { status } = computeAffordabilityVerdict(
    profile,
    getCohortAlignedMedianPrice(block, flatType),
  );
  if (mode === "comfortable") return status === "comfortable";
  return status === "comfortable" || status === "stretch";
}
