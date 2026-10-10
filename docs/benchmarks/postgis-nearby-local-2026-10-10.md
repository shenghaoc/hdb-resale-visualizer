# Local PostGIS benchmark of the nearby-places query — 2026-10-10

The shipped query (`NEARBY_SPATIAL_SQL`) measured on a local PostgreSQL 18.6 + PostGIS 3.6.3 database at three data sizes, so
that the cost of the exact approach and the point where a cheaper candidate strategy pays off are known from measurement. The
method, the harness and its limits are in [`scripts/bench-postgis/README.md`](../../scripts/bench-postgis/README.md); the raw
results are in [`postgis-nearby-local-2026-10-10.report.json`](postgis-nearby-local-2026-10-10.report.json). This is a laptop
over loopback with the simple protocol, a warm cache and default server settings. It says nothing about the Worker, Hyperdrive,
TLS, the network or Neon's compute, and it must not be quoted as an edge or production latency.

## What the numbers say

All figures below are from rows that ran with no other PostgreSQL session active (the two rows marked ⚠ in the tables did not
and are excluded from this list).

- **At the size of the real data (about 10,000 blocks, about 800 points of interest) the query is cheap.** One client: p50
  0.28 to 1.20 ms and p99 0.30 to 2.31 ms across all twelve scenarios; the 100 to 500 m scenarios stay at or below 0.46 ms p99.
  Eight clients: p99 at most 4.89 ms (all kinds, 2,500 m). Database time is a small share of an end-to-end request.
- **Cost follows the number of points inside the radius, not the size of the table.** The query orders every candidate in the
  radius before it applies the limit of 25. Blocks within 2,500 m: p50 1.15 ms (10k), 10.8 ms (100k), 132 ms (1M). Within 100 m with
  eight clients the three sizes are 0.32, 0.44 and 1.42 ms. The exit table is smaller and scales gently: p50 at 2,500 m is 0.30, 0.55 and
  3.44 ms.
- **The plan is the intended one.** For a 500 m block query at 1M the plan is a bitmap scan of `block_locations_location_gist`
  (`location && _st_expand(point, 500)`), the exact `st_dwithin` filter, a nested loop to `blocks_pkey` and a top-N heapsort;
  `EXPLAIN (ANALYZE, BUFFERS)` execution time was 4.1 to 6.2 ms for the 500 and 1,000 m scenarios at every size and 26 ms (100k)
  and 63 ms (1M) for all kinds at 2,500 m. The files are reproduced by the harness.
- **Planning in a fresh backend costs 11 to 14 ms**, because the PostGIS function lookups fill a cold catalog cache; in the
  pgbench runs, on warm backends, planning is part of totals below 0.3 ms. A first query on a new connection therefore costs more
  than the tables show; pooled connections avoid it for most requests.
- **Concurrency.** Eight clients on ten cores raise throughput 4.6 to 4.8 times in the heaviest scenario at every size (811 to
  3,890 queries per second at 10k) while p50 rises 1.6 to 1.7 times.
- **A candidate strategy pays off only at scale.** "The 100 nearest by the GiST `<->` operator, then exact filter and order"
  took 0.184 ms against 0.136 ms for the exact query at 10k (slower), 0.267 against 1.087 ms at 100k (4.1 times faster) and
  0.509 against 10.7 ms at 1M (21 times faster). For 2,000 block-derived centres at 1,500 m per size, the strategy's top 25 never
  differed from the exact top 25 and it never returned fewer rows. That is one radius, one kind and in-distribution centres;
  `<->` ranks by sphere, which reads north-south distances 0.56% high, so a dense cluster of near-equal distances or a sparse
  area could still produce a disagreement. It is evidence for further testing, not a proposal.

## Implication

The exact query is the right default for the data we have and well beyond it (to roughly ten times as many points). If the point
count grows past tens of thousands, the first optimisation to test is the candidate strategy above, with its exact re-rank and
a disagreement test in CI, not a change to the model. Whatever the database costs, the deployed latency still has to be measured
through the Worker and Hyperdrive (`tests/deployed-path/`).

