/**
 * HTTP client for the deployed-path check of GET /api/nearby-places. It speaks only HTTP to the Worker under test and
 * holds no credentials.
 *
 *   BASE_URL=https://<temporary-worker>.workers.dev node tests/deployed-path/verify-client.mjs <phase> [out.json]
 *
 * Phases (run them in this order; each needs a fresh 60 s rate-limit window, so wait a minute between them):
 *   functional    capability probe, every sample against the expected fingerprints, MISS then HIT, canonical key, 400
 *   client-limit  one repeated request until the per-client limit answers 429
 *   origin-limit  distinct cache-missing centres until the per-location origin budget answers 503 (needs a Worker
 *                 whose NEARBY_ORIGIN_LIMITER limit is small, for example 10)
 *   ceiling       distinct cache-missing centres until the global daily statement ceiling answers 503, then a
 *                 cached centre once more (needs a Worker whose NEARBY_DAILY_STATEMENT_CEILING var is small and whose
 *                 client limit is at least that number + 4; set EXPECT_CEILING to the same number)
 *   budget-unavailable
 *                 three cache misses against a Worker whose budget table is missing: all must be refused with 503
 *   latency       40 cache misses and 40 hits, as client-observed wall time (needs generous limits)
 *
 * BASE_URL must be https, or a loopback http URL with ALLOW_LOCAL_HTTP=1. EXPECTED_FILE and SAMPLES_FILE override the
 * defaults (fork-expected.json, the fork samples).
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLES, queryString } from "./samples.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL ?? "";
const isLoopback = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE);
if (!BASE.startsWith("https://") && !(process.env.ALLOW_LOCAL_HTTP === "1" && isLoopback)) {
  throw new Error(
    "BASE_URL must be the Worker's https URL (or a loopback http URL with ALLOW_LOCAL_HTTP=1)",
  );
}
const expected = JSON.parse(
  readFileSync(process.env.EXPECTED_FILE ?? path.join(here, "fork-expected.json"), "utf8"),
).samples;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const REQUEST_TIMEOUT_MS = 30_000;
const WINDOW_MS = 65_000;

async function get(pathAndQuery) {
  const started = performance.now();
  const response = await fetch(`${BASE}${pathAndQuery}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.text();
  return {
    status: response.status,
    elapsedMs: Math.round((performance.now() - started) * 10) / 10,
    cache: response.headers.get("x-data-cache"),
    cacheControl: response.headers.get("cache-control"),
    retryAfter: response.headers.get("retry-after"),
    colo: (response.headers.get("cf-ray") ?? "").split("-")[1] ?? null,
    body,
  };
}

function parse(response) {
  try {
    return JSON.parse(response.body);
  } catch {
    return null;
  }
}

/** Same line format as the direct SQL fingerprint in direct-sql.mjs. */
function fingerprint(places) {
  const lines = places.map((place) =>
    [
      place.kind,
      place.id,
      place.name,
      String(place.lat),
      String(place.lng),
      place.addressKey ?? "",
      place.stationName ?? "",
      place.exitCode ?? "",
      String(place.distanceMeters),
    ].join("|"),
  );
  return { n: places.length, md5: createHash("md5").update(lines.join("\n")).digest("hex") };
}

function percentile(sorted, q) {
  return sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)]
    : null;
}

function summarise(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0] ?? null,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? null,
  };
}

