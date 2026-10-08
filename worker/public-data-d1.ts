/**
 * Public reads from D1: the default backend and the rollback target (docs/architecture/public-read-backend.md).
 * The statements are the ones the public routes issued before the read boundary existed.
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
import {
  SEARCH_RESULT_LIMIT,
  buildSearchQuery,
  type SearchRequest,
} from "../functions/_lib/search";

const BLOCK_ORDER = "ORDER BY median_price DESC, transaction_count DESC";
/** D1 answers at most this many rows per query here, so the sitemap index is read in pages. */
const BLOCK_INDEX_PAGE_SIZE = 10_000;

/** The error D1 raises while `blocks` predates the flat-type cohort column. */
function isMissingCohortColumnError(error: unknown): boolean {
  return error instanceof Error && /no such column:.*flat_type_cohorts_json/i.test(error.message);
}

function transactionFilter(scope: TransactionScope): { where: string; params: string[] } {
  switch (scope.kind) {
    case "block":
      return {
        where: "town = ?1 AND block = ?2 AND flat_type = ?3",
        params: [scope.town, scope.block, scope.flatType],
      };
    case "street":
      return {
        where: "street_name = ?1 AND flat_type = ?2",
        params: [scope.streetName, scope.flatType],
      };
    case "town":
      return { where: "town = ?1 AND flat_type = ?2", params: [scope.town, scope.flatType] };
  }
}