## The statement the Worker sends

The document above measures the verified places query (`NEARBY_SPATIAL_SQL`). The Worker no longer sends that alone: it sends `NEARBY_LABELLED_SQL`, which embeds it and adds the publication label in the same statement (a lookup of the manifest row, the SHA-256 of its 10.6 KB text, a union and an outer sort of at most 26 rows), so that a cache miss is one Hyperdrive statement instead of three. The harness can benchmark that statement (`--statement labelled`) and can reproduce the database-side work of the old miss path (`--statement multi`: the manifest read, the places query and the manifest read, as three statements of one transaction; it leaves out the two extra network round trips a deployed miss also paid). 10,000 blocks, 10 s per scenario after a 2 s warm-up, 1 and 8 clients, the three modes run back to back on the same machine; milliseconds, p50 / p99. Raw results: [`postgis-nearby-statement-comparison-2026-10-10.report.json`](postgis-nearby-statement-comparison-2026-10-10.report.json).

| Scenario     | Clients | places only: p50 / p99 | labelled (one statement): p50 / p99 | old flow (three statements): p50 / p99 |
| ------------ | ------: | ---------------------- | ----------------------------------- | -------------------------------------- |
| blocks-r100  |       1 | 0.28 / 0.33            | 0.39 / 0.45                         | 0.39 / 0.46                            |
| blocks-r100  |       8 | 0.50 / 0.83            | 0.74 / 1.31                         | 0.72 / 1.42                            |
| blocks-r500  |       1 | 0.33 / 0.44            | 0.44 / 0.55                         | 0.44 / 0.63                            |
| blocks-r500  |       8 | 0.59 / 1.10            | 0.88 / 1.47                         | 0.78 / 1.42                            |
| blocks-r1000 |       1 | 0.45 / 0.75            | 0.57 / 0.87                         | 0.57 / 0.87                            |
| blocks-r1000 |       8 | 0.89 / 1.97            | 1.29 / 2.66                         | 0.94 / 1.91                            |
| blocks-r2500 |       1 | 1.17 / 2.31            | 1.28 / 2.41                         | 1.29 / 2.46                            |
| blocks-r2500 |       8 | 2.17 / 4.65            | 2.68 / 5.34                         | 2.30 / 4.74                            |
| exits-r100   |       1 | 0.25 / 0.49            | 0.36 / 0.41                         | 0.36 / 0.43                            |
| exits-r100   |       8 | 0.45 / 0.74            | 0.69 / 1.08                         | 0.60 / 0.93                            |
| exits-r500   |       1 | 0.25 / 0.32            | 0.36 / 0.41                         | 0.37 / 0.44                            |
| exits-r500   |       8 | 0.47 / 0.73            | 0.69 / 1.11                         | 0.60 / 0.96                            |
| exits-r1000  |       1 | 0.26 / 0.30            | 0.36 / 0.42                         | 0.38 / 0.49                            |
| exits-r1000  |       8 | 0.48 / 0.90            | 0.69 / 1.03                         | 0.63 / 1.17                            |
| exits-r2500  |       1 | 0.28 / 0.35            | 0.39 / 0.44                         | 0.39 / 0.47                            |
| exits-r2500  |       8 | 0.52 / 0.93            | 0.73 / 1.17                         | 0.65 / 1.05                            |
| all-r100     |       1 | 0.29 / 0.52            | 0.40 / 0.55                         | 0.40 / 0.49                            |
| all-r100     |       8 | 0.53 / 1.01            | 0.77 / 1.25                         | 0.70 / 1.25                            |
| all-r500     |       1 | 0.34 / 0.44            | 0.45 / 0.56                         | 0.45 / 0.57                            |
| all-r500     |       8 | 0.61 / 1.08            | 0.87 / 1.49                         | 0.79 / 1.35                            |
| all-r1000    |       1 | 0.47 / 0.77            | 0.58 / 0.89                         | 0.59 / 0.99                            |
| all-r1000    |       8 | 0.89 / 1.75            | 1.29 / 2.23                         | 1.19 / 3.13                            |
| all-r2500    |       1 | 1.20 / 2.33            | 1.33 / 2.48                         | 1.51 / 4.81                            |
| all-r2500    |       8 | 2.45 / 5.19            | 2.97 / 5.83                         | 2.75 / 7.68                            |

