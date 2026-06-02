import { computeLoanTenureYears } from "@/lib/affordability";
import {
  getCurrentYear,
  HDB_MAX_BUYER_AGE,
  HDB_MAX_LTV_RATIO,
  MAX_LEASE_DURATION,
} from "@/lib/constants";

/**
 * Buyer-only lease & financing reality check.
 *
 * Commercial portals and HDB's own listings show you the price but quietly omit
 * how a flat's *remaining lease* interacts with *your age* to shrink the CPF you
 * can use and the loan you can get. These are deterministic, published CPF/HDB
 * rules — not market forecasts — so we surface them plainly for the buyer:
 *
 *  - "Lease-to-95" rule: to use CPF up to the full Valuation Limit and qualify
 *    for the maximum HDB loan-to-value, the remaining lease must cover the
 *    *youngest* buyer until age 95. If it falls short, CPF usage and the loan
 *    ceiling are pro-rated by how far the lease *does* reach.
 *  - Hard floor: a remaining lease under 20 years means no CPF may be used and
 *    HDB/bank financing is generally unavailable — effectively a cash purchase.
 *
 * Everything here is arithmetic over policy thresholds; no price projection or
 * valuation guess is made (the project deals in deterministic facts only).
 */

/**
 * Minimum remaining lease (years) below which CPF cannot be used at all and
 * HDB/bank financing is generally not granted. Published CPF/HDB rule.
 */
export const CPF_MIN_LEASE_YEARS = 20;

/**
 * A representative hold horizon used to illustrate lease decay concretely
 * (roughly the length of an HDB loan / a typical owner-occupier tenure).
 */
export const TYPICAL_HOLD_YEARS = 25;

export type LeaseFinancingStatus =
  /** Remaining lease covers the youngest buyer to 95 → full CPF + max LTV. */
  | "covers-to-95"
  /** Lease ≥ 20 yrs but doesn't reach age 95 → CPF & loan pro-rated. */
  | "prorated"
  /** Remaining lease < 20 yrs → no CPF, financing generally unavailable. */
  | "below-cpf-floor"
  /** Buyer age unknown → financing fit can't be assessed (decay still shown). */
  | "unknown";

export type LeaseFinancingAssessment = {
  status: LeaseFinancingStatus;
  /** Remaining lease (years, floored) the assessment is based on. */
  remainingLeaseYears: number;
  /** Age of the youngest applicant (drives the lease-to-95 rule), or null. */
  youngestApplicantAge: number | null;
  /** Years of lease needed to cover the youngest applicant to age 95, or null. */
  requiredLeaseYears: number | null;
  /** Shortfall in years vs. the lease-to-95 requirement (0 when covered). */
  shortfallYears: number;
  /** Pro-ration factor in (0, 1]; 1 when fully covered, null when unknown. */
  prorationFactor: number | null;
  /** Indicative max HDB loan-to-value after pro-ration, or null when unknown. */
  proratedLtvRatio: number | null;
  /**
   * HDB concessionary loan tenure cap (years): the lower of the age cap
   * (min(25, 65 − age)) and the lease cap (remaining lease − 20, so at least
   * 20 years remain at loan end). Null when the buyer's age is unknown.
   */
  loanTenureYears: number | null;
  /**
   * Which constraint pulls the tenure below the 25-year maximum — so the buyer
   * sees the real reason rather than always being told it's their age. Null
   * when the tenure is the full 25 years or the age is unknown.
   */
  tenureLimitedBy: "age" | "lease" | null;
  /** Remaining lease (years) left after a {@link TYPICAL_HOLD_YEARS} hold. */
  remainingLeaseAfterHold: number;
};

/**
 * Remaining lease (years) for a unit, given its lease-commencement year.
 * Floors at 0 so an expired lease never reads as negative.
 */
export function computeRemainingLeaseYears(
  leaseCommenceYear: number,
  currentYear: number = getCurrentYear(),
): number {
  return Math.max(0, MAX_LEASE_DURATION - (currentYear - leaseCommenceYear));
}

/**
 * Pick the youngest valid applicant age. The CPF lease-to-95 rule keys off the
 * *youngest* owner (the hardest case), so this is the buyer-protective choice.
 */
