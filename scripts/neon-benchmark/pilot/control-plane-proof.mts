import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { initializePilotCohort, chargePilotSetupContingency } from "./cohort-store";
import { retirePilotLedger } from "./ledger-transfer";
import { sessionScopedPilotPlan } from "./session-plan";
import { evaluateWholePilotPlan } from "./plan";
import type { TransactionStorage } from "./transactional-store";
import { PILOT_CONTROL_METHODS, PILOT_CONTROL_PROTOCOL } from "./control-contract";
import { startLocalPilotPg } from "./local-pg-wire";
import { capturePilotHttp, type HttpReceipt } from "./evidence";

const OUTPUT = ".neon-benchmark/control-plane-local-20261006";
const CONFIG = ".neon-benchmark/session-owner-pilot-20261006/wrangler.jsonc";
const ENTRY = ".neon-benchmark/shared-counter-candidate-pilot-20261005/worker.ts";
const sha = (b: string | Uint8Array) => createHash("sha256").update(b).digest("hex");
const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve("wrangler/package.json"));
type LocalWorker = {
  dispatchFetch(url: string, init?: RequestInit): Promise<Response>;
  dispose(): Promise<void>;
};
const { Miniflare } = wranglerRequire("miniflare") as {
  Miniflare: new (options: Record<string, unknown>) => LocalWorker;
};

class LocalStorage implements TransactionStorage {
  data = new Map<string, unknown>();
  async transaction<T>(action: Parameters<TransactionStorage["transaction"]>[0]): Promise<T> {
    const next = structuredClone(this.data);
    const result = await action({
      get: async <V,>(key: string) => structuredClone(next.get(key)) as V | undefined,
      put: async (key, value) => {
        next.set(key, structuredClone(value));
      },
    });
    this.data = next;
    return result as T;
  }
}

// Local-only: dry-run produces the actual upload envelope. No CLI authentication or deploy.
await mkdir(OUTPUT + "/fixed-build", { recursive: true });
const built = spawnSync(
  resolve("node_modules/.bin/wrangler"),
  [
    "deploy",
    "--dry-run",
    "--config",
    CONFIG,
    "--outdir",
    OUTPUT + "/fixed-build",
    "--outfile",
    OUTPUT + "/fixed-build/upload.multipart",
    "--metafile",
  ],
  {
    encoding: "utf8",
    timeout: 30_000,
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_LOG_PATH: resolve(OUTPUT + "/fixed-build-debug.log"),
    },
  },
);
await writeFile(OUTPUT + "/fixed-build.log", built.stdout + built.stderr);
assert.equal(built.status, 0, "Actual would-deploy build failed");
const raw = await readFile(OUTPUT + "/fixed-build/upload.multipart");
const boundary = raw.subarray(0, raw.indexOf("\r\n")).toString().slice(2);
const form = await new Response(raw, {
  headers: { "content-type": "multipart/form-data; boundary=" + boundary },
}).formData();
const entry = form.get("worker.js");
assert(entry && typeof entry !== "string");
const bundle = Buffer.from(await entry.arrayBuffer());
await writeFile(OUTPUT + "/fixed-build/worker.js", bundle);
const metadataPart = form.get("metadata");
assert(typeof metadataPart === "string");
await writeFile(OUTPUT + "/fixed-build/upload-metadata.json", metadataPart);
const metadata = JSON.parse(metadataPart);
const configBytes = await readFile(CONFIG);
const config = JSON.parse(configBytes.toString());
assert.equal(metadata.main_module, "worker.js");
assert.equal(metadata.compatibility_date, config.compatibility_date);
assert.deepEqual(metadata.compatibility_flags, config.compatibility_flags);
assert.equal(config.assets, undefined);
assert.equal(config.d1_databases, undefined);
assert.equal(config.routes, undefined);
assert.equal(config.triggers, undefined);
assert.equal(config.main, "../shared-counter-candidate-pilot-20261005/worker.ts");
assert.deepEqual(config.durable_objects.bindings, [
  { name: "PILOT_COUNTER", class_name: "PilotCounter" },
]);
assert.deepEqual(config.migrations[0].new_sqlite_classes, ["PilotCounter"]);
assert(bundle.toString().includes('"/control/begin"'));
assert(bundle.toString().includes("PilotCounter"));
await writeFile(OUTPUT + "/fixed-build/actual-config.json", configBytes);

