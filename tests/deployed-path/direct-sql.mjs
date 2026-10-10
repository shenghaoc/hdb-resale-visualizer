/**
 * Builds the read-only check that runs the SHIPPED statement (NEARBY_LABELLED_SQL: the one the Worker sends), bound
 * exactly as the Worker binds it ($1 lat, $2 lng, $3 radius, $4 kinds, $5 limit), once per sample, and reports
 * `id|rows|md5` of its place rows through RAISE EXCEPTION (a DO block returns no rows). It also runs the verified
 * places query it embeds (NEARBY_SPATIAL_SQL) and fails unless both return the same places in the same order, and
 * unless the labelled statement returns exactly one publication row. The md5 covers the same line format that
 * verify-client.mjs builds from Worker responses, so equal md5 means equal places in equal order.
 *
 * CLI (prints the sql_statements array for a SQL runner such as the Neon MCP, READ ONLY first):
 *   node --import tsx tests/deployed-path/direct-sql.mjs
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SAMPLES, canonical } from "./samples.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The statement the Worker sends, and the verified places query it embeds. */
export async function loadShippedSql() {
  const { NEARBY_LABELLED_SQL, NEARBY_SPATIAL_SQL } = await import(
    pathToFileURL(path.join(repoRoot, "worker/nearby-spatial-query.ts")).href
  );
  return { labelled: NEARBY_LABELLED_SQL, base: NEARBY_SPATIAL_SQL };
}

const FINGERPRINT_COLUMNS = `count(*)::int, md5(COALESCE(string_agg(concat_ws('|', kind, id, name, lat::text, lng::text, COALESCE(address_key,''), COALESCE(station_name,''), COALESCE(exit_code,''), distance_meters::text), E'\\n' ORDER BY ord), ''))`;
const FINGERPRINT_BASE_SQL = `SELECT ${FINGERPRINT_COLUMNS} FROM (SELECT *, row_number() OVER () AS ord FROM (%s) q) r`;
const FINGERPRINT_PLACES_SQL = `SELECT ${FINGERPRINT_COLUMNS} FROM (SELECT *, row_number() OVER () AS ord FROM (%s) q WHERE row_type = 'place') r`;
const HEADER_COUNT_SQL = `SELECT count(*)::int FROM (%s) q WHERE row_type = 'publication'`;

export function buildDirectBlock(samples, shipped) {
  for (const text of [shipped.labelled, shipped.base])
    for (const tag of ["$q$", "$b$", "$f$", "$do$"])
      if (text.includes(tag)) throw new Error("dollar-quote collision");
  const cells = samples.map((sample) => ({ id: sample.id, ...canonical(sample) }));
  return `DO $do$
DECLARE sql text := $q$${shipped.labelled}$q$; base text := $b$${shipped.base}$b$;
  s record; n int; h text; n0 int; h0 text; headers int; r text := '';
BEGIN
  FOR s IN SELECT * FROM jsonb_to_recordset('${JSON.stringify(cells)}'::jsonb)
    AS x(id text, lat double precision, lng double precision, radius double precision, kinds text[]) LOOP
    EXECUTE format($f$${FINGERPRINT_PLACES_SQL}$f$, sql) INTO n, h USING s.lat, s.lng, s.radius, s.kinds, 25;
    EXECUTE format($f$${FINGERPRINT_BASE_SQL}$f$, base) INTO n0, h0 USING s.lat, s.lng, s.radius, s.kinds, 25;
    IF n IS DISTINCT FROM n0 OR h IS DISTINCT FROM h0 THEN
      RAISE EXCEPTION 'LABELLED-DIFFERS % labelled % rows % base % rows %', s.id, h, n, h0, n0;
    END IF;
    EXECUTE format($f$${HEADER_COUNT_SQL}$f$, sql) INTO headers USING s.lat, s.lng, s.radius, s.kinds, 25;
    IF headers <> 1 THEN RAISE EXCEPTION 'LABELLED-HEADER % returned % publication rows', s.id, headers; END IF;
    r := r || s.id || '|' || n || '|' || h || E'\\n';
  END LOOP;
  RAISE EXCEPTION 'REALPATH-RESULT%', E'\\n' || r;
END $do$`;
}

/** Parses the `id|rows|md5` lines out of the error text a runner returns. */
export function parseFingerprints(text) {
  const entries = text
    .split("\n")
    .filter((line) => /^[a-z0-9-]+\|\d+\|[0-9a-f]{32}$/.test(line))
    .map((line) => {
      const [id, n, md5] = line.split("|");
      return [id, { n: Number(n), md5 }];
    });
  return Object.fromEntries(entries);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const block = buildDirectBlock(SAMPLES, await loadShippedSql());
  console.log(JSON.stringify(["SET TRANSACTION READ ONLY", block]));
}
