/**
 * Public reads from Neon PostgreSQL, through the request's Hyperdrive transport (`worker/neon-transport.ts`).
 *
 * Every statement is a fixed, parameterized SELECT on the public tables, written so that each operation
 * returns what D1 returns for it (`tests/unit/public-data-parity.test.ts`): JSONB columns come back as text,
 * counts as integers, D1's implicit orders are spelled out, and SQLite's comparison rules are reproduced
 * where a predicate depends on them. Request values only ever travel as bound parameters, and the database
 * role is read-only.
 */
import {
  RECENT_TRANSACTIONS_LIMIT,
  likePatterns,
  type BlockRow,
  type NameMatch,
  type PublicData,
  type TownBlockPriceRow,
  type TownFlatTypeTrendRow,
  type TransactionRecord,
  type TransactionScope,
  type TrendHistoryRow,
} from "../functions/_lib/public-data";
import { SEARCH_RESULT_LIMIT, type SearchRequest } from "../functions/_lib/search";
import { workerCurrentUtcYear } from "../functions/_lib/worker-time";
import { canonicalFlatType } from "../shared/filter-options";
import { requiresFlatTypeCohortMetadata } from "../shared/product/flat-type-cohort";
import { MAX_LEASE_DURATION_YEARS } from "../shared/search-bounds";
import { queryNearbyPlaces } from "./nearby-spatial-query";

export type PublicReadRow = Record<string, unknown>;
export type PublicReadQuery = (sql: string, params: readonly unknown[]) => Promise<PublicReadRow[]>;

const BLOCK_SCALARS = [
  "address_key",
  "town",
  "block",
  "street_name",
  "display_name",
  "lat",
  "lng",
  "median_price",
  "price_per_sqm_median",
  "transaction_count",
  "floor_area_min",
  "floor_area_max",
  "lease_commence_year",
  "latest_month",
  "available_min_month",
  "available_max_month",
  "postal_code",
] as const;
const BLOCK_JSON = [
  "flat_types_json",
  "flat_models_json",
  "median_price_by_flat_type_json",
  "median_price_per_sqm_by_flat_type_json",
  "flat_type_cohorts_json",
  "nearest_mrt_json",
  "nearby_mrts_json",
] as const;
/** Every `blocks` column, the JSONB ones as text, so that a row matches D1's `SELECT *`. */
const BLOCK_COLUMNS = [
  ...BLOCK_SCALARS.map((name) => `blocks.${name}`),
  ...BLOCK_JSON.map((name) => `blocks.${name}::text AS ${name}`),
].join(", ");
const BLOCK_ORDER = "ORDER BY median_price DESC, transaction_count DESC";
const TRANSACTION_COLUMNS =
  "id, month, town, block, street_name, address_key, flat_type, storey_range, floor_area_sqm, lease_commence_year, resale_price, flat_model";
/** D1 compares text byte by byte; PostgreSQL would otherwise use the database locale. */
const BYTE_ORDER = 'COLLATE "C"';
const TREND_ORDER = `ORDER BY town ${BYTE_ORDER}, flat_type ${BYTE_ORDER}, month ${BYTE_ORDER}`;
/**
 * The name matches ask for "the first 20", and D1 answers in the order SQLite walks: the town, street or
 * postal code index (byte order for these upper-case values), or for blocks the table itself, which the
 * pipeline writes as median_price DESC, transaction_count DESC. PostgreSQL has no implicit order, so it is
 * spelled out, with the address key breaking ties among blocks. SQLite's LIKE ignores ASCII case, hence ILIKE.
 */
const BLOCKS_IN_PIPELINE_ORDER = `${BLOCK_ORDER}, address_key ${BYTE_ORDER}`;
const BLOCK_LABEL = "(block || ' ' || street_name)";

const ASCII_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ASCII_LOWER = "abcdefghijklmnopqrstuvwxyz";
/** SQLite's NOCASE folds ASCII letters only. */
const asciiFold = (expression: string) =>
  `translate(${expression}, '${ASCII_UPPER}', '${ASCII_LOWER}')`;
