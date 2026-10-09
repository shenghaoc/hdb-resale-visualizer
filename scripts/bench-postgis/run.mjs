/**
 * Local PostGIS benchmark of the shipped nearby-places query (see README.md for the method and its limits).
 *
 *   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres \
 *     node --import tsx scripts/bench-postgis/run.mjs --out docs/benchmarks/run --sizes 10000,100000,1000000 --seconds 15
 *
 * For every size it builds a deterministic synthetic database (blocks, the shipped migration, stations and exits),
 * runs the SHIPPED NEARBY_SPATIAL_SQL under pgbench for 12 scenarios (3 kind sets x 4 radii) at 1 and 8 clients,
 * derives p50/p95/p99 from pgbench's per-transaction logs, records EXPLAIN (ANALYZE, BUFFERS) for three scenarios,
 * and compares a KNN-candidate strategy with the exact one. Nothing leaves the machine.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++)
  if (argv[i].startsWith("--")) args[argv[i].slice(2)] = argv[i + 1];
const sizes = (args.sizes ?? "10000").split(",").map(Number);
const seconds = Number(args.seconds ?? 15);
const outDir = path.resolve(args.out ?? "bench-out");
const concurrencies = (args.clients ?? "1,8").split(",").map(Number);
const knnCandidates = Number(args["knn-candidates"] ?? 100);
const bin = process.env.PG_BIN ?? "";
const tool = (name) => (bin ? path.join(bin, name) : name);
mkdirSync(outDir, { recursive: true });

const run = (file, argv, options = {}) =>
  execFileSync(file, argv, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...options });
const psql = (db, sql) =>
  run(tool("psql"), ["-d", db, "-v", "ON_ERROR_STOP=1", "-At", "-q", "-c", sql]).trim();
const psqlFile = (db, file, vars = {}) =>
  run(tool("psql"), [
    "-d",
    db,
    "-v",
    "ON_ERROR_STOP=1",
    "-q",
    ...Object.entries(vars).flatMap(([k, v]) => ["-v", `${k}=${v}`]),
    "-f",
    file,
  ]);
const log = (...parts) => console.log("[bench]", ...parts);

const { NEARBY_SPATIAL_SQL } = await import(
  pathToFileURL(path.join(repoRoot, "worker/nearby-spatial-query.ts")).href
);

const KIND_SETS = {
  blocks: ["hdb_block"],
  exits: ["mrt_exit"],
  all: ["hdb_block", "mrt_station", "mrt_exit"],
};
const RADII = [100, 500, 1000, 2500];
const PLAN_SCENARIOS = ["blocks-r500", "exits-r1000", "all-r2500"];

/** The shipped query with $1..$5 replaced the way pgbench can run it: a centre looked up by :id, a literal radius. */
function scenarioSql(kinds, radius, id) {
  const centre = (column) => `(SELECT ${column} FROM bench_centres WHERE id = ${id})`;
  return NEARBY_SPATIAL_SQL.replaceAll("$1", centre("lat"))
    .replaceAll("$2", centre("lng"))
    .replaceAll("$3", String(radius))
    .replaceAll("$4", `ARRAY[${kinds.map((k) => `'${k}'`).join(",")}]::text[]`)
    .replaceAll("$5", "25");
}

function percentiles(micros) {
  const sorted = Float64Array.from(micros).sort();
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)] / 1000;
  return {
    n: sorted.length,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: sorted.at(-1) / 1000,
  };
}

function readLatencies(prefix) {
  const dir = path.dirname(prefix);
  const base = path.basename(prefix);
  const values = [];
  for (const name of readdirSync(dir).filter((f) => f.startsWith(base))) {
    for (const line of readFileSync(path.join(dir, name), "utf8").split("\n")) {
      const columns = line.split(" ");
      if (columns.length >= 3) values.push(Number(columns[2]));
    }
    rmSync(path.join(dir, name));
  }
  return values;
}