- **Against the places-only query, the labelled statement costs about 0.1 ms more.** Geometric-mean p50 ratio 1.37 (1.32 at one client, 1.42 at eight). The plan is the same inside; the manifest branch takes about 0.14 ms in `EXPLAIN (ANALYZE)`: fetching the 10 KB document, rendering it as text and hashing it.
- **Against the old flow's database-side work it costs about the same.** Geometric-mean p50 ratio 1.05 (range 0.88 to 1.37); the old flow was 1.30 over places-only. Replacing two manifest reads by one hash costs about what the second read cost.
- So the saving is not database CPU. It is what surrounds it: two Hyperdrive statements out of a shared daily allowance, two network round trips, and about 21 KB of transfer out of Neon per miss. At the daily ceiling (10,000 misses) the extra database time is about 1.4 s a day.
- **Caveats.** A first pair of runs, made while other work was running on the same machine, showed larger gaps at eight clients (up to 2× on the blocks scenarios); they are discarded because that work disturbed them, and the harness cannot see load outside PostgreSQL. The figures here have no row flagged as disturbed by another PostgreSQL session but the machine was not otherwise idle for the whole of the three passes (short lint, format and unit-test runs overlapped), so treat differences under about 20% as noise. Everything in the first sections of this document used the places-only query and is unaffected.

## Reproduce

```bash
PG_BIN=/path/to/postgres/bin PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres \
  node --import tsx scripts/bench-postgis/run.mjs --out /tmp/bench --sizes 10000,100000,1000000 --seconds 15 --clients 1,8
node scripts/bench-postgis/render.mjs /tmp/bench/report.json
# the statement the Worker sends, and the old three-statement miss path, at one size:
node --import tsx scripts/bench-postgis/run.mjs --out /tmp/bench-labelled --sizes 10000 --seconds 10 --statement labelled
node --import tsx scripts/bench-postgis/run.mjs --out /tmp/bench-multi --sizes 10000 --seconds 10 --statement multi
```

An earlier run on the same machine had more rows disturbed by another process using the same PostgreSQL cluster (its harness did
not yet repeat disturbed runs); the rows that were clean in both runs agree to within noise.

## Environment

- Run at 2026-10-09T19:57:17.346Z on 10 cores, 16 GiB RAM, Apple M5 (Darwin 27.0.0), Node v24.21.0.
- PostgreSQL 18.6 / PostGIS 3.6.3 / GEOS 3.14.1 / PROJ 9.7.1; pgbench (PostgreSQL) 18.6 (Postgres.app).
- Server settings (defaults of the local cluster, not tuned): effective_cache_size=4193288kB, fsync=on, jit=on, max_connections=100, max_parallel_workers_per_gather=2, random_page_cost=4, shared_buffers=163848kB, synchronous_commit=on, work_mem=4096kB.
- 15 s per scenario and client count after a 2 s discarded warm-up; clients 1 and 8; protocol `simple`; pgbench on the same machine over loopback.

## 10,000 blocks

Built in 1 s; blocks, block points and POIs with their indexes occupy 5 MB. The query reads the shipped SQL (`NEARBY_SPATIAL_SQL`) with a block-derived centre.