const pg = await startLocalPilotPg();
const token = "synthetic-local-control-token";
const localOptions = {
  modules: true,
  scriptPath: OUTPUT + "/fixed-build/worker.js",
  compatibilityDate: config.compatibility_date,
  compatibilityFlags: config.compatibility_flags,
  bindings: { ...config.vars, BENCHMARK_TOKEN: token },
  durableObjects: Object.fromEntries(
    config.durable_objects.bindings.map((b: { name: string; class_name: string }) => [
      b.name,
      {
        className: b.class_name,
        useSQLite: config.migrations.some((m: { new_sqlite_classes: string[] }) =>
          m.new_sqlite_classes.includes(b.class_name),
        ),
      },
    ]),
  ),
  hyperdrives: { [config.hyperdrive[0].binding]: pg.connectionString },
  outboundService: { network: { allow: [] } },
};
let mf = new Miniflare(localOptions);
const requests: Record<string, unknown>[] = [];
const redirectReceipts: HttpReceipt[] = [];
const redirectServerTrace: { path: string; method: string }[] = [];
async function request(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  rawBody?: string,
) {
  const before = pg.SQL.length;
  const started = Date.now();
  const response = await mf.dispatchFetch("https://pilot.invalid" + path, {
    method,
    headers: { "x-benchmark-token": token, ...headers },
    ...(body !== undefined || rawBody !== undefined
      ? { body: rawBody ?? JSON.stringify(body) }
      : {}),
    redirect: "manual",
  });
  const text = await response.text();
  const result = {
    method,
    path,
    status: response.status,
    allow: response.headers.get("allow"),
    contentType: response.headers.get("content-type"),
    observedMethod: response.headers.get("x-pilot-control-method"),
    observedPath: response.headers.get("x-pilot-control-path"),
    body: text,
    SQLBefore: before,
    SQLAfter: pg.SQL.length,
    wallMs: Date.now() - started,
  };
  requests.push(result);
  await writeFile(
    OUTPUT + "/built-request-receipts.json",
    JSON.stringify(requests, null, 2) + "\n",
  );
  return { ...result, data: text.startsWith("{") ? JSON.parse(text) : null };
}
const identity = (pilotId: string, requestId: string, sequence: number) => ({
  "x-pilot-id": pilotId,
  "x-request-id": requestId,
  "x-request-sequence": String(sequence),
});
let passed = false;
try {
  assert.equal(
    (await request("GET", "/control/ready", undefined, { "x-benchmark-token": "wrong" })).status,
    403,
  );
  const ready = await request("GET", "/control/ready");
  assert.equal(ready.observedMethod, "GET");
  assert.equal(ready.observedPath, "/control/ready");
  assert.deepEqual(ready.data, {
    ready: true,
    protocol: PILOT_CONTROL_PROTOCOL,
    sessionId: config.vars.SESSION_ID,
  });
  for (const [path, method] of Object.entries(PILOT_CONTROL_METHODS)) {
    const wrong = await request(method === "GET" ? "POST" : "GET", path);
    assert.equal(wrong.status, 405);
    assert.equal(wrong.allow, method);
    assert.equal(wrong.SQLBefore, wrong.SQLAfter);
    assert(wrong.contentType?.includes("application/json"));
  }
  for (const path of [
    "/control",
    "/control/",
    "/control/missing",
    "/control/begin/",
    "/control/assets/index.html",
  ]) {
    const missing = await request("GET", path, undefined, identity("safeguards", "missing", 1));
    assert.equal(missing.status, 404);
    assert.equal(missing.SQLBefore, missing.SQLAfter);
    assert.equal(missing.data.error, "Unknown control route");
  }
  for (const body of ["{", "{}", '{"handoff":null}']) {
    assert.equal((await request("POST", "/control/begin", undefined, {}, body)).status, 409);
  }
  assert.equal((await request("GET", "/control/evidence")).status, 409);
  assert.equal(pg.SQL.length, 0);
  const storage = new LocalStorage();
  const now = Date.now();
  await initializePilotCohort(
    storage,
    config.vars.SESSION_ID,
    now,
    sessionScopedPilotPlan(true, true),
    "direct-setup",
  );
  await chargePilotSetupContingency(storage, "direct-setup", {
    id: "localReadiness",
    startedAtMs: now,
    endedAtMs: now + 1,
    ambiguous: false,
  });
  const handoff = await retirePilotLedger(storage, "direct-setup", "worker", Date.now() + 1, false);
  // A malformed certificate must not occupy the one-shot slot.
  assert.equal(
    (await request("POST", "/control/begin", { handoff: { ...handoff, SHA256: "0".repeat(64) } }))
      .status,
    409,
  );
  const begins = await Promise.all([
    request("POST", "/control/begin", { handoff }),
    request("POST", "/control/begin", { handoff }),
  ]);
  assert.deepEqual(
    begins.map((b) => b.status).sort((a, b) => a - b),
    [200, 409],
  );
  const original = await request("GET", "/control/evidence");
  assert.equal(original.data.cohort.applicationStatements, 0);
  assert.equal(original.data.cohort.contingencySpentMs, 1);
  assert.equal(original.data.cohort.custody.generation, 1);
  assert.equal((await request("POST", "/control/begin", { handoff })).status, 409);
  assert.equal((await request("GET", "/control/ready")).status, 409);
  assert.deepEqual((await request("GET", "/control/evidence")).data, original.data);
  assert.equal(pg.SQL.length, 0);
  const configure = async (pilotId: string, mode: string) =>
    assert.equal((await request("POST", "/control/configure", { pilotId, mode })).status, 200);
  await configure("safeguards", "safeguards");
  assert.equal(
    (await request("POST", "/control/configure", { pilotId: "safeguards", mode: "safeguards" }))
      .status,
    409,
  );
  assert.equal(
    (
      await request(
        "GET",
        "/control/safeguards",
        undefined,
        identity("safeguards", "localSafeguards", 1),
      )
    ).status,
    200,
  );
  const sequential = "candidate-sequential-diagnostic-20261005";
  const concurrent = "candidate-concurrent-diagnostic-20261005";
  await configure(sequential, "sequential");
  assert.equal(
    (await request("GET", "/diagnostic", undefined, identity(sequential, "diagA", 1))).status,
    200,
  );
  assert.equal(
    (await request("GET", "/diagnostic", undefined, identity(sequential, "diagB", 2))).status,
    409,
  );
  await configure(concurrent, "concurrent");
  const race = await Promise.all([
    request("GET", "/diagnostic", undefined, identity(concurrent, "raceA", 1)),
    request("GET", "/diagnostic", undefined, identity(concurrent, "raceB", 2)),
  ]);
  assert.deepEqual(
    race.map((r) => r.status).sort((a, b) => a - b),
    [200, 409],
  );
  assert.equal(
    (await request("POST", "/control/accept-diagnostic", { sequential, concurrent })).status,
    200,
  );
  const cleanup = "cleanup-observations-before-resource-delete";
  await configure(cleanup, "cleanup");
  assert.equal(
    (
      await request(
        "GET",
        "/control/cleanup-observations",
        undefined,
        identity(cleanup, "localCleanup", 1),
      )
    ).status,
    200,
  );
  const evidence = await request("GET", "/control/evidence");
  assert.equal(evidence.data.root.diagnosticPassed, true);
  assert.equal(evidence.data.root.safeguardsPassed, true);
  assert.equal(evidence.data.cohort.applicationStatements, pg.SQL.length);
  assert.equal(evidence.data.cohort.comparablePOSTs, 0);
  const retired = await request("POST", "/control/retire");
  assert.equal(retired.status, 200);
  assert.equal(retired.data.terminal, true);
  assert.equal((await request("GET", "/control/retired-handoff")).data.SHA256, retired.data.SHA256);
  const SQLAtEnd = pg.SQL.length;
  assert.equal((await request("POST", "/control/retire")).status, 409);
  assert.equal((await request("POST", "/control/stop")).status, 200);
  assert.equal((await request("POST", "/control/begin", { handoff })).status, 409);
  assert.equal(pg.SQL.length, SQLAtEnd);
  // A second isolated local DO exercises loss of the begin response after acceptance.
  // The controller inspects/retire-reconciles the committed ledger; it never resets it.
  await mf.dispose();
  mf = new Miniflare(localOptions);
  const second = new LocalStorage();
  await initializePilotCohort(
    second,
    config.vars.SESSION_ID,
    Date.now(),
    sessionScopedPilotPlan(true, true),
    "direct-setup",
  );
  const lostHandoff = await retirePilotLedger(second, "direct-setup", "worker", Date.now(), false);
  const lost = await mf.dispatchFetch("https://pilot.invalid/control/begin", {
    method: "POST",
    body: JSON.stringify({ handoff: lostHandoff }),
    headers: { "x-benchmark-token": token },
  });
  assert.equal(lost.status, 200);
  await lost.body?.cancel();
  requests.push({
    method: "POST",
    path: "/control/begin",
    status: 200,
    responseIntentionallyDiscarded: true,
    note: "local response-loss simulation after workerd acceptance; not a remote TCP abort",
    SQLBefore: SQLAtEnd,
    SQLAfter: pg.SQL.length,
  });
  assert.equal((await request("POST", "/control/begin", { handoff: lostHandoff })).status, 409);
  const reconciled = await request("GET", "/control/evidence");
  assert.equal(reconciled.data.cohort.applicationStatements, 0);
  assert.equal(reconciled.data.cohort.custody.generation, 1);
  assert.equal((await request("POST", "/control/stop")).status, 200);
  const failedCleanup = await request("POST", "/control/retire");
  assert.equal(failedCleanup.status, 200);
  assert.equal(failedCleanup.data.snapshot.applicationStatements, 0);
  assert.equal(failedCleanup.data.snapshot.stopped, true);
  assert.equal(
    (await request("GET", "/control/retired-handoff")).data.SHA256,
    failedCleanup.data.SHA256,
  );
  assert.equal((await request("POST", "/control/retire")).status, 409);
  assert.equal(pg.SQL.length, SQLAtEnd);
  // Demonstrate real native-fetch redirect semantics, separate from built-Worker routing.
  // The trace identifies the fixture's actual received method, not an inferred final method.
  const redirectServer = createServer((req, res) => {
    redirectServerTrace.push({ path: req.url ?? "", method: req.method ?? "UNKNOWN" });
    if (req.url?.startsWith("/redirect/")) {
      res.writeHead(req.url.endsWith("303") ? 303 : 307, {
        location: "/target",
        "content-type": "text/plain",
      });
      res.end("synthetic redirect");
    } else {
      res.writeHead(200, {
        "content-type": "application/json",
        "x-pilot-control-method": req.method ?? "UNKNOWN",
        "x-pilot-control-path": "/target",
      });
      res.end(JSON.stringify({ observedMethod: req.method }));
    }
  });
  try {
    await new Promise<void>((resolve, reject) => {
      redirectServer.once("error", reject);
      redirectServer.listen(0, "127.0.0.1", resolve);
    });
    const address = redirectServer.address();
    assert(address && typeof address !== "string");
    for (const mode of ["follow", "manual"] as const)
      for (const status of [303, 307]) {
        const url = `http://127.0.0.1:${address.port}/redirect/${status}`;
        const traceBefore = redirectServerTrace.length;
        const capture = () =>
          capturePilotHttp({
            id: "native" + mode + status,
            sequence: redirectReceipts.length + 1,
            method: "POST",
            label: "native-redirect",
            requestURL: url,
            redirectMode: mode,
            capturePublicSyntheticSnippet: true,
            authority: { snapshot: async () => ({ applicationStatements: pg.SQL.length }) },
            journal: {
              persist: async (r) => {
                redirectReceipts.push(structuredClone(r));
              },
            },
            fetchResponse: (signal) => fetch(url, { method: "POST", redirect: mode, signal }),
            parse: (body) => JSON.parse(body),
          });
        if (mode === "manual") await assert.rejects(capture, /http-status/);
        else await capture();
        const receipt = redirectReceipts.at(-1)!;
        assert.equal(receipt.redirectChain, null);
        assert.equal(receipt.redirected, mode === "follow");
        assert.equal(receipt.status, mode === "follow" ? 200 : status);
        assert.equal(
          receipt.finalMethod,
          mode === "follow" ? (status === 303 ? "GET" : "POST") : "UNKNOWN",
        );
        assert.equal(redirectServerTrace.length - traceBefore, mode === "follow" ? 2 : 1);
        assert.equal(receipt.applicationStatementsAfter, SQLAtEnd);
      }
  } finally {
    redirectServer.closeAllConnections();
    await new Promise<void>((resolve) => redirectServer.close(() => resolve()));
  }
  passed = true;
} finally {
  await mf.dispose();
  await pg.close();
  const runtimePath = process.env.MINIFLARE_WORKERD_PATH;
  const report = {
    passed,
    capturedAtUTC: new Date().toISOString(),
    gitHEAD: "482be1eba9ff2091c1580f5757d7b33e20b26515",
    commands: {
      build:
        "wrangler deploy --dry-run --config " +
        CONFIG +
        " --outdir ... --outfile upload.multipart --metafile",
      test: "tsx scripts/neon-benchmark/pilot/control-plane-proof.mts",
    },
    configPath: CONFIG,
    configSHA256: sha(configBytes),
    entrypointSHA256: sha(await readFile(ENTRY)),
    bundleSHA256: sha(bundle),
    uploadSHA256: sha(raw),
    bundleBytes: bundle.length,
    metafileSHA256: sha(await readFile(OUTPUT + "/fixed-build/bundle-meta.json")),
    metadata,
    compatibilityDateUnchanged: true,
    localOverrides: [
      "synthetic BENCHMARK_TOKEN",
      "real SQLite durable-object binding backed by ephemeral local storage",
      "HYPERDRIVE loopback-only PostgreSQL protocol fixture",
      "outbound service deny-all",
    ],
    miniflareVersion: wranglerRequire("miniflare/package.json").version,
    wranglerVersion: require("wrangler/package.json").version,
    workerdVersion: runtimePath
      ? spawnSync(runtimePath, ["--version"], { encoding: "utf8" }).stdout.trim()
      : "installed dependency",
    runtimeSHA256: runtimePath ? sha(await readFile(runtimePath)) : null,
    requests: requests.length,
    nativeRedirectCases: new Set(redirectReceipts.map((r) => r.id)).size,
    nativeRedirectHTTPRequests: redirectServerTrace.length,
    localSQL: pg.SQL.length,
    localConnections: pg.connections(),
    SQL: pg.SQL,
    NeonCalls: 0,
    CloudflareResourceCalls: 0,
    quotaConsumption: 0,
    nextReservationOnly: evaluateWholePilotPlan(sessionScopedPilotPlan(true, true)),
    remoteRetryAuthorized: false,
    historicalRemote404Cause:
      "UNKNOWN; raw body unavailable; this proof is not an explanation of remote edge routing",
  };
  await writeFile(OUTPUT + "/built-proof.json", JSON.stringify(report, null, 2) + "\n");
  await writeFile(
    OUTPUT + "/native-redirect-receipts.json",
    JSON.stringify({ receipts: redirectReceipts, trace: redirectServerTrace }, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      passed,
      requests: requests.length,
      localSQL: pg.SQL.length,
      NeonCalls: 0,
      bundleSHA256: report.bundleSHA256,
    }),
  );
}
