import { MAX_LEASE_DURATION } from "./constants";

export type LeaseSignalSeverity = "warn" | "info";
export type LeaseSignalKey =
  | "lease.signal.veryShort"
  | "lease.signal.short"
  | "lease.signal.oldCommence"
  | "lease.signal.belowFilter";

export type LeaseSignal = {
  key: LeaseSignalKey;
  severity: LeaseSignalSeverity;
};

const VERY_SHORT_THRESHOLD = 30;
const SHORT_THRESHOLD = 60;
const OLD_COMMENCE_THRESHOLD = 1975;

/**
 * Derive factual lease signals from a block's lease range and the active filter.
 * Pure function — no side effects, no i18n, no rendering.
 */
export function buildLeaseSignals(
  leaseCommenceRange: [number, number],
  currentYear: number,
  remainingLeaseMin: number | null,
): LeaseSignal[] {
  const signals: LeaseSignal[] = [];

  // leaseCommenceRange[0] = earliest start year → fewest remaining years
  // leaseCommenceRange[1] = latest start year  → most remaining years
  const minRemainingLease = MAX_LEASE_DURATION - (currentYear - leaseCommenceRange[0]);
  const maxRemainingLease = MAX_LEASE_DURATION - (currentYear - leaseCommenceRange[1]);

  if (maxRemainingLease < VERY_SHORT_THRESHOLD) {
    signals.push({ key: "lease.signal.veryShort", severity: "warn" });
  } else if (maxRemainingLease < SHORT_THRESHOLD) {
    signals.push({ key: "lease.signal.short", severity: "info" });
  }

  if (leaseCommenceRange[0] < OLD_COMMENCE_THRESHOLD) {
    signals.push({ key: "lease.signal.oldCommence", severity: "info" });
  }

  if (remainingLeaseMin !== null && minRemainingLease < remainingLeaseMin) {
    signals.push({ key: "lease.signal.belowFilter", severity: "info" });
  }

  return signals;
}