| Scenario     | Clients | Samples | p50 ms | p95 ms | p99 ms | max ms |   TPS | Other sessions before/after | Attempts |
| ------------ | ------: | ------: | -----: | -----: | -----: | -----: | ----: | --------------------------: | -------: |
| blocks-r100  |       1 |   49877 |   0.30 |   0.31 |   0.32 |   15.9 |  3324 |                         0/0 |        1 |
| blocks-r100  |       8 |  307893 |   0.32 |   0.55 |   0.58 |   24.0 | 20520 |                         0/0 |        1 |
| blocks-r500  |       1 |   42432 |   0.35 |   0.41 |   0.44 |   16.9 |  2827 |                         0/0 |        1 |
| blocks-r500  |       8 |  249597 |   0.43 |   0.72 |   0.81 |   27.8 | 16636 |                         0/0 |        2 |
| blocks-r1000 |       1 |   31623 |   0.47 |   0.67 |   0.74 |   16.7 |  2107 |                         0/0 |        1 |
| blocks-r1000 |       8 |  168104 |   0.65 |   1.23 |   1.52 |   25.2 | 11204 |                         0/0 |        1 |
| blocks-r2500 |       1 |   12712 |   1.15 |   1.91 |   2.23 |   18.6 |   847 |                         0/0 |        1 |
| blocks-r2500 |       8 |   59806 |   1.88 |   3.75 |   4.77 |   31.2 |  3985 |                         0/0 |        1 |
| exits-r100   |       1 |   53270 |   0.28 |   0.29 |   0.30 |   12.7 |  3550 |                         0/0 |        1 |
| exits-r100   |       8 |  313988 |   0.34 |   0.50 |   0.55 |   19.3 | 20927 |                         0/0 |        1 |
| exits-r500   |       1 |   53039 |   0.28 |   0.29 |   0.30 |   12.7 |  3534 |                         0/0 |        1 |
| exits-r500   |       8 |  309987 |   0.34 |   0.51 |   0.57 |   35.9 | 20657 |                         0/0 |        1 |
| exits-r1000  |       1 |   52000 |   0.28 |   0.31 |   0.33 |   16.3 |  3465 |                         0/0 |        1 |
| exits-r1000  |       8 |  309139 |   0.34 |   0.51 |   0.54 |   26.9 | 20606 |                         0/0 |        1 |
| exits-r2500  |       1 |   49096 |   0.30 |   0.33 |   0.34 |   16.5 |  3271 |                         0/0 |        1 |
| exits-r2500  |       8 |  287848 |   0.37 |   0.56 |   0.60 |   24.8 | 19186 |                         0/0 |        1 |
| all-r100     |       1 |   47168 |   0.31 |   0.34 |   0.37 |   16.7 |  3143 |                         0/0 |        1 |
| all-r100     |       8 |  288006 |   0.35 |   0.56 |   0.59 |   29.9 | 19195 |                         0/0 |        2 |
| all-r500     |       1 |   41316 |   0.36 |   0.42 |   0.46 |   16.6 |  2753 |                         0/0 |        1 |
| all-r500     |       8 |  236859 |   0.46 |   0.74 |   0.83 |   26.4 | 15787 |                         0/0 |        1 |
| all-r1000    |       1 |   29952 |   0.49 |   0.71 |   0.79 |   16.5 |  1996 |                         0/0 |        1 |
| all-r1000    |       8 |  162722 |   0.68 |   1.26 |   1.55 |   26.1 | 10843 |                         0/0 |        1 |
| all-r2500    |       1 |   12163 |   1.20 |   1.99 |   2.31 |   17.3 |   811 |                         0/0 |        1 |
| all-r2500    |       8 |   58379 |   1.93 |   3.80 |   4.89 |   28.8 |  3890 |                         0/0 |        1 |

Candidate strategy for blocks at 1,500 m over 2000 centres: exact `ST_DWithin` 0.136 ms per query; the 100 nearest by the `<->` operator then exact filter and order 0.184 ms per query; the KNN result differed from the exact one for 0 centres and returned fewer rows for 0.

## 100,000 blocks

Built in 4 s; blocks, block points and POIs with their indexes occupy 48 MB. The query reads the shipped SQL (`NEARBY_SPATIAL_SQL`) with a block-derived centre.

