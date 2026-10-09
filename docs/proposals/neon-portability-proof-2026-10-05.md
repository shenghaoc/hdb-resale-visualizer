# Neon portability proof — 2026-10-05

**The fixed-workload portability estimate passes; remote publication remains subject to the frozen publisher's admission checks.** The user accepted the completed local 226,501,152 B durable-growth/raw-WAL model and requested this narrow portability check. This report supersedes the pending portability conclusion in the previous storage investigation. No publisher implementation, resource guard or production database changed.

Complete settings, relation/index/TOAST catalogs, source identities and nine read-only SQL receipts are in [structured evidence](../evidence/neon-portability-proof-2026-10-05.json). The exact isolated target is benchmark-d1-migration / br-wispy-boat-b34glczl, project wispy-mouse-67963002, AWS Singapore. Control-plane metadata confirms Free v3, a 1,073,741,824 B branch limit, six-hour history retention and maximum 1 CU. Zero usage counters returned by the API are not accepted as live remaining quota.

## PostgreSQL comparison

| Setting                  | Local measurement | Neon benchmark |
| ------------------------ | ----------------- | -------------- |
| PostgreSQL/platform      | 18.6 / ARM64      | 18.6 / ARM64   |
| Block size               | 8,192 B           | 8,192 B        |
| Native TOAST compression | pglz              | pglz           |
| WAL level                | replica           | replica        |
| WAL compression          | off               | off            |
| Full page writes         | on                | off            |
| WAL hint logging         | off               | off            |
| Checksums                | on                | on             |
| Checkpoint timeout       | 30 minutes        | 5 minutes      |
| Maximum WAL size         | 4 GiB             | 1 GiB          |
| Work memory              | 4 MiB             | 4 MiB          |
| Autovacuum               | off               | on             |

All affected columns have matching native types and storage policy. Index definitions, default fill factors, replica identity and relation persistence match. The four transaction indexes have exactly matching allocated sizes. The remote database is 418,480,128 B; details and comparisons have larger existing allocations. Those allocations are not assumed to be reusable free space.

| Relation      |      Heap B |   Indexes B |    TOAST B |     Total B |
| ------------- | ----------: | ----------: | ---------: | ----------: |
| transactions  | 158,924,800 | 129,376,256 |      8,192 | 288,374,784 |
| blocks        |  11,534,336 |   1,089,536 |      8,192 |  12,664,832 |
| block_details |   2,506,752 |     901,120 | 72,826,880 |  76,267,520 |
| comparisons   |  23,609,344 |     901,120 |      8,192 |  24,551,424 |
| trends        |   3,784,704 |   2,138,112 |      8,192 |   5,963,776 |
| manifest      |       8,192 |      16,384 |     57,344 |      81,920 |

Totals include relation auxiliary forks. The evidence lists every affected table, index, TOAST object and column individually.

## WAL portability

The shorter checkpoint interval does not introduce ordinary checkpoint-dependent full page images when full_page_writes is off. Neon also changes XLogHintBitIsNeeded to depend on wal_log_hints alone, so checksums do not re-enable hint images here. WAL consistency checking is empty; no active physical base backup was observed. Neon reconstructs compute base backups through the pageserver. No compression discount is taken for generated WAL.

Neon's B-tree split path can explicitly force the original/left page image during an overlapping vacuum cycle; the right page uses WILL_INIT. This is separately reserved. The frozen ingestion locks conflict with main-table autovacuum. TOAST indexes receive their own conservative allowance because TOAST vacuum can be independent.

For both attempts, charge the full uncompressed native stage JSONB bytes as possible final values, all per-datum chunk rounding, and an extra 1 MiB manifest. This yields at most 105,080 TOAST chunks per attempt. The four affected TOAST indexes have 174 existing main pages. Charging up to 406 fixed tuples on every existing page and assuming at least 128 fixed entries per split child yields ceil((174 × 406 + 2 × 105,080) / 128) = 2,194 leaf pages. Add 128 internal-page allowances and charge every image 8,192 + 512 B: 20,210,688 B. A rounded **24 MiB combined reserve** exceeds that estimate. It does not require newly allocated OIDs to exceed existing IDs. The two 12 MiB arithmetic halves are not enforced per-attempt caps.

The ≥128-entry packing assumption is deliberately below normal capacity for fixed OID/int4 TOAST keys on 8 KiB pages. This is a fixed-workload engineering reserve, not a universal mathematical WAL ceiling for future workloads. Independent review supports this bounded pilot estimate and requires reporting any frozen admission failure.

| Component                                                                           |           Bytes |
| ----------------------------------------------------------------------------------- | --------------: |
| Accepted observed local durable + raw WAL                                           |     226,501,152 |
| Larger local reserve: permanent growth + two largest WAL phases + outside-phase WAL |     296,929,984 |
| Additional Neon forced-image reserve for both attempts                              |      25,165,824 |
| **Reserved persistent growth + raw WAL**                                            | **322,095,808** |
| Available durable allowance                                                         |     330,276,864 |
| **Remaining margin**                                                                |   **8,181,056** |

Compute-local TEMP remains separate: accepted capacity model 8,183,657,352 B (~7.62 GiB), against documented 20 GiB capacity at maximum 1 CU. The publisher's existing 256 MiB loaded-stage guard and its stricter admission formula remain unchanged. The first failure and subsequent success must each satisfy those predicates; the portability estimate does not bypass them.

Read-only inspection used nine commands across two connections: 16,123 received stream-proxy bytes and 14,288 sent bytes. These are transport proxies, not provider billing. No corpus reconciliation was repeated. Stale Console usage timestamps remain separate from this independently bounded pilot.

Primary references: [PostgreSQL 18 WAL settings](https://www.postgresql.org/docs/18/runtime-config-wal.html), [Neon hint-image condition](https://github.com/neondatabase/postgres/blob/REL_18_STABLE_neon/src/include/access/xlog.h), [Neon image registration](https://github.com/neondatabase/postgres/blob/REL_18_STABLE_neon/src/backend/access/transam/xloginsert.c), [Neon B-tree split logging](https://github.com/neondatabase/postgres/blob/REL_18_STABLE_neon/src/backend/access/nbtree/nbtinsert.c), [Neon core architecture](https://github.com/neondatabase/neon/blob/main/docs/core_changes.md), [compute capacity](https://neon.com/docs/manage/computes), [history window](https://neon.com/docs/postgres/backup-restore/history-window). Captured public source digests are preserved; they are behavioral references, not a claim to possess the exact hosted build source.

No production cutover, scheduled refresh, push, PR or merge is authorized by this proof. Overall long-term assessment remains **NEON FREE IS MARGINAL** until practical compute/transfer and storage runway are resolved.