/** `json_each(array).value = value COLLATE NOCASE`, on a JSONB array. */
const hasMember = (array: string, value: string) =>
  `EXISTS (SELECT 1 FROM jsonb_array_elements_text(${array}) AS member(value) WHERE ${asciiFold("member.value")} = ${asciiFold(value)})`;

/** The PostgreSQL form of `buildSearchQuery` (functions/_lib/search.ts): the same predicates, in the same order. */
function searchStatement(request: SearchRequest, useFlatTypeCohorts: boolean) {
  const params: unknown[] = [];
  const param = (value: unknown) => `$${params.push(value)}`;
  const where: string[] = [];
  if (!useFlatTypeCohorts && requiresFlatTypeCohortMetadata(request)) {
    where.push("0 = 1");
  } else {
    // The selected flat type's key in `flat_type_cohorts_json`, when its cohort answers the refinements.
    let cohort: string | null = null;
    const cohortField = (...path: string[]) =>
      `blocks.flat_type_cohorts_json #>> ${param([cohort, ...path])}::text[]`;
    if (request.town) where.push(`town = ${param(request.town)}`);
    if (request.flatType) {
      const flatType = canonicalFlatType(request.flatType);
      where.push(hasMember("blocks.flat_types_json", param(flatType)));
      cohort = useFlatTypeCohorts ? flatType : null;
      // SQLite's CAST(… AS INTEGER) truncates, where a PostgreSQL integer cast would round.
      const price = () =>
        `COALESCE(trunc((blocks.median_price_by_flat_type_json ->> ${param(flatType)})::double precision), blocks.median_price)`;
      if (request.budgetMin !== null) where.push(`${price()} >= ${param(request.budgetMin)}`);
      if (request.budgetMax !== null) where.push(`${price()} <= ${param(request.budgetMax)}`);
    } else {
      if (request.budgetMin !== null) where.push(`median_price >= ${param(request.budgetMin)}`);
      if (request.budgetMax !== null) where.push(`median_price <= ${param(request.budgetMax)}`);
    }
    if (request.flatModel)
      where.push(
        cohort
          ? hasMember(
              `blocks.flat_type_cohorts_json #> ${param([cohort, "flatModels"])}::text[]`,
              param(request.flatModel),
            )
          : hasMember("blocks.flat_models_json", param(request.flatModel)),
      );
    if (request.areaMin !== null)
      where.push(
        cohort
          ? `(${cohortField("floorAreaRange", "1")})::double precision >= ${param(request.areaMin)}`
          : `floor_area_max >= ${param(request.areaMin)}`,
      );
    if (request.areaMax !== null)
      where.push(
        cohort
          ? `(${cohortField("floorAreaRange", "0")})::double precision <= ${param(request.areaMax)}`
          : `floor_area_min <= ${param(request.areaMax)}`,
      );
    if (request.mrtMax !== null) {
      where.push("nearest_mrt_json IS NOT NULL");
      where.push(
        `(nearest_mrt_json ->> 'distanceMeters')::double precision <= ${param(request.mrtMax)}`,
      );
    }
    if (request.remainingLeaseMin !== null)
      where.push(
        `(${param(workerCurrentUtcYear())}::integer - lease_commence_year) <= ${param(MAX_LEASE_DURATION_YEARS - request.remainingLeaseMin)}::double precision`,
      );
    if (request.startMonth)
      where.push(
        cohort
          ? `(${cohortField("latestMonth")}) >= ${param(request.startMonth)}`
          : `latest_month >= ${param(request.startMonth)}`,
      );
    if (request.endMonth)
      where.push(
        cohort
          ? `(${cohortField("latestMonth")}) <= ${param(request.endMonth)}`
          : `latest_month <= ${param(request.endMonth)}`,
      );
  }
  const filter = where.length > 0 ? `WHERE ${where.join(" AND ")} ` : "";
  return {
    sql: `SELECT ${BLOCK_COLUMNS} FROM public.blocks AS blocks ${filter}ORDER BY address_key ${BYTE_ORDER} LIMIT ${param(SEARCH_RESULT_LIMIT + 1)}`,
    params,
  };
}

