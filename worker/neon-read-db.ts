/** Runtime extension of the frozen public GET compiler; only known handler SELECTs. */
import { MAX_COMPARABLES } from "../shared/comparable-engine";
import {
  compilePublicRead,
  type PublicReadQuery,
  type PublicReadRow,
} from "./neon-public-read-sql";

const SCOPES = [
  "town = ?1 AND block = ?2 AND flat_type = ?3",
  "street_name = ?1 AND flat_type = ?2",
  "town = ?1 AND flat_type = ?2",
] as const;
/**
 * `/api/suggest` (functions/_lib/suggest.ts) asks for "the first 20 matches" with no ORDER BY, so each
 * answer depends on how SQLite happens to walk the table. Production D1 walks, in effect:
 *   - towns, streets, postal codes: their NOCASE/BINARY index, ascending. Source values are upper case,
 *     so that is plain byte order;
 *   - blocks: the table itself, which the pipeline inserts as median_price DESC, transaction_count DESC.
 * PostgreSQL has no implicit order, so it is spelled out here and address_key breaks ties among blocks
 * with equal (median_price, transaction_count). SQLite's LIKE is ASCII case-insensitive, hence ILIKE.
 * This keeps suggest results identical to the legacy implementation (see docs/architecture/public-read-backend.md).
 */
const BYTE_ORDER = 'COLLATE "C"';
const BLOCKS_IN_PIPELINE_ORDER = `ORDER BY median_price DESC, transaction_count DESC, address_key ${BYTE_ORDER}`;
const BLOCK_LABEL = "(block || ' ' || street_name)";
const LEGACY_SUGGEST = new Map<string, { bindings: number; native: string }>([
  [
    "SELECT DISTINCT town FROM blocks WHERE town LIKE ? ESCAPE '\\' LIMIT 20",
    {
      bindings: 1,
      native: `SELECT town FROM public.blocks WHERE town ILIKE $1 ESCAPE '\\' GROUP BY town ORDER BY town ${BYTE_ORDER} LIMIT 20`,
    },
  ],
  [
    "SELECT DISTINCT town FROM blocks WHERE town LIKE ? ESCAPE '\\' AND town NOT LIKE ? ESCAPE '\\' LIMIT 20",
    {
      bindings: 2,
      native: `SELECT town FROM public.blocks WHERE town ILIKE $1 ESCAPE '\\' AND town NOT ILIKE $2 ESCAPE '\\' GROUP BY town ORDER BY town ${BYTE_ORDER} LIMIT 20`,
    },
  ],
  [
    "SELECT DISTINCT street_name FROM blocks WHERE street_name LIKE ? ESCAPE '\\' LIMIT 20",
    {
      bindings: 1,
      native: `SELECT street_name FROM public.blocks WHERE street_name ILIKE $1 ESCAPE '\\' GROUP BY street_name ORDER BY street_name ${BYTE_ORDER} LIMIT 20`,
    },
  ],
  [
    "SELECT DISTINCT street_name FROM blocks WHERE street_name LIKE ? ESCAPE '\\' AND street_name NOT LIKE ? ESCAPE '\\' LIMIT 20",
    {
      bindings: 2,
      native: `SELECT street_name FROM public.blocks WHERE street_name ILIKE $1 ESCAPE '\\' AND street_name NOT ILIKE $2 ESCAPE '\\' GROUP BY street_name ORDER BY street_name ${BYTE_ORDER} LIMIT 20`,
    },
  ],
  [
    "SELECT address_key, block, street_name FROM blocks WHERE (block || ' ' || street_name) COLLATE NOCASE LIKE ? ESCAPE '\\' LIMIT 20",
    {
      bindings: 1,
      native: `SELECT address_key, block, street_name FROM public.blocks WHERE ${BLOCK_LABEL} ILIKE $1 ESCAPE '\\' ${BLOCKS_IN_PIPELINE_ORDER} LIMIT 20`,
    },
  ],
  [
    "SELECT address_key, block, street_name FROM blocks WHERE (block || ' ' || street_name) COLLATE NOCASE LIKE ? ESCAPE '\\' AND (block || ' ' || street_name) COLLATE NOCASE NOT LIKE ? ESCAPE '\\' LIMIT 20",
    {
      bindings: 2,
      native: `SELECT address_key, block, street_name FROM public.blocks WHERE ${BLOCK_LABEL} ILIKE $1 ESCAPE '\\' AND ${BLOCK_LABEL} NOT ILIKE $2 ESCAPE '\\' ${BLOCKS_IN_PIPELINE_ORDER} LIMIT 20`,
    },
  ],
  [
    "SELECT DISTINCT postal_code FROM blocks WHERE postal_code IS NOT NULL AND postal_code LIKE ? ESCAPE '\\' LIMIT 20",
    {
      bindings: 1,
      native: `SELECT postal_code FROM public.blocks WHERE postal_code IS NOT NULL AND postal_code ILIKE $1 ESCAPE '\\' GROUP BY postal_code ORDER BY postal_code ${BYTE_ORDER} LIMIT 20`,
    },
  ],
]);
const TRANSACTION_COLUMNS =
  "id, month, town, block, street_name, address_key, flat_type, storey_range, floor_area_sqm, lease_commence_year, resale_price, flat_model";