const phases = {
  async functional() {
    const results = {
      capability: null,
      samples: [],
      cacheContract: null,
      versionAgreement: null,
      badRequest: null,
    };
    const capability = await get("/api/nearby-capabilities");
    results.capability = {
      status: capability.status,
      body: parse(capability),
      cacheControl: capability.cacheControl,
    };
    for (const sample of SAMPLES) {
      const first = await get(`/api/nearby-places?${queryString(sample)}`);
      const body = parse(first);
      const got = body ? fingerprint(body.places ?? []) : null;
      const want = expected[sample.id];
      const second = await get(`/api/nearby-places?${queryString(sample)}`);
      results.samples.push({
        id: sample.id,
        status: first.status,
        cacheFirst: first.cache,
        cacheSecond: second.cache,
        colo: first.colo,
        got,
        want,
        equal: Boolean(got && want && got.n === want.n && got.md5 === want.md5),
        distanceBasis: body?.distanceBasis,
        firstMs: first.elapsedMs,
        secondMs: second.elapsedMs,
      });
      await sleep(400);
    }
    // The blocks-only 250 m cell asked again with reordered parameters and a centre moved by less than half a grid
    // step must be served from the entry created above.
    const base = SAMPLES.find((sample) => sample.types === "hdb_block" && sample.radius === 250);
    if (base) {
      const lat = (base.lat + 0.00004).toFixed(5);
      const lng = (base.lng - 0.00004).toFixed(5);
      const reordered = await get(
        `/api/nearby-places?types=hdb_block&radius=250&lng=${lng}&lat=${lat}`,
      );
      results.cacheContract = {
        sample: base.id,
        status: reordered.status,
        cache: reordered.cache,
        expected: "HIT",
        ok: reordered.cache === "HIT",
      };
    }
    // The label nearby answers are stored under is computed IN SQL; /api/manifest labels its own answer from the manifest
    // text in JS, and both write the one shared pointer. If the two hashes ever disagreed, asking for the manifest would
    // move the pointer and the nearby entry stored a moment ago would stop matching: the repeat below would be a MISS.
    // Only meaningful when /api/manifest answered 200 and the base request above had been cached.
    const manifestResponse = await get("/api/manifest");
    const repeat = base ? await get(`/api/nearby-places?${queryString(base)}`) : null;
    results.versionAgreement = {
      manifestStatus: manifestResponse.status,
      manifestCache: manifestResponse.cache,
      nearbyRepeatCache: repeat?.cache ?? null,
      exercised: manifestResponse.status === 200 && repeat !== null,
      ok: manifestResponse.status === 200 && repeat?.cache === "HIT",
    };
    const bad = await get("/api/nearby-places?lat=2&lng=103.8");
    results.badRequest = { status: bad.status, cacheControl: bad.cacheControl, cache: bad.cache };
    return results;
  },

  async "client-limit"() {
    // After the first answer every repeat is a cache hit, so only the per-client limit can answer 429.
    const query = queryString(SAMPLES[0]);
    const rows = [];
    for (let i = 1; i <= 45; i++) {
      const response = await get(`/api/nearby-places?${query}`);
      rows.push({
        i,
        status: response.status,
        cache: response.cache,
        retryAfter: response.retryAfter,
        cacheControl: response.cacheControl,
      });
      if (rows.filter((row) => row.status === 429).length >= 3) break;
    }
    return {
      requests: rows.length,
      ok200: rows.filter((row) => row.status === 200).length,
      first429: rows.find((row) => row.status === 429) ?? null,
      statuses: rows.map((row) => row.status).join(","),
    };
  },

  async "origin-limit"() {
    // Distinct snapped centres are all cache misses; fewer than the client limit, so only the per-location origin
    // budget can answer 503. Wait for the previous window first.
    await sleep(WINDOW_MS);
    const rows = [];
    for (let i = 0; i < 25; i++) {
      const response = await get(
        `/api/nearby-places?lat=1.${3000 + i}&lng=103.8200&radius=500&types=mrt_exit`,
      );
      rows.push({
        i,
        status: response.status,
        cache: response.cache,
        retryAfter: response.retryAfter,
        cacheControl: response.cacheControl,
        body: response.status === 503 ? parse(response) : undefined,
      });
    }
    return {
      statuses: rows.map((row) => row.status).join(","),
      first503: rows.find((row) => row.status === 503) ?? null,
    };
  },

  async ceiling() {
    // Run against a Worker whose daily statement ceiling is EXPECT_CEILING (a small number set in its vars). Distinct
    // snapped centres are all cache misses, so each draws one statement: the first EXPECT_CEILING are answered, the
    // rest refused with 503 and the time to 00:00 UTC. Then the first centre is asked again: it is cached, so it never
    // reaches the allowance and is still served. Needs a fresh 60 s window for the per-client limit (use a Worker
    // whose client limit is not below ceiling + 4).
    const ceiling = Number(process.env.EXPECT_CEILING);
    if (!Number.isInteger(ceiling) || ceiling < 1)
      throw new Error("EXPECT_CEILING must be the whole-number ceiling the Worker runs under");
    // lng 103.83 (the origin-limit phase uses 103.82, budget-unavailable 103.84) so no earlier phase's cached entry can
    // answer these centres without drawing from the allowance.
    const centre = (i) =>
      `/api/nearby-places?lat=1.${3000 + i}&lng=103.8300&radius=500&types=mrt_exit`;
    const rows = [];
    for (let i = 0; i < ceiling + 3; i++) {
      const response = await get(centre(i));
      rows.push({
        i,
        status: response.status,
        cache: response.cache,
        retryAfter: response.retryAfter,
        cacheControl: response.cacheControl,
        body: response.status === 503 ? parse(response) : undefined,
      });
    }
    const again = await get(centre(0));
    return {
      ceiling,
      statuses: rows.map((row) => row.status).join(","),
      firstRefused: rows.find((row) => row.status === 503) ?? null,
      cachedStillServed: { status: again.status, cache: again.cache },
    };
  },

  async "budget-unavailable"() {
    // Run against a Worker whose budget table does not exist (or whose D1 is down): every cache miss must be refused,
    // never answered unmetered.
    const rows = [];
    for (let i = 0; i < 3; i++) {
      const response = await get(
        `/api/nearby-places?lat=1.${3000 + i}&lng=103.8400&radius=500&types=mrt_exit`,
      );
      rows.push({
        i,
        status: response.status,
        cacheControl: response.cacheControl,
        retryAfter: response.retryAfter,
        body: parse(response),
      });
    }
    return { statuses: rows.map((row) => row.status).join(","), first: rows[0] };
  },

  async latency() {
    const miss = [];
    const hit = [];
    for (let i = 0; i < 40; i++) {
      const query = `lat=1.${3100 + i}&lng=103.${8000 + (i % 7) * 11}&radius=1000&types=hdb_block,mrt_station,mrt_exit`;
      const first = await get(`/api/nearby-places?${query}`);
      if (first.status === 200 && first.cache === "MISS") miss.push(first.elapsedMs);
      const second = await get(`/api/nearby-places?${query}`);
      if (second.status === 200 && second.cache?.startsWith("HIT")) hit.push(second.elapsedMs);
      await sleep(250);
    }
    return {
      miss: summarise(miss),
      hit: summarise(hit),
      note: "client-observed wall time from this machine; includes the network to the nearest Cloudflare location",
    };
  },
};

const phase = process.argv[2];
if (!phases[phase])
  throw new Error(`unknown phase "${phase}"; expected one of ${Object.keys(phases).join(", ")}`);
const output = JSON.stringify(
  { phase, base: new URL(BASE).host, at: new Date().toISOString(), ...(await phases[phase]()) },
  null,
  2,
);
if (process.argv[3]) writeFileSync(process.argv[3], output);
console.log(output);
