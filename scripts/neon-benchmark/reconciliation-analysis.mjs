// Local investigation only: uses retained receipts/snapshot; performs no database/network mutation.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { SCRATCH, save, TABLES } from "./common.mjs";
const source = new DatabaseSync(`${SCRATCH}/source.sqlite`, { readOnly: true });
const receipt = JSON.parse(readFileSync(`${SCRATCH}/reconciliation.json`, "utf8"));
function decimal(n) {
  const s = String(n);
  if (!/[eE]/.test(s)) return s;
  const [m, e] = s.split(/[eE]/),
    negative = m.startsWith("-"),
    unsigned = negative ? m.slice(1) : m;
  const digits = unsigned.replace(".", ""),
    point = (unsigned.indexOf(".") < 0 ? unsigned.length : unsigned.indexOf(".")) + Number(e);
  return (
    (negative ? "-" : "") +
    (point <= 0
      ? "0." + "0".repeat(-point) + digits
      : point >= digits.length
        ? digits + "0".repeat(point - digits.length)
        : digits.slice(0, point) + "." + digits.slice(point))
  );
}
function jsonb(v) {
  if (v === null) return "null";
  if (typeof v === "number") return decimal(v);
  if (Array.isArray(v)) return "[" + v.map(jsonb).join(", ") + "]";
  if (typeof v === "object")
    return (
      "{" +
      Object.keys(v)
        .sort(
          (a, b) =>
            Buffer.byteLength(a) - Buffer.byteLength(b) ||
            Buffer.compare(Buffer.from(a), Buffer.from(b)),
        )
        .map((k) => JSON.stringify(k) + ": " + jsonb(v[k]))
        .join(", ") +
      "}"
    );
  return JSON.stringify(v);
}
function field(c, v) {
  if (v === null) return null;
  if (c === "json" || c.endsWith("_json")) return jsonb(JSON.parse(v));
  if (c.endsWith("_at")) {
    const iso = new Date(v).toISOString();
    return iso
      .replace("T", " ")
      .replace(/\.000Z$/, "+00")
      .replace(/(\.\d*?[1-9])0*Z$/, "$1+00")
      .replace("Z", "+00");
  }
  return typeof v === "number" ? decimal(v) : String(v);
}
const modeled = [];
try {
  for (const table of TABLES) {
    const columns = source
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((r) => r.name);
    let rows = 0,
      bytes = 0;
    const partitions = { historicalBefore2017: 0, hot2017Onward: 0 };
    for (const row of source.prepare(`SELECT * FROM ${table}`).iterate()) {
      let n = 7 + 4 * columns.length;
      for (const c of columns) {
        const text = field(c, row[c]);
        if (text !== null) n += Buffer.byteLength(text);
      }
      rows++;
      bytes += n;
      if (table === "transactions")
        partitions[row.month < "2017-01" ? "historicalBefore2017" : "hot2017Onward"] += n;
    }
    const passes = receipt.records.filter((r) => r.table === table),
      queries = passes.reduce((n, r) => n + r.queries, 0),
      jsonBytes = passes.reduce((n, r) => n + r.jsonBytes, 0);
    modeled.push({
      table,
      rows,
      passes: passes.length,
      queries,
      measuredApplicationJsonBytes: jsonBytes,
      modeledDataRowBytesOnePass: bytes,
      modeledDataRowBytes: bytes * passes.length,
      ...(table === "transactions" ? { partitions } : {}),
    });
    console.log(JSON.stringify(modeled.at(-1)));
  }
  const bands = source
    .prepare(
      "SELECT CASE WHEN month<'2000-01' THEN '1990-1999' WHEN month<'2012-03' THEN '2000-2012-02' WHEN month<'2015-01' THEN '2012-03-2014' WHEN month<'2017-01' THEN '2015-2016' ELSE '2017-onward' END AS partition,count(*) AS rows FROM transactions GROUP BY partition ORDER BY partition",
    )
    .all();
  const duplicates = source
    .prepare(
      "SELECT count(*) AS distinct_tuples,sum(n-1) AS duplicate_extras,sum(CASE WHEN n>1 THEN 1 ELSE 0 END) AS duplicate_groups FROM (SELECT count(*) AS n FROM transactions GROUP BY month,town,block,street_name,address_key,flat_type,storey_range,floor_area_sqm,lease_commence_year,resale_price,flat_model)",
    )
    .get();
  const total = modeled.reduce((n, r) => n + r.modeledDataRowBytes, 0),
    wire = receipt.wireReceivedBytes;
  const result = {
    at: new Date().toISOString(),
    source:
      "Local retained original source.sqlite plus existing reconciliation.json only; no new full scan of any remote DB",
    measuredWireReceivedBytes: wire,
    measuredApplicationJsonBytes: receipt.returnedPayloadBytes,
    modeledDataRowBytes: total,
    unattributedBytes: wire - total,
    modeled,
    sourcePartitions: bands,
    duplicates,
    limits:
      "Modeled per-table PostgreSQL text DataRow framing and canonical JSONB formatting; excludes per-query/control/TLS framing. Aggregate stream.bytesRead is measured, not finalized Neon public-transfer billing. Partition metadata does not prove immutability.",
  };
  save("reconciliation-analysis", result);
  console.log(
    JSON.stringify({
      total,
      wire,
      unattributedBytes: wire - total,
      sourcePartitions: bands,
      duplicates,
    }),
  );
} finally {
  source.close();
}
