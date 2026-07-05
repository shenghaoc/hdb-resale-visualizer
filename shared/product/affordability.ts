import type { AffordabilityMode, BlockSummary } from "../data-types";

export const HDB_MAX_LTV_RATIO = 0.75;
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

/**
 * Profile completeness gate for affordability filter and sort. Mirrors the
 * per-card pill gate but extends to CPF + age so the verdict is meaningful
 * (income alone with no CPF yields a zero ceiling that would flag every
 * block as "over").
 */
export function isAffordabilityProfileComplete(profile: AffordabilityProfile): boolean {
  return profile.monthlyIncome !== null && profile.cpfOABalance !== null && profile.age !== null;
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
  block: Pick<BlockSummary, "medianPrice">,
  profile: AffordabilityProfile,
  mode: AffordabilityMode,
): boolean {
  if (mode === "") return true;
  if (!isAffordabilityProfileComplete(profile)) return true;
  const { status } = computeAffordabilityVerdict(profile, block.medianPrice);
  if (mode === "comfortable") return status === "comfortable";
  return status === "comfortable" || status === "stretch";
}
