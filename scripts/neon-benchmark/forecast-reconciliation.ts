/** Complete LOCAL retained-context scenario. Never fetches or publishes; not a fresh-context forecast. */
import { readFileSync } from "node:fs";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { D1Client, type D1Statement } from "../lib/sync/d1";
import { readPublishedArtifacts, planArtifactWrites } from "../lib/sync/store";
import {
  buildArtifacts,
  walkingTimeLookupKey,
  type GeneratedArtifacts,
  type ResaleTransaction,
  type SchoolLocation,
  type GeocodeEntry,
} from "../lib/pipeline";
import {
  canonicalJson,
  canonicalNeonArtifacts,
  validateNeonPublicationPlan,
  publicationRowCount,
} from "../lib/sync/neon";
import {
  assignNeonTransactionIds,
  includeRetainedSourceRows,
  type planNeonReconciliation,
  type NeonManifest,
} from "../lib/sync/neon-reconciliation";
import type { StoredTransaction } from "../lib/sync/incremental";
import { rekeyPropertyInfo } from "../lib/sync/normalization";
import {
  MAX_ATOMIC_BYTES,
  MAX_ATOMIC_STATEMENTS,
  MAX_FORECAST_WRITES,
} from "../lib/sync/statements";

export type CapturedForecastContext = Pick<
  Parameters<typeof buildArtifacts>[0],
  | "propertyInfo"
  | "mrtExits"
  | "schools"
  | "hawkers"
  | "supermarkets"
  | "parks"
  | "metadata"
  | "sourceVersionHints"
> & {
  exitsGeoJson: Parameters<typeof planArtifactWrites>[2];
  stationsGeoJson: Parameters<typeof planArtifactWrites>[3];
  missingAmenityCacheKeys: string[];
  capturedNormalizedContextComplete: boolean;
};

/** Explain emitted mutations without changing the shared compiler's accounting. */
export function publicationBreakdown(
  statements: D1Statement[],
  indexes: { tbl_name: string; sql: string }[],
  expectedForecast: number,
) {
  const groups: Record<
    string,
    { inserted: number; updated: number; statements: number; forecast: number }
  > = {
    manifest: { inserted: 0, updated: 1, statements: 2, forecast: 1 },
  };
  let mandatoryTransactionForecast = 0,
    mandatoryBlockPriceForecast = 0,
    mandatoryBlockPriceRows = 0;
  for (const statement of statements) {
    const table = statement.sql.match(/^(?:INSERT(?: OR REPLACE)? INTO|UPDATE) ([a-z_]+)/)?.[1];
    if (!table) throw new Error("Unrecognized local forecast mutation");
    const inserted = statement.sql.startsWith("INSERT");
    const rows = publicationRowCount(statement);
    const assignment =
      statement.sql.match(/^UPDATE [a-z_]+ SET ([\s\S]+?)(?: FROM | WHERE )/)?.[1] ?? "";
    const columns = [...assignment.matchAll(/\b([a-z_]+)=/g)].map((match) => match[1]);
    const affected = indexes.filter(
      (index) =>
        index.tbl_name === table &&
        (inserted || columns.some((column) => new RegExp(`\\b${column}\\b`, "i").test(index.sql))),
    ).length;
    const replacementFactor = statement.sql.startsWith("INSERT OR REPLACE") ? 2 : 1;
    const forecast = rows * replacementFactor * (1 + (inserted ? 1 : 2) * affected);
    const group = groups[table] ?? { inserted: 0, updated: 0, statements: 0, forecast: 0 };
    group[inserted ? "inserted" : "updated"] += rows;
    group.statements++;
    group.forecast += forecast;
    groups[table] = group;
    if (table === "transactions" && inserted) mandatoryTransactionForecast += forecast;
    if (
      table === "blocks" &&
      !inserted &&
      columns.some((column) => column === "median_price" || column === "transaction_count")
    ) {
      const priceIndexes = indexes.filter(
        (index) =>
          index.tbl_name === "blocks" && /\b(?:median_price|transaction_count)\b/i.test(index.sql),
      ).length;
      if (priceIndexes !== 1) throw new Error("Known block-price index inventory changed");
      mandatoryBlockPriceRows += rows;
      // Own-source median/count changes require this row plus old/new sort-index entries.
      mandatoryBlockPriceForecast += rows * 3;
    }
  }
  const sum = Object.values(groups).reduce((total, group) => total + group.forecast, 0);
  if (sum !== expectedForecast)
    throw new Error("Diagnostic groups differ from shared compiler forecast");
  return {
    groups,
    mandatoryPinnedSourceSubset: {
      transactionInsertForecast: mandatoryTransactionForecast,
      blockMedianOrCountRows: mandatoryBlockPriceRows,
      blockMedianOrCountForecast: mandatoryBlockPriceForecast,
      combinedForecast: mandatoryTransactionForecast + mandatoryBlockPriceForecast,
      guardLimit: MAX_FORECAST_WRITES,
      passesWriteGuard:
        mandatoryTransactionForecast + mandatoryBlockPriceForecast <= MAX_FORECAST_WRITES,
      excludesAllComparisonsDetailsTrendsCachesAndManifest: true,
      provenance:
        "Required exact pinned transaction inserts and existing-block own-source median/count changes; independent of school/supermarket geocodes or additional block coordinates. Conservative internal index-operation model, not measured billing writes.",
    },
  };
}

