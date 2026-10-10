/**
 * Local rehearsal of the deployed-path check: the real Worker running under workerd (`wrangler dev`) against a real
 * local PostgreSQL + PostGIS database that carries the shipped migration, queried by the same verification client the
 * deployed run uses. It exercises the Worker, the node-postgres transport, the SQL, the cache and the rate-limit
 * wiring. It is NOT the Hyperdrive path and Cloudflare's real rate-limit counters are not involved.
 *
 * Needs: psql on PATH (or PSQL), a superuser connection to PostgreSQL 18 with PostGIS available (libpq PG* variables),
 * `pnpm install` done. It works in a database it creates itself, `hdb_realpath_local_<random run id>`, refuses to start
 * if that name is somehow taken, and drops only the database it created (never with FORCE; see
 * scripts/lib/scratch-database.ts). The cluster-level role `hdb_benchmark_runtime` is created if missing and left in
 * place, because concurrent runs share it.
 *
 *   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres node --import tsx tests/deployed-path/local-rehearsal.mjs <out-dir>
 *   PHASES=functional  runs a subset (functional, client-limit, latency, origin-limit, ceiling, budget-unavailable);
 *                      default is all. The budget is in the same disposable PostgreSQL database,
 *                      accessed through a separate minimal-role Hyperdrive connection.
 *   SCRATCH_RUN_ID=<6-16 lowercase letters/digits>  fixes the run id instead of drawing a random one.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  cleanupOnSignals,
  createScratchDatabases,
  describeCleanup,
} from "../../scripts/lib/scratch-database.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const outDir = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("usage: local-rehearsal.mjs <out-dir>");
mkdirSync(outDir, { recursive: true });

const PSQL = process.env.PSQL ?? "psql";
const PORT = 8799;
const BUDGET_MIGRATION = path.join(repoRoot, "sql/neon/002_nearby_daily_budget.sql");
/** The ceiling the `ceiling` phase runs under: small enough to reach, the Worker's var overriding the shipped number. */
const CEILING = 5;
const phasesWanted = new Set(
  (
    process.env.PHASES ?? "functional,client-limit,latency,origin-limit,ceiling,budget-unavailable"
  ).split(","),
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) => console.log("[rehearsal]", ...parts);
const psql = (db, sql) =>
  execFileSync(PSQL, ["-d", db, "-v", "ON_ERROR_STOP=1", "-At", "-q", "-c", sql], {
    encoding: "utf8",
  });
const psqlFile = (db, file) =>
  execFileSync(PSQL, ["-d", db, "-v", "ON_ERROR_STOP=1", "-q", "-f", file], { encoding: "utf8" });

