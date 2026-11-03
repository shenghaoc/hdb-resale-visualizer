import { z } from "zod";
import {
  ESTIMATED_RECONCILIATION_BYTES,
  NEON_MONTHLY_TRANSFER_LIMIT_BYTES,
  PROPOSED_TRANSFER_RESERVE_BYTES,
} from "./refresh-policy";
import { NEON_REFRESH_PROJECT, NEON_REFRESH_ENDPOINT, NEON_REFRESH_BRANCH } from "./neon";
import { neonEndpointIdFromHost, readServingHyperdriveId } from "./serving-config";

// Reserved, not claimed consumed. Covers meter lag and small unrelated/control activity.
export const UNKNOWN_USAGE_TRANSFER_RESERVE_BYTES = 1_000_000_000;
export const UNKNOWN_USAGE_COMPUTE_RESERVE_CU_HOURS = 10;
/** The bounded run window: the 20-minute run deadline plus Neon's 5-minute suspend tail. */
export const RUN_WINDOW_HOURS = 25 / 60;
/** Receipts and the serving origin must be observed within this long before the run checks them. */
const MAX_OBSERVATION_AGE_MS = 20 * 60 * 1000;

/** One Neon compute endpoint as read from the Neon Console at `knownActivity.observedAt`. */
const endpointActivitySchema = z
  .object({
    endpointId: z.string().regex(/^ep-[a-z0-9]+(?:-[a-z0-9]+)*$/),
    branchId: z.string().regex(/^br-[a-z0-9]+(?:-[a-z0-9]+)*$/),
    state: z.enum(["idle", "active"]),
    maxCU: z.number().positive().max(2),
    lastActiveAt: z.iso.datetime(),
    suspendedAt: z.iso.datetime().nullable(),
  })
  .strict();

/**
 * The origin of the Hyperdrive configuration that serves the site, as read from Cloudflare when the receipt was
 * captured. The run checks its configuration id against `wrangler.jsonc`, so the serving endpoint is derived from
 * the deployed configuration rather than from a branch named in this file.
 */
const servingOriginSchema = z
  .object({
    source: z.literal("cloudflare-hyperdrive"),
    hyperdriveConfigId: z.string().regex(/^[0-9a-f]{32}$/),
    host: z.string().min(1),
    observedAt: z.iso.datetime(),
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
    servingOrigin: servingOriginSchema.optional(),
    knownActivity: z
      .object({
        observedAt: z.iso.datetime(),
        priorMeasuredReceivedBytes: z.number().positive().safe(),
        /** The operator lists every compute endpoint in the project, not a chosen subset. */
        endpointInventory: z.literal("complete"),
        endpoints: z.array(endpointActivitySchema).min(2),
      })
      .strict()
      .optional(),
    additionalKnownTransferUpperBytes: z.number().nonnegative().safe().default(0),
    additionalKnownComputeUpperCUHours: z.number().nonnegative().default(0),
  })
  .strict();

type NeonUsageReceipt = z.infer<typeof neonUsageReceiptSchema>;

function isFreshObservation(observedAt: string, now: number): boolean {
  const observed = Date.parse(observedAt);
  return observed <= now && now - observed <= MAX_OBSERVATION_AGE_MS;
}

/**
 * Unsettled ("UNKNOWN as-of") Console totals are only usable with bounded evidence for every endpoint that could
 * still be consuming. Returns the serving endpoint and the compute it may add during this run's window.
 */
