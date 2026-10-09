import { z } from "zod";
import {
  ESTIMATED_RECONCILIATION_BYTES,
  NEON_MONTHLY_TRANSFER_LIMIT_BYTES,
  PROPOSED_TRANSFER_RESERVE_BYTES,
} from "./refresh-policy";
import { NEON_REFRESH_PROJECT, NEON_REFRESH_ENDPOINT, NEON_REFRESH_BRANCH } from "./neon";

// Reserved, not claimed consumed. Covers meter lag and small unrelated/control activity.
export const UNKNOWN_USAGE_TRANSFER_RESERVE_BYTES = 1_000_000_000;
export const UNKNOWN_USAGE_COMPUTE_RESERVE_CU_HOURS = 10;
const endpointActivitySchema = z
  .object({
    endpointId: z.enum([NEON_REFRESH_ENDPOINT, "ep-cool-glade-b3bjctpc"]),
    branchId: z.enum([NEON_REFRESH_BRANCH, "br-broad-credit-b3bz9b61"]),
    state: z.enum(["idle", "active"]),
    maxCU: z.number().positive().max(2),
    lastActiveAt: z.iso.datetime(),
    suspendedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const neonUsageReceiptSchema = z
  .object({
    projectId: z.literal(NEON_REFRESH_PROJECT),
    source: z.literal("neon-console"),
    networkScope: z.enum(["public-only", "all-network-upper-bounds-public"]),
    periodStart: z.iso.datetime(),
    periodEnd: z.iso.datetime(),
    observedAt: z.iso.datetime(),
    settledThrough: z.iso.datetime().nullable(),
    usageAsOf: z.enum(["REPORTED", "UNKNOWN"]).default("REPORTED"),
    networkTransferBytes: z.number().nonnegative().safe(),
    transferResolutionBytes: z.number().nonnegative().safe(),
    computeCUHours: z.number().nonnegative(),
    computeResolutionCUHours: z.number().nonnegative(),
    knownActivity: z
      .object({
        observedAt: z.iso.datetime(),
        priorMeasuredReceivedBytes: z.number().positive().safe(),
        endpoints: z.array(endpointActivitySchema).length(2),
      })
      .strict()
      .optional(),
    additionalKnownTransferUpperBytes: z.number().nonnegative().safe().default(0),
    additionalKnownComputeUpperCUHours: z.number().nonnegative().default(0),
  })
  .strict();

export function checkNeonPilotBudget(receipt: unknown, now = Date.now()) {
  const usage = neonUsageReceiptSchema.parse(receipt);
  const observed = Date.parse(usage.observedAt),
    periodStart = Date.parse(usage.periodStart),
    periodEnd = Date.parse(usage.periodEnd);
  if (
    observed > now ||
    now - observed > 20 * 60 * 1000 ||
    periodStart > observed ||
    periodEnd <= now
  )
    throw new Error("Neon baseline usage is stale, unsettled or outside the allowance period");
  const unknownAsOf = usage.usageAsOf === "UNKNOWN";
  if (unknownAsOf) {
    const activity = usage.knownActivity;
    if (
      usage.settledThrough !== null ||
      !activity ||
      Date.parse(activity.observedAt) > now ||
      now - Date.parse(activity.observedAt) > 20 * 60 * 1000 ||
      activity.priorMeasuredReceivedBytes < ESTIMATED_RECONCILIATION_BYTES ||
      usage.networkTransferBytes + usage.transferResolutionBytes <
        activity.priorMeasuredReceivedBytes ||
      new Set(activity.endpoints.map((endpoint) => endpoint.endpointId)).size !== 2
    )
      throw new Error(
        "Unknown usage as-of requires calibrated Console totals and bounded known lifecycle evidence",
      );
    for (const endpoint of activity.endpoints) {
      const isBenchmark = endpoint.endpointId === NEON_REFRESH_ENDPOINT;
      if (
        endpoint.branchId !== (isBenchmark ? NEON_REFRESH_BRANCH : "br-broad-credit-b3bz9b61") ||
        endpoint.maxCU !== (isBenchmark ? 1 : 2) ||
        Date.parse(endpoint.lastActiveAt) > Date.parse(activity.observedAt) ||
        (endpoint.state === "idle" &&
          (!endpoint.suspendedAt ||
            Date.parse(endpoint.suspendedAt) < Date.parse(endpoint.lastActiveAt))) ||
        (endpoint.suspendedAt && Date.parse(endpoint.suspendedAt) > Date.parse(activity.observedAt))
      )
        throw new Error("Unbounded or mismatched known Neon endpoint activity");
    }
  } else {
    const settled = usage.settledThrough ? Date.parse(usage.settledThrough) : NaN;
    if (
      !Number.isFinite(settled) ||
      settled > observed ||
      now - settled > 2 * 60 * 60 * 1000 ||
      settled < periodStart
    )
      throw new Error("Reported Neon baseline usage is stale or unsettled");
  }
  // Known earlier benchmark traffic cannot be reconciled with uncalibrated zero meters.
  if (
    usage.networkTransferBytes === 0 ||
    (usage.computeCUHours === 0 && usage.computeResolutionCUHours === 0)
  )
    throw new Error("Uncalibrated zero Neon usage; authoritative Console readings required");
  const pendingTransferReserve = unknownAsOf ? UNKNOWN_USAGE_TRANSFER_RESERVE_BYTES : 0;
  const pendingComputeReserve = unknownAsOf ? UNKNOWN_USAGE_COMPUTE_RESERVE_CU_HOURS : 0;
  const transferUpper =
    usage.networkTransferBytes +
    usage.transferResolutionBytes +
    usage.additionalKnownTransferUpperBytes;
  const remainingAfterPilotAndReserve =
    NEON_MONTHLY_TRANSFER_LIMIT_BYTES -
    transferUpper -
    ESTIMATED_RECONCILIATION_BYTES -
    pendingTransferReserve -
    PROPOSED_TRANSFER_RESERVE_BYTES;
  // The bounded pilot permits at most 20 minutes + 5-minute idle tail at endpoint max 1 CU.
  const computeUpper =
    usage.computeCUHours +
    usage.computeResolutionCUHours +
    usage.additionalKnownComputeUpperCUHours +
    pendingComputeReserve +
    25 / 60;
  if (remainingAfterPilotAndReserve < 0 || computeUpper > 100)
    throw new Error("Insufficient measured Free headroom for the bounded Neon pilot");
  return {
    usage,
    remainingAfterPilotAndReserve,
    pendingTransferReserve,
    pendingComputeReserve,
    totalComputeUpperAfterPilot: computeUpper,
    maxPilotComputeCUHours: 25 / 60,
    limitation:
      "Unknown Console as-of is preserved; pending reserves are planning allowances, not measured consumption or a guaranteed lag bound. Known isolated activity and one bounded pilot only; no monthly/runtime certification.",
  };
}
