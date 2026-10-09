/**
 * Validated staging model. The isolated transport lives in staged-publisher.ts.
 * PostgreSQL row counts, not the unchanged D1 index-operation forecast, bind this plan.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalJson } from "../lib/sync/neon";
import { BLOCK_COLUMNS } from "../lib/sync/store";
import { TRANSACTION_COLUMNS } from "../lib/sync/incremental";
import { sourceFactsSHA256 } from "../lib/sync/neon-reconciliation";
import type { TransactionRow } from "../lib/schemas";

const objects = z.record(z.string(), z.json());
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const pathSegment = z
  .string()
  .min(1)
  .max(128)
  .refine((v) => !v.includes("\0"));
const tableSchema = z.enum([
  "transactions",
  "blocks",
  "block_details",
  "comparisons",
  "town_flat_type_trends",
  "mrt_geojson",
  "geocode_cache",
  "walking_time_cache",
]);
export type StageTable = z.infer<typeof tableSchema>;
const patchSchema = z
  .object({
    path: z.array(pathSegment).min(1).max(6),
    beforeExists: z.boolean().optional(),
    before: z.json(),
    after: z.json(),
  })
  .strict();
const itemSchema = z
  .object({
    table: tableSchema,
    operation: z.enum(["insert", "update"]),
    key: objects,
    before: objects.nullable(),
    after: objects,
    detailPatches: z.array(patchSchema).max(64).optional(),
    detailBeforePgSHA256: digest.optional(),
  })
  .strict();
export type StageItem = z.infer<typeof itemSchema>;
export const STAGE_DESCRIPTOR: Record<StageTable, { keys: string[]; columns: readonly string[] }> =
  {
    transactions: { keys: ["id"], columns: ["id", ...TRANSACTION_COLUMNS] },
    blocks: { keys: ["address_key"], columns: BLOCK_COLUMNS },
    block_details: { keys: ["address_key"], columns: ["address_key", "json"] },
    comparisons: { keys: ["address_key"], columns: ["address_key", "json"] },
    town_flat_type_trends: {
      keys: ["town", "flat_type", "month"],
      columns: [
        "town",
        "flat_type",
        "month",
        "median_price",
        "median_price_per_sqm",
        "transaction_count",
      ],
    },
    mrt_geojson: { keys: ["kind"], columns: ["kind", "json", "updated_at"] },
    geocode_cache: {
      keys: ["cache_key"],
      columns: [
        "cache_key",
        "lat",
        "lng",
        "postal_code",
        "display_name",
        "search_value",
        "updated_at",
      ],
    },
    walking_time_cache: {
      keys: ["cache_key"],
      columns: ["cache_key", "walking_time_seconds", "walking_distance_meters", "updated_at"],
    },
  };
const descriptor = STAGE_DESCRIPTOR;
export const STAGE_TABLES = Object.keys(descriptor) as StageTable[];
export const STAGE_MAX_ITEM_BYTES = 1_000_000; // Existing row-size restraint, not a monthly cap.
export const STAGE_MAX_COPY_BYTES = 90_000_000;
export const STAGE_MAX_TEMPORARY_BYTES = 256 * 1024 * 1024;
export const STAGE_MIN_PROJECT_HEADROOM_BYTES = 256 * 1024 * 1024;
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const equalNames = (a: string[], b: readonly string[]) => same([...a].sort(), [...b].sort());

function validateItem(input: unknown): StageItem {
  const item = itemSchema.parse(input),
    d = descriptor[item.table];
  if (!equalNames(Object.keys(item.key), d.keys)) throw new Error("Invalid target key columns");
  if (Object.entries(item.key).some(([k, v]) => k !== "id" && (typeof v !== "string" || !v.length)))
    throw new Error("Invalid target key values");
  if (
    item.table === "transactions" &&
    (!Number.isSafeInteger(item.key.id) || Number(item.key.id) < 1)
  )
    throw new Error("Unsafe stable transaction ID");
  if (item.table === "transactions" && item.operation !== "insert")
    throw new Error("No transaction corrections or deletions in this proposal");
  if (item.operation === "insert") {
    if (
      item.before !== null ||
      item.detailPatches ||
      item.detailBeforePgSHA256 ||
      !equalNames(Object.keys(item.after), d.columns) ||
      d.keys.some((k) => !same(item.key[k], item.after[k]))
    )
      throw new Error("Insert must contain a complete typed row and matching identity");
  } else if (item.detailBeforePgSHA256) {
    if (
      item.table !== "block_details" ||
      item.detailPatches ||
      item.before === null ||
      Object.keys(item.before).length ||
      !equalNames(Object.keys(item.after), ["json"]) ||
      !item.after.json ||
      typeof item.after.json !== "object" ||
      Array.isArray(item.after.json)
    )
      throw new Error("Materialized detail requires one complete object and old PG digest");
  } else if (item.detailPatches) {
    if (
      item.table !== "block_details" ||
      item.before === null ||
      Object.keys(item.before).length ||
      Object.keys(item.after).length ||
      !item.detailPatches.length
    )
      throw new Error("Invalid detail patch shape");
    const paths = item.detailPatches.map((p) => p.path);
    for (const p of item.detailPatches) {
      if (
        (p.path[0] === "summary"
          ? p.path.length < 2
          : !["monthlyTrend", "recentTransactions"].includes(p.path[0]) || p.path.length !== 1) ||
        (p.beforeExists !== false && same(p.before, p.after)) ||
        (p.beforeExists === false && p.before !== null)
      )
        throw new Error("Unsupported or unchanged detail path");
      if (
        p.path[0] === "summary" &&
        ((p.before !== null && typeof p.before === "object" && !Array.isArray(p.before)) ||
          (p.after !== null &&
            typeof p.after === "object" &&
            !Array.isArray(p.after) &&
            p.before !== null))
      )
        throw new Error(
          "Existing structured summary nodes require owned leaf patches; unknown siblings must survive",
        );
    }
    if (
      new Set(paths.map(canonicalJson)).size !== paths.length ||
      paths.some((a) =>
        paths.some((b) => a.length < b.length && a.every((part, i) => part === b[i])),
      )
    )
      throw new Error("Overlapping detail patch paths");
  } else {
    if (item.table === "block_details")
      throw new Error("Existing detail blobs require owned-path patches");
    const fields = Object.keys(item.after);
    if (
      item.before === null ||
      !fields.length ||
      !equalNames(Object.keys(item.before), fields) ||
      fields.some(
        (k) =>
          d.keys.includes(k) || !d.columns.includes(k) || same(item.before?.[k], item.after[k]),
      )
    )
      throw new Error("Only genuinely changed non-key columns may be patched");
  }
  if (Buffer.byteLength(canonicalJson(item)) > STAGE_MAX_ITEM_BYTES)
    throw new Error("Staging item size bound exceeded");
  return item;
}

/** Leaf hashes keep server root validation bounded; it need not concatenate large JSON bodies. */
export function packStage(input: unknown[]) {
  const items = input.map(validateItem).sort((a, b) => {
    const left = `${a.table}:${canonicalJson(a.key)}`,
      right = `${b.table}:${canonicalJson(b.key)}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const identities = items.map((item) => `${item.table}:${canonicalJson(item.key)}`);
  if (new Set(identities).size !== identities.length)
    throw new Error("Duplicate staging target: ambiguous UPDATE FROM join");
  const wires = items.map(canonicalJson);
  const root = sha256(wires.map((wire, i) => `${i + 1}:${sha256(wire)}`).join("\n"));
  // Canonical JSON escapes control characters; COPY text additionally quotes its backslashes.
  const copyText = wires.map((wire, i) => `${i + 1}\t${wire.replaceAll("\\", "\\\\")}\n`).join("");
  const groups = Object.fromEntries(
    STAGE_TABLES.map((table) => {
      const rows = items
        .map((item, i) => ({ item, ordinal: i + 1 }))
        .filter((r) => r.item.table === table);
      return [
        table,
        {
          insert: rows.filter((r) => r.item.operation === "insert").length,
          update: rows.filter((r) => r.item.operation === "update").length,
          delete: 0,
          keySHA256: sha256(canonicalJson(rows.map((r) => r.item.key))),
          payloadSHA256: sha256(canonicalJson(rows.map((r) => r.item))),
          beforeSHA256: sha256(
            canonicalJson(
              rows.map(({ item }) => ({
                key: item.key,
                before: item.before,
                detailBeforePgSHA256: item.detailBeforePgSHA256,
                detailPatches: item.detailPatches?.map((p) => ({
                  path: p.path,
                  beforeExists: p.beforeExists ?? true,
                  before: p.before,
                })),
              })),
            ),
          ),
          afterSHA256: sha256(
            canonicalJson(
              rows.map(({ item }) => ({
                key: item.key,
                after: item.after,
                detailPatches: item.detailPatches?.map((p) => ({ path: p.path, after: p.after })),
              })),
            ),
          ),
          payloadBytes: rows.reduce((n, r) => n + Buffer.byteLength(wires[r.ordinal - 1]), 0),
          ordinalSHA256: sha256(rows.map((r) => r.ordinal).join(",")),
        },
      ];
    }),
  ) as Record<
    StageTable,
    {
      insert: number;
      update: number;
      delete: number;
      keySHA256: string;
      payloadSHA256: string;
      beforeSHA256: string;
      afterSHA256: string;
      payloadBytes: number;
      ordinalSHA256: string;
    }
  >;
  return {
    items,
    wires,
    copyText,
    groups,
    rows: items.length,
    rootSHA256: root,
    copyBytes: Buffer.byteLength(copyText),
    payloadBytes: wires.reduce((n, w) => n + Buffer.byteLength(w), 0),
  };
}
export type PackedStage = ReturnType<typeof packStage>;

/** Each DML mode gets its own subset of the original global ordinals. */
export function expectedModeReceipt(
  plan: PackedStage,
  table: StageTable,
  operation: "insert" | "update",
) {
  const ordinals = plan.items
    .map((item, i) => ({ item, ordinal: i + 1 }))
    .filter((r) => r.item.table === table && r.item.operation === operation)
    .map((r) => r.ordinal);
  return { rows: ordinals.length, ordinalSHA256: sha256(ordinals.join(",")) };
}

const envelopeSchema = z
  .object({
    version: z.literal(1),
    status: z.enum(["proposed", "approved"]),
    intent: z.literal("manual-snapshot"),
    decisionReference: z.string().min(1),
    projectId: z.literal("wispy-mouse-67963002"),
    branchId: z.literal("br-wispy-boat-b34glczl"),
    sourceIdentity: z
      .object({
        rawCSVBodySHA256: digest,
        canonicalScopedFactsSHA256: digest,
        baselineScopedFactsSHA256: digest,
        positiveFactsSHA256: digest,
        reconciliationReviewSHA256: digest,
        baselineScopedRows: z.number().int().nonnegative(),
        incomingScopedRows: z.number().int().nonnegative(),
        exactIncomingOccurrences: z.number().int().nonnegative(),
        unresolvedCount: z.number().int().nonnegative(),
        historicalInputs: z.literal("retained-baseline-not-recaptured"),
      })
      .strict(),
    baselineManifestSHA256: digest,
    baselineHasBuildState: z.boolean(),
    context: z
      .object({
        rawHashes: z.record(z.string(), digest),
        normalizedSHA256: digest,
        missingGeocodeKeys: z.array(z.string()),
        missingRoutingKeys: z.array(z.string()),
        resolution: z.enum(["cache-only-pinned", "unknown"]),
      })
      .strict(),
    unresolvedOccurrences: z.array(
      z
        .object({
          id: z.number().int().positive().safe(),
          tuple: objects,
          occurrenceCount: z.literal(1),
          remainingLease: z.string().min(1),
          disposition: z.literal("retain-unresolved"),
        })
        .strict(),
    ),
    detailOwnedPaths: z.array(z.array(pathSegment).min(1).max(6)),
    executionPinsSHA256: digest.optional(),
    stage: objects,
    nextManifestSHA256: digest,
    limits: z
      .object({
        exactCopyBytes: z.number().int().nonnegative().max(STAGE_MAX_COPY_BYTES),
        exactRows: z.number().int().nonnegative(),
        maxTemporaryBytes: z.number().int().positive().max(STAGE_MAX_TEMPORARY_BYTES),
        reservedDatabaseGrowthBytes: z.number().int().nonnegative(),
        maxStatementMs: z.number().int().positive().max(120_000),
        maxTransactionMs: z.number().int().positive().max(600_000),
        maxLockWaitMs: z.number().int().positive().max(5_000),
      })
      .strict(),
  })
  .strict();
export type StageEnvelope = z.infer<typeof envelopeSchema>;

export function stageIdentity(plan: PackedStage) {
  return {
    rootSHA256: plan.rootSHA256,
    rows: plan.rows,
    copyBytes: plan.copyBytes,
    payloadBytes: plan.payloadBytes,
    groups: plan.groups,
  };
}
/** Excluding final-manifest hash prevents a circular ID embedded in that same manifest. */
export function stagePublicationId(envelope: StageEnvelope) {
  return sha256(
    canonicalJson({
      ...envelope,
      status: undefined,
      decisionReference: undefined,
      nextManifestSHA256: undefined,
    }),
  );
}
/** Count equality alone never admits a changed key, payload, source, context or baseline. */
export function assertStageEnvelope(
  plan: PackedStage,
  envelopeInput: unknown,
  observedBinding: unknown,
  nextManifest: unknown,
) {
  const envelope = envelopeSchema.parse(envelopeInput);
  if (envelope.status !== "approved")
    throw new Error("Snapshot mutation envelope is proposed; manual review required");
  if (envelope.context.resolution !== "cache-only-pinned")
    throw new Error("Incomplete context/cache pinning");
  for (const keys of [envelope.context.missingGeocodeKeys, envelope.context.missingRoutingKeys])
    if (new Set(keys).size !== keys.length) throw new Error("Duplicated unresolved context keys");
  const incoming = plan.items.filter((item) => item.table === "transactions");
  if (
    incoming.length !== envelope.sourceIdentity.exactIncomingOccurrences ||
    sourceFactsSHA256(incoming.map((item) => item.after as TransactionRow)) !==
      envelope.sourceIdentity.positiveFactsSHA256
  )
    throw new Error("Incoming occurrence multiplicity drift");
  if (
    envelope.unresolvedOccurrences.length !== envelope.sourceIdentity.unresolvedCount ||
    new Set(envelope.unresolvedOccurrences.map((r) => r.id)).size !==
      envelope.unresolvedOccurrences.length ||
    incoming.some((item) => envelope.unresolvedOccurrences.some((r) => r.id === item.key.id))
  )
    throw new Error("Retained occurrence identity drift");
  const binding = {
    sourceIdentity: envelope.sourceIdentity,
    baselineManifestSHA256: envelope.baselineManifestSHA256,
    baselineHasBuildState: envelope.baselineHasBuildState,
    context: envelope.context,
    unresolvedOccurrences: envelope.unresolvedOccurrences,
  };
  if (!same(binding, observedBinding))
    throw new Error("Source/baseline/context/retention identity drift");
  if (
    !same(stageIdentity(plan), envelope.stage) ||
    plan.copyBytes !== envelope.limits.exactCopyBytes ||
    plan.rows !== envelope.limits.exactRows
  )
    throw new Error("Staging keys, patches, counts or byte identity drift");
  const owned = new Set(envelope.detailOwnedPaths.map(canonicalJson));
  if (plan.items.some((item) => item.detailPatches?.some((p) => !owned.has(canonicalJson(p.path)))))
    throw new Error("Unowned JSON path");
  if (sha256(canonicalJson(nextManifest)) !== envelope.nextManifestSHA256)
    throw new Error("Target manifest drift");
  const publicationId = stagePublicationId(envelope);
  const target = objects.parse(nextManifest),
    receipt = objects.parse(target.neonPublication);
  if (receipt.publicationId !== publicationId)
    throw new Error("Manifest publication identity drift");
  return publicationId;
}

/** Acknowledgement loss requires an authoritative read. Never blind-retry COMMIT. */
export function classifyManifest(
  current: unknown,
  baseline: unknown,
  published: unknown,
): "already-published" | "baseline-retry-eligible" | "stale-review-required" {
  if (same(current, published)) return "already-published";
  return same(current, baseline) ? "baseline-retry-eligible" : "stale-review-required";
}

/** Local semantic witness for jsonb_set paths: no sibling deletion or inferred fact pairing. */
export function applyDetailPaths(value: unknown, patches: z.infer<typeof patchSchema>[]) {
  const result = structuredClone(objects.parse(value));
  for (const p of patches) {
    let parent: Record<string, unknown> = result;
    for (const segment of p.path.slice(0, -1)) {
      const next = parent[segment];
      if (
        !Object.hasOwn(parent, segment) ||
        !next ||
        typeof next !== "object" ||
        Array.isArray(next)
      )
        throw new Error("Missing/non-object JSON parent");
      parent = next as Record<string, unknown>;
    }
    const leaf = p.path.at(-1)!;
    const exists = Object.hasOwn(parent, leaf);
    if (exists !== (p.beforeExists ?? true) || (exists && !same(parent[leaf], p.before)))
      throw new Error("Stale or absent owned JSON path");
    Object.defineProperty(parent, leaf, {
      value: structuredClone(p.after),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}

export const CREATE_STAGE_SQL = `CREATE TEMP TABLE neon_publication_stage (
  ordinal INTEGER PRIMARY KEY CHECK(ordinal>0),
  wire TEXT NOT NULL CHECK(octet_length(wire)<=${STAGE_MAX_ITEM_BYTES}),
  item JSONB GENERATED ALWAYS AS (wire::jsonb) STORED,
  CHECK(jsonb_typeof(item)='object')
) ON COMMIT DROP`;
export const STAGE_UNIQUE_SQL = `CREATE UNIQUE INDEX ON neon_publication_stage ((item->>'table'),(item->'key'))`;
export const COPY_STAGE_SQL = `COPY pg_temp.neon_publication_stage(ordinal,wire) FROM STDIN WITH(FORMAT text,ENCODING 'UTF8')`;
export const STAGE_DIGEST_SQL = `SELECT count(*) AS rows,sum(octet_length(wire)) AS payload_bytes,
  encode(sha256(convert_to(COALESCE(string_agg(ordinal::text||':'||encode(sha256(convert_to(wire,'UTF8')),'hex'),chr(10) ORDER BY ordinal),''),'UTF8')),'hex') AS root_sha256,
  pg_total_relation_size('pg_temp.neon_publication_stage') AS temporary_bytes,
  pg_database_size(current_database()) AS database_bytes
FROM pg_temp.neon_publication_stage`;

export const stageKeyJoin = (table: StageTable, alias = "b") =>
  descriptor[table].keys
    .map((k) => `${alias}.${k}=(s.item->'key'->>'${k}')${k === "id" ? "::bigint" : ""}`)
    .join(" AND ");
const keyJoin = stageKeyJoin;
/** Identifiers come from fixed table descriptors, never external input. */
function rawStagedDml(table: StageTable, operation: "insert" | "update") {
  const d = descriptor[table],
    selection = `s.item->>'table'='${table}' AND s.item->>'operation'='${operation}'`;
  if (operation === "insert")
    return `INSERT INTO public.${table} AS b (${d.columns.join(",")})
SELECT ${d.columns.map((c) => `r.${c}`).join(",")} FROM pg_temp.neon_publication_stage s
CROSS JOIN LATERAL jsonb_populate_record(NULL::public.${table},s.item->'after') r
WHERE ${selection} RETURNING ${d.keys.map((k) => `b.${k}`).join(",")},to_jsonb(b) AS actual`;
  if (table === "transactions") throw new Error("Transaction updates not authorized");
  if (table === "block_details")
    return `UPDATE public.block_details b SET json=s.item->'after'->'json'
FROM pg_temp.neon_publication_stage s WHERE ${selection} AND ${keyJoin(table)}
AND encode(sha256(convert_to(b.json::text,'UTF8')),'hex')=s.item->>'detailBeforePgSHA256'
AND b.json IS DISTINCT FROM s.item->'after'->'json'
RETURNING s.ordinal,(b.json=s.item->'after'->'json') AS result_match`;
  const columns = d.columns.filter((c) => !d.keys.includes(c));
  return `UPDATE public.${table} b SET ${columns.map((c) => `${c}=CASE WHEN s.item->'after' ? '${c}' THEN r.${c} ELSE b.${c} END`).join(",")}
FROM pg_temp.neon_publication_stage s CROSS JOIN LATERAL jsonb_populate_record(NULL::public.${table},s.item->'after') r
WHERE ${selection} AND ${keyJoin(table)}
AND EXISTS(SELECT 1 FROM jsonb_each(s.item->'after') f WHERE to_jsonb(b)->f.key IS DISTINCT FROM to_jsonb(r)->f.key)
RETURNING s.ordinal,NOT EXISTS(SELECT 1 FROM jsonb_each(s.item->'after') f
  WHERE to_jsonb(b)->f.key IS DISTINCT FROM to_jsonb(r)->f.key) AS result_match`;
}

/** RETURNING keys/results are checked server-side; only a small receipt leaves PostgreSQL. */
export function stagedDml(table: StageTable, operation: "insert" | "update") {
  // UPDATE already has a unique stage target. Return its ordinal directly: rejoining
  // by JSON keys made the measured detail receipt quadratic and exceeded 120 seconds.
  if (operation === "update")
    return `WITH changed AS (${rawStagedDml(table, operation)})
SELECT count(*) AS affected_rows,
encode(sha256(convert_to(COALESCE(string_agg(ordinal::text,',' ORDER BY ordinal),''),'UTF8')),'hex') AS ordinal_sha256,
COALESCE(bool_and(result_match),true) AS results_match FROM changed`;
  const expected = `NOT EXISTS(SELECT 1 FROM jsonb_each(s.item->'after') f WHERE c.actual->f.key IS DISTINCT FROM to_jsonb(expected)->f.key)`;
  const typedExpected = `CROSS JOIN LATERAL jsonb_populate_record(NULL::public.${table},s.item->'after') expected`;
  return `WITH changed AS (${rawStagedDml(table, operation)})
SELECT count(*) AS affected_rows,
encode(sha256(convert_to(COALESCE(string_agg(s.ordinal::text,',' ORDER BY s.ordinal),''),'UTF8')),'hex') AS ordinal_sha256,
COALESCE(bool_and(${expected}),true) AS results_match
FROM changed c JOIN pg_temp.neon_publication_stage s ON ${keyJoin(table, "c")}
${typedExpected}
WHERE s.item->>'table'='${table}' AND s.item->>'operation'='${operation}'`;
}

export function verifyMutationReceipt(
  receipt: { affected_rows: unknown; ordinal_sha256: unknown; results_match: unknown },
  expected: { rows: number; ordinalSHA256: string },
) {
  if (
    Number(receipt.affected_rows) !== expected.rows ||
    receipt.ordinal_sha256 !== expected.ordinalSHA256 ||
    receipt.results_match !== true
  )
    throw new Error("Affected key/result receipt mismatch; rollback required");
}

/** One count per actual SQL statement, including separate setup/control/validation commands. */
export function statementShape(groups: Record<StageTable, { insert: number; update: number }>) {
  const dml = STAGE_TABLES.reduce(
    (n, t) => n + Number(groups[t].insert > 0) + Number(groups[t].update > 0),
    0,
  );
  // Initial read + BEGIN + settings + CREATE + unique index + COPY + ANALYZE + locked manifest
  // + table locks + digest/storage + target validation + post-DML aggregate + manifest + COMMIT.
  return {
    dml,
    nonDml: 14,
    sqlStatements: dml + 14,
    roundTrips: dml + 14,
    copyStreams: 1,
    note: "Excludes reconciliation scans, auth/connect/TLS, failure ROLLBACK and recovery reads; COPY sends multiple protocol data frames.",
  };
}
