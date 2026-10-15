import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Socket } from "node:net";
import {
  buildArtifacts,
  buildMrtStationsGeoJson,
  excludedTransactionDigest,
  toTransactionRow,
  type ResaleTransaction,
} from "./lib/pipeline";
import { collectionMetadataSchema } from "./lib/schemas";
import { fetchCsvRows, fetchGeoJson, fetchJson } from "./lib/sync/fetchers";
import { fetchSourceVersionHints } from "./lib/sync/source-version";
import {
  normalizeResaleRows,
  normalizePropertyRows,
  rekeyPropertyInfo,
  normalizeMrtFeatures,
} from "./lib/sync/normalization";
import { loadGeocodeCache, saveGeocodeCacheEntries } from "./lib/sync/geocode";
import { loadRoutingCache, saveRoutingCacheEntries } from "./lib/sync/routing";
import { fetchAmenityData, geocodeMissingAddresses, computeWalkingTimes } from "./sync-data";
import {
  planTransactionDelta,
  readTransactionSnapshot,
  assignStableTransactionIds,
} from "./lib/sync/incremental";
import { readPublishedArtifacts, planArtifactWrites } from "./lib/sync/store";
import {
  resolveOneMapSearchEndpoint,
  resolveOneMapRoutingEndpoint,
  resolveOneMapTokenEndpoint,
  validateGeneratedArtifacts,
} from "./lib/syncGuards";
import {
  NEON_REFRESH_BRANCH,
  NEON_REFRESH_PROJECT,
  NeonPlanningStore,
  NeonSessionGuard,
  createNeonRefreshClient,
  canonicalJson,
  canonicalNeonArtifacts,
  validateNeonRefreshUrl,
  publishNeon,
  readNeonSqlTime,
  readNeonPublicationUpdatedAt,
  assertNeonPublicationUnchanged,
  safeNeonError,
  AmbiguousNeonPublicationError,
  StaleNeonPreparationError,
  validateNeonPublicationPlan,
  type NeonPublicationVersion,
  type PgQuery,
} from "./lib/sync/neon";
import { checkNeonPilotBudget } from "./lib/sync/neon-usage";
import {
  OneMapRequestBudget,
  OneMapRun,
  oneMapNotStarted,
  parseOneMapBudget,
  type OneMapRunDependencies,
} from "./lib/sync/onemap-budget";
import { installOneMapRequestBudget } from "./lib/sync/rate-limits";
import { readServingHyperdriveId } from "./lib/sync/serving-config";
import {
  requireApprovedNeonReview,
  planNeonReconciliation,
  includeRetainedSourceRows,
  isNeonPublicationReplay,
  NeonReconciliationPolicyError,
  neonManifestSHA256,
  type NeonManifest,
  type NeonSourceCheckpoint,
  assignNeonTransactionIds,
} from "./lib/sync/neon-reconciliation";
import {
  MOE_SCHOOL_DATASET_ID,
  MRT_DATASET_ID,
  NEA_HAWKER_DATASET_ID,
  NPARKS_PARKS_DATASET_ID,
  PROPERTY_DATASET_ID,
  RESALE_COLLECTION_ID,
  SFA_SUPERMARKET_DATASET_ID,
} from "./lib/sync/constants";

function option(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  if (!argv[index + 1] || argv[index + 1].startsWith("--"))
    throw new Error(`Missing ${name} value`);
  return argv[index + 1];
}

export function neonRefreshOptions(argv: string[]) {
  const modes = ["--apply", "--plan", "--check-upstream"].filter((mode) => argv.includes(mode));
  if (modes.length !== 1) throw new Error("Choose exactly one Neon refresh mode");
  const mode = modes[0];
  if (mode !== "--check-upstream" && !argv.includes("--reconcile-manual"))
    throw new Error("Neon refresh requires explicit manual reconciliation intent");
  if (argv.includes("--reconcile-monthly"))
    throw new Error("Monthly Neon scheduling is not enabled");
  const branch = option(argv, "--branch");
  if (branch !== NEON_REFRESH_BRANCH)
    throw new Error("Explicit isolated Neon benchmark branch required");
  return {
    mode,
    branch,
    connectionFile: option(argv, "--connection-file"),
    usageBefore: option(argv, "--usage-before"),
    report: option(argv, "--report"),
    reconciliationReview: option(argv, "--reconciliation-review"),
    sourceCaptureDirectory: option(argv, "--source-capture-directory"),
    // Optional OneMap enrichment. Absent means zero: the run makes no OneMap request of that kind.
    oneMapBudget: {
      search: parseOneMapBudget(option(argv, "--onemap-search-budget"), "--onemap-search-budget"),
      routing: parseOneMapBudget(
        option(argv, "--onemap-routing-budget"),
        "--onemap-routing-budget",
      ),
    },
  };
}

