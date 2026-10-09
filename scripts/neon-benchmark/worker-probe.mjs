import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import { connect, SCRATCH, save } from "./common.mjs";
const origin = "https://hdb-neon-benchmark-20261004.shenghaoc.workers.dev";
const token = JSON.parse(readFileSync(`${SCRATCH}/worker-secrets.json`, "utf8")).BENCHMARK_TOKEN;
const mode = process.argv[2] ?? "warm";
const records = [];
async function probe(name, path, backend = "hyperdrive", extra = {}, method = "GET") {
  const started = performance.now();
  const response = await fetch(origin + path, {
    method,
    headers: { "x-benchmark-token": token, "x-benchmark-backend": backend, ...extra },
  });
  const body = await response.text();
  const record = {
    name,
    backend,
    status: response.status,
    wallMs: performance.now() - started,
    queryMs: Number(response.headers.get("x-benchmark-query-ms")),
    connectMs: Number(response.headers.get("x-benchmark-connect-ms")),
    calls: response.headers.has("x-benchmark-db-calls")
      ? Number(response.headers.get("x-benchmark-db-calls"))
      : null,
    returnedRows: Number(response.headers.get("x-benchmark-rows-returned")),
    cache: response.headers.get("x-data-cache"),
    colo: response.headers.get("x-benchmark-colo"),
    bytes: Buffer.byteLength(body),
    sha256: crypto.createHash("sha256").update(body).digest("hex"),
    at: new Date().toISOString(),
  };
  records.push(record);
  console.log(JSON.stringify(record));
  if (response.status !== 200 && !(name.startsWith("error") && response.status === 503))
    throw new Error(`Worker probe ${name} failed (${response.status})`);
  return record;
}
if (mode === "cold-http" || mode === "cold-hyperdrive") {
  const backend = mode.slice(5);
  await probe("first-after-confirmed-suspension", "/direct/manifest", backend);
  for (let i = 0; i < 5; i++) await probe(`warm-manifest-${i}`, "/direct/manifest", backend);
  save(`worker-${mode}`, { at: new Date().toISOString(), records });
} else if (mode === "cache-lifecycle") {
  const { client } = await connect();
  const original = (await client.query("SELECT json FROM manifest WHERE id=1")).rows[0].json;
  try {
    // The initial warm receipt is more than 60 seconds old; exercise the real TTL, not just deletion.
    const expiry = await probe("actual-pointer-expiry", "/api/search?town=BEDOK&flatType=4%20ROOM");
    if (expiry.calls !== 1 || expiry.cache !== "HIT-AFTER-VERSION-READ")
      throw new Error("Pointer TTL behaviour mismatch");
    await client.query(
      "UPDATE manifest SET json=jsonb_set(json,'{benchmarkVersion}',to_jsonb($1::text)) WHERE id=1",
      [crypto.randomUUID()],
    );
    await probe("pointer-remove-version", "/control/pointer", "hyperdrive", {}, "DELETE");
    await probe("version-change", "/api/search?town=BEDOK&flatType=4%20ROOM");
    await probe("version-warm", "/api/search?town=BEDOK&flatType=4%20ROOM");
    const race = probe("version-during-response", "/api/manifest", "hyperdrive", {
      "x-benchmark-race": "1",
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
    await client.query(
      "UPDATE manifest SET json=jsonb_set(json,'{benchmarkVersion}',to_jsonb($1::text)) WHERE id=1",
      [crypto.randomUUID()],
    );
    await race;
    const after = await probe("race-not-shared-cached", "/api/manifest");
    if (after.calls !== 3 || after.cache !== "MISS") throw new Error("Raced response was cached");
    await probe("race-current-version-warm", "/api/manifest");
    save("worker-cache-lifecycle", {
      at: new Date().toISOString(),
      records,
      manifestRestored: true,
    });
  } finally {
    await client.query("UPDATE manifest SET json=$1::jsonb WHERE id=1", [JSON.stringify(original)]);
    await client.end();
    await probe("pointer-remove-restored", "/control/pointer", "hyperdrive", {}, "DELETE");
  }
} else {
  for (const backend of ["http", "hyperdrive"]) {
    for (let i = 0; i < 5; i++)
      await probe(
        `direct-comparable-${i}`,
        "/direct/comparable?town=ANG%20MO%20KIO&flatType=4%20ROOM",
        backend,
      );
    await probe(
      "multi-query-cold",
      `/api/search?town=ANG%20MO%20KIO&flatType=${backend === "http" ? "5%20ROOM" : "4%20ROOM"}`,
      backend,
    );
  }
  await probe("pointer-remove", "/control/pointer", "hyperdrive", {}, "DELETE");
  const initial = "/api/search?town=BEDOK&flatType=4%20ROOM";
  await probe("cache-cold", initial);
  await probe("cache-warm", initial);
  await probe("canonical-query-order", "/api/search?flatType=4%20ROOM&town=BEDOK");
  await probe("different-semantic-query", "/api/search?town=BEDOK&flatType=5%20ROOM");
  for (let i = 0; i < 2; i++)
    await probe(`error-${i}`, "/api/search?town=JURONG%20EAST&flatType=4%20ROOM", "hyperdrive", {
      "x-benchmark-error": "1",
    });
  for (let i = 0; i < 2; i++) await probe(`private-${i}`, "/api/shortlist/synthetic", "hyperdrive");
  for (let i = 0; i < 2; i++)
    await probe(`post-${i}`, "/api/comparable-transactions?town=BEDOK", "hyperdrive", {}, "POST");
  save("worker-warm", { at: new Date().toISOString(), records });
}
