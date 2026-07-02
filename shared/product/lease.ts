import type { BlockSummary } from "../data-types";

export const MAX_LEASE_DURATION = 99;
export const HDB_MAX_BUYER_AGE = 95;

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