function environment() {
  const settings = psql(
    "postgres",
    `SELECT string_agg(name || '=' || setting || coalesce(unit, ''), ', ' ORDER BY name) FROM pg_settings WHERE name IN ('shared_buffers','work_mem','effective_cache_size','max_parallel_workers_per_gather','jit','random_page_cost','max_connections','synchronous_commit','fsync')`,
  );
  const versions = psql(
    "postgres",
    `CREATE EXTENSION IF NOT EXISTS postgis; SELECT split_part(version(), ' ', 2) || ' / PostGIS ' || postgis_lib_version() || ' / GEOS ' || split_part(postgis_geos_version(), '-', 1) || ' / PROJ ' || split_part(postgis_proj_version(), ' ', 1)`,
  )
    .split("\n")
    .at(-1);
  return {
    machine: `${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GiB RAM, ${os.cpus()[0].model}`,
    platform: `${os.type()} ${os.release()}`,
    node: process.version,
    versions,
    settings,
    pgbench: run(tool("pgbench"), ["--version"]).trim(),
    at: new Date().toISOString(),
  };
}

function buildDataset(n) {
  const db = `hdb_bench_${n}`;
  psql("postgres", `DROP DATABASE IF EXISTS ${db} WITH (FORCE)`);
  psql("postgres", `CREATE DATABASE ${db}`);
  psql(
    "postgres",
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hdb_benchmark_runtime') THEN CREATE ROLE hdb_benchmark_runtime LOGIN; END IF; END $$`,
  );
  psql("postgres", `GRANT CONNECT ON DATABASE ${db} TO hdb_benchmark_runtime`);
  const started = Date.now();
  psqlFile(db, path.join(repoRoot, "tests/deployed-path/base-schema.sql"));
  psqlFile(db, path.join(here, "dataset.sql"), { n });
  psqlFile(db, path.join(repoRoot, "sql/neon/001_postgis_nearby.sql"));
  psqlFile(db, path.join(here, "pois.sql"), { n });
  const sizeMb = psql(
    db,
    `SELECT round((pg_total_relation_size('blocks') + pg_total_relation_size('block_locations') + pg_total_relation_size('poi_locations'))/1048576.0)`,
  );
  log(
    `dataset ${n}: built in ${Math.round((Date.now() - started) / 1000)} s, ${sizeMb} MB of tables and indexes`,
  );
  return {
    db,
    buildSeconds: Math.round((Date.now() - started) / 1000),
    relationsMb: Number(sizeMb),
  };
}

const MAX_ATTEMPTS = 4;
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Sessions active in OTHER databases of the shared cluster: the only noise this harness can see and does not cause. */
const otherActiveSessions = (db) =>
  Number(
    psql(
      "postgres",
      `SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND datname IS DISTINCT FROM '${db}' AND pid <> pg_backend_pid()`,
    ),
  );

function benchScenario(db, name, kinds, radius, clients, dir) {
  const script = path.join(dir, `${name}.pgbench`);
  writeFileSync(
    script,
    `\\set id random(1, 10000)\n${scenarioSql(kinds, radius, ":id").trim()};\n`,
  );
  const common = [
    "-n",
    "-M",
    "simple",
    "-c",
    String(clients),
    "-j",
    String(Math.min(clients, 4)),
    "-f",
    script,
    db,
  ];
  run(tool("pgbench"), ["-T", "2", ...common]); // warm-up, discarded
  // A run that overlapped with activity in another database is repeated (up to MAX_ATTEMPTS) and flagged if it never ran clean.
  for (let attempt = 1; ; attempt++) {
    const before = otherActiveSessions(db);
    const prefix = path.join(dir, `log-${name}-c${clients}`);
    const out = run(tool("pgbench"), [
      "-T",
      String(seconds),
      "-l",
      "--log-prefix",
      prefix,
      ...common,
    ]);
    const after = otherActiveSessions(db);
    const noisy = before > 0 || after > 0;
    const latencies = readLatencies(prefix);
    if (noisy && attempt < MAX_ATTEMPTS) {
      log(
        `${name} c${clients}: other sessions active (${before} before, ${after} after); repeating`,
      );
      pause(15_000);
      continue;
    }
    const tps = Number(/tps = ([\d.]+)/.exec(out)?.[1]);
    return {
      scenario: name,
      clients,
      tps,
      ...percentiles(latencies),
      noise: { before, after, attempts: attempt, noisy },
    };
  }
}

