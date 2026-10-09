# Local PostGIS benchmark for `nearby-places`

Measures the **shipped** query (`NEARBY_SPATIAL_SQL`, `worker/nearby-spatial-query.ts`) on a local PostgreSQL + PostGIS
database at three data sizes, so the planner behaviour and the scaling of the exact approach are known before anyone argues
for a faster approximate one. It deliberately does not use the free Neon project: large synthetic loads would burn its
transfer and compute allowances, and the results would depend on the neighbours.

## What it does

For each size (default 10,000, 100,000 and 1,000,000 blocks):

1. creates database `hdb_bench_<n>`, the publisher base schema (`tests/deployed-path/base-schema.sql`) and the role
   `hdb_benchmark_runtime`;
2. loads `n` blocks, applies `sql/neon/001_postgis_nearby.sql` (which backfills `block_locations` and creates
   `poi_locations`), then adds `n/50` stations and `n/16` exits (the real ratios: 9,730 blocks, 190 stations, 613 exits) and
   10,000 query centres taken from real block positions;
3. runs 12 scenarios (blocks only, exits only, all three kinds, each at 100, 500, 1,000 and 2,500 m) under `pgbench` for
   `--seconds` seconds at each client count, after a discarded warm-up, and derives p50/p95/p99/max from pgbench's
   per-transaction logs;
4. records `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` for three scenarios;
5. compares the exact approach with "the 100 nearest by the GiST `<->` operator, then exact filter and order" over 2,000
   centres: how often the result differs, whether it returns fewer rows, and the time per query.

Points are deterministic functions of the row number (80% in 40 clusters about 1.4 km wide, 20% uniform, inside the allowed
query box), so a size always produces the same data. Real Singapore is far less dense than the 1,000,000-block case;
that case is a stress test of the algorithm, not a forecast.

## Run it

Needs PostgreSQL 18 with PostGIS, `pgbench`, a superuser connection (libpq `PG*` variables), `pnpm install` done.

```bash
PG_BIN=/path/to/postgres/bin PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres \
  node --import tsx scripts/bench-postgis/run.mjs --out /tmp/bench --sizes 10000,100000,1000000 --seconds 15 --clients 1,8
node scripts/bench-postgis/render.mjs /tmp/bench/report.json > /tmp/bench/report.md
```

`--keep-databases true` keeps the generated databases. A full run takes roughly half an hour on a laptop.

## Reading the numbers

- Latency is pgbench's per-transaction time on the same machine over loopback with the simple protocol. It includes
  planning and execution and excludes everything a deployed request adds: the Worker, Hyperdrive, TLS, the network and
  Neon's compute. It is not an edge number and not a prediction of one.
- The cluster runs with its default settings (recorded in the report). The data is warm in the OS cache; there is no cold run.
- Each scenario records the number of sessions active in other databases of the cluster before and after the run. A run that
  overlapped with such activity is repeated up to four times; one that never ran clean is marked ⚠ in the report. The harness
  cannot see other processes outside PostgreSQL, so run it on an otherwise idle machine and read "no ⚠" as "no PostgreSQL
  neighbour", not "quiet machine".
- `EXPLAIN (ANALYZE)` reports 11 to 14 ms of planning time because each plan is captured in a fresh backend whose catalog
  cache is cold (PostGIS function lookups dominate); the pgbench latencies come from warm backends, where planning is part of
  a sub-millisecond total. A first query on a new database connection therefore costs more than the figures here; pooled
  connections (Hyperdrive keeps up to five to the origin) avoid it for most requests.
- The query orders every candidate inside the radius before applying the limit of 25, so its cost grows with the number of
  points inside the radius, not with the table size. The scenarios at 2,500 m show that.
- The KNN comparison measures a candidate strategy, not a proposal. `<->` on `geography` ranks by spherical distance, so it can
  miss a true top-25 member near the 0.56% edge; the "differ" count is the measured size of that risk on this data.