export async function fetchNeonSourceInventory() {
  const metadata = collectionMetadataSchema.parse(
    await fetchJson<unknown>(
      `https://api-production.data.gov.sg/v2/public/api/collections/${RESALE_COLLECTION_ID}/metadata`,
    ),
  ).data.collectionMetadata;
  const hints = await fetchSourceVersionHints([
    ...metadata.childDatasets,
    PROPERTY_DATASET_ID,
    MRT_DATASET_ID,
    MOE_SCHOOL_DATASET_ID,
    NEA_HAWKER_DATASET_ID,
    SFA_SUPERMARKET_DATASET_ID,
    NPARKS_PARKS_DATASET_ID,
  ]);
  if (!metadata.childDatasets.length || !metadata.lastUpdatedAt)
    throw new Error("Incomplete upstream inventory");
  return { metadata, hints };
}

/** The slice of `pg.Client` the refresh uses; tests substitute a real local PostgreSQL or PGlite session. */
export type NeonRefreshClient = {
  connect(): Promise<unknown>;
  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  end(): Promise<unknown>;
  connection?: { stream?: Pick<Socket, "bytesRead" | "bytesWritten"> };
};

export type SyncNeonDependencies = {
  env: NodeJS.ProcessEnv;
  now: () => number;
  fetchSourceInventory: () => ReturnType<typeof fetchNeonSourceInventory>;
  fetchCsvRows: typeof fetchCsvRows;
  fetchGeoJson: typeof fetchGeoJson;
  fetchAmenityData: typeof fetchAmenityData;
  oneMap: OneMapRunDependencies;
  createClient: (url: string) => NeonRefreshClient;
  /** The Hyperdrive configuration id the Worker binds (`wrangler.jsonc`). */
  servingHyperdriveId: () => string;
  /** Applies only to the two short read snapshots and the publication transaction. */
  idleInTransactionTimeoutMs: number;
  /** After this, the connection is closed; nothing can commit afterwards. */
  runDeadlineMs: number;
};

function defaultDependencies(): SyncNeonDependencies {
  return {
    env: process.env,
    now: Date.now,
    fetchSourceInventory: fetchNeonSourceInventory,
    fetchCsvRows,
    fetchGeoJson,
    fetchAmenityData,
    oneMap: {},
    createClient: (url) => createNeonRefreshClient(url) as unknown as NeonRefreshClient,
    servingHyperdriveId: () => readServingHyperdriveId(),
    idleInTransactionTimeoutMs: 120_000,
    runDeadlineMs: 20 * 60 * 1000,
  };
}

/**
 * One manual run; no source snapshot substitution, synthetic additions, migration or automatic retry.
 *
 * Database work happens in three short phases on one session, and nothing network-bound runs inside a transaction:
 * 1. A REPEATABLE READ READ ONLY snapshot reads the publication version (manifest JSON + `updated_at`), the
 *    transaction facts, the published artifacts and both caches, then commits.
 * 2. With database access closed, the run downloads amenity sources, makes its budgeted OneMap requests, checks
 *    that the upstream inventory did not change, and builds artifacts. Cache writes are staged in memory.
 * 3. A second READ ONLY snapshot first requires the publication version to be unchanged, then reads the stored
 *    rows the planner compares against. With `--apply`, publication re-checks the same version under
 *    `SELECT ... FOR UPDATE` and writes data then the manifest in one transaction.
 * Every publication rewrites `updated_at` with its data, so an unchanged version proves the rows read in phases 1
 * and 3 are one generation and that nothing was published in between.
 */