| Scenario     | Clients | Samples | p50 ms | p95 ms | p99 ms | max ms |   TPS | Other sessions before/after | Attempts |
| ------------ | ------: | ------: | -----: | -----: | -----: | -----: | ----: | --------------------------: | -------: |
| blocks-r100  |       1 |   42372 |   0.35 |   0.40 |   0.43 |   17.7 |  2823 |                         0/0 |        1 |
| blocks-r100  |       8 |  245108 |   0.44 |   0.69 |   0.76 |   24.6 | 16335 |                         0/0 |        1 |
| blocks-r500  |       1 |   17334 |   0.82 |   1.50 |   1.76 |   17.3 |  1155 |                         0/0 |        1 |
| blocks-r500  |       8 |   86480 |   1.27 |   2.62 |   3.52 |   26.4 |  5763 |                         0/0 |        1 |
| blocks-r1000 |       1 |    6356 |   2.20 |   4.67 |   5.59 |   17.6 |   424 |                         0/0 |        1 |
| blocks-r1000 |       8 |   31057 |   3.53 |   7.99 |   10.9 |   29.9 |  2069 |                         0/0 |        1 |
| blocks-r2500 |       1 |    1366 |   10.8 |   20.2 |   24.1 |   32.4 |    91 |                         0/0 |        1 |
| blocks-r2500 |       8 |    6284 |   18.3 |   35.7 |   41.2 |   50.5 |   418 |                         0/0 |        1 |
| exits-r100   |       1 |   51743 |   0.29 |   0.30 |   0.31 |   16.9 |  3448 |                         0/0 |        1 |
| exits-r100   |       8 |  308942 |   0.34 |   0.52 |   0.55 |   20.8 | 20580 |                         0/0 |        1 |
| exits-r500   |       1 |   49462 |   0.30 |   0.32 |   0.34 |   16.6 |  3296 |                         0/0 |        1 |
| exits-r500   |       8 |  296407 |   0.35 |   0.55 |   0.58 |   23.9 | 19748 |                         0/0 |        1 |
| exits-r1000  |       1 |   45215 |   0.33 |   0.36 |   0.39 |   16.8 |  3013 |                         0/0 |        1 |
| exits-r1000  |       8 |  268599 |   0.39 |   0.61 |   0.66 |   27.9 | 17899 |                         0/0 |        1 |
| exits-r2500  |       1 |   27415 |   0.55 |   0.63 |   0.68 |   17.2 |  1826 |                         0/0 |        1 |
| exits-r2500  |       8 |  148239 |   0.73 |   1.16 |   1.30 |   52.6 |  9878 |                         0/0 |        1 |
| all-r100     |       1 |   41316 |   0.36 |   0.41 |   0.44 |   17.0 |  2753 |                         0/0 |        1 |
| all-r100     |       8 |  241750 |   0.44 |   0.71 |   0.78 |   24.1 | 16110 |                         0/0 |        1 |
| all-r500     |       1 |   16727 |   0.85 |   1.55 |   1.81 |   18.6 |  1115 |                         0/0 |        1 |
| all-r500     |       8 |   82076 |   1.34 |   2.75 |   3.62 |   29.4 |  5469 |                         0/0 |        2 |
| all-r1000    |       1 |    6144 |   2.28 |   4.82 |   5.71 |   16.8 |   409 |                         0/0 |        1 |
| all-r1000    |       8 |   29528 |   3.73 |   8.27 |   11.2 |   98.3 |  1967 |                         0/0 |        1 |
| all-r2500    |       1 |    1285 |   11.3 |   21.3 |   24.9 |   41.5 |    86 |                         0/0 |        1 |
| all-r2500    |       8 |    5974 |   19.2 |   36.6 |   43.4 |    105 |   397 |                         0/0 |        1 |

Candidate strategy for blocks at 1,500 m over 2000 centres: exact `ST_DWithin` 1.087 ms per query; the 100 nearest by the `<->` operator then exact filter and order 0.267 ms per query; the KNN result differed from the exact one for 0 centres and returned fewer rows for 0.

## 1,000,000 blocks

Built in 41 s; blocks, block points and POIs with their indexes occupy 487 MB. The query reads the shipped SQL (`NEARBY_SPATIAL_SQL`) with a block-derived centre.

