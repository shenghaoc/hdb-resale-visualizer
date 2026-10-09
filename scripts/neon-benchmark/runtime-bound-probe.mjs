/** Explicit bounded isolated GET pilot. No retries, concurrency, production calls or retained bodies. */
import { readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
const root = ".neon-benchmark/runtime-canary";
const origin = "https://hdb-neon-benchmark-20261004.shenghaoc.workers.dev";
const token = JSON.parse(
  readFileSync(".neon-benchmark/worker-secrets.json", "utf8"),
).BENCHMARK_TOKEN;
const resource = JSON.parse(readFileSync(".neon-benchmark/worker-resource.json", "utf8"));
if (resource.branch !== "br-wispy-boat-b34glczl" || !resource.cachingDisabled)
  throw Error("Isolated branch/caching guard");
const deadline = Date.parse(resource.createdAt) + 12 * 60_000;
const receipt = {
  startedAtUTC: new Date().toISOString(),
  bounds: {
    maximumGETs: 32,
    receivedBytes: 100_000_000,
    admissionBytes: 80_000_000,
    inFlightReserve: 20_000_000,
    maximumCU: 1,
    maximumCUHours: 0.25,
    maximumOutstanding: 1,
  },
  records: [],
  receivedBytes: 0,
  attemptedGETs: 0,
};
const persist = () =>
  writeFileSync(`${root}/aggregate-runtime-pilot.json`, JSON.stringify(receipt, null, 2));
async function probe(name, path, bound, mode = "cold", expected = 200) {
  if (
    receipt.attemptedGETs >= 32 ||
    receipt.receivedBytes + bound > 80_000_000 ||
    bound > 20_000_000 ||
    Date.now() + 60_000 > deadline
  )
    throw Error("Pilot admission refused; no limit is raised");
  receipt.attemptedGETs++;
  persist();
  const started = performance.now();
  const response = await fetch(origin + path, {
    headers: { "x-benchmark-token": token, "x-benchmark-mode": mode },
    signal: AbortSignal.timeout(60_000),
  });
  const record = {
    name,
    path,
    mode,
    admittedBoundBytes: bound,
    atUTC: new Date().toISOString(),
    status: response.status,
    cache: response.headers.get("x-data-cache"),
    colo: response.headers.get("x-benchmark-colo"),
    receivedBytes: response.headers.has("x-benchmark-received-bytes")
      ? Number(response.headers.get("x-benchmark-received-bytes"))
      : null,
    queries: JSON.parse(response.headers.get("x-benchmark-queries") ?? "null"),
    connectMs: Number(response.headers.get("x-benchmark-connect-ms")),
    handlerMs: Number(response.headers.get("x-benchmark-handler-ms")),
    wallMs: 0,
    responseBytes: 0,
    responseSHA256: "",
  };
  const digest = crypto.createHash("sha256");
  const control = [];
  if (response.body)
    for await (const chunk of response.body) {
      record.responseBytes += chunk.byteLength;
      if (record.responseBytes > 20_000_000) throw Error("HTTP result envelope exceeds admission");
      digest.update(chunk);
      if (path === "/control/diagnostic") control.push(Buffer.from(chunk));
    }
  record.responseSHA256 = digest.digest("hex");
  record.wallMs = performance.now() - started;
  receipt.records.push(record);
  if (record.receivedBytes === null || !record.queries) {
    receipt.unmeteredFailedRequest = true;
    persist();
    throw Error("Missing complete database instrumentation; stop without retry");
  }
  receipt.receivedBytes += record.receivedBytes;
  persist();
  console.log(
    JSON.stringify({
      name,
      status: record.status,
      dbBytes: record.receivedBytes,
      calls: record.queries.length,
      rows: record.queries.reduce((n, x) => n + x.rows, 0),
      wallMs: record.wallMs,
      cache: record.cache,
      colo: record.colo,
    }),
  );
  if (record.receivedBytes > bound || record.status !== expected)
    throw Error(`Isolated ${name} result/admission mismatch`);
  return control.length ? JSON.parse(Buffer.concat(control).toString()) : record;
}
try {
  const initial = await probe("diagnostic-before", "/control/diagnostic", 131072);
  receipt.initial = initial;
  persist();
  if (
    initial.role !== "hdb_benchmark_runtime" ||
    initial.fact_write ||
    initial.private_access ||
    initial.blocks !== 9730 ||
    initial.trends !== 45028
  )
    throw Error("Current corpus/role identity drift");
  const controlOverhead = 65536 + 4 * (initial.manifest_bytes + 1024);
  const whole = initial.summary_json_bytes + 1024 * 32 + controlOverhead;
  const search = initial.maximum_search_json_bytes + 2001 * 128 + 32768 + controlOverhead;
  const town = initial.largest_town_json_bytes + 32768 + controlOverhead;
  const detail = initial.largest_detail_bytes + controlOverhead;
  const comparison = initial.largest_comparison_bytes + controlOverhead;
  receipt.admission = { controlOverhead, whole, search, town, detail, comparison };
  // Finite SQL-shape coverage, not every Cartesian combination of input values.
  const cases = [
    ["manifest", "/api/manifest", controlOverhead],
    ["all-summaries", "/api/block-summaries", whole],
    [
      "largest-town",
      `/api/blocks/${initial.largest_town.toLowerCase().replaceAll(" ", "-")}`,
      town,
    ],
    ["largest-detail", `/api/details/${initial.largest_detail_key}`, detail],
    ["largest-comparison", `/api/comparisons/${initial.largest_comparison_key}`, comparison],
    ["all-trends", "/api/trends/town-flat-type", 7_000_000],
    ["mrt-stations", "/api/mrt-stations", 300_000],
    ["mrt-exits", "/api/mrt-exits", 500_000],
    ["search-unfiltered-cap", "/api/search?limit=999999&offset=-1", search],
    ["suggest-text-dictionary", "/api/suggest?q=amk", 2_000_000],
    ["search-town", "/api/search?town=BEDOK", search],
    [
      "search-flat-type-budget",
      "/api/search?flatType=4%20ROOM&budgetMin=0&budgetMax=1e308",
      search,
    ],
    [
      "search-selected-cohort",
      "/api/search?flatType=4%20ROOM&flatModel=Model%20A&areaMin=0&areaMax=9999&startMonth=1990-01&endMonth=2026-12",
      search,
    ],
    [
      "search-block-refinements",
      "/api/search?flatModel=Model%20A&areaMin=0&areaMax=9999&mrtMax=5000&remainingLeaseMin=0&startMonth=2026-12&endMonth=1990-01",
      search,
    ],
    [
      "search-nonfinite-ignored",
      "/api/search?budgetMin=NaN&budgetMax=Infinity&areaMin=NaN&flatType=unknown",
      search,
    ],
    ["suggest-numeric-dictionary", "/api/suggest?q=560123", 2_000_000],
    ["unknown-town", "/api/blocks/unknown", controlOverhead],
    ["unknown-detail", "/api/details/unknown", controlOverhead, 404],
    ["unknown-comparison", "/api/comparisons/unknown", controlOverhead, 404],
    ["invalid-search-mrt", "/api/search?mrtMax=999999", 65536, 400],
    ["invalid-search-negative-budget", "/api/search?budgetMin=-1", 65536, 400],
    ["invalid-search-month", "/api/search?startMonth=invalid", 65536, 400],
    ["invalid-search-oversize", `/api/search?town=${"x".repeat(257)}`, 65536, 400],
    ["invalid-suggest-short", "/api/suggest?q=a", 65536, 400],
    ["invalid-suggest-oversize", `/api/suggest?q=${"x".repeat(257)}`, 65536, 400],
  ];
  const wholeAdmission =
    receipt.receivedBytes + cases.reduce((n, x) => n + x[2], 0) + 4 * search + 131072;
  receipt.completeAdmissionBytes = wholeAdmission;
  persist();
  if (wholeAdmission > 80_000_000 || cases.length + 6 > 32)
    throw Error("Complete coverage does not fit approved envelope; stop for smaller proposal");
  for (const [name, path, bound, status] of cases)
    await probe(name, path, bound, "cold", status ?? 200);
  const path = "/api/search?town=BEDOK&flatType=4%20ROOM";
  await probe("cache-normal-miss", path, search, "normal");
  const warm = await probe("cache-normal-hit", path, search, "normal");
  const reordered = await probe(
    "cache-canonical-hit",
    "/api/search?flatType=4%20ROOM&town=BEDOK",
    search,
    "normal",
  );
  await probe("cache-semantic-miss", "/api/search?town=BEDOK&flatType=5%20ROOM", search, "normal");
  if (
    warm.receivedBytes ||
    reordered.receivedBytes ||
    warm.queries.length ||
    reordered.queries.length ||
    warm.cache !== "HIT" ||
    reordered.cache !== "HIT"
  )
    throw Error("Actual warm Cache API failed to eliminate SQL");
  receipt.final = await probe("diagnostic-after", "/control/diagnostic", 131072);
  receipt.passed = true;
} finally {
  receipt.finishedAtUTC = new Date().toISOString();
  persist();
}
