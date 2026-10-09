/**
 * Isolated manual PostgreSQL publisher. No CLI, import-time connection or automatic retry.
 * Production D1/runtime and its 25k guard are unaffected.
 */
import pg from "pg";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";
import type { Socket } from "node:net";
import { canonicalJson, NEON_REFRESH_BRANCH, validateNeonRefreshUrl } from "../lib/sync/neon";
import {
  classifyManifest,
  CREATE_STAGE_SQL,
  COPY_STAGE_SQL,
  STAGE_UNIQUE_SQL,
  STAGE_DIGEST_SQL,
  STAGE_TABLES,
  stagedDml,
  expectedModeReceipt,
  verifyMutationReceipt,
  sha256,
  type PackedStage,
} from "./staged-plan";
import {
  assertExecutionInput,
  sequenceLimitsSchema,
  type SequenceLimits,
  type StageExecutionInput,
} from "./staged-execution";
import {
  MANIFEST_READ_SQL,
  MANIFEST_LOCK_SQL,
  MANIFEST_WRITE_SQL,
  INGESTION_LOCK_SQL,
  PRECONDITIONS_SQL,
  POSTCONDITIONS_SQL,
} from "./staged-validation";

const COPY_CHUNK_BYTES = 64 * 1024;
const SETTINGS_SQL = `SELECT set_config('statement_timeout',$1,true),
  set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout',$3,true),
  set_config('transaction_timeout',$4,true),
  set_config('search_path','pg_catalog,public',true)`;
export function publicationSQLSHA256(plan: PackedStage) {
  return sha256(
    canonicalJson([
      MANIFEST_READ_SQL,
      "BEGIN",
      SETTINGS_SQL,
      CREATE_STAGE_SQL,
      STAGE_UNIQUE_SQL,
      COPY_STAGE_SQL,
      "ANALYZE pg_temp.neon_publication_stage",
      MANIFEST_LOCK_SQL,
      INGESTION_LOCK_SQL,
      STAGE_DIGEST_SQL,
      PRECONDITIONS_SQL,
      ...STAGE_TABLES.flatMap((t) =>
        (["insert", "update"] as const)
          .filter((m) => plan.groups[t][m] > 0)
          .map((m) => stagedDml(t, m)),
      ),
      POSTCONDITIONS_SQL,
      MANIFEST_WRITE_SQL,
      "COMMIT",
    ]),
  );
}
export type CommandReceipt = {
  label: string;
  wallMs: number;
  receivedProxyBytes: number;
  sentProxyBytes: number;
  success: boolean;
  rows: number | null;
};
export type SequenceReceipt = {
  startedAtUTC: string;
  commands: CommandReceipt[];
  connections: number;
  receivedProxyBytes: number;
  sentProxyBytes: number;
  wallMs: number;
  computeCUHoursUpperProxy: number;
  providerTransferUsed: "UNKNOWN";
  providerComputeUsed: "UNKNOWN";
};

/** Shared by stale/failure/success/replay/recovery; the caller must persist the receipt.
 * Limits never reset per attempt. Socket counters are transport proxies, not Neon billing.
 * Compute proxy assumes the pinned endpoint maximum CU and includes one idle tail.
 */