| Scenario       | Clients | Samples | p50 ms | p95 ms | p99 ms | max ms |   TPS | Other sessions before/after | Attempts |
| -------------- | ------: | ------: | -----: | -----: | -----: | -----: | ----: | --------------------------: | -------: |
| blocks-r100 ⚠  |       1 |    9235 |   1.51 |   2.83 |   3.52 |   27.7 |   615 |                         5/6 |        4 |
| blocks-r100    |       8 |   80185 |   1.42 |   2.58 |   3.18 |   33.6 |  5343 |                         0/0 |        2 |
| blocks-r500    |       1 |    1597 |   8.98 |   18.4 |   21.7 |   32.1 |   106 |                         0/0 |        1 |
| blocks-r500    |       8 |    7671 |   14.6 |   31.8 |   39.0 |   75.6 |   510 |                         0/0 |        1 |
| blocks-r1000   |       1 |     497 |   28.0 |   61.7 |   69.3 |   81.3 |    33 |                         0/0 |        1 |
| blocks-r1000   |       8 |    2394 |   47.6 |   98.4 |    119 |    133 |   159 |                         0/0 |        1 |
| blocks-r2500   |       1 |     108 |    132 |    264 |    280 |    321 |     7 |                         0/0 |        1 |
| blocks-r2500 ⚠ |       8 |     244 |    485 |    872 |   1028 |   1090 |    16 |                         5/7 |        4 |
| exits-r100     |       1 |   47854 |   0.31 |   0.33 |   0.34 |   20.7 |  3189 |                         0/0 |        3 |
| exits-r100     |       8 |  293979 |   0.34 |   0.56 |   0.60 |   26.8 | 19588 |                         0/0 |        1 |
| exits-r500     |       1 |   35969 |   0.41 |   0.47 |   0.51 |   16.8 |  2397 |                         0/0 |        1 |
| exits-r500     |       8 |  186923 |   0.58 |   0.91 |   1.85 |   27.3 | 12453 |                         0/0 |        1 |
| exits-r1000    |       1 |   19840 |   0.76 |   0.88 |   0.93 |   18.6 |  1322 |                         0/0 |        1 |
| exits-r1000    |       8 |  107899 |   1.02 |   1.64 |   1.80 |   29.4 |  7191 |                         0/0 |        1 |
| exits-r2500    |       1 |    4489 |   3.44 |   3.83 |   4.08 |   20.5 |   299 |                         0/0 |        1 |
| exits-r2500    |       8 |   17774 |   5.39 |   9.46 |   29.6 |    372 |  1184 |                         0/0 |        1 |
| all-r100       |       1 |   15754 |   0.91 |   1.55 |   1.80 |   27.0 |  1050 |                         0/0 |        1 |
| all-r100       |       8 |   73242 |   1.55 |   2.83 |   3.52 |   31.5 |  4881 |                         0/0 |        1 |
| all-r500       |       1 |    1649 |   8.24 |   18.3 |   22.1 |   27.2 |   110 |                         0/0 |        1 |
| all-r500       |       8 |    6037 |   16.7 |   51.8 |   78.7 |    123 |   402 |                         0/0 |        1 |
| all-r1000      |       1 |     490 |   30.5 |   58.1 |   71.9 |   75.8 |    33 |                         0/0 |        1 |
| all-r1000      |       8 |    2330 |   49.0 |   99.9 |    119 |    183 |   154 |                         0/0 |        1 |
| all-r2500      |       1 |     102 |    141 |    260 |    305 |    316 |     7 |                         0/0 |        1 |
| all-r2500      |       8 |     490 |    241 |    425 |    497 |    517 |    32 |                         0/0 |        1 |

Candidate strategy for blocks at 1,500 m over 2000 centres: exact `ST_DWithin` 10.724 ms per query; the 100 nearest by the `<->` operator then exact filter and order 0.509 ms per query; the KNN result differed from the exact one for 0 centres and returned fewer rows for 0.
