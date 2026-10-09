// Four bounded read-only requests; no owner connection or manifest changes.
import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { SCRATCH, save } from "./common.mjs";
const phase = process.argv[2];
if (!["before-refresh", "after-refresh"].includes(phase))
  throw new Error("Explicit phase required");
const origin = "https://hdb-neon-benchmark-20261004.shenghaoc.workers.dev";
const token = JSON.parse(readFileSync(`${SCRATCH}/worker-secrets.json`, "utf8")).BENCHMARK_TOKEN;
const records = [];
async function probe(name, path, method = "GET") {
  const start = performance.now();
  const response = await fetch(origin + path, {
    method,
    headers: { "x-benchmark-token": token, "x-benchmark-backend": "hyperdrive" },
  });
  const text = await response.text();
  const record = {
    name,
    status: response.status,
    at: new Date().toISOString(),
    wallMs: performance.now() - start,
    cache: response.headers.get("x-data-cache"),
    colo: response.headers.get("x-benchmark-colo"),
    calls: response.headers.has("x-benchmark-db-calls")
      ? Number(response.headers.get("x-benchmark-db-calls"))
      : null,
    returnedRows: Number(response.headers.get("x-benchmark-rows-returned")),
    queryMs: Number(response.headers.get("x-benchmark-query-ms")),
    connectMs: Number(response.headers.get("x-benchmark-connect-ms")),
    responseBytes: Buffer.byteLength(text),
    sha256: crypto.createHash("sha256").update(text).digest("hex"),
  };
  records.push(record);
  save(`worker-cache-${phase}`, {
    phase,
    records,
    success: false,
    limitation:
      "Instrumented SQL calls and returned rows, not provider billing. Cache API is POP-local.",
  });
  console.log(JSON.stringify(record));
  if (response.status !== 200) throw new Error(`Bounded Worker request failed: ${response.status}`);
  return { record, body: JSON.parse(text) };
}
await probe("remove-pointer", "/control/pointer", "DELETE");
// A valid unique semantic cache key avoids assuming a deleted deployment cleared Cache API.
const budget = 700000 + crypto.randomInt(100000);
const path = `/api/search?town=BEDOK&flatType=4%20ROOM&budgetMax=${budget}`;
const cold = await probe("cold-public-get", path);
const warm = await probe("immediate-identical-public-get", path);
if (
  cold.record.cache !== "MISS" ||
  cold.record.calls !== 3 ||
  warm.record.cache !== "HIT" ||
  warm.record.calls !== 0 ||
  warm.record.queryMs !== 0 ||
  warm.record.connectMs !== 0 ||
  cold.record.sha256 !== warm.record.sha256 ||
  cold.record.colo !== warm.record.colo
)
  throw new Error("Cold/warm cache safety acceptance failed");
const role = await probe("verify-existing-readonly-role", "/direct/role");
const permissions = role.body.rows[0];
if (
  permissions.role !== "hdb_benchmark_runtime" ||
  !permissions.public_read ||
  permissions.rolsuper ||
  permissions.rolcreatedb ||
  permissions.rolcreaterole ||
  permissions.elevated ||
  permissions.fact_write ||
  permissions.private_access
)
  throw new Error("Existing runtime role safety acceptance failed");
save(`worker-cache-${phase}`, {
  phase,
  records,
  permissions,
  success: true,
  totalInstrumentedSQLCalls: records.reduce((n, r) => n + (r.calls ?? 0), 0),
  limitation:
    "SQL calls/returned rows are instrumentation, not Neon billed transfer or Hyperdrive billable query counts. Same-POP warm hit only; no global hit-rate extrapolation.",
});