export class PublicationSequenceBudget {
  readonly limits: SequenceLimits;
  readonly receipt: SequenceReceipt;
  private readonly began: number;
  private claims = new Set<string>();
  private active: { close: () => void; detach: () => void } | undefined;
  private deadline: ReturnType<typeof setTimeout>;
  private exhausted = false;
  constructor(input: SequenceLimits, priorReadOnlyAdmission?: SequenceReceipt) {
    const elapsed = priorReadOnlyAdmission
      ? Date.now() - Date.parse(priorReadOnlyAdmission.startedAtUTC)
      : 0;
    if (
      !Number.isFinite(elapsed) ||
      elapsed < 0 ||
      (priorReadOnlyAdmission &&
        priorReadOnlyAdmission.commands.some((r) => !r.label.startsWith("admit-")))
    )
      throw new Error("Only a read-only admission receipt can resume; no mutation retry");
    this.began = performance.now() - elapsed;
    this.limits = sequenceLimitsSchema.parse(input);
    if (
      !input.maxCommands ||
      !input.maxConnections ||
      !input.maxWallMs ||
      ((input.maxWallMs + input.endpointIdleTailMs) * input.endpointMaximumCU) / 3_600_000 >
        input.maxComputeCUHoursProxy
    )
      throw new Error("Sequence time/compute upper proxy does not fit the explicit reserve");
    this.receipt = priorReadOnlyAdmission ?? {
      startedAtUTC: new Date().toISOString(),
      commands: [],
      connections: 0,
      receivedProxyBytes: 0,
      sentProxyBytes: 0,
      wallMs: 0,
      computeCUHoursUpperProxy: 0,
      providerTransferUsed: "UNKNOWN",
      providerComputeUsed: "UNKNOWN",
    };
    this.deadline = setTimeout(
      () => {
        this.exhausted = true;
        this.active?.close();
      },
      Math.max(1, input.maxWallMs - elapsed),
    );
    this.deadline.unref();
    this.check();
  }
  check() {
    const elapsed = performance.now() - this.began;
    this.receipt.wallMs = elapsed;
    this.receipt.computeCUHoursUpperProxy =
      ((elapsed + this.limits.endpointIdleTailMs) * this.limits.endpointMaximumCU) / 3_600_000;
    if (
      this.exhausted ||
      elapsed >= this.limits.maxWallMs ||
      this.receipt.receivedProxyBytes > this.limits.maxReceivedProxyBytes ||
      this.receipt.sentProxyBytes > this.limits.maxSentProxyBytes
    )
      throw new Error("Shared publication sequence resource bound exhausted");
  }
  claim(
    mode: "snapshot-rejection" | "failure-before-manifest" | "success" | "replay" | "recovery",
  ) {
    this.check();
    if (this.claims.has(mode))
      throw new Error("Verification step already consumed; no automatic retry");
    this.claims.add(mode);
  }
  reserveCommand(label: string, requestBytes: number) {
    this.check();
    if (
      this.receipt.commands.length >= this.limits.maxCommands ||
      this.receipt.sentProxyBytes + requestBytes > this.limits.maxSentProxyBytes
    )
      throw new Error("Shared command/transfer reserve exceeded before dispatch");
    const receipt: CommandReceipt = {
      label,
      wallMs: 0,
      receivedProxyBytes: 0,
      sentProxyBytes: 0,
      success: false,
      rows: null,
    };
    this.receipt.commands.push(receipt);
    return receipt;
  }
  beginConnection() {
    this.check();
    if (this.active || this.receipt.connections >= this.limits.maxConnections)
      throw new Error("Shared connection reserve exceeded");
    this.receipt.connections++;
  }
  remainingWallMs() {
    this.check();
    return Math.max(1, Math.floor(this.limits.maxWallMs - (performance.now() - this.began)));
  }
  armConnectionAbort(close: () => void) {
    this.active = { close, detach: () => {} };
  }
  attachSocket(socket: Socket) {
    let previousRead = 0,
      previousWrite = 0;
    const observe = () => {
      if (!Number.isSafeInteger(socket.bytesRead) || !Number.isSafeInteger(socket.bytesWritten))
        throw new Error("Missing transport byte counters");
      this.receipt.receivedProxyBytes += socket.bytesRead - previousRead;
      this.receipt.sentProxyBytes += socket.bytesWritten - previousWrite;
      previousRead = socket.bytesRead;
      previousWrite = socket.bytesWritten;
      try {
        this.check();
      } catch {
        this.exhausted = true;
        socket.destroy();
      }
    };
    const onData = () => observe();
    observe();
    socket.on("data", onData);
    this.active = {
      close: () => socket.destroy(),
      detach: () => {
        observe();
        socket.off("data", onData);
      },
    };
    return observe;
  }
  releaseConnection() {
    this.active?.detach();
    this.active = undefined;
  }
  finish() {
    this.releaseConnection();
    clearTimeout(this.deadline);
    this.check();
    return structuredClone(this.receipt);
  }
}

