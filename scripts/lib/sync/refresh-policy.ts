export type ReconciliationTrigger = "observe" | "monthly" | "manual";

/** Expensive reconciliation requires an explicit invocation, never a metadata hint. */
export function resolveReconciliationTrigger(argv: string[]): ReconciliationTrigger {
  const monthly = argv.includes("--reconcile-monthly");
  const manual = argv.includes("--reconcile-manual") || argv.includes("--force");
  if (monthly && manual) throw new Error("Choose monthly or manual reconciliation, not both");
  if (argv.includes("--check-upstream")) return "observe";
  return manual ? "manual" : monthly ? "monthly" : "observe";
}

export function requiresSourceReconciliation(options: {
  trigger: ReconciliationTrigger;
  previousReconciledAt?: string;
  now?: number;
}): boolean {
  const { trigger, previousReconciledAt, now = Date.now() } = options;
  if (trigger === "observe") return false;
  if (trigger === "manual") return true;
  if (!Number.isFinite(now)) throw new Error("Invalid monthly reconciliation clock");
  const previousTime = previousReconciledAt ? Date.parse(previousReconciledAt) : NaN;
  if (!Number.isFinite(previousTime) || previousTime > now) return true;
  const previous = new Date(previousTime);
  const current = new Date(now);
  return (
    previous.getUTCFullYear() !== current.getUTCFullYear() ||
    previous.getUTCMonth() !== current.getUTCMonth()
  );
}

// Planning assumptions from the isolated Neon benchmark, not live billing meters.
export const NEON_MONTHLY_TRANSFER_LIMIT_BYTES = 5_000_000_000;
export const PROPOSED_TRANSFER_RESERVE_BYTES = 1_000_000_000;
export const ESTIMATED_RECONCILIATION_BYTES = 493_707_924;
export const ESTIMATED_COLD_BOOTSTRAP_BYTES = 12_997_301;

export function estimateMonthlyNeonTransfer(
  options: {
    manualReconciliations?: number;
    coldBootstrapEquivalents?: number;
  } = {},
) {
  const { manualReconciliations = 0, coldBootstrapEquivalents = 0 } = options;
  for (const count of [manualReconciliations, coldBootstrapEquivalents]) {
    if (!Number.isSafeInteger(count) || count < 0)
      throw new Error("Invalid monthly workload count");
  }
  const reconciliationBytes = ESTIMATED_RECONCILIATION_BYTES * (1 + manualReconciliations);
  const runtimeBytes = ESTIMATED_COLD_BOOTSTRAP_BYTES * coldBootstrapEquivalents;
  const totalEstimatedBytes = reconciliationBytes + runtimeBytes;
  if (!Number.isSafeInteger(totalEstimatedBytes)) throw new Error("Monthly estimate overflow");
  const runtimeHeadroomBytes =
    NEON_MONTHLY_TRANSFER_LIMIT_BYTES - PROPOSED_TRANSFER_RESERVE_BYTES - reconciliationBytes;
  const remainingAfterReserveBytes = runtimeHeadroomBytes - runtimeBytes;
  return {
    plannedMonthlyReconciliations: 1,
    manualReconciliations,
    coldBootstrapEquivalents,
    reconciliationBytes,
    runtimeBytes,
    totalEstimatedBytes,
    runtimeHeadroomBytes,
    remainingAfterReserveBytes,
    fitsProposedReserve: remainingAfterReserveBytes >= 0,
  };
}