// 1. Database, base schema, deterministic synthetic data. The database name carries a per-run id; creation refuses
// (throws) if that name already exists, and only a database created here is ever dropped.
const scratch = createScratchDatabases((db, sql) => psql(db, sql), {
  runId: process.env.SCRATCH_RUN_ID,
});
const DB = scratch.create("hdb_realpath_local");
log("database:", DB);
cleanupOnSignals(() => {
  for (const line of describeCleanup(scratch.dropAll()).lines) log(line);
});
try {
  psql(
    "postgres",
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hdb_benchmark_runtime') THEN CREATE ROLE hdb_benchmark_runtime LOGIN; END IF; END $$`,
  );
  psql("postgres", `GRANT CONNECT ON DATABASE ${DB} TO hdb_benchmark_runtime`);
  // Separate quota-only login: keep the public runtime role transaction-read-only.
  psql(
    "postgres",
    `DO $role$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hdb_nearby_budget') THEN CREATE ROLE hdb_nearby_budget LOGIN PASSWORD 'local-test-only'; END IF; END $role$`,
  );
  psql("postgres", `GRANT CONNECT ON DATABASE ${DB} TO hdb_nearby_budget`);
  psqlFile(DB, path.join(here, "base-schema.sql"));
  psql(
    DB,
    `INSERT INTO blocks(address_key, town, block, street_name, display_name, lat, lng, median_price, price_per_sqm_median, transaction_count,
     floor_area_min, floor_area_max, lease_commence_year, latest_month, available_min_month, available_max_month, flat_types_json, flat_models_json)
   SELECT 'blk-' || g, 'TOWN ' || (g % 8), ((g % 900) + 1)::text, 'STREET ' || (g % 120), CASE WHEN g % 5 = 0 THEN 'NAMED ' || g END,
     c.lat + (abs(hashint8(g * 7 + 1)::numeric) % 3000 - 1500) / 100000.0, c.lng + (abs(hashint8(g * 13 + 5)::numeric) % 3000 - 1500) / 100000.0,
     500000, 5000, 10, 60, 110, 1990, '2026-06', '2020-01', '2026-06', '["4 ROOM"]'::jsonb, '["MODEL A"]'::jsonb
   FROM generate_series(1, 3000) g
   JOIN (VALUES (0, 1.300, 103.850), (1, 1.330, 103.750), (2, 1.360, 103.830), (3, 1.330, 103.930),
                (4, 1.420, 103.800), (5, 1.280, 103.820), (6, 1.390, 103.900), (7, 1.440, 103.820)) c(i, lat, lng) ON c.i = g % 8`,
  );
  // 64 stations of about 3 exits each. Stations 0 and 1 carry code-like labels (CC9, DT18) and two exits of station 2 share
  // a coordinate, so grouping, the source-label quirk and the distance tie-break are all exercised.
  psql(
    DB,
    `WITH st AS (
     SELECT s, CASE s WHEN 0 THEN 'CC9' WHEN 1 THEN 'DT18' ELSE 'STATION ' || s || ' MRT STATION' END AS label,
       1.27 + (abs(hashint8(s * 31 + 3)::numeric) % 1900) / 10000.0 AS lat, 103.65 + (abs(hashint8(s * 17 + 9)::numeric) % 3800) / 10000.0 AS lng
     FROM generate_series(0, 63) s),
   ex AS (
     SELECT row_number() OVER (ORDER BY s, e) AS objid, s, e, label,
       CASE WHEN s = 2 AND e IN (1, 2) THEN lat ELSE lat + e * 0.0004 END AS lat,
       CASE WHEN s = 2 AND e IN (1, 2) THEN lng ELSE lng + e * 0.0003 END AS lng
     FROM st, generate_series(0, 2) e)
   INSERT INTO mrt_geojson(kind, json, updated_at)
   SELECT 'exits', jsonb_build_object('type', 'FeatureCollection', 'features', (SELECT jsonb_agg(jsonb_build_object('type', 'Feature',
     'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(lng, lat)),
     'properties', jsonb_build_object('OBJECTID', objid::text, 'STATION_NA', label, 'EXIT_CODE', 'Exit ' || chr(65 + e))) ORDER BY objid) FROM ex)), now()
   UNION ALL
   SELECT 'stations', jsonb_build_object('type', 'FeatureCollection', 'features', (SELECT jsonb_agg(jsonb_build_object('type', 'Feature',
     'geometry', jsonb_build_object('type', 'Point', 'coordinates', jsonb_build_array(lng, lat)),
     'properties', jsonb_build_object('stationName', label)) ORDER BY s) FROM st)), now()`,
  );
  psql(
    DB,
    // About 10 KB (the serving branch's is 10.6 KB) and not ASCII-only, so the SQL-side and JS-side hashes of its text are
    // compared on something that could tell UTF-8 from anything else.
    `INSERT INTO manifest(id, json, updated_at) VALUES (1, jsonb_build_object('schemaVersion', 1, 'generatedAt', '2026-10-10T00:00:00.000Z', 'rehearsal', true, 'note', 'Résumé — 新加坡 組屋 — Ångström ✓', 'padding', repeat('0123456789', 1000)), now())`,
  );
  psql(DB, `GRANT USAGE ON SCHEMA public TO hdb_benchmark_runtime`);
  psql(
    DB,
    `GRANT SELECT ON transactions, blocks, block_details, comparisons, town_flat_type_trends, manifest, mrt_geojson TO hdb_benchmark_runtime`,
  );

  // 2. The shipped migration, then the catalog defaults the serving branch's runtime role has.
  psqlFile(DB, path.join(repoRoot, "sql/neon/001_postgis_nearby.sql"));
  psqlFile(DB, BUDGET_MIGRATION);
  psql(
    DB,
    `ALTER ROLE hdb_nearby_budget IN DATABASE ${DB} SET default_transaction_read_only = off`,
  );
  psql(DB, `ALTER ROLE hdb_nearby_budget IN DATABASE ${DB} SET statement_timeout = '5s'`);
  psql(
    DB,
    `ALTER ROLE hdb_benchmark_runtime IN DATABASE ${DB} SET default_transaction_read_only = on`,
  );
  psql(DB, `ALTER ROLE hdb_benchmark_runtime IN DATABASE ${DB} SET statement_timeout = '60s'`);
  log(
    "model:",
    psql(
      DB,
      `SELECT (SELECT count(*) FROM blocks) || ' blocks, ' || (SELECT count(*) FROM block_locations) || ' block points, ' || (SELECT count(*) FROM poi_locations WHERE poi_kind = 'mrt_station') || ' stations, ' || (SELECT count(*) FROM poi_locations WHERE poi_kind = 'mrt_exit') || ' exits'`,
    ).trim(),
  );

  // 3. Samples drawn from the data, and the expected fingerprints from the shipped SQL.
  const row = (sql) => psql(DB, sql).trim().split("|");
  const [denseLat, denseLng] = row(
    `SELECT lat, lng FROM (SELECT b.lat, b.lng, (SELECT count(DISTINCT p.source_properties->>'STATION_NA') FROM poi_locations p
     WHERE p.poi_kind = 'mrt_exit' AND ST_DWithin(p.location, ST_SetSRID(ST_MakePoint(b.lng, b.lat), 4326)::geography, 1500)) AS n
   FROM blocks b ORDER BY n DESC, address_key LIMIT 1) q`,
  );
  const [blockLat, blockLng] = row(`SELECT lat, lng FROM blocks ORDER BY md5(address_key) LIMIT 1`);
  const [codeLat, codeLng] = row(
    `SELECT lat, lng FROM poi_locations WHERE poi_kind = 'mrt_exit' AND source_properties->>'STATION_NA' = 'CC9' ORDER BY source_id LIMIT 1`,
  );
  const [tieLat, tieLng] = row(
    `SELECT lat, lng FROM poi_locations WHERE poi_kind = 'mrt_exit' AND source_properties->>'STATION_NA' = 'STATION 2 MRT STATION' ORDER BY source_id LIMIT 1`,
  );
  const grid = (value) => Math.round(Number(value) * 10_000) / 10_000;
  const samples = [
    {
      id: "dense-exits-1500",
      lat: grid(denseLat),
      lng: grid(denseLng),
      radius: 1500,
      types: "mrt_exit",
    },
    {
      id: "dense-all-1000",
      lat: grid(denseLat),
      lng: grid(denseLng),
      radius: 1000,
      types: "hdb_block,mrt_station,mrt_exit",
    },
    { id: "block-default-500", lat: grid(blockLat), lng: grid(blockLng), radius: 500 },
    {
      id: "block-blocks-only-250",
      lat: grid(blockLat),
      lng: grid(blockLng),
      radius: 250,
      types: "hdb_block",
    },
    {
      id: "block-blocks-exits-1000",
      lat: grid(blockLat),
      lng: grid(blockLng),
      radius: 1000,
      types: "hdb_block,mrt_exit",
    },
    {
      id: "code-labelled-exit-100",
      lat: grid(codeLat),
      lng: grid(codeLng),
      radius: 100,
      types: "mrt_exit",
    },
    {
      id: "tied-exits-same-station-250",
      lat: grid(tieLat),
      lng: grid(tieLng),
      radius: 250,
      types: "mrt_exit",
    },
    {
      id: "stations-exits-2500",
      lat: grid(denseLat),
      lng: grid(denseLng),
      radius: 2500,
      types: "mrt_station,mrt_exit",
    },
    {
      id: "offshore-south-2500",
      lat: 1.19,
      lng: 103.8,
      radius: 2500,
      types: "hdb_block,mrt_station,mrt_exit",
    },
    {
      id: "box-corner-2500",
      lat: 1.55,
      lng: 104.15,
      radius: 2500,
      types: "hdb_block,mrt_station,mrt_exit",
    },
    {
      id: "radius-101-rounds-up-to-250",
      lat: grid(blockLat),
      lng: grid(blockLng),
      radius: 101,
      types: "hdb_block",
    },
  ];
  const samplesFile = path.join(outDir, "samples.local.json");
  writeFileSync(samplesFile, JSON.stringify(samples, null, 2));
  process.env.SAMPLES_FILE = samplesFile;
  const { buildDirectBlock, loadShippedSql, parseFingerprints } = await import(
    pathToFileURL(path.join(here, "direct-sql.mjs")).href
  );
  let directOutput = "";
  try {
    execFileSync(
      PSQL,
      [
        "-d",
        DB,
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        "-q",
        "-c",
        buildDirectBlock(samples, await loadShippedSql()),
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    directOutput = String(error.stderr ?? ""); // the block reports through RAISE EXCEPTION
  }
  const fingerprints = parseFingerprints(directOutput);
  if (Object.keys(fingerprints).length !== samples.length)
    throw new Error(`expected ${samples.length} fingerprints:\n${directOutput.slice(0, 400)}`);
  const expectedFile = path.join(outDir, "expected.local.json");
  writeFileSync(
    expectedFile,
    JSON.stringify(
      {
        source: "shipped NEARBY_SPATIAL_SQL via psql on the local synthetic database",
        samples: fingerprints,
      },
      null,
      2,
    ),
  );
  log(
    "expected rows:",
    Object.entries(fingerprints)
      .map(([id, f]) => `${id}=${f.n}`)
      .join(" "),
  );

  // The label the Worker stores a nearby answer under is computed IN SQL, by the labelled statement itself; every other
  // route computes it in JS from the manifest text. They must be the same string, or the shared pointer would flip.
  const { manifestVersion } = await import(
    pathToFileURL(path.join(repoRoot, "shared/publication-state.ts")).href
  );
  const { NEARBY_LABELLED_SQL } = await import(
    pathToFileURL(path.join(repoRoot, "worker/nearby-spatial-query.ts")).href
  );
  const manifestText = execFileSync(
    PSQL,
    [
      "-d",
      DB,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-q",
      "-c",
      "SELECT json::text FROM manifest WHERE id = 1",
    ],
    { encoding: "utf8" },
  ).replace(/\n$/, "");
  const labelledOutput = execFileSync(
    PSQL,
    [
      "-d",
      DB,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-q",
      "-c",
      `PREPARE labelled(double precision, double precision, double precision, text[], int) AS ${NEARBY_LABELLED_SQL}; EXECUTE labelled(1.3, 103.85, 100, ARRAY['mrt_exit'], 25)`,
    ],
    { encoding: "utf8" },
  );
  const sqlVersion = labelledOutput
    .split("\n")
    .find((line) => line.startsWith("publication|"))
    ?.split("|")[1];
  const jsVersion = await manifestVersion(manifestText);
  const identity = {
    manifestBytes: Buffer.byteLength(manifestText, "utf8"),
    nonAscii: Buffer.byteLength(manifestText, "utf8") !== manifestText.length,
    sql: sqlVersion,
    js: jsVersion,
    equal: sqlVersion === jsVersion,
  };
  if (!identity.equal)
    throw new Error(
      `the labelled statement and manifestVersion disagree: ${JSON.stringify(identity)}`,
    );
  log(
    `publication identity: SQL and JS agree (${jsVersion.slice(0, 12)}…, ${identity.manifestBytes} bytes, non-ASCII ${identity.nonAscii})`,
  );

  /**
   * What the Worker's database role has sent, from pg_stat_statements: every query it sends is one statement, which is
   * how Hyperdrive counts them. Needs the library loaded in the cluster (`shared_preload_libraries`); when it is not,
   * the check says "not measured" instead of passing silently.
   */
  let statementsMeasured = true;
  let statementsUnavailable = "";
  try {
    psql(DB, "CREATE EXTENSION IF NOT EXISTS pg_stat_statements");
    psql(DB, "SELECT count(*) FROM pg_stat_statements");
  } catch (error) {
    statementsMeasured = false;
    statementsUnavailable = String(error.stderr ?? error.message)
      .trim()
      .split("\n")
      .at(-1);
  }
  const runtimeRole = `(SELECT oid FROM pg_roles WHERE rolname = 'hdb_benchmark_runtime')`;
  const thisDatabase = `(SELECT oid FROM pg_database WHERE datname = current_database())`;
  const resetStatements = () =>
    statementsMeasured &&
    psql(DB, `SELECT pg_stat_statements_reset(${runtimeRole}, ${thisDatabase}, 0)`);
  const runtimeStatements = () => {
    const [calls, distinct, onlyLabelled] = psql(
      DB,
      `SELECT coalesce(sum(calls), 0), count(*), coalesce(bool_and(query LIKE '%row_type%'), false) FROM pg_stat_statements WHERE userid = ${runtimeRole} AND dbid = ${thisDatabase}`,
    )
      .trim()
      .split("|");
    return {
      calls: Number(calls),
      distinctStatements: Number(distinct),
      onlyLabelled: onlyLabelled === "t",
    };
  };

  // 4. The Worker under workerd.
  function workerConfig(originLimit, clientLimit, vars = {}, budgetEnabled = true) {
    return JSON.stringify(
      {
        name: "hdb-realpath-local",
        main: path.join(repoRoot, "worker/index.ts"),
        compatibility_date: "2026-04-19",
        compatibility_flags: ["nodejs_compat"],
        rules: [
          { type: "Data", globs: ["**/*.ttf"] },
          { type: "CompiledWasm", globs: ["**/*.wasm"] },
        ],
        ratelimits: [
          {
            name: "NEARBY_IP_LIMITER",
            namespace_id: "9003",
            simple: { limit: clientLimit, period: 60 },
          },
          {
            name: "NEARBY_ORIGIN_LIMITER",
            namespace_id: "9004",
            simple: { limit: originLimit, period: 60 },
          },
        ],
        hyperdrive: [
          {
            binding: "HDB_PUBLIC_NEON",
            id: "00000000000000000000000000000000",
            localConnectionString: `postgresql://hdb_benchmark_runtime:local@${process.env.PGHOST ?? "127.0.0.1"}:${process.env.PGPORT ?? "5432"}/${DB}`,
          },
          ...(budgetEnabled
            ? [
                {
                  binding: "HDB_NEARBY_BUDGET",
                  id: "11111111111111111111111111111111",
                  localConnectionString: `postgresql://hdb_nearby_budget:local-test-only@${process.env.PGHOST ?? "127.0.0.1"}:${process.env.PGPORT ?? "5432"}/${DB}`,
                },
              ]
            : []),
        ],
        vars: {
          PUBLIC_DATA_BACKEND: "neon",
          D1_PUBLIC_CACHE_EPOCH: "unused",
          NEON_PUBLIC_CACHE_EPOCH: "local-rehearsal",
          NEON_SPATIAL_ENABLED: "true",
          ...vars,
        },
      },
      null,
      2,
    );
  }

  const wranglerBin = path.join(repoRoot, "node_modules/.bin/wrangler");
  const wranglerEnv = { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" };
  /** The daily budget rows each Worker left behind, by label. */
  const budgetAfter = {};

  async function withWorker(
    label,
    originLimit,
    clientLimit,
    run,
    { vars = {}, migrate = true } = {},
  ) {
    const config = path.join(outDir, `wrangler.local.${label}.json`);
    writeFileSync(config, workerConfig(originLimit, clientLimit, vars, migrate));
    const state = path.join(outDir, `wrangler-state-${label}`);
    rmSync(state, { recursive: true, force: true });
    // Reset only this invocation's PostgreSQL table between independent phases.
    psql(DB, "DELETE FROM public.nearby_daily_budget");
    const wrangler = spawn(
      wranglerBin,
      [
        "dev",
        "--config",
        config,
        "--port",
        String(PORT),
        "--ip",
        "127.0.0.1",
        "--local",
        "--persist-to",
        state,
        "--log-level",
        "warn",
      ],
      { cwd: outDir, env: wranglerEnv },
    );
    let output = "";
    wrangler.stdout.on("data", (chunk) => (output += chunk));
    wrangler.stderr.on("data", (chunk) => (output += chunk));
    try {
      const started = Date.now();
      for (;;) {
        if (wrangler.exitCode !== null)
          throw new Error(`wrangler exited early:\n${output.slice(-1500)}`);
        const ready = await fetch(`http://127.0.0.1:${PORT}/api/nearby-capabilities`).then(
          (response) => response.ok,
          () => false,
        );
        if (ready) break;
        if (Date.now() - started > 120_000)
          throw new Error(`wrangler did not start:\n${output.slice(-1500)}`);
        await sleep(500);
      }
      log(
        `worker "${label}" ready after ${Date.now() - started} ms (origin limit ${originLimit}, client limit ${clientLimit})`,
      );
      return await run();
    } finally {
      wrangler.kill("SIGTERM");
      await sleep(1000);
      if (wrangler.exitCode === null) wrangler.kill("SIGKILL");
      writeFileSync(path.join(outDir, `wrangler-${label}.log`), output);
      budgetAfter[label] = psql(
        DB,
        "SELECT day::text, used FROM public.nearby_daily_budget ORDER BY day",
      ).trim();
    }
  }

  function client(phase, extraEnv = {}) {
    const file = path.join(outDir, `${phase}.json`);
    const stdout = execFileSync("node", [path.join(here, "verify-client.mjs"), phase, file], {
      env: {
        ...process.env,
        BASE_URL: `http://127.0.0.1:${PORT}`,
        ALLOW_LOCAL_HTTP: "1",
        SAMPLES_FILE: samplesFile,
        EXPECTED_FILE: expectedFile,
        ...extraEnv,
      },
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(stdout);
  }

  const results = {};
  if (phasesWanted.has("functional") || phasesWanted.has("client-limit")) {
    await withWorker("main", 300, 30, async () => {
      if (phasesWanted.has("functional")) {
        resetStatements();
        results.functional = client("functional");
        // One statement per cache miss and none for hits (before this change a miss cost three).
        const misses = results.functional.samples.filter(
          (sample) => sample.cacheFirst === "MISS",
        ).length;
        results.statements = statementsMeasured
          ? (({ calls, ...rest }) => ({
              measured: true,
              calls,
              expected: misses,
              ...rest,
              equal: calls === misses && rest.onlyLabelled && rest.distinctStatements === 1,
            }))(runtimeStatements())
          : { measured: false, reason: statementsUnavailable };
        if (statementsMeasured) {
          // Control: a route that still goes through the shared cache's before/after manifest reads. One miss and one
          // hit of /api/mrt-stations show where the other two statements of a miss come from.
          resetStatements();
          const get = async () => {
            const response = await fetch(`http://127.0.0.1:${PORT}/api/mrt-stations`);
            await response.arrayBuffer();
            return response.headers.get("x-data-cache");
          };
          const labels = [await get(), await get()];
          const { calls, distinctStatements } = runtimeStatements();
          results.control = { route: "/api/mrt-stations", labels, calls, distinctStatements };
        }
      }
      if (phasesWanted.has("client-limit")) {
        if (results.functional) await sleep(61_000); // let the 60 s window pass so this phase counts from zero
        results["client-limit"] = client("client-limit");
      }
    });
  }
  if (phasesWanted.has("latency"))
    await withWorker(
      "latency",
      100_000,
      100_000,
      async () => (results.latency = client("latency")),
    );
  if (phasesWanted.has("origin-limit"))
    await withWorker(
      "origin10",
      10,
      30,
      async () => (results["origin-limit"] = client("origin-limit")),
    );
  if (phasesWanted.has("ceiling"))
    await withWorker(
      "ceiling",
      100_000,
      100_000,
      async () => (results.ceiling = client("ceiling", { EXPECT_CEILING: String(CEILING) })),
      { vars: { NEARBY_DAILY_STATEMENT_CEILING: String(CEILING) } },
    );
  if (phasesWanted.has("budget-unavailable"))
    await withWorker(
      "unmigrated",
      100_000,
      100_000,
      async () => (results["budget-unavailable"] = client("budget-unavailable")),
      { migrate: false },
    );

  // 5. Verdict.
  const functional = results.functional;
  const verdict = {
    capability: functional?.capability,
    samplesEqual:
      functional &&
      `${functional.samples.filter((sample) => sample.equal).length}/${functional.samples.length}`,
    notEqual: functional?.samples
      .filter((sample) => !sample.equal)
      .map(({ id, status, got, want }) => ({ id, status, got, want })),
    cache: functional?.samples
      .map((sample) => `${sample.cacheFirst}->${sample.cacheSecond}`)
      .join(" "),
    cacheContract: functional?.cacheContract,
    versionAgreement: functional?.versionAgreement,
    badRequest: functional?.badRequest,
    clientLimit: results["client-limit"] && {
      ok200: results["client-limit"].ok200,
      first429: results["client-limit"].first429,
    },
    originLimit: results["origin-limit"] && {
      statuses: results["origin-limit"].statuses,
      first503: results["origin-limit"].first503,
    },
    publicationIdentity: identity,
    statementsPerMiss: results.statements,
    sharedCacheControl: results.control,
    dailyCeiling: results.ceiling && {
      ceiling: CEILING,
      statuses: results.ceiling.statuses,
      firstRefused: results.ceiling.firstRefused,
      cachedStillServed: results.ceiling.cachedStillServed,
      budgetRows: budgetAfter.ceiling,
    },
    budgetUnavailable: results["budget-unavailable"] && {
      statuses: results["budget-unavailable"].statuses,
      first: results["budget-unavailable"].first,
    },
    budgetRowsAfterMainRun: budgetAfter.main,
    latency: results.latency && { miss: results.latency.miss, hit: results.latency.hit },
  };
  writeFileSync(path.join(outDir, "verdict.json"), JSON.stringify(verdict, null, 2));
  console.log(JSON.stringify(verdict, null, 2));
} finally {
  const cleanup = describeCleanup(scratch.dropAll());
  for (const line of cleanup.lines) log(line);
  if (!cleanup.complete) process.exitCode = 1;
  log("cluster-level test roles were left in place; only the owned scratch database was deleted");
}