export type PublicationTransport = {
  query: (
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  copy: (sql: string, chunks: AsyncIterable<Buffer>) => Promise<number>;
  sample: () => { receivedProxyBytes: number; sentProxyBytes: number };
  destroy: () => void;
  close: () => Promise<void>;
};
export type TransportFactory = (budget: PublicationSequenceBudget) => Promise<PublicationTransport>;

/** Existing direct benchmark credentials only. A dedicated connection owns BEGIN through COMMIT. */
export function directBenchmarkTransport(url: string): TransportFactory {
  const safeUrl = validateNeonRefreshUrl(url, NEON_REFRESH_BRANCH);
  return async (budget) => {
    budget.beginConnection();
    const client = new pg.Client({
      connectionString: safeUrl,
      application_name: "hdb-neon-staged-verification",
      connectionTimeoutMillis: Math.min(
        budget.limits.connectionTimeoutMs,
        budget.remainingWallMs(),
      ),
      statement_timeout: 120_000,
    });
    client.on("error", () => {}); // Query promises carry failures; shutdown of an idle socket is expected.
    budget.armConnectionAbort(() => client.connection.stream.destroy());
    let socket: Socket | undefined;
    let observe: () => void = () => {};
    try {
      await client.connect();
      socket = (client as unknown as { connection: { stream: Socket } }).connection.stream;
      observe = budget.attachSocket(socket);
      budget.check();
    } catch {
      socket?.destroy();
      await client.end().catch(() => {});
      budget.releaseConnection();
      throw new Error("Isolated connection failed; credentials and URLs withheld");
    }
    const activeSocket = socket;
    return {
      query: async (sql, params = []) => client.query(sql, params),
      copy: async (sql, chunks) => {
        const stream = client.query(copyFrom(sql));
        await pipeline(Readable.from(chunks), stream);
        return stream.rowCount;
      },
      sample: () => {
        observe();
        return {
          receivedProxyBytes: budget.receipt.receivedProxyBytes,
          sentProxyBytes: budget.receipt.sentProxyBytes,
        };
      },
      destroy: () => activeSocket.destroy(),
      close: async () => {
        observe();
        await client.end();
        budget.releaseConnection();
      },
    };
  };
}

function* csvChunks(plan: PackedStage) {
  // Preserve UTF-8 bytes across stream chunk boundaries and bound client frames.
  // Strings and COPY text identity were rebuilt/verified before opening a connection.
  const bytes = Buffer.from(plan.copyText);
  for (let offset = 0; offset < bytes.length; offset += COPY_CHUNK_BYTES)
    yield bytes.subarray(offset, Math.min(offset + COPY_CHUNK_BYTES, bytes.length));
}
function oneRow(result: { rows: Record<string, unknown>[] }) {
  if (result.rows.length !== 1) throw new Error("Missing or incomplete server receipt");
  return result.rows[0];
}
function safeInteger(value: unknown) {
  const result = Number(value);
  if (value === null || value === undefined || !Number.isSafeInteger(result) || result < 0)
    throw new Error("Missing/invalid integer server receipt");
  return result;
}
function validateTargetChecks(row: Record<string, unknown>, plan: PackedStage, maxId: number) {
  if (!Array.isArray(row.target_checks) || row.target_checks.length !== STAGE_TABLES.length)
    throw new Error("Incomplete target validation receipt");
  const checks = row.target_checks as Record<string, unknown>[];
  if (new Set(checks.map((r) => r.table_name)).size !== STAGE_TABLES.length)
    throw new Error("Duplicate target validation receipt");
  for (const table of STAGE_TABLES) {
    const receipt = checks.find((r) => r.table_name === table);
    if (
      !receipt ||
      safeInteger(receipt.staged_rows) !== plan.groups[table].insert + plan.groups[table].update ||
      safeInteger(receipt.mismatches) !== 0
    )
      throw new Error("Stale target or final-value snapshot mismatch");
  }
  if (
    safeInteger(row.retained_mismatches) !== 0 ||
    safeInteger(row.maximum_transaction_id) !== maxId
  )
    throw new Error("Retained tuple or stable integer boundary drift");
}
function validateFinalStorage(
  row: Record<string, unknown>,
  initialDatabaseBytes: number,
  input: StageExecutionInput,
) {
  const database = safeInteger(row.database_bytes),
    temporary = safeInteger(row.temporary_bytes);
  if (
    temporary > input.envelope.limits.maxTemporaryBytes ||
    temporary > input.pins.estimatedTemporaryUpperBytes ||
    database - initialDatabaseBytes > input.envelope.limits.reservedDatabaseGrowthBytes ||
    database +
      input.pins.projectOtherBranchStorageUpperBytes +
      input.pins.minimumRemainingProjectBytes >
      1_073_741_824
  )
    throw new Error(
      "Final durable/index/TOAST storage exceeds the approved growth/headroom reserve",
    );
}
export type PublicationOutcome = {
  state: "published" | "already-published";
  publicationId: string;
  commands: number;
  mutations: number;
  copyBytes: number;
};
export class AmbiguousStagedCommitError extends Error {
  constructor(readonly publicationId: string) {
    super("COMMIT response unavailable; use one bounded fresh manifest read, never blind retry");
  }
}

export async function publishStaged(
  input: StageExecutionInput,
  budget: PublicationSequenceBudget,
  factory: TransportFactory,
  mode: "snapshot-rejection" | "failure-before-manifest" | "success" | "replay",
): Promise<PublicationOutcome> {
  const { publicationId, pins, retainedRows } = assertExecutionInput(
    input,
    publicationSQLSHA256(input.plan),
  );
  if (pins.sequenceLimitsSHA256 !== sha256(canonicalJson(budget.limits)))
    throw new Error("Shared sequence limits differ from the approved execution pins");
  budget.claim(mode);
  const { plan, envelope, baselineManifest, nextManifest } = input;
  const commandStart = budget.receipt.commands.length;
  const transport = await factory(budget);
  let transaction = false,
    commitDispatched = false,
    acknowledged = false,
    destroyed = false;
  let completedCopyBytes = 0;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const query = async (label: string, sql: string, params: unknown[] = []) => {
    const receipt = budget.reserveCommand(
      label,
      Buffer.byteLength(sql) + Buffer.byteLength(canonicalJson(params)) + 1024,
    );
    const before = transport.sample(),
      began = performance.now();
    try {
      const result = await transport.query(sql, params);
      receipt.rows = result.rowCount;
      receipt.success = true;
      return result;
    } finally {
      const after = transport.sample();
      receipt.wallMs = performance.now() - began;
      receipt.receivedProxyBytes = after.receivedProxyBytes - before.receivedProxyBytes;
      receipt.sentProxyBytes = after.sentProxyBytes - before.sentProxyBytes;
      budget.check();
    }
  };
  const outcome = (state: PublicationOutcome["state"], mutations = 0): PublicationOutcome => ({
    state,
    publicationId,
    commands: budget.receipt.commands.length - commandStart,
    mutations,
    copyBytes: completedCopyBytes,
  });
  try {
    const initial = oneRow(await query("manifest-read", MANIFEST_READ_SQL)).json;
    const classification = classifyManifest(initial, baselineManifest, nextManifest);
    if (classification === "already-published") return outcome("already-published");
    if (classification !== "baseline-retry-eligible")
      throw new Error("Stale manifest; manual snapshot review required");
    if (mode === "replay")
      throw new Error("Expected durable replay receipt absent; replay cannot publish");
    await query("begin", "BEGIN");
    transaction = true;
    deadline = setTimeout(() => {
      destroyed = true;
      transport.destroy();
    }, envelope.limits.maxTransactionMs);
    deadline.unref();
    await query("settings", SETTINGS_SQL, [
      `${envelope.limits.maxStatementMs}ms`,
      `${envelope.limits.maxLockWaitMs}ms`,
      "30000ms",
      `${envelope.limits.maxTransactionMs}ms`,
    ]);
    await query("create-stage", CREATE_STAGE_SQL);
    await query("stage-unique-index", STAGE_UNIQUE_SQL);
    const copyReceipt = budget.reserveCommand("copy-stage", plan.copyBytes + 1024);
    const before = transport.sample(),
      began = performance.now();
    try {
      async function* boundedChunks() {
        let sent = 0;
        for (const chunk of csvChunks(plan)) {
          budget.check();
          sent += chunk.length;
          if (sent > envelope.limits.exactCopyBytes) throw new Error("COPY byte bound exceeded");
          yield chunk;
          transport.sample();
          budget.check();
        }
        if (sent !== envelope.limits.exactCopyBytes) throw new Error("Incomplete COPY byte stream");
      }
      const copied = await transport.copy(COPY_STAGE_SQL, boundedChunks());
      if (copied !== plan.rows) throw new Error("Incomplete COPY row receipt");
      completedCopyBytes = plan.copyBytes;
      copyReceipt.rows = copied;
      copyReceipt.success = true;
    } finally {
      const after = transport.sample();
      copyReceipt.wallMs = performance.now() - began;
      copyReceipt.receivedProxyBytes = after.receivedProxyBytes - before.receivedProxyBytes;
      copyReceipt.sentProxyBytes = after.sentProxyBytes - before.sentProxyBytes;
      budget.check();
    }
    await query("analyze-stage", "ANALYZE pg_temp.neon_publication_stage");
    const locked = oneRow(await query("manifest-lock", MANIFEST_LOCK_SQL)).json;
    const lockedClass = classifyManifest(locked, baselineManifest, nextManifest);
    if (lockedClass !== "baseline-retry-eligible") {
      if (lockedClass === "already-published") {
        await query("rollback-already-published", "ROLLBACK");
        transaction = false;
        return outcome("already-published");
      }
      throw new Error("Stale locked manifest; manual snapshot review required");
    }
    await query("ingestion-locks", INGESTION_LOCK_SQL);
    const digest = oneRow(await query("stage-digest", STAGE_DIGEST_SQL));
    const temporary = safeInteger(digest.temporary_bytes),
      database = safeInteger(digest.database_bytes);
    if (
      safeInteger(digest.rows) !== plan.rows ||
      safeInteger(digest.payload_bytes) !== plan.payloadBytes ||
      digest.root_sha256 !== plan.rootSHA256 ||
      temporary > envelope.limits.maxTemporaryBytes ||
      temporary > pins.estimatedTemporaryUpperBytes ||
      database - temporary > pins.maximumDatabaseBytesBeforeStage ||
      database +
        envelope.limits.reservedDatabaseGrowthBytes +
        pins.projectOtherBranchStorageUpperBytes +
        pins.minimumRemainingProjectBytes >
        1_073_741_824
    )
      throw new Error("Loaded staging identity/storage admission mismatch");
    const pre = oneRow(
      await query("preconditions", PRECONDITIONS_SQL, [
        canonicalJson(retainedRows),
        canonicalJson(pins.cacheInputs),
      ]),
    );
    validateTargetChecks(pre, plan, pins.baselineMaximumTransactionId);
    if (
      pre.cache_inputs_match !== true ||
      sha256(canonicalJson(pre.schema_catalog)) !== pins.schemaCatalogSHA256
    )
      throw new Error("Schema or cached context snapshot drift");
    if (mode === "snapshot-rejection")
      throw new Error("Injected snapshot rejection before durable DML");
    for (const table of STAGE_TABLES)
      for (const operation of ["insert", "update"] as const) {
        const expected = expectedModeReceipt(plan, table, operation);
        if (!expected.rows) continue;
        const row = oneRow(await query(`${table}-${operation}`, stagedDml(table, operation)));
        verifyMutationReceipt(
          {
            affected_rows: row.affected_rows,
            ordinal_sha256: row.ordinal_sha256,
            results_match: row.results_match,
          },
          expected,
        );
      }
    const post = oneRow(
      await query("postconditions", POSTCONDITIONS_SQL, [canonicalJson(retainedRows)]),
    );
    validateTargetChecks(
      post,
      plan,
      pins.baselineMaximumTransactionId + plan.groups.transactions.insert,
    );
    validateFinalStorage(post, database, input);
    if (mode === "failure-before-manifest")
      throw new Error("Injected failure before manifest publication");
    const updated = await query("manifest-last", MANIFEST_WRITE_SQL, [
      canonicalJson(nextManifest),
      pins.targetUpdatedAtUTC,
      canonicalJson(baselineManifest),
    ]);
    const manifestReceipt = oneRow(updated);
    if (
      updated.rowCount !== 1 ||
      canonicalJson(manifestReceipt.json) !== canonicalJson(nextManifest)
    )
      throw new Error("Manifest compare-and-set result mismatch");
    validateFinalStorage(manifestReceipt, database, input);
    // Set ambiguity only after a dispatch reserve has succeeded. A local reserve rejection
    // before COMMIT is an ordinary rollback, not an ambiguous publication.
    const receipt = budget.reserveCommand("commit", Buffer.byteLength("COMMIT") + 1024);
    commitDispatched = true;
    const begin = performance.now(),
      beforeCommit = transport.sample();
    try {
      await transport.query("COMMIT");
      acknowledged = true;
      transaction = false;
      receipt.success = true;
    } finally {
      const after = transport.sample();
      receipt.wallMs = performance.now() - begin;
      receipt.receivedProxyBytes = after.receivedProxyBytes - beforeCommit.receivedProxyBytes;
      receipt.sentProxyBytes = after.sentProxyBytes - beforeCommit.sentProxyBytes;
    }
    budget.check();
    return outcome("published", plan.rows + 1);
  } catch (error) {
    if (commitDispatched && !acknowledged) {
      destroyed = true;
      transport.destroy();
      throw new AmbiguousStagedCommitError(publicationId);
    }
    if (transaction && !destroyed) {
      try {
        await query("rollback", "ROLLBACK");
        transaction = false;
      } catch {
        destroyed = true;
        transport.destroy();
      }
    }
    // Server/upstream errors may include values. Deliberately return no raw error details.
    if (
      error instanceof Error &&
      /^(Injected|Stale|Expected|Missing|Incomplete|Duplicate|Retained|Schema|Loaded|Affected|Manifest|Shared|COPY)/.test(
        error.message,
      )
    )
      throw error;
    // Raw PostgreSQL causes can contain data/connection strings. Keep them out of receipts.
    // eslint-disable-next-line preserve-caught-error
    throw new Error("Isolated publication failed; connection closed without automatic retry");
  } finally {
    if (deadline) clearTimeout(deadline);
    if (destroyed) transport.destroy();
    await transport.close().catch(() => {
      transport.destroy();
    });
  }
}

/** Explicit recovery read. Old baseline is retry-eligible only; it does not authorize a replay. */
export async function recoverStagedOutcome(
  input: Pick<StageExecutionInput, "baselineManifest" | "nextManifest">,
  budget: PublicationSequenceBudget,
  factory: TransportFactory,
) {
  budget.claim("recovery");
  const transport = await factory(budget);
  try {
    const receipt = budget.reserveCommand(
      "recovery-manifest",
      Buffer.byteLength(MANIFEST_READ_SQL) + 1024,
    );
    const before = transport.sample(),
      start = performance.now();
    try {
      const result = await transport.query(MANIFEST_READ_SQL);
      receipt.success = true;
      receipt.rows = result.rowCount;
      return classifyManifest(oneRow(result).json, input.baselineManifest, input.nextManifest);
    } finally {
      const after = transport.sample();
      receipt.wallMs = performance.now() - start;
      receipt.receivedProxyBytes = after.receivedProxyBytes - before.receivedProxyBytes;
      receipt.sentProxyBytes = after.sentProxyBytes - before.sentProxyBytes;
    }
  } finally {
    await transport.close().catch(() => {
      transport.destroy();
    });
    budget.check();
  }
}
