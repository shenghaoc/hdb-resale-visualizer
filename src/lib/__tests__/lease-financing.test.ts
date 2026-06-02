import { describe, expect, it } from "vitest";
import {
  assessLeaseFinancing,
  computeRemainingLeaseYears,
  CPF_MIN_LEASE_YEARS,
  TYPICAL_HOLD_YEARS,
} from "@/lib/lease-financing";
import { HDB_MAX_BUYER_AGE, HDB_MAX_LTV_RATIO, MAX_LEASE_DURATION } from "@/lib/constants";

describe("computeRemainingLeaseYears", () => {
  it("returns the lease span minus elapsed years", () => {
    expect(computeRemainingLeaseYears(2000, 2025)).toBe(MAX_LEASE_DURATION - 25);
  });

  it("never returns a negative remaining lease", () => {
    expect(computeRemainingLeaseYears(1900, 2025)).toBe(0);
  });

  it("treats a brand-new lease as the full 99 years", () => {
    expect(computeRemainingLeaseYears(2025, 2025)).toBe(MAX_LEASE_DURATION);
  });
});

describe("assessLeaseFinancing", () => {
  it("reports full CPF and max LTV when the lease covers the youngest to 95", () => {
    // Youngest is 35 → needs 60 years; 80 years comfortably covers it.
    const result = assessLeaseFinancing({
      remainingLeaseYears: 80,
      applicantAge: 35,
    });
    expect(result.status).toBe("covers-to-95");
    expect(result.requiredLeaseYears).toBe(HDB_MAX_BUYER_AGE - 35);
    expect(result.shortfallYears).toBe(0);
    expect(result.prorationFactor).toBe(1);
    expect(result.proratedLtvRatio).toBe(HDB_MAX_LTV_RATIO);
    expect(result.loanTenureYears).toBe(25); // min(25, 65 - 35, 80 - 20)
    expect(result.tenureLimitedBy).toBeNull();
  });

  it("uses the youngest applicant for the lease-to-95 rule", () => {
    // Co-applicant aged 30 is younger → needs 65 years; 60 falls short.
    const result = assessLeaseFinancing({
      remainingLeaseYears: 60,
      applicantAge: 45,
      coApplicantAge: 30,
    });
    expect(result.status).toBe("prorated");
    expect(result.youngestApplicantAge).toBe(30);
    expect(result.requiredLeaseYears).toBe(65);
    expect(result.shortfallYears).toBe(5);
  });

  it("pro-rates CPF usage and LTV when the lease falls short of 95", () => {
    // Youngest 40 → needs 55 years; 44 years reaches 44/55 = 0.8 of the span.
    const result = assessLeaseFinancing({
      remainingLeaseYears: 44,
      applicantAge: 40,
    });
    expect(result.status).toBe("prorated");
    expect(result.requiredLeaseYears).toBe(55);
    expect(result.shortfallYears).toBe(11);
    expect(result.prorationFactor).toBeCloseTo(0.8, 10);
    expect(result.proratedLtvRatio).toBeCloseTo(HDB_MAX_LTV_RATIO * 0.8, 10);
  });

  it("flags the hard CPF floor under 20 years, regardless of age", () => {
    const result = assessLeaseFinancing({
      remainingLeaseYears: CPF_MIN_LEASE_YEARS - 1,
      applicantAge: 35,
    });
    expect(result.status).toBe("below-cpf-floor");
    expect(result.prorationFactor).toBe(0);
    expect(result.proratedLtvRatio).toBe(0);
    // Age-derived facts are still reported so the buyer sees the full picture.
    expect(result.requiredLeaseYears).toBe(HDB_MAX_BUYER_AGE - 35);
    // Tenure collapses to 0 (lease − 20 floors at 0) and the lease is the binder.
    expect(result.loanTenureYears).toBe(0);
    expect(result.tenureLimitedBy).toBe("lease");
  });

  it("still flags the CPF floor when the buyer's age is unknown", () => {
    const result = assessLeaseFinancing({
      remainingLeaseYears: 15,
      applicantAge: null,
    });
    expect(result.status).toBe("below-cpf-floor");
    expect(result.youngestApplicantAge).toBeNull();
    expect(result.requiredLeaseYears).toBeNull();
    expect(result.loanTenureYears).toBeNull();
    expect(result.tenureLimitedBy).toBeNull();
  });

  it("attributes an exact age/lease tie to the lease", () => {
    // Age 50 → age cap min(25, 65 − 50) = 15; remaining 35 → lease cap 15.
    const result = assessLeaseFinancing({ remainingLeaseYears: 35, applicantAge: 50 });
    expect(result.loanTenureYears).toBe(15);
    expect(result.tenureLimitedBy).toBe("lease");
  });

  it("returns unknown (but still computes decay) when age is missing", () => {
    const result = assessLeaseFinancing({
      remainingLeaseYears: 70,
      applicantAge: null,
    });
    expect(result.status).toBe("unknown");
    expect(result.prorationFactor).toBeNull();
    expect(result.proratedLtvRatio).toBeNull();
    expect(result.loanTenureYears).toBeNull();
    expect(result.remainingLeaseAfterHold).toBe(70 - TYPICAL_HOLD_YEARS);
  });

  it("marks tenure as age-limited once the applicant is over 40", () => {
    const result = assessLeaseFinancing({ remainingLeaseYears: 90, applicantAge: 50 });
    expect(result.status).toBe("covers-to-95");
    expect(result.loanTenureYears).toBe(15); // min(25, 65 - 50, 90 - 20)
    expect(result.tenureLimitedBy).toBe("age");
  });

  it("caps loan tenure by the remaining lease minus 20 years", () => {
    // Age cap is the full 25 (min(25, 65 - 30)); the lease cap (35 - 20 = 15)
    // is the binding constraint, so the buyer is told it's the lease, not age.
    const result = assessLeaseFinancing({ remainingLeaseYears: 35, applicantAge: 30 });
    expect(result.loanTenureYears).toBe(15);
    expect(result.tenureLimitedBy).toBe("lease");
  });

  it("reports the lease cap even in the prorated band", () => {
    // Youngest 40 → needs 55 yrs; 44 yrs is prorated. Age cap min(25,25)=25,
    // lease cap 44-20=24 → tenure 24, limited by lease.
    const result = assessLeaseFinancing({ remainingLeaseYears: 44, applicantAge: 40 });
    expect(result.status).toBe("prorated");
    expect(result.loanTenureYears).toBe(24);
    expect(result.tenureLimitedBy).toBe("lease");
  });

  it("computes the lease left after a typical hold, flooring at zero", () => {
    expect(
      assessLeaseFinancing({ remainingLeaseYears: 95, applicantAge: 30 }).remainingLeaseAfterHold,
    ).toBe(95 - TYPICAL_HOLD_YEARS);
    expect(
      assessLeaseFinancing({ remainingLeaseYears: 22, applicantAge: 30 }).remainingLeaseAfterHold,
    ).toBe(0);
  });

  it("floors a fractional remaining lease before assessing", () => {
    const result = assessLeaseFinancing({ remainingLeaseYears: 59.9, applicantAge: 35 });
    expect(result.remainingLeaseYears).toBe(59);
    expect(result.status).toBe("prorated"); // 59 < 60 required
  });

  it("treats an exact lease-to-95 match as fully covered", () => {
    // Youngest 36 → needs exactly 59 years; 59 should not be pro-rated.
    const result = assessLeaseFinancing({ remainingLeaseYears: 59, applicantAge: 36 });
    expect(result.status).toBe("covers-to-95");
    expect(result.prorationFactor).toBe(1);
  });
});