function transactionFilter(scope: TransactionScope): { where: string; params: string[] } {
  switch (scope.kind) {
    case "block":
      return {
        where: "town = $1 AND block = $2 AND flat_type = $3",
        params: [scope.town, scope.block, scope.flatType],
      };
    case "street":
      return {
        where: "street_name = $1 AND flat_type = $2",
        params: [scope.streetName, scope.flatType],
      };
    case "town":
      return { where: "town = $1 AND flat_type = $2", params: [scope.town, scope.flatType] };
  }
}

export function createNeonPublicData(query: PublicReadQuery): PublicData {
  const rows = async <Row>(sql: string, params: readonly unknown[] = []) =>
    (await query(sql, params)) as Row[];
  const json = async (sql: string, params: readonly unknown[] = []) =>
    (await rows<{ json: string }>(sql, params))[0]?.json ?? null;
  const nameMatch =
    <Row>(prefixSql: string, substringSql: string) =>
    ({ query: text, position }: NameMatch) => {
      const { prefix, contains } = likePatterns(text);
      return position === "prefix"
        ? rows<Row>(prefixSql, [prefix])
        : rows<Row>(substringSql, [contains, prefix]);
    };

  return {
    manifestJson: () => json("SELECT json::text AS json FROM public.manifest WHERE id = 1"),
    allBlocks: () =>
      rows<BlockRow>(`SELECT ${BLOCK_COLUMNS} FROM public.blocks AS blocks ${BLOCK_ORDER}`),
    townBlocks: (town) =>
      rows<BlockRow>(
        `SELECT ${BLOCK_COLUMNS} FROM public.blocks AS blocks WHERE town = $1 ${BLOCK_ORDER}`,
        [town],
      ),
    block: async (addressKey) =>
      (
        await rows<BlockRow>(
          `SELECT ${BLOCK_COLUMNS} FROM public.blocks AS blocks WHERE address_key = $1`,
          [addressKey],
        )
      )[0] ?? null,
    // One query: unlike D1, PostgreSQL has no per-query row cap to page around.
    blockIndex: () =>
      rows<{ address_key: string; town: string }>(
        `SELECT address_key, town FROM public.blocks ORDER BY address_key ${BYTE_ORDER}`,
      ),
    townBlockPrices: (townA, townB) =>
      rows<TownBlockPriceRow>(
        "SELECT town, median_price, transaction_count FROM public.blocks WHERE town IN ($1, $2)",
        [townA, townB],
      ),
    blockDetailJson: (addressKey) =>
      json("SELECT json::text AS json FROM public.block_details WHERE address_key = $1", [
        addressKey,
      ]),
    blockComparisonJson: (addressKey) =>
      json("SELECT json::text AS json FROM public.comparisons WHERE address_key = $1", [
        addressKey,
      ]),
    mrtGeoJson: (kind) =>
      json("SELECT json::text AS json FROM public.mrt_geojson WHERE kind = $1", [kind]),
    nearbyPlaces: (request) => queryNearbyPlaces(query, request),
    townFlatTypeTrends: () =>
      rows<TownFlatTypeTrendRow>(
        `SELECT town, flat_type, month, median_price, median_price_per_sqm, transaction_count FROM public.town_flat_type_trends ${TREND_ORDER}`,
      ),
    flatTypeCohortsComplete: async () => {
      // JSONB cannot hold an empty JSON text, so SQL NULL is the only state that is not backfilled.
      const [counts] = await rows<{ total_count?: number; populated_count?: number }>(
        "SELECT COUNT(*)::integer AS total_count, COUNT(flat_type_cohorts_json)::integer AS populated_count FROM public.blocks",
      );
      return (
        typeof counts?.total_count === "number" &&
        counts.total_count > 0 &&
        counts.populated_count === counts.total_count
      );
    },
    searchBlocks: async (request, useFlatTypeCohorts) => {
      const { sql, params } = searchStatement(request, useFlatTypeCohorts);
      return { rows: await rows<BlockRow>(sql, params), usedFlatTypeCohorts: useFlatTypeCohorts };
    },
    townsMatching: nameMatch<{ town: string }>(
      `SELECT town FROM public.blocks WHERE town ILIKE $1 ESCAPE '\\' GROUP BY town ORDER BY town ${BYTE_ORDER} LIMIT 20`,
      `SELECT town FROM public.blocks WHERE town ILIKE $1 ESCAPE '\\' AND town NOT ILIKE $2 ESCAPE '\\' GROUP BY town ORDER BY town ${BYTE_ORDER} LIMIT 20`,
    ),
    streetsMatching: nameMatch<{ street_name: string }>(
      `SELECT street_name FROM public.blocks WHERE street_name ILIKE $1 ESCAPE '\\' GROUP BY street_name ORDER BY street_name ${BYTE_ORDER} LIMIT 20`,
      `SELECT street_name FROM public.blocks WHERE street_name ILIKE $1 ESCAPE '\\' AND street_name NOT ILIKE $2 ESCAPE '\\' GROUP BY street_name ORDER BY street_name ${BYTE_ORDER} LIMIT 20`,
    ),
    blocksMatching: nameMatch<{ address_key: string; block: string; street_name: string }>(
      `SELECT address_key, block, street_name FROM public.blocks WHERE ${BLOCK_LABEL} ILIKE $1 ESCAPE '\\' ${BLOCKS_IN_PIPELINE_ORDER} LIMIT 20`,
      `SELECT address_key, block, street_name FROM public.blocks WHERE ${BLOCK_LABEL} ILIKE $1 ESCAPE '\\' AND ${BLOCK_LABEL} NOT ILIKE $2 ESCAPE '\\' ${BLOCKS_IN_PIPELINE_ORDER} LIMIT 20`,
    ),
    postalCodesStartingWith: (text) =>
      rows<{ postal_code: string }>(
        `SELECT postal_code FROM public.blocks WHERE postal_code IS NOT NULL AND postal_code ILIKE $1 ESCAPE '\\' GROUP BY postal_code ORDER BY postal_code ${BYTE_ORDER} LIMIT 20`,
        [likePatterns(text).prefix],
      ),
    countTransactions: async (scope) => {
      const { where, params } = transactionFilter(scope);
      const [result] = await rows<{ cnt: number }>(
        `SELECT COUNT(*)::integer AS cnt FROM public.transactions WHERE ${where}`,
        params,
      );
      return result?.cnt ?? 0;
    },
    recentTransactions: (scope) => {
      const { where, params } = transactionFilter(scope);
      // SQLite's month-DESC indexes visit equal months in rowid order: keep that order, legitimate duplicate
      // source rows included.
      return rows<TransactionRecord>(
        `SELECT ${TRANSACTION_COLUMNS} FROM public.transactions WHERE ${where} ORDER BY month DESC, id ASC LIMIT ${RECENT_TRANSACTIONS_LIMIT}`,
        params,
      );
    },
    trendHistory: async (pairs) => {
      if (pairs.length === 0) return [];
      const placeholders = pairs.map((_, i) => `($${i * 2 + 1},$${i * 2 + 2})`).join(", ");
      // The time adjustment needs each pair's whole history.
      return rows<TrendHistoryRow>(
        `SELECT town, flat_type, month, median_price_per_sqm, transaction_count FROM public.town_flat_type_trends WHERE (town, flat_type) IN (${placeholders}) ${TREND_ORDER}`,
        pairs.flatMap((pair) => [pair.town, pair.flatType]),
      );
    },
  };
}