export function createD1PublicData(db: D1Database): PublicData {
  const json = async (statement: D1PreparedStatement) =>
    (await statement.first<{ json: string }>())?.json ?? null;
  const rows = async <Row>(statement: D1PreparedStatement) =>
    (await statement.all<Row>()).results ?? [];
  const nameMatch =
    <Row>(prefixSql: string, substringSql: string) =>
    ({ query, position }: NameMatch) => {
      const { prefix, contains } = likePatterns(query);
      return rows<Row>(
        position === "prefix"
          ? db.prepare(prefixSql).bind(prefix)
          : db.prepare(substringSql).bind(contains, prefix),
      );
    };
  const search = (request: SearchRequest, cohorts: boolean) => {
    const { whereSql, bindings } = buildSearchQuery(request, undefined, cohorts);
    return rows<BlockRow>(
      db
        .prepare(`SELECT blocks.* FROM blocks ${whereSql} ORDER BY address_key LIMIT ?`)
        .bind(...bindings, SEARCH_RESULT_LIMIT + 1),
    );
  };

  return {
    manifestJson: () => json(db.prepare("SELECT json FROM manifest WHERE id = 1")),
    allBlocks: () => rows<BlockRow>(db.prepare(`SELECT * FROM blocks ${BLOCK_ORDER}`)),
    townBlocks: (town) =>
      rows<BlockRow>(
        db.prepare(`SELECT blocks.* FROM blocks WHERE town = ? ${BLOCK_ORDER}`).bind(town),
      ),
    block: (addressKey) =>
      db.prepare("SELECT * FROM blocks WHERE address_key = ?").bind(addressKey).first<BlockRow>(),
    blockIndex: async () => {
      const index: { address_key: string; town: string }[] = [];
      for (let offset = 0; ; offset += BLOCK_INDEX_PAGE_SIZE) {
        const page = await rows<{ address_key: string; town: string }>(
          db
            .prepare("SELECT address_key, town FROM blocks LIMIT ?1 OFFSET ?2")
            .bind(BLOCK_INDEX_PAGE_SIZE, offset),
        );
        index.push(...page);
        if (page.length < BLOCK_INDEX_PAGE_SIZE) return index;
      }
    },
    townBlockPrices: (townA, townB) =>
      rows<TownBlockPriceRow>(
        db
          .prepare("SELECT town, median_price, transaction_count FROM blocks WHERE town IN (?, ?)")
          .bind(townA, townB),
      ),
    blockDetailJson: (addressKey) =>
      json(db.prepare("SELECT json FROM block_details WHERE address_key = ?").bind(addressKey)),
    blockComparisonJson: (addressKey) =>
      json(db.prepare("SELECT json FROM comparisons WHERE address_key = ?").bind(addressKey)),
    mrtGeoJson: (kind) =>
      json(db.prepare("SELECT json FROM mrt_geojson WHERE kind = ?").bind(kind)),
    townFlatTypeTrends: () =>
      rows<TownFlatTypeTrendRow>(
        db.prepare(
          "SELECT town, flat_type, month, median_price, median_price_per_sqm, transaction_count FROM town_flat_type_trends ORDER BY town, flat_type, month",
        ),
      ),
    flatTypeCohortsComplete: async () => {
      try {
        const [counts] = await rows<{ total_count?: number; populated_count?: number }>(
          db
            .prepare(
              "SELECT COUNT(*) AS total_count, COUNT(NULLIF(TRIM(flat_type_cohorts_json), '')) AS populated_count FROM blocks",
            )
            .bind(),
        );
        return (
          typeof counts?.total_count === "number" &&
          counts.total_count > 0 &&
          counts.populated_count === counts.total_count
        );
      } catch (error) {
        if (isMissingCohortColumnError(error)) return false;
        throw error;
      }
    },
    searchBlocks: async (request, useFlatTypeCohorts) => {
      try {
        return {
          rows: await search(request, useFlatTypeCohorts),
          usedFlatTypeCohorts: useFlatTypeCohorts,
        };
      } catch (error) {
        // The column went away between the caller's check and this query: answer without the cohorts, which
        // the result reports, instead of failing.
        if (!useFlatTypeCohorts || !isMissingCohortColumnError(error)) throw error;
        return { rows: await search(request, false), usedFlatTypeCohorts: false };
      }
    },
    // No ORDER BY in the four name matches: SQLite walks the matching NOCASE index (towns, streets, postal
    // codes), which for these upper-case values is byte order, or the table itself (blocks), which the
    // pipeline writes in the `allBlocks` order.
    townsMatching: nameMatch<{ town: string }>(
      "SELECT DISTINCT town FROM blocks WHERE town LIKE ? ESCAPE '\\' LIMIT 20",
      "SELECT DISTINCT town FROM blocks WHERE town LIKE ? ESCAPE '\\' AND town NOT LIKE ? ESCAPE '\\' LIMIT 20",
    ),
    streetsMatching: nameMatch<{ street_name: string }>(
      "SELECT DISTINCT street_name FROM blocks WHERE street_name LIKE ? ESCAPE '\\' LIMIT 20",
      "SELECT DISTINCT street_name FROM blocks WHERE street_name LIKE ? ESCAPE '\\' AND street_name NOT LIKE ? ESCAPE '\\' LIMIT 20",
    ),
    blocksMatching: nameMatch<{ address_key: string; block: string; street_name: string }>(
      "SELECT address_key, block, street_name FROM blocks WHERE (block || ' ' || street_name) COLLATE NOCASE LIKE ? ESCAPE '\\' LIMIT 20",
      "SELECT address_key, block, street_name FROM blocks WHERE (block || ' ' || street_name) COLLATE NOCASE LIKE ? ESCAPE '\\' AND (block || ' ' || street_name) COLLATE NOCASE NOT LIKE ? ESCAPE '\\' LIMIT 20",
    ),
    postalCodesStartingWith: (query) =>
      rows<{ postal_code: string }>(
        db
          .prepare(
            "SELECT DISTINCT postal_code FROM blocks WHERE postal_code IS NOT NULL AND postal_code LIKE ? ESCAPE '\\' LIMIT 20",
          )
          .bind(likePatterns(query).prefix),
      ),
    countTransactions: async (scope) => {
      const { where, params } = transactionFilter(scope);
      const result = await db
        .prepare(`SELECT COUNT(*) AS cnt FROM transactions WHERE ${where}`)
        .bind(...params)
        .first<{ cnt: number }>();
      return result?.cnt ?? 0;
    },
    recentTransactions: (scope) => {
      const { where, params } = transactionFilter(scope);
      return rows<TransactionRecord>(
        db
          .prepare(
            `SELECT * FROM transactions WHERE ${where} ORDER BY month DESC LIMIT ${RECENT_TRANSACTIONS_LIMIT}`,
          )
          .bind(...params),
      );
    },
    trendHistory: async (pairs) => {
      if (pairs.length === 0) return [];
      const placeholders = pairs.map((_, i) => `(?${i * 2 + 1},?${i * 2 + 2})`).join(", ");
      return rows<TrendHistoryRow>(
        db
          .prepare(
            `SELECT town, flat_type, month, median_price_per_sqm, transaction_count FROM town_flat_type_trends WHERE (town, flat_type) IN (${placeholders})`,
          )
          .bind(...pairs.flatMap((pair) => [pair.town, pair.flatType])),
      );
    },
  };
}
