/** Closed read-only port of the SQL emitted by the current public GET handlers. */
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
const BLOCK_SELECT = [
  ...BLOCK_SCALARS.map((name) => `blocks.${name}`),
  ...BLOCK_JSON.map((name) => `blocks.${name}::text AS ${name}`),
].join(", ");
const BLOCK_ORDER = "ORDER BY median_price DESC, transaction_count DESC";
const ASCII_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ASCII_LOWER = "abcdefghijklmnopqrstuvwxyz";
const asciiFold = (expression: string) =>
  `translate(${expression}, '${ASCII_UPPER}', '${ASCII_LOWER}')`;

function jsonPath(value: unknown): string[] {
  if (typeof value !== "string") throw new Error("Expected a generated JSON path");
  const match =
    /^\$\.("(?:[^"\\]|\\.)*")(?:\.(flatModels|latestMonth|floorAreaRange\[[01]\]))?$/.exec(value);
  if (!match) throw new Error("Unsupported public-read JSON path");
  const key: unknown = JSON.parse(match[1]);
  if (typeof key !== "string") throw new Error("Invalid public-read JSON key");
  const field = match[2];
  if (!field) return [key];
  if (field.startsWith("floorAreaRange")) return [key, "floorAreaRange", field.slice(-2, -1)];
  return [key, field];
}