function declaredIndexes() {
  const schema = readFileSync("scripts/neon-benchmark/schema.sql", "utf8");
  const indexes: { tbl_name: string; sql: string }[] = [];
  for (const match of schema.matchAll(/CREATE TABLE ([a-z_]+) \(([\s\S]*?)\);/g)) {
    const [, table, body] = match;
    const composite = body.match(/PRIMARY KEY\(([^)]+)\)/)?.[1];
    const single = body.match(/(?:^|\n)\s*([a-z_]+) [^\n,]*?PRIMARY KEY/)?.[1];
    const columns = composite ?? single;
    if (columns)
      indexes.push({
        tbl_name: table,
        sql: `CREATE UNIQUE INDEX ${table}_pkey ON ${table} (${columns})`,
      });
  }
  for (const match of schema.matchAll(/CREATE INDEX [a-z_]+ ON ([a-z_]+)\([^;]+;/g))
    indexes.push({ tbl_name: match[1], sql: match[0] });
  if (indexes.filter((index) => index.tbl_name === "transactions").length !== 4)
    throw new Error("Declared PostgreSQL index inventory changed");
  return indexes;
}
class LocalForecastStore extends D1Client {
  constructor(private readonly local: DatabaseSync) {
    super({
      accountId: "local",
      databaseId: "local",
      apiToken: "local",
      endpoint: "http://localhost",
    });
  }
  override async query<T = Record<string, unknown>>(
    statement: D1Statement | D1Statement[],
  ): Promise<T[]> {
    if (Array.isArray(statement) || !statement.sql.startsWith("SELECT "))
      throw new Error("Forecast adapter permits local reads only");
    const result = statement.sql.includes("FROM sqlite_master")
      ? declaredIndexes()
      : this.local.prepare(statement.sql).all(...((statement.params ?? []) as SQLInputValue[]));
    for (const row of result as Record<string, unknown>[]) {
      for (const [column, value] of Object.entries(row))
        if ((column === "json" || column.endsWith("_json")) && typeof value === "string")
          row[column] = canonicalJson(JSON.parse(value));
    }
    this.usage.push({
      phase: "local-forecast",
      table: statement.sql.match(/FROM ([a-z_]+)/)?.[1] ?? "unknown",
      operation: "SELECT",
      rowsRead: result.length,
      rowsWritten: 0,
      changes: 0,
      durationMs: 0,
      success: true,
    });
    return result as T[];
  }
}
export async function forecastRetainedContext(input: {
  local: DatabaseSync;
  previous: StoredTransaction[];
  active: ResaleTransaction[];
  reconciliation: ReturnType<typeof planNeonReconciliation>;
  manifest: NeonManifest;
  capturedContext?: CapturedForecastContext;
  /** Supplies the real builder output to the offline native adapter; never opens a connection. */
  onPreparedArtifacts?: (material: {
    artifacts: GeneratedArtifacts;
    effectiveSourceAddressKeys: string[];
    baselineSourceAddressKeys: string[];
    missingGeocodeAddresses: string[];
  }) => void;
}) {
  const started = performance.now(),
    { local, previous, active, reconciliation, manifest } = input;
  const store = new LocalForecastStore(local);
  const old = await readPublishedArtifacts(store, canonicalJson(manifest));
  if (!old) throw new Error("Missing retained artifacts");
  const historical = previous
    .filter((row) => row.month < "2017-01")
    .map((row) => ({
      id: `stored:${row.id}`,
      month: row.month,
      town: row.town,
      block: row.block,
      streetName: row.street_name,
      addressKey: row.address_key,
      flatType: row.flat_type,
      storeyRange: row.storey_range,
      floorAreaSqm: row.floor_area_sqm,
      leaseCommenceDate: row.lease_commence_year ?? 0,
      resalePrice: row.resale_price,
      flatModel: row.flat_model,
      remainingLease: "",
      pricePerSqm: Number((row.resale_price / row.floor_area_sqm).toFixed(2)),
      pricePerSqft: Number((row.resale_price / row.floor_area_sqm / 10.7639).toFixed(2)),
    }));
  const source = [...historical, ...active.map((row) => ({ ...row }))];
  const effective = includeRetainedSourceRows(source, reconciliation);
  assignNeonTransactionIds(effective, previous, reconciliation, source.length);
  const geoRows = local.prepare("SELECT * FROM geocode_cache").all();
  const geocodes: Record<string, GeocodeEntry> = Object.fromEntries(
    geoRows.map((row) => [
      String(row.cache_key),
      {
        lat: Number(row.lat),
        lng: Number(row.lng),
        postalCode: row.postal_code as string | null,
        displayName: row.display_name as string | null,
        searchValue: String(row.search_value),
      },
    ]),
  );
  const mrtRows = local.prepare("SELECT * FROM mrt_geojson").all();
  const exits = JSON.parse(mrtRows.find((row) => row.kind === "exits")!.json as string) as {
    type: "FeatureCollection";
    features: { properties: { STATION_NA: string }; geometry: { coordinates: [number, number] } }[];
  };
  const stations = JSON.parse(mrtRows.find((row) => row.kind === "stations")!.json as string);
  const retainedMrtExits = exits.features.map((feature) => ({
    stationName: feature.properties.STATION_NA,
    lat: feature.geometry.coordinates[1],
    lng: feature.geometry.coordinates[0],
  }));
  const walkingTimes = new Map<string, number>();
  // Fresh-context mode uses the actual empty retained routing cache and existing straight-line fallback.
  if (!input.capturedContext)
    for (const block of old.blockSummaries)
      for (const mrt of block.nearbyMrts ?? [])
        walkingTimes.set(
          walkingTimeLookupKey(block.addressKey, mrt.stationName),
          mrt.walkingTimeSeconds,
        );
  else if (Number(local.prepare("SELECT count(*) AS n FROM walking_time_cache").get()!.n) !== 0)
    throw new Error("Captured-context forecast requires a verified empty retained routing cache");
  const schools = new Map<string, SchoolLocation>();
  for (const comparison of Object.values(old.comparisons ?? {}))
    for (const school of comparison.amenities.nearestPrimarySchools ?? []) {
      if (!school.coordinates) continue;
      schools.set(JSON.stringify([school.name, school.coordinates]), {
        name: school.name,
        ...school.coordinates,
        mainLevelCode: "PRIMARY",
      });
    }
  if (!schools.size)
    throw new Error("No retained school observations; cannot construct comparison scenario");
  const propertyInfo = Object.entries(old.details).map(([addressKey, detail]) => ({
    addressKey,
    block: detail.summary.block,
    streetName: detail.summary.streetName,
    maxFloorLevel:
      Number(
        detail.summary.flatModels.find((model) => model.startsWith("MAX FLOOR "))?.slice(10),
      ) || null,
    yearCompleted: null,
    totalDwellingUnits: null,
  }));
  const context = input.capturedContext;
  const candidate = canonicalNeonArtifacts(
    buildArtifacts({
      transactions: effective,
      propertyInfo: context ? rekeyPropertyInfo(context.propertyInfo, effective) : propertyInfo,
      mrtExits: context?.mrtExits ?? retainedMrtExits,
      geocodes,
      walkingTimes,
      schools: context?.schools ?? [...schools.values()],
      hawkers: context?.hawkers,
      supermarkets: context?.supermarkets,
      parks: context?.parks,
      metadata: context?.metadata ?? manifest.sources,
      sourceVersionHints: context?.sourceVersionHints,
      incremental: { previous: old, delta: reconciliation.delta },
    }),
  );
  // Hold old static amenities fixed explicitly; rehydrated nearest schools are not a new official inventory.
  if (!context)
    for (const [key, comparison] of Object.entries(candidate.comparisons ?? {}))
      if (old.comparisons?.[key]) comparison.amenities = old.comparisons[key].amenities;
  const identity = (row: {
    month: string;
    flatType: string;
    storeyRange: string;
    floorAreaSqm: number;
    leaseCommenceDate: number;
    resalePrice: number;
    flatModel: string;
  }) =>
    JSON.stringify([
      row.month,
      row.flatType,
      row.storeyRange,
      row.floorAreaSqm,
      row.leaseCommenceDate,
      row.resalePrice,
      row.flatModel,
    ]);
  for (const [key, detail] of Object.entries(candidate.details)) {
    const presentations = new Map<string, typeof detail.recentTransactions>();
    for (const row of old.details[key]?.recentTransactions ?? []) {
      const list = presentations.get(identity(row)) ?? [];
      list.push(row);
      presentations.set(identity(row), list);
    }
    for (const row of detail.recentTransactions)
      if (row.month < "2017-01") {
        const prior = presentations.get(identity(row))?.shift();
        if (prior) row.remainingLease = prior.remainingLease;
      }
  }
  (candidate.manifest as NeonManifest).neonReconciliation = reconciliation.state;
  const plan = await planArtifactWrites(
    store,
    candidate,
    context?.exitsGeoJson ?? (JSON.parse(canonicalJson(exits)) as typeof exits),
    context?.stationsGeoJson ?? (JSON.parse(canonicalJson(stations)) as typeof stations),
    "2026-10-04T10:10:00.000Z",
    reconciliation.delta,
    { enforceBudget: false },
  );
  let guardPass = true;
  try {
    validateNeonPublicationPlan(plan, candidate.manifest);
  } catch {
    guardPass = false;
  }
  const missingGeocodes = [
    ...new Set(effective.filter((row) => !geocodes[row.addressKey]).map((row) => row.addressKey)),
  ].sort();
  const missingGeocodesInNewFacts = [
    ...new Set(
      reconciliation.delta.inserts
        .filter((row) => !geocodes[row.address_key])
        .map((row) => row.address_key),
    ),
  ].sort();
  const unknownNewAmenities = Object.keys(candidate.comparisons ?? {}).filter(
    (key) => !old.comparisons?.[key],
  );
  input.onPreparedArtifacts?.({
    artifacts: candidate,
    effectiveSourceAddressKeys: [...new Set(effective.map((row) => row.addressKey))].sort(),
    baselineSourceAddressKeys: [...new Set(previous.map((row) => row.address_key))].sort(),
    missingGeocodeAddresses: missingGeocodes,
  });
  const mutationRows = Object.entries(plan.changedRows).reduce((sum, [, n]) => sum + n, 0) + 1;
  return {
    scenario: context
      ? "Exact captured current-context / supported cache-only local publication candidate; historical raw sources retained"
      : "Complete retained-context local publication plan; not executable fresh-source publication",
    scope: context
      ? "Pinned active CSV unchanged; retained historical transaction facts; six captured official context files; existing geocodes only; no OneMap or DB calls"
      : "Real local transaction reconstruction, current retained active CSV, retained MRT/geocodes/property presentation/amenities. Historical raw CSVs and current context not reacquired.",
    logicalMutations: mutationRows,
    changedRows: { ...plan.changedRows, manifest: 1 },
    forecastWriteUpperBound: plan.forecastWriteUpperBound,
    guardLimit: MAX_FORECAST_WRITES,
    guardPass,
    guardChecks: {
      writes: { actual: plan.forecastWriteUpperBound, limit: MAX_FORECAST_WRITES },
      statements: { actual: plan.statements.length + 2, limit: MAX_ATOMIC_STATEMENTS },
      encodedBytes: {
        actual: Buffer.byteLength(
          JSON.stringify({ statements: plan.statements, manifest: candidate.manifest }),
        ),
        limit: MAX_ATOMIC_BYTES,
      },
    },
    statements: plan.statements.length + 2,
    encodedPlanAndManifestBytes: Buffer.byteLength(
      JSON.stringify({ statements: plan.statements, manifest: candidate.manifest }),
    ),
    localWallMs: performance.now() - started,
    computation: candidate.computation,
    baselineSyncBuildStatePresent: !!manifest.syncBuildState,
    contextInvalidationReason: !manifest.syncBuildState
      ? "No retained baseline syncBuildState/context digest; initial incremental bootstrap requires complete derived rebuild even with identical context"
      : "Candidate context digest compared to retained syncBuildState",
    ledgerAndCheckpointBytes: Buffer.byteLength(JSON.stringify(reconciliation.state)),
    missingGeocodeAddresses: missingGeocodes,
    missingGeocodeAddressesInNewFacts: missingGeocodesInNewFacts,
    unknownNewComparisonAmenities: unknownNewAmenities,
    retainedSchools: schools.size,
    capturedNormalizedContextComplete: context?.capturedNormalizedContextComplete ?? false,
    missingAmenityCacheKeys: context?.missingAmenityCacheKeys ?? [],
    declaredIndexInventory: declaredIndexes(),
    mutationBreakdown: publicationBreakdown(
      plan.statements,
      declaredIndexes(),
      plan.forecastWriteUpperBound,
    ),
    stagedGeocodeWrites: 0,
    stagedRoutingWrites: 0,
    currentOfficialRawContextVerified: !!context,
    currentOfficialContextVerified: context?.capturedNormalizedContextComplete ?? false,
    actualFreshContextForecast: null,
    remoteRetryPermitted: false,
    limitations: context
      ? [
          "All six current raw context bodies have verified capture hashes and stable before/after metadata; they are newly captured, not proven byte-identical original August/failed-run inputs.",
          "Historical transaction bodies were not recaptured. Pinning the saved active CSV does not invent historical source verification.",
          "Supported skip-geocoding semantics reuse persistent coordinates, omit unlocated blocks/details/comparisons and skip unresolved amenities. No new geocode outcomes are required for this cache-only snapshot.",
          "Empty routing cache uses the existing straight-line fallback with no staged routing writes; authenticated routing cost is not invented.",
          "No baseline syncBuildState exists. Bootstrap invalidation is independent of reconstruction effects; no guard is changed.",
        ]
      : [
          "This scenario does not reacquire official property/MRT/amenity context or geocode new addresses; actual complete fresh-context forecast remains UNKNOWN and blocked.",
          "Retained static amenities are explicitly reused. Context digest in this counterfactual candidate must never be published.",
          "The recovered property/school input inventory differs from the original unavailable inputs; contextChanged includes reconstruction effects and is not proof that current upstream context changed.",
          "Manifest-last ledger/checkpoint is included in the existing write/body/statement guards. No limits are changed.",
        ],
  };
}
