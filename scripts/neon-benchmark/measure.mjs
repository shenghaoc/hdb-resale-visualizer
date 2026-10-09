import { connect, save, TABLES } from "./common.mjs";
const { client, connectionMs } = await connect();
try {
  const size = await client.query(
    "SELECT pg_database_size(current_database())::bigint AS database_bytes",
  );
  const objects = await client.query(`SELECT c.relname AS object,
    (pg_table_size(c.oid)-CASE WHEN c.reltoastrelid=0 THEN 0 ELSE pg_total_relation_size(c.reltoastrelid) END)::bigint AS heap_bytes,
    pg_indexes_size(c.oid)::bigint AS index_bytes,
    CASE WHEN c.reltoastrelid=0 THEN 0 ELSE pg_total_relation_size(c.reltoastrelid) END::bigint AS toast_bytes,
    pg_total_relation_size(c.oid)::bigint AS total_bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY total_bytes DESC`);
  const indexes = await client.query(
    "SELECT indexrelname,relname,pg_relation_size(indexrelid)::bigint AS bytes FROM pg_stat_user_indexes ORDER BY bytes DESC",
  );
  const counts = {};
  for (const table of [...TABLES, "shortlists"])
    counts[table] = Number((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
  const storage = {
    at: new Date().toISOString(),
    connectionMs,
    databaseBytes: Number(size.rows[0].database_bytes),
    objects: objects.rows,
    indexes: indexes.rows,
    counts,
    limitBytes: 1073741824,
  };
  storage.headroomBytes = storage.limitBytes - storage.databaseBytes;
  storage.percentUsed = (100 * storage.databaseBytes) / storage.limitBytes;
  save("storage", storage);
  console.log(JSON.stringify(storage));
  if (storage.percentUsed >= 90) {
    console.log("STORAGE GATE: stop; inadequate free runway");
    process.exitCode = 2;
  } else {
    const example = (
      await client.query(
        "SELECT town,block,street_name,flat_type,address_key FROM transactions ORDER BY id DESC LIMIT 1",
      )
    ).rows[0];
    const b = (
      await client.query(
        "SELECT address_key FROM blocks WHERE town=$1 ORDER BY address_key LIMIT 1",
        [example.town],
      )
    ).rows[0];
    const queries = [
      ["full_blocks", "SELECT * FROM blocks ORDER BY median_price DESC,transaction_count DESC", []],
      [
        "town_blocks",
        "SELECT * FROM blocks WHERE town=$1 ORDER BY median_price DESC,transaction_count DESC",
        [example.town],
      ],
      ["all_trends", "SELECT * FROM town_flat_type_trends ORDER BY town,flat_type,month", []],
      [
        "town_search",
        "SELECT * FROM blocks WHERE town=$1 ORDER BY address_key LIMIT 2001",
        [example.town],
      ],
      [
        "flat_type_budget_search",
        "SELECT * FROM blocks WHERE flat_types_json ? $1 AND COALESCE((median_price_by_flat_type_json->>$1)::integer,median_price) BETWEEN $2 AND $3 ORDER BY address_key LIMIT 2001",
        ["4 ROOM", 400000, 700000],
      ],
      [
        "suggest_dictionary",
        "SELECT address_key,town,block,street_name,postal_code FROM blocks WHERE address_key>$1 ORDER BY address_key LIMIT 5000",
        [""],
      ],
      [
        "comparable_block",
        "SELECT * FROM transactions WHERE town=$1 AND block=$2 AND flat_type=$3 ORDER BY month DESC LIMIT 150",
        [example.town, example.block, example.flat_type],
      ],
      [
        "comparable_street",
        "SELECT * FROM transactions WHERE street_name=$1 AND flat_type=$2 ORDER BY month DESC LIMIT 150",
        [example.street_name, example.flat_type],
      ],
      [
        "comparable_town",
        "SELECT * FROM transactions WHERE town=$1 AND flat_type=$2 ORDER BY month DESC LIMIT 150",
        [example.town, example.flat_type],
      ],
      [
        "count_comparable_town",
        "SELECT count(*) FROM transactions WHERE town=$1 AND flat_type=$2",
        [example.town, example.flat_type],
      ],
      ["detail_lookup", "SELECT json FROM block_details WHERE address_key=$1", [b.address_key]],
      ["comparison_lookup", "SELECT json FROM comparisons WHERE address_key=$1", [b.address_key]],
      ["manifest", "SELECT json FROM manifest WHERE id=1", []],
      ["reconciliation_page", "SELECT * FROM transactions WHERE id>$1 ORDER BY id LIMIT 5000", [0]],
    ];
    const measurements = [];
    for (const [name, sql, params] of queries) {
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const t = performance.now();
        if (typeof sql !== "string") throw new Error("Expected benchmark SQL string");
        const result = await client.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${sql}`, params);
        const plan = result.rows[0]["QUERY PLAN"][0];
        runs.push({
          wallMs: performance.now() - t,
          sqlMs: plan["Execution Time"],
          planningMs: plan["Planning Time"],
          rows: plan.Plan["Actual Rows"],
          plan: plan.Plan,
        });
      }
      measurements.push({ name, sql, params, runs });
      console.log(
        JSON.stringify({
          name,
          sqlMs: runs.map((r) => r.sqlMs),
          rows: runs[0].rows,
          scan: runs[0].plan["Node Type"],
        }),
      );
    }
    save("queries", {
      at: new Date().toISOString(),
      connectionMs,
      measurements,
      note: "First measured execution versus repeats; not a compute-suspension/cold-buffer claim",
    });
  }
} finally {
  await client.end();
}