export function compilePublicRead(sql: string, bindings: readonly unknown[] = []) {
  const source = sql.trim().replace(/\s+/g, " ");
  const params: unknown[] = [];
  let cursor = 0;
  const parameter = (transform: (value: unknown) => unknown = (value) => value) => {
    if (cursor >= bindings.length) throw new Error("Missing public-read binding");
    params.push(transform(bindings[cursor++]));
    return `$${params.length}`;
  };
  const finish = (nativeSql: string) => {
    if (cursor !== bindings.length) throw new Error("Unexpected public-read binding");
    return { sql: nativeSql, params };
  };
  if (source === "SELECT json FROM manifest WHERE id = 1")
    return finish("SELECT json::text AS json FROM public.manifest WHERE id = 1");
  if (source === `SELECT * FROM blocks ${BLOCK_ORDER}`)
    return finish(`SELECT ${BLOCK_SELECT} FROM public.blocks AS blocks ${BLOCK_ORDER}`);
  if (source === `SELECT blocks.* FROM blocks WHERE town = ? ${BLOCK_ORDER}`)
    return finish(
      `SELECT ${BLOCK_SELECT} FROM public.blocks AS blocks WHERE town = ${parameter()} ${BLOCK_ORDER}`,
    );
  for (const table of ["block_details", "comparisons"] as const)
    if (source === `SELECT json FROM ${table} WHERE address_key = ?`)
      return finish(
        `SELECT json::text AS json FROM public.${table} WHERE address_key = ${parameter()}`,
      );
  for (const kind of ["stations", "exits"] as const)
    if (source === `SELECT json FROM mrt_geojson WHERE kind = '${kind}'`)
      return finish(`SELECT json::text AS json FROM public.mrt_geojson WHERE kind = '${kind}'`);
  if (source === "SELECT json FROM mrt_geojson WHERE kind = ?")
    return finish(`SELECT json::text AS json FROM public.mrt_geojson WHERE kind = ${parameter()}`);
  if (
    source ===
    "SELECT town, flat_type, month, median_price, median_price_per_sqm, transaction_count FROM town_flat_type_trends ORDER BY town, flat_type, month"
  )
    return finish(
      'SELECT town, flat_type, month, median_price, median_price_per_sqm, transaction_count FROM public.town_flat_type_trends ORDER BY town COLLATE "C", flat_type COLLATE "C", month COLLATE "C"',
    );
  if (
    source ===
    "SELECT town, street_name, address_key, block, postal_code FROM blocks WHERE address_key > ? ORDER BY address_key LIMIT ?"
  )
    return finish(
      `SELECT town, street_name, address_key, block, postal_code FROM public.blocks WHERE address_key COLLATE "C" > ${parameter()}::text COLLATE "C" ORDER BY address_key COLLATE "C" LIMIT ${parameter()}`,
    );
  if (
    source ===
    "SELECT COUNT(*) AS total_count, COUNT(NULLIF(TRIM(flat_type_cohorts_json), '')) AS populated_count FROM blocks"
  )
    // JSONB cannot store an invalid empty JSON text. SQL NULL is the unbackfilled state.
    return finish(
      "SELECT COUNT(*)::integer AS total_count, COUNT(flat_type_cohorts_json)::integer AS populated_count FROM public.blocks",
    );

  const search =
    /^SELECT blocks\.\* FROM blocks(?: WHERE (.+))? ORDER BY address_key LIMIT \?$/.exec(source);
  if (!search) throw new Error("SQL outside the isolated public-read allowlist");
  const clauses = (search[1] ?? "")
    .split(" AND ")
    .filter(Boolean)
    .map((clause) => {
      if (clause === "0 = 1" || clause === "nearest_mrt_json IS NOT NULL") return clause;
      if (
        /^(?:town =|median_price >=|median_price <=|floor_area_max >=|floor_area_min <=|latest_month >=|latest_month <=) \?$/.test(
          clause,
        )
      )
        return clause.replace("?", parameter());
      if (clause === "(? - lease_commence_year) <= ?")
        return `(${parameter()}::integer - lease_commence_year) <= ${parameter()}::double precision`;
      if (clause === "CAST(json_extract(nearest_mrt_json, '$.distanceMeters') AS REAL) <= ?")
        return `(nearest_mrt_json ->> 'distanceMeters')::double precision <= ${parameter()}`;
      if (
        clause ===
          "EXISTS (SELECT 1 FROM json_each(blocks.flat_types_json) WHERE json_each.value = ? COLLATE NOCASE)" ||
        clause ===
          "EXISTS (SELECT 1 FROM json_each(blocks.flat_models_json) WHERE json_each.value = ? COLLATE NOCASE)"
      ) {
        const column = clause.includes("flat_types_json") ? "flat_types_json" : "flat_models_json";
        return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(blocks.${column}) AS member(value) WHERE ${asciiFold("member.value")} = ${asciiFold(parameter())})`;
      }
      if (
        clause ===
        "EXISTS (SELECT 1 FROM json_each(blocks.flat_type_cohorts_json, ?) WHERE json_each.value = ? COLLATE NOCASE)"
      ) {
        const path = parameter(jsonPath);
        return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(blocks.flat_type_cohorts_json #> ${path}::text[]) AS member(value) WHERE ${asciiFold("member.value")} = ${asciiFold(parameter())})`;
      }
      const budget =
        /^COALESCE\(CAST\(json_extract\(blocks\.median_price_by_flat_type_json, \?\) AS INTEGER\), blocks\.median_price\) (>=|<=) \?$/.exec(
          clause,
        );
      if (budget) {
        const key = parameter((value) => {
          const path = jsonPath(value);
          if (path.length !== 1) throw new Error("Expected flat-type price key");
          return path[0];
        });
        // SQLite INTEGER casts truncate; PostgreSQL integer casts round floating values.
        return `COALESCE(trunc((blocks.median_price_by_flat_type_json ->> ${key})::double precision), blocks.median_price) ${budget[1]} ${parameter()}`;
      }
      const area =
        /^CAST\(json_extract\(blocks\.flat_type_cohorts_json, \?\) AS REAL\) (>=|<=) \?$/.exec(
          clause,
        );
      if (area)
        return `(blocks.flat_type_cohorts_json #>> ${parameter(jsonPath)}::text[])::double precision ${area[1]} ${parameter()}`;
      const month = /^json_extract\(blocks\.flat_type_cohorts_json, \?\) (>=|<=) \?$/.exec(clause);
      if (month)
        return `(blocks.flat_type_cohorts_json #>> ${parameter(jsonPath)}::text[]) ${month[1]} ${parameter()}`;
      throw new Error("Unsupported public search predicate");
    });
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")} ` : "";
  return finish(
    `SELECT ${BLOCK_SELECT} FROM public.blocks AS blocks ${where}ORDER BY address_key COLLATE "C" LIMIT ${parameter()}`,
  );
}

export function createPublicReadDb(query: PublicReadQuery) {
  function statement(sql: string, bindings: readonly unknown[] = []) {
    async function rows() {
      const compiled = compilePublicRead(sql, bindings);
      return query(compiled.sql, compiled.params);
    }
    return {
      bind: (...args: unknown[]) => statement(sql, args),
      all: async <T = PublicReadRow>() => ({ results: (await rows()) as T[] }),
      first: async <T = PublicReadRow>() => ((await rows())[0] as T | undefined) ?? null,
    };
  }
  return { prepare: (sql: string) => statement(sql) };
}