export function compileRuntimeRead(sql: string, bindings: readonly unknown[] = []) {
  const source = sql.trim().replace(/\s+/g, " ");
  const exact = (nativeSql: string, count: number) => {
    if (bindings.length !== count) throw new Error("Unexpected runtime-read binding count");
    return { sql: nativeSql, params: [...bindings] };
  };
  for (const scope of SCOPES) {
    const count = scope.includes("block =") ? 3 : 2;
    const nativeScope = scope.replace(/\?(\d+)/g, "$$$1");
    if (source === `SELECT COUNT(*) AS cnt FROM transactions WHERE ${scope}`)
      return exact(
        `SELECT COUNT(*)::integer AS cnt FROM public.transactions WHERE ${nativeScope}`,
        count,
      );
    if (source === `SELECT * FROM transactions WHERE ${scope} ORDER BY month DESC LIMIT 150`)
      // SQLite's matching month-DESC indexes visit equal months in integer rowid order.
      // Keep that deterministic order, including legitimate duplicate source occurrences.
      return exact(
        `SELECT ${TRANSACTION_COLUMNS} FROM public.transactions WHERE ${nativeScope} ORDER BY month DESC, id ASC LIMIT 150`,
        count,
      );
  }
  const trendPrefix =
    "SELECT town, flat_type, month, median_price_per_sqm, transaction_count FROM town_flat_type_trends WHERE (town, flat_type) IN ";
  if (source.startsWith(trendPrefix)) {
    const pairs = bindings.length / 2;
    if (!Number.isInteger(pairs) || pairs < 1 || pairs > MAX_COMPARABLES)
      throw new Error("Unexpected comparable trend pair count");
    const expected = Array.from({ length: pairs }, (_, i) => `(?${i * 2 + 1},?${i * 2 + 2})`);
    if (source !== `${trendPrefix}(${expected.join(", ")})`)
      throw new Error("SQL outside the comparable trend allowlist");
    const native = Array.from({ length: pairs }, (_, i) => `($${i * 2 + 1},$${i * 2 + 2})`);
    // Full matching history is required by the unchanged time-adjustment engine.
    return exact(
      `SELECT town, flat_type, month, median_price_per_sqm, transaction_count FROM public.town_flat_type_trends WHERE (town, flat_type) IN (${native.join(", ")}) ORDER BY town COLLATE "C", flat_type COLLATE "C", month COLLATE "C"`,
      bindings.length,
    );
  }
  if (
    source ===
    "SELECT address_key,town,display_name,median_price,transaction_count,available_min_month,available_max_month,floor_area_min,floor_area_max FROM blocks WHERE address_key = ?1"
  )
    return exact(source.replace("FROM blocks", "FROM public.blocks").replace("?1", "$1"), 1);
  if (source === "SELECT address_key, town FROM blocks LIMIT ?1 OFFSET ?2")
    return exact(
      'SELECT address_key, town FROM public.blocks ORDER BY address_key COLLATE "C" LIMIT $1 OFFSET $2',
      2,
    );
  if (source === "SELECT town, median_price, transaction_count FROM blocks WHERE town IN (?, ?)")
    return exact(
      "SELECT town, median_price, transaction_count FROM public.blocks WHERE town IN ($1, $2)",
      2,
    );
  if (source === "SELECT * FROM blocks WHERE address_key = ?") {
    const projection = compilePublicRead(
      "SELECT * FROM blocks ORDER BY median_price DESC, transaction_count DESC",
    ).sql.replace("ORDER BY median_price DESC, transaction_count DESC", "WHERE address_key = $1");
    return exact(projection, 1);
  }
  const legacySuggest = LEGACY_SUGGEST.get(source);
  if (legacySuggest) return exact(legacySuggest.native, legacySuggest.bindings);
  return compilePublicRead(sql, bindings);
}

export function createNeonReadDb(query: PublicReadQuery) {
  const statement = (sql: string, bindings: readonly unknown[] = []) => {
    const rows = async () => {
      const compiled = compileRuntimeRead(sql, bindings);
      return query(compiled.sql, compiled.params);
    };
    return {
      bind: (...params: unknown[]) => statement(sql, params),
      all: async <T = PublicReadRow>() => ({ results: (await rows()) as T[] }),
      first: async <T = PublicReadRow>() => ((await rows())[0] as T | undefined) ?? null,
    };
  };
  return { prepare: (sql: string) => statement(sql) };
}