function explainPlans(db, dir) {
  const plans = {};
  for (const name of PLAN_SCENARIOS) {
    const [kindName, r] = name.split("-r");
    const sql = scenarioSql(KIND_SETS[kindName], Number(r), 1);
    plans[name] = run(tool("psql"), [
      "-d",
      db,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-q",
      "-c",
      `EXPLAIN (ANALYZE, BUFFERS, SETTINGS) ${sql}`,
    ]);
    writeFileSync(path.join(dir, `plan-${name}.txt`), plans[name]);
  }
  return plans;
}

/** Exact versus KNN-candidate-then-exact for blocks, over 2,000 centres. KNN candidates are ranked spherically. */
function strategyComparison(db) {
  const sql = `DO $do$
DECLARE c record; exact text[]; knn text[]; t0 timestamptz; te interval := '0'; tk interval := '0'; n int := 0; bad int := 0; short int := 0;
BEGIN
  FOR c IN SELECT id, lat, lng FROM bench_centres WHERE id <= 2000 ORDER BY id LOOP
    t0 := clock_timestamp();
    SELECT array_agg(address_key ORDER BY d, address_key COLLATE "C") INTO exact FROM (
      SELECT p.address_key, ST_Distance(p.location, pt.g) AS d FROM block_locations p, (SELECT ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography AS g) pt
      WHERE ST_DWithin(p.location, pt.g, 1500) ORDER BY d, p.address_key COLLATE "C" LIMIT 25) a;
    te := te + (clock_timestamp() - t0);
    t0 := clock_timestamp();
    SELECT array_agg(address_key ORDER BY d, address_key COLLATE "C") INTO knn FROM (
      SELECT k.address_key, ST_Distance(k.location, pt.g) AS d
      FROM (SELECT ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography AS g) pt,
      LATERAL (SELECT address_key, location FROM block_locations ORDER BY location <-> pt.g LIMIT ${knnCandidates}) k
      WHERE ST_DWithin(k.location, pt.g, 1500) ORDER BY d, k.address_key COLLATE "C" LIMIT 25) a;
    tk := tk + (clock_timestamp() - t0);
    n := n + 1;
    IF exact IS DISTINCT FROM knn THEN bad := bad + 1; END IF;
    IF coalesce(cardinality(knn), 0) < coalesce(cardinality(exact), 0) THEN short := short + 1; END IF;
  END LOOP;
  RAISE EXCEPTION 'STRATEGY centres=% differ=% knn_returned_fewer=% exact_ms_per_query=% knn_ms_per_query=%', n, bad, short, round((extract(epoch FROM te) * 1000 / n)::numeric, 3), round((extract(epoch FROM tk) * 1000 / n)::numeric, 3);
END $do$`;
  try {
    run(tool("psql"), ["-d", db, "-v", "ON_ERROR_STOP=1", "-At", "-q", "-c", sql], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const match = /STRATEGY (.*)/.exec(String(error.stderr));
    if (match)
      return Object.fromEntries(
        match[1]
          .split(" ")
          .map((pair) => pair.split("="))
          .map(([k, v]) => [k, Number(v)]),
      );
    throw error;
  }
  throw new Error("strategy comparison did not report");
}

const report = { environment: environment(), seconds, concurrencies, knnCandidates, sizes: {} };
for (const n of sizes) {
  const dir = path.join(outDir, String(n));
  mkdirSync(dir, { recursive: true });
  const dataset = buildDataset(n);
  const results = [];
  for (const [kindName, kinds] of Object.entries(KIND_SETS)) {
    for (const radius of RADII) {
      for (const clients of concurrencies) {
        const result = benchScenario(
          dataset.db,
          `${kindName}-r${radius}`,
          kinds,
          radius,
          clients,
          dir,
        );
        results.push(result);
        log(
          `${n} ${result.scenario} c${clients}: p50 ${result.p50.toFixed(2)} ms, p95 ${result.p95.toFixed(2)} ms, p99 ${result.p99.toFixed(2)} ms, ${result.tps} tps (n=${result.n})`,
        );
      }
    }
  }
  explainPlans(dataset.db, dir);
  const strategy = strategyComparison(dataset.db);
  log(`${n} strategy: ${JSON.stringify(strategy)}`);
  report.sizes[n] = { ...dataset, results, strategy };
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  if (args["keep-databases"] !== "true")
    psql("postgres", `DROP DATABASE IF EXISTS ${dataset.db} WITH (FORCE)`);
}
console.log(JSON.stringify(report, null, 2));