function checkUnsettledActivity(
  usage: NeonUsageReceipt,
  now: number,
  servingHyperdriveId: string,
): { servingEndpointId: string; servingRunWindowComputeCUHours: number } {
  const activity = usage.knownActivity;
  if (
    usage.settledThrough !== null ||
    !activity ||
    !isFreshObservation(activity.observedAt, now) ||
    activity.priorMeasuredReceivedBytes < ESTIMATED_RECONCILIATION_BYTES ||
    usage.networkTransferBytes + usage.transferResolutionBytes < activity.priorMeasuredReceivedBytes
  )
    throw new Error(
      "Unknown usage as-of requires calibrated Console totals and bounded known lifecycle evidence",
    );
  const origin = usage.servingOrigin;
  if (!origin)
    throw new Error(
      "Unknown usage as-of requires the serving Hyperdrive origin, so the endpoint that serves traffic is counted",
    );
  if (origin.hyperdriveConfigId !== servingHyperdriveId)
    throw new Error("Serving origin is not the Hyperdrive configuration bound in wrangler.jsonc");
  if (!isFreshObservation(origin.observedAt, now))
    throw new Error("Serving Hyperdrive origin observation is stale");
  const servingEndpointId = neonEndpointIdFromHost(origin.host);
  if (servingEndpointId === NEON_REFRESH_ENDPOINT)
    throw new Error(
      "The serving Hyperdrive origin is the refresh write target; refusing to refresh the serving database",
    );

  const ids = activity.endpoints.map((endpoint) => endpoint.endpointId);
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate endpoint in the Neon endpoint inventory");
  const benchmark = activity.endpoints.find((e) => e.endpointId === NEON_REFRESH_ENDPOINT);
  const serving = activity.endpoints.find((e) => e.endpointId === servingEndpointId);
  if (!benchmark || benchmark.branchId !== NEON_REFRESH_BRANCH || benchmark.maxCU !== 1)
    throw new Error("Endpoint inventory must include the isolated benchmark endpoint at 1 CU");
  if (!serving)
    throw new Error(
      "Endpoint inventory omits the serving endpoint behind Hyperdrive; its traffic would go uncounted",
    );
  if (serving.branchId === NEON_REFRESH_BRANCH)
    throw new Error("The serving endpoint must not be on the isolated benchmark branch");

  const observedAt = Date.parse(activity.observedAt);
  for (const endpoint of activity.endpoints) {
    const lastActive = Date.parse(endpoint.lastActiveAt);
    const suspended = endpoint.suspendedAt === null ? null : Date.parse(endpoint.suspendedAt);
    if (
      lastActive > observedAt ||
      (suspended !== null && suspended > observedAt) ||
      (endpoint.state === "idle" && (suspended === null || suspended < lastActive))
    )
      throw new Error("Unbounded or mismatched known Neon endpoint activity");
    // Live traffic can keep the serving endpoint awake and the refresh wakes the benchmark; anything else must
    // be demonstrably suspended, or its activity has no bound.
    if (
      endpoint.state === "active" &&
      endpoint.endpointId !== NEON_REFRESH_ENDPOINT &&
      endpoint.endpointId !== servingEndpointId
    )
      throw new Error(
        `Unbounded activity: endpoint ${endpoint.endpointId} is active and is neither the refresh target nor the serving endpoint`,
      );
  }
  // Traffic may wake the serving endpoint at any moment of this run, whatever its state when observed.
  return { servingEndpointId, servingRunWindowComputeCUHours: serving.maxCU * RUN_WINDOW_HOURS };
}

export function checkNeonPilotBudget(
  receipt: unknown,
  now = Date.now(),
  options: { servingHyperdriveId?: () => string } = {},
) {
  const usage = neonUsageReceiptSchema.parse(receipt);
  const observed = Date.parse(usage.observedAt),
    periodStart = Date.parse(usage.periodStart),
    periodEnd = Date.parse(usage.periodEnd);
  if (
    observed > now ||
    now - observed > MAX_OBSERVATION_AGE_MS ||
    periodStart > observed ||
    periodEnd <= now
  )
    throw new Error("Neon baseline usage is stale, unsettled or outside the allowance period");
  const unknownAsOf = usage.usageAsOf === "UNKNOWN";
  let serving: ReturnType<typeof checkUnsettledActivity> | null = null;
  if (unknownAsOf) {
    serving = checkUnsettledActivity(
      usage,
      now,
      (options.servingHyperdriveId ?? readServingHyperdriveId)(),
    );
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
  const servingRunWindowComputeReserve = serving?.servingRunWindowComputeCUHours ?? 0;
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
    servingRunWindowComputeReserve +
    RUN_WINDOW_HOURS;
  if (remainingAfterPilotAndReserve < 0 || computeUpper > 100)
    throw new Error("Insufficient measured Free headroom for the bounded Neon pilot");
  return {
    usage,
    remainingAfterPilotAndReserve,
    pendingTransferReserve,
    pendingComputeReserve,
    servingEndpointId: serving?.servingEndpointId ?? null,
    servingRunWindowComputeReserve,
    totalComputeUpperAfterPilot: computeUpper,
    maxPilotComputeCUHours: RUN_WINDOW_HOURS,
    limitation:
      "Unknown Console as-of is preserved; pending reserves are planning allowances, not measured consumption or a guaranteed lag bound. The serving endpoint is resolved from the Hyperdrive origin captured with the receipt and checked against wrangler.jsonc; the run cannot query Cloudflare itself. Known isolated activity and one bounded pilot only; no monthly/runtime certification.",
  };
}
