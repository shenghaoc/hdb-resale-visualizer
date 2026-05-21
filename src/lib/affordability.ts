import {
  getCurrentYear,
  HDB_CONCESSIONARY_ANNUAL_RATE,
  HDB_LOAN_TENURE_MONTHS,
  HDB_MAX_BUYER_AGE,
  HDB_MORTGAGE_SERVICING_RATIO,
  MAX_LEASE_DURATION,
} from "@/lib/constants";
import type { BlockSummary } from "@/types/data";

/**
 * Maximum HDB concessionary loan size implied by a household's gross monthly
 * income, capped by the HDB Mortgage Servicing Ratio (MSR) of 30%.
 *
 * Computes the standard PV-of-annuity over a 25-year tenure at the prevailing
 * 2.6% concessionary rate. Returns 0 for non-positive inputs so callers can
 * treat "no income provided" as "no loan headroom".
 */
export function maxLoanFor(monthlyIncome: number): number {
  if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) return 0;
  const maxMonthlyPayment = monthlyIncome * HDB_MORTGAGE_SERVICING_RATIO;
  const monthlyRate = HDB_CONCESSIONARY_ANNUAL_RATE / 12;
  const discount = (1 - Math.pow(1 + monthlyRate, -HDB_LOAN_TENURE_MONTHS)) / monthlyRate;
  return Math.floor(maxMonthlyPayment * discount);
}

/**
 * Maximum tolerable "lease consumed" (years since lease commencement) such
 * that an applicant of the given age still has a flat covered to
 * HDB_MAX_BUYER_AGE (currently 95).
 *
 * Formula per HDB rule, with MAX_LEASE_DURATION = 99: 99 - (95 - age).
 * Equivalent to `age + 4` once 99 - 95 is folded in. The result is the upper
 * bound on (currentYear − leaseCommenceYear); convert to a minimum remaining
 * lease by subtracting from MAX_LEASE_DURATION.
 */
export function maxRemainingLeaseForAge(oldestAge: number): number {
  return MAX_LEASE_DURATION - (HDB_MAX_BUYER_AGE - oldestAge);
}

/**
 * Whether a block's newest lease-commence year is recent enough that the
 * remaining lease covers an applicant of the given age to HDB_MAX_BUYER_AGE.
 *
 * Uses leaseCommenceRange[1] (the newest commencement in the block) so the
 * check passes when *any* unit in the block satisfies the rule.
 */
export function isBlockAgeEligible(block: BlockSummary, oldestAge: number): boolean {
  const leaseConsumed = getCurrentYear() - block.leaseCommenceRange[1];
  return leaseConsumed <= maxRemainingLeaseForAge(oldestAge);
}
