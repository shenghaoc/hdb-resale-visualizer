// Hash every logical field in the published benchmark, without exporting the corpus again.
// JSONB key order/numeric display is normalized locally to PostgreSQL's canonical representation.
import { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import { connect, SCRATCH, TABLES, save } from "./common.mjs";
const source = new DatabaseSync(`${SCRATCH}/planner.sqlite`, { readOnly: true });
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
function jsonb(value) {
  if (value === null) return "null";
  if (typeof value === "number") return decimal(value);
  if (Array.isArray(value)) return "[" + value.map(jsonb).join(", ") + "]";
  if (typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort(
          (a, b) =>
            Buffer.byteLength(a) - Buffer.byteLength(b) ||
            Buffer.compare(Buffer.from(a), Buffer.from(b)),
        )
        .map((k) => JSON.stringify(k) + ": " + jsonb(value[k]))
        .join(", ") +
      "}"
    );
  return JSON.stringify(value);
}
const { client } = await connect();
const measurements = [];
try {
  for (const table of TABLES) {
    const columns = source
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((r) => r.name)
      .filter((c) => c !== "updated_at"); // Timestamp metadata is independently changed by publication; all logical fields compared.
    const pgColumns = (
      await client.query(
        "SELECT column_name,udt_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2",
        ["public", table],
      )
    ).rows;
    const jsonColumns = new Set(
      pgColumns.filter((r) => r.udt_name === "jsonb").map((r) => r.column_name),
    );
    const keys =
      table === "transactions"
        ? ["id"]
        : table === "town_flat_type_trends"
          ? ["town", "flat_type", "month"]
          : table === "mrt_geojson"
            ? ["kind"]
            : table === "manifest"
              ? ["id"]
              : table.endsWith("_cache")
                ? ["cache_key"]
                : ["address_key"];
    let count = 0;
    const hash = crypto.createHash("md5");
    for (const row of source
      .prepare(`SELECT ${columns.join(",")} FROM ${table} ORDER BY ${keys.join(",")}`)
      .iterate()) {
      const encoded = columns
        .map((c) =>
          row[c] === null
            ? "\x1e"
            : jsonColumns.has(c)
              ? jsonb(JSON.parse(row[c]))
              : typeof row[c] === "number"
                ? decimal(row[c])
                : String(row[c]),
        )
        .join("\x1f");
      hash.update(crypto.createHash("md5").update(encoded).digest("hex"));
      count++;
    }
    const expressions = columns.map((c) => `COALESCE(${String(c)}::text,chr(30))`).join(",");
    const result = (
      await client.query(
        `SELECT count(*) AS n,md5(COALESCE(string_agg(md5(concat_ws(chr(31),${expressions})),'' ORDER BY ${keys.join(",")}),'')) AS hash FROM ${table}`,
      )
    ).rows[0];
    const expected = hash.digest("hex"),
      match = expected === result.hash && count === Number(result.n);
    measurements.push({
      table,
      rows: count,
      logicalColumns: columns,
      sourceHash: expected,
      postgresHash: result.hash,
      match,
    });
    console.log(JSON.stringify({ table, rows: count, match }));
    if (!match) throw new Error(`Logical field fidelity failed: ${table}`);
  }
  const role = (
    await client.query(
      "SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,pg_has_role(oid,'neon_superuser','member') AS superuser_member FROM pg_roles WHERE rolname='hdb_benchmark_runtime'",
    )
  ).rows[0];
  const prices = (
    await client.query(
      "SELECT count(*) AS n FROM transactions WHERE resale_price<>trunc(resale_price)",
    )
  ).rows[0];
  save("fidelity", {
    at: new Date().toISOString(),
    provenance:
      "Current synthetic publication versus authoritative local planner snapshot; original import used COPY from source.sqlite. All logical fields; updated_at metadata excluded.",
    measurements,
    runtimeRole: role,
    fractionalPrices: Number(prices.n),
  });
} finally {
  source.close();
  await client.end();
}