function youngestAge(applicantAge: number | null, coApplicantAge: number | null): number | null {
  const ages = [applicantAge, coApplicantAge].filter(
    (age): age is number => age !== null && Number.isFinite(age),
  );
  return ages.length > 0 ? Math.min(...ages) : null;
}

/**
 * Assess how a flat's remaining lease affects the buyer's CPF usage and loan
 * ceiling. Pure function — no i18n, no rendering, no side effects.
 */
export function assessLeaseFinancing(params: {
  remainingLeaseYears: number;
  applicantAge: number | null;
  coApplicantAge?: number | null;
}): LeaseFinancingAssessment {
  const remaining = Math.max(0, Math.floor(params.remainingLeaseYears));
  const remainingLeaseAfterHold = Math.max(0, remaining - TYPICAL_HOLD_YEARS);
  const youngest = youngestAge(params.applicantAge, params.coApplicantAge ?? null);

  const requiredLeaseYears =
    youngest !== null ? Math.max(0, HDB_MAX_BUYER_AGE - youngest) : null;

  // Loan tenure is the lower of the age cap (min(25, 65 − age)) and the lease
  // cap (remaining − 20, so ≥ 20 years of lease survive the loan). HDB applies
  // both; using age alone overstates the tenure on older flats.
  const ageCapYears = youngest !== null ? computeLoanTenureYears(youngest) : null;
  const leaseCapYears = Math.max(0, remaining - CPF_MIN_LEASE_YEARS);
  const loanTenureYears = ageCapYears !== null ? Math.min(ageCapYears, leaseCapYears) : null;
  // On a tie, attribute it to the lease — that's the constraint the buyer can't
  // change, so it's the more useful (and less self-blaming) thing to surface.
  const tenureLimitedBy: LeaseFinancingAssessment["tenureLimitedBy"] =
    ageCapYears === null || loanTenureYears === null || loanTenureYears >= 25
      ? null
      : leaseCapYears <= ageCapYears
        ? "lease"
        : "age";

  // The 20-year floor is a hard fact independent of the buyer's age.
  if (remaining < CPF_MIN_LEASE_YEARS) {
    return {
      status: "below-cpf-floor",
      remainingLeaseYears: remaining,
      youngestApplicantAge: youngest,
      requiredLeaseYears,
      shortfallYears:
        requiredLeaseYears !== null ? Math.max(0, requiredLeaseYears - remaining) : 0,
      prorationFactor: 0,
      proratedLtvRatio: 0,
      loanTenureYears,
      tenureLimitedBy,
      remainingLeaseAfterHold,
    };
  }

  if (youngest === null || requiredLeaseYears === null) {
    return {
      status: "unknown",
      remainingLeaseYears: remaining,
      youngestApplicantAge: null,
      requiredLeaseYears: null,
      shortfallYears: 0,
      prorationFactor: null,
      proratedLtvRatio: null,
      loanTenureYears: null,
      tenureLimitedBy: null,
      remainingLeaseAfterHold,
    };
  }

  if (requiredLeaseYears === 0 || remaining >= requiredLeaseYears) {
    return {
      status: "covers-to-95",
      remainingLeaseYears: remaining,
      youngestApplicantAge: youngest,
      requiredLeaseYears,
      shortfallYears: 0,
      prorationFactor: 1,
      proratedLtvRatio: HDB_MAX_LTV_RATIO,
      loanTenureYears,
      tenureLimitedBy,
      remainingLeaseAfterHold,
    };
  }

  // Lease ≥ 20 yrs but doesn't reach age 95: CPF usage and the loan ceiling are
  // pro-rated by how far the lease reaches toward the required span.
  const prorationFactor = remaining / requiredLeaseYears;
  return {
    status: "prorated",
    remainingLeaseYears: remaining,
    youngestApplicantAge: youngest,
    requiredLeaseYears,
    shortfallYears: requiredLeaseYears - remaining,
    prorationFactor,
    proratedLtvRatio: HDB_MAX_LTV_RATIO * prorationFactor,
    loanTenureYears,
    tenureLimitedBy,
    remainingLeaseAfterHold,
  };
}
