import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";
import { connect, csvCell, save, TABLES, SCRATCH } from "./common.mjs";
const source = new DatabaseSync(`${SCRATCH}/source.sqlite`, { readOnly: true });
const { client, connectionMs } = await connect();
const evidence = {
  branch: "br-wispy-boat-b34glczl",
  startedAt: new Date().toISOString(),
  connectionMs,
  tables: [],
  inputBytes: 0,
};
try {
  const existing = await client.query("SELECT to_regclass('public.transactions') AS existing");
  if (existing.rows[0].existing) {
    for (const table of TABLES)
      if (Number((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n))
        throw new Error("Preserve nonempty benchmark data; no overwrite");
    // The initial failed COPY left the isolated schema empty; correct SQLite-affinity types before resuming.
    await client.query("ALTER TABLE transactions ALTER COLUMN resale_price TYPE double precision");
    await client.query("ALTER TABLE blocks ALTER COLUMN median_price TYPE double precision");
    await client.query(
      "ALTER TABLE town_flat_type_trends ALTER COLUMN median_price TYPE double precision",
    );
  } else {
    await client.query("BEGIN");
    await client.query(readFileSync("scripts/neon-benchmark/schema.sql", "utf8"));
    await client.query("COMMIT");
  }
  for (const table of TABLES) {
    const columns = source
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((r) => r.name);
    let count = 0,
      bytes = 0;
    const started = performance.now();
    function* rows() {
      for (const row of source.prepare(`SELECT ${columns.join(",")} FROM ${table}`).iterate()) {
        const line = columns.map((c) => csvCell(row[c])).join(",") + "\n";
        count++;
        bytes += Buffer.byteLength(line);
        yield line;
      }
    }
    await client.query("BEGIN");
    await pipeline(
      Readable.from(rows()),
      client.query(copyFrom(`COPY ${table} (${columns.join(",")}) FROM STDIN WITH (FORMAT csv)`)),
    );
    await client.query("COMMIT");
    evidence.tables.push({
      table,
      rows: count,
      inputBytes: bytes,
      wallMs: performance.now() - started,
    });
    evidence.inputBytes += bytes;
    save("import", evidence);
    console.log(JSON.stringify(evidence.tables.at(-1)));
  }
  await client.query(
    "SELECT setval(pg_get_serial_sequence('transactions','id'),(SELECT max(id) FROM transactions),true)",
  );
  const analyze = performance.now();
  await client.query("ANALYZE");
  evidence.analyzeMs = performance.now() - analyze;
  evidence.finishedAt = new Date().toISOString();
  save("import", evidence);
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(JSON.stringify({ code: error.code, message: error.message, where: error.where }));
  throw new Error(`Benchmark import failed (${error.code ?? error.name}); credentials withheld`, {
    cause: error,
  });
} finally {
  source.close();
  await client.end();
}