export async function runSyncNeon(
  argv = process.argv.slice(2),
  overrides: Partial<SyncNeonDependencies> = {},
) {
  const deps: SyncNeonDependencies = { ...defaultDependencies(), ...overrides };
  const options = neonRefreshOptions(argv);
  // Validated before any network or database activity.
  const oneMapBudget = new OneMapRequestBudget(options.oneMapBudget);
  if (
    !Number.isSafeInteger(deps.idleInTransactionTimeoutMs) ||
    deps.idleInTransactionTimeoutMs <= 0
  )
    throw new Error("Invalid idle-in-transaction timeout");
  const startedAt = new Date().toISOString();
  // Review is checked before fetching sources or opening a connection, even for remote planning.
  const review = options.reconciliationReview
    ? requireApprovedNeonReview(JSON.parse(readFileSync(options.reconciliationReview, "utf8")))
    : undefined;
  if (
    review &&
    (!options.report ||
      !options.sourceCaptureDirectory ||
      !/^\.neon-benchmark\/[a-zA-Z0-9.-]+$/.test(options.sourceCaptureDirectory))
  )
    throw new Error(
      "Reviewed Neon reconciliation requires a sanitized report and private source capture directory",
    );
  if (options.mode === "--check-upstream") {
    const inventory = await deps.fetchSourceInventory();
    console.log(
      JSON.stringify({
        mode: "neon-upstream-observation",
        branch: options.branch,
        ...inventory,
        databaseCalls: 0,
        reconciliationRequired: false,
      }),
    );
    return;
  }
  if (!options.usageBefore)
    throw new Error(
      "Authoritative captured Console usage receipt required before the expensive Neon run",
    );
  const usageBefore: unknown = JSON.parse(readFileSync(options.usageBefore, "utf8"));
  const budgetOptions = { servingHyperdriveId: deps.servingHyperdriveId };
  checkNeonPilotBudget(usageBefore, deps.now(), budgetOptions);
  const url = validateNeonRefreshUrl(
    options.connectionFile
      ? readFileSync(options.connectionFile, "utf8").trim()
      : (deps.env.NEON_REFRESH_DATABASE_URL ?? ""),
    options.branch,
  );
  // Fetch genuine upstream source before waking compute. An upstream denial does not consume a corpus scan.
  const { metadata, hints } = await deps.fetchSourceInventory();
  const csvs: NeonSourceCheckpoint["csvs"] = [];
  if (review) mkdirSync(options.sourceCaptureDirectory!, { mode: 0o700 });
  const transactions: ResaleTransaction[] = [];
  for (const id of metadata.childDatasets) {
    if (!/^d_[a-f0-9]{32}$/.test(id)) throw new Error("Unexpected official dataset identifier");
    const rows = await deps.fetchCsvRows(
        id,
        review
          ? (receipt, body) => {
              csvs.push({
                datasetId: receipt.datasetId,
                bodySHA256: receipt.bodySHA256,
                bytes: receipt.bytes,
                rows: receipt.rows,
              });
              writeFileSync(`${options.sourceCaptureDirectory}/${id}.csv`, body, { mode: 0o600 });
              writeFileSync(
                `${options.sourceCaptureDirectory}/receipt.json`,
                JSON.stringify({ startedAt, csvs, metadata, hints, complete: false }, null, 2),
                { mode: 0o600 },
              );
            }
          : undefined,
      ),
      normalized = normalizeResaleRows(rows);
    if (rows.length !== normalized.length || !rows.length)
      throw new Error("Partial or invalid resale source rejected");
    for (const row of normalized) transactions.push(row);
  }
  const sourceCapturedAtUTC = new Date().toISOString();
  if (review) {
    const after = await deps.fetchSourceInventory();
    if (canonicalJson(after) !== canonicalJson({ metadata, hints }))
      throw new Error(
        "Source inventory changed during capture; no database reconciliation attempted",
      );
    writeFileSync(
      `${options.sourceCaptureDirectory}/receipt.json`,
      JSON.stringify(
        { startedAt, capturedAtUTC: sourceCapturedAtUTC, csvs, metadata, hints, complete: true },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
  const propertyRows = await deps.fetchCsvRows(PROPERTY_DATASET_ID);
  const mrtGeoJson = await deps.fetchGeoJson(MRT_DATASET_ID),
    mrtExits = normalizeMrtFeatures(mrtGeoJson);
  // Upstream downloading can be slow; do not wake compute with an expired provider baseline.
  const budget = checkNeonPilotBudget(usageBefore, deps.now(), budgetOptions);
  const client = deps.createClient(url);
  const connected = performance.now();
  await client.connect();
  const connectionMs = performance.now() - connected;
  const stream = client.connection?.stream;
  const receivedBefore = stream?.bytesRead ?? 0,
    sentBefore = stream?.bytesWritten ?? 0;
  const queryAwait: {
    sql: string;
    elapsedMs: number;
    returnedRows: number;
    affectedRows: number | null;
    success: boolean;
  }[] = [];
  const instrumented: PgQuery = async (sql, params) => {
    const t = performance.now();
    try {
      const result = await client.query(sql, params);
      queryAwait.push({
        sql: sql.slice(0, 120),
        elapsedMs: performance.now() - t,
        returnedRows: result.rows.length,
        affectedRows: result.rowCount,
        success: true,
      });
      return result;
    } catch (error) {
      queryAwait.push({
        sql: sql.slice(0, 120),
        elapsedMs: performance.now() - t,
        returnedRows: 0,
        affectedRows: null,
        success: false,
      });
      throw error;
    }
  };
  // Tracks this session's transaction state and closes database access during network-bound preparation.
  const session = new NeonSessionGuard(instrumented);
  const query = session.query;
  const sensitive = [
    new URL(url).password,
    decodeURIComponent(new URL(url).password),
    deps.env.ONEMAP_TOKEN ?? "",
    deps.env.ONEMAP_PASSWORD ?? "",
    deps.env.DATA_GOV_API_KEY ?? "",
  ];
  const db = new NeonPlanningStore(query);
  let lock = false;
  const started: { oneMap?: OneMapRun } = {};
  const phases: Record<string, number> = {};
  const evidence: Record<string, unknown> = {
    startedAt,
    projectId: NEON_REFRESH_PROJECT,
    branchId: options.branch,
    invocation: "manual-process",
    mode: options.mode,
    dataProvenance: "fresh official upstream; full exact multiset reconciliation",
    connectionMs,
    budgetBefore: budget,
    sideEffects: {
      database:
        options.mode === "--apply"
          ? "read-only snapshots, then at most one publication transaction on the isolated benchmark branch"
          : "read-only snapshots only; no publication and no mutation",
      upstreamDatasets:
        "data.gov.sg metadata and dataset downloads (resale, property, MRT, amenities), needed to plan at all",
      oneMap:
        "only within the explicit per-run budgets of HTTP attempts (retries included) reported under oneMap",
    },
    transactionBoundaries: {
      snapshots: "REPEATABLE READ READ ONLY, reads only",
      preparationOutsideTransaction: true,
      idleInTransactionTimeoutMs: deps.idleInTransactionTimeoutMs,
    },
    publication: null,
  };
  const deadline = setTimeout(() => {
    void client.end();
  }, deps.runDeadlineMs);
  const phase = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
    const t = performance.now();
    try {
      return await work();
    } finally {
      phases[name] = performance.now() - t;
    }
  };
  try {
    await query("SET lock_timeout='5s'");
    await query(`SET idle_in_transaction_session_timeout=${deps.idleInTransactionTimeoutMs}`);
    const acquired = await query("SELECT pg_try_advisory_lock(724921, 1) AS acquired");
    if (acquired.rows[0].acquired !== true)
      throw new Error("Another Neon ingestion is in progress");
    lock = true;
    await db.inspectSchema();
    const sqlBefore = await readNeonSqlTime(query);

    // Phase 1: one consistent snapshot of everything the run builds on. Reads only, then commit.
    const snapshot = await phase("baselineSnapshot", async () => {
      await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const baseline = await db.query<{ json: string }>({
        sql: "SELECT json FROM manifest WHERE id = 1",
      });
      const manifestJson = baseline[0]?.json;
      if (!manifestJson)
        throw new Error(
          "Existing faithful baseline manifest required; this job never bootstraps data",
        );
      const version: NeonPublicationVersion = {
        manifestJson,
        updatedAt: await readNeonPublicationUpdatedAt(query),
      };
      const manifest = JSON.parse(manifestJson) as NeonManifest;
      if (manifest.neonReconciliation && !review)
        throw new Error("Durable discrepancy state requires the reviewed Neon reconciliation path");
      if (
        review &&
        !manifest.neonReconciliation &&
        neonManifestSHA256(manifest) !== review.initialBaselineManifestSHA256
      )
        throw new Error("Reviewed initial Neon manifest differs; corpus read deferred for review");
      const stored = await readTransactionSnapshot(db);
      const previous = await readPublishedArtifacts(db, manifestJson);
      if (!previous) throw new Error("Missing published artifact baseline");
      const cache = await loadGeocodeCache(db),
        routing = await loadRoutingCache(db);
      await query("COMMIT");
      return { manifestJson, version, manifest, stored, previous, cache, routing };
    });
    const { manifestJson, version, manifest, stored, previous, cache, routing } = snapshot;

    const factRows = transactions.flatMap((row) => {
      const fact = toTransactionRow(row);
      return fact ? [fact] : [];
    });
    const excluded = excludedTransactionDigest(transactions);
    if (
      (manifest.syncBuildState?.excludedSourceDigest &&
        manifest.syncBuildState.excludedSourceDigest !== excluded) ||
      (!manifest.syncBuildState?.excludedSourceDigest && transactions.length !== factRows.length)
    )
      throw new Error("Excluded source facts require explicit reconciliation");
    const reconciled = review
      ? planNeonReconciliation({
          previous: stored,
          incoming: factRows,
          manifest,
          review,
          capturedAtUTC: sourceCapturedAtUTC,
          csvs,
          sourceNormalizedRows: transactions.length,
          intent: "manual",
        })
      : undefined;
    const delta = reconciled?.delta ?? planTransactionDelta(stored, factRows);
    const effectiveTransactions = reconciled
      ? includeRetainedSourceRows(transactions, reconciled)
      : transactions;
    if (reconciled)
      assignNeonTransactionIds(effectiveTransactions, stored, reconciled, transactions.length);
    else assignStableTransactionIds(effectiveTransactions, stored, delta, toTransactionRow);
    if (reconciled)
      evidence.reconciliation = {
        sourceFacts: reconciled.sourceFacts,
        storedFacts: reconciled.storedFacts,
        retainedOccurrences: reconciled.retainedOccurrences,
        newlyMissingIds: reconciled.newlyMissingIds,
        reappearedIds: reconciled.reappearedIds,
        growth: reconciled.growth,
        ledger: reconciled.state,
      };
    db.beginWriteStaging();

    // Phase 2: network-bound preparation. No transaction is open and no query can be sent.
    const prepared = await phase("preparationWithoutDatabase", () =>
      session.withoutDatabase("upstream and OneMap preparation", async () => {
        const run = await OneMapRun.start(
          { budget: oneMapBudget, env: deps.env, tokenEndpoint: resolveOneMapTokenEndpoint() },
          deps.oneMap,
        );
        started.oneMap = run;
        const timestamp = () => new Date().toISOString();
        const addresses = new Map(
          effectiveTransactions.map((row) => [
            row.addressKey,
            `${row.block} ${row.streetName} SINGAPORE`,
          ]),
        );
        // Block addresses are geocoded first, so a small search budget goes to blocks before amenities.
        const { attempt } = run.allocateBlockGeocoding(
          [...addresses].filter(([key]) => !cache.entries[key]),
        );
        const geocoded = await geocodeMissingAddresses(
          {
            missingAddresses: attempt,
            geocodeCache: cache,
            geocodeEndpoint: resolveOneMapSearchEndpoint(),
            skipGeocoding: false,
            concurrency: 10,
            flushCacheFn: (keys) => saveGeocodeCacheEntries(db, cache, keys, timestamp()),
          },
          { geocodeAddressFn: run.geocodeBlockAddress },
        );
        const beforeAmenities = new Set(Object.keys(cache.entries));
        const amenities = await deps.fetchAmenityData(cache, {
          skipGeocoding: false,
          geocodeEndpoint: resolveOneMapSearchEndpoint(),
          geocodeAddressFn: run.geocodeAmenityAddress,
        });
        if (amenities.failedSources.length) throw new Error("Incomplete amenity source rejected");
        await saveGeocodeCacheEntries(
          db,
          cache,
          Object.keys(cache.entries).filter((key) => !beforeAmenities.has(key)),
          timestamp(),
        );
        const walking = await computeWalkingTimes(
          {
            geocodes: cache.entries,
            addressKeys: addresses.keys(),
            mrtExits,
            routingCache: routing,
            skipRouting: false,
            routingEndpoint: resolveOneMapRoutingEndpoint(),
            tokenEndpoint: resolveOneMapTokenEndpoint(),
            concurrency: 4,
            flushCacheFn: (keys) => saveRoutingCacheEntries(db, routing, keys, timestamp()),
          },
          {
            // The token was resolved once for the run (or deliberately not at all).
            resolveOneMapTokenFn: async () => run.routingToken,
            routeMissingPairsFn: run.routeMissingPairs,
          },
        );
        // Every upstream read is complete; the inventory must still be the one the run started from.
        if (canonicalJson(await deps.fetchSourceInventory()) !== canonicalJson({ metadata, hints }))
          throw new Error(
            "Source inventory changed during preparation; nothing was planned or written",
          );
        const artifacts = canonicalNeonArtifacts(
          buildArtifacts({
            transactions: effectiveTransactions,
            propertyInfo: rekeyPropertyInfo(
              normalizePropertyRows(propertyRows),
              effectiveTransactions,
            ),
            mrtExits,
            geocodes: cache.entries,
            walkingTimes: walking.walkingTimes,
            ...amenities,
            sourceVersionHints: hints,
            incremental: { previous, delta },
            metadata: {
              resaleCollectionId: RESALE_COLLECTION_ID,
              resaleDatasetIds: metadata.childDatasets,
              propertyDatasetId: PROPERTY_DATASET_ID,
              mrtDatasetId: MRT_DATASET_ID,
              moeSchoolDatasetId: MOE_SCHOOL_DATASET_ID,
              neaHawkerDatasetId: NEA_HAWKER_DATASET_ID,
              sfaSupermarketDatasetId: SFA_SUPERMARKET_DATASET_ID,
              nparksParksDatasetId: NPARKS_PARKS_DATASET_ID,
              lastUpdatedAt: metadata.lastUpdatedAt,
            },
          }),
        );
        if (reconciled) (artifacts.manifest as NeonManifest).neonReconciliation = reconciled.state;
        // Addresses not looked up this run (no token, or beyond the budget) are unresolved like failed ones.
        const unresolvedBlockAddresses =
          geocoded.geocodeFailureCount +
          run.blockGeocoding.deferredByBudget +
          run.blockGeocoding.notAttemptedWithoutToken;
        validateGeneratedArtifacts({
          blockSummariesCount: artifacts.blockSummaries.length,
          detailCount: Object.keys(artifacts.details).length,
          geocodeFailureCount: unresolvedBlockAddresses,
        });
        evidence.unresolved = {
          blockAddressesWithoutCoordinates: unresolvedBlockAddresses,
          amenitiesWithoutCoordinates: amenities.unlocatedCount,
          // Published walking times for these pairs are the pipeline's existing straight-line estimate.
          walkingPairsWithoutRoute: walking.fallbackCount,
        };
        return { artifacts, stations: buildMrtStationsGeoJson(mrtExits) };
      }),
    );
    const { artifacts, stations } = prepared;

    // Phase 3: plan against the same generation, or stop.
    const plan = await phase("planningSnapshot", async () => {
      await query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await assertNeonPublicationUnchanged(query, version);
      const planned = await planArtifactWrites(
        db,
        artifacts,
        JSON.parse(canonicalJson(mrtGeoJson)) as typeof mrtGeoJson,
        JSON.parse(canonicalJson(stations)) as typeof stations,
        new Date().toISOString(),
        delta,
        { enforceBudget: false },
      );
      await query("COMMIT");
      return planned;
    });
    evidence.sourceRows = factRows.length;
    evidence.delta = {
      inserts: delta.inserts.length,
      updates: delta.updates.length,
      deletes: 0,
      affectedBlocks: delta.affectedBlocks.size,
      affectedTownTypes: delta.affectedTownTypes.size,
    };
    evidence.changedRows = plan.changedRows;
    evidence.conservativeIndexOperationForecast = plan.forecastWriteUpperBound;
    evidence.publicationBodyBytes = Buffer.byteLength(
      JSON.stringify({ statements: plan.statements, manifest: artifacts.manifest }),
    );
    validateNeonPublicationPlan(plan, artifacts.manifest);
    const beforePublish = await readNeonSqlTime(query);
    let publicationExecuted = false;
    if (options.mode === "--apply") {
      const replay = isNeonPublicationReplay(
        manifest,
        artifacts.manifest as NeonManifest,
        plan.statements.length,
      );
      publicationExecuted = !replay;
      evidence.publication = replay
        ? {
            outcome: "already-published-exact-data-replay",
            wallMs: 0,
            statements: 0,
            roundTrips: 0,
            changedRows: {},
            manifestAdvanced: false,
          }
        : await phase("publication", () =>
            publishNeon(
              query,
              db,
              plan,
              artifacts.manifest,
              manifestJson,
              new Date().toISOString(),
              version.updatedAt,
            ),
          );
    }
    const sqlAfter = await readNeonSqlTime(query);
    evidence.sqlExecution = {
      wholeRunMs:
        sqlBefore !== null && sqlAfter !== null && sqlAfter >= sqlBefore
          ? sqlAfter - sqlBefore
          : null,
      publicationMs:
        publicationExecuted &&
        beforePublish !== null &&
        sqlAfter !== null &&
        sqlAfter >= beforePublish
          ? sqlAfter - beforePublish
          : null,
      provenance:
        "pg_stat_statements database/current-role cumulative delta; includes instrumentation and concurrent same-role work if present; unavailable or reset is unknown",
    };
    evidence.success = true;
  } catch (error) {
    if (error instanceof NeonReconciliationPolicyError)
      evidence.unresolvedDiscrepancy = error.discrepancy;
    evidence.success = false;
    evidence.outcome =
      error instanceof AmbiguousNeonPublicationError
        ? "commit-unknown-reconciliation-required"
        : error instanceof StaleNeonPreparationError
          ? "stale-preparation-nothing-written"
          : "failed-no-success-marker";
    evidence.error = safeNeonError(error, sensitive);
    throw error;
  } finally {
    clearTimeout(deadline);
    // Removes the run's OneMap budget from the shared request choke point, even if preparation failed early.
    installOneMapRequestBudget(null);
    if (session.inTransaction) await query("ROLLBACK").catch(() => {});
    if (lock) await query("SELECT pg_advisory_unlock(724921, 1)").catch(() => {});
    evidence.finishedAt = new Date().toISOString();
    evidence.phasesMs = phases;
    evidence.oneMap = started.oneMap?.report() ?? oneMapNotStarted(oneMapBudget);
    evidence.wireReceivedProxyBytes = stream ? stream.bytesRead - receivedBefore : null;
    evidence.wireSentProxyBytes = stream ? stream.bytesWritten - sentBefore : null;
    evidence.queryCount = queryAwait.length;
    evidence.queryAwait = queryAwait;
    evidence.planning = db.usageReport();
    evidence.providerPublicTransferBytes = null;
    evidence.providerComputeCUHours = null;
    evidence.providerActiveTimeSeconds = null;
    evidence.limitation =
      "Wire/client timings are proxies; append settled provider readings before assessing scheduling. Not a GitHub Actions run.";
    if (options.report)
      writeFileSync(options.report, JSON.stringify(evidence, null, 2), { mode: 0o600 });
    await client.end().catch(() => {});
    console.log(JSON.stringify({ ...evidence, queryAwait: undefined, planning: undefined }));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void runSyncNeon().catch((error: unknown) => {
    console.error(
      safeNeonError(error, [
        process.env.ONEMAP_TOKEN ?? "",
        process.env.ONEMAP_PASSWORD ?? "",
        process.env.DATA_GOV_API_KEY ?? "",
      ]),
    );
    process.exitCode = 1;
  });
