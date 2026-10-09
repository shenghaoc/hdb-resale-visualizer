/** Explicitly authorized ephemeral tail only. Raw frames and credentials remain memory-only. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { normalizeSuggestQuery } from "../../functions/_lib/suggest";
import { townToFilename } from "../../shared/geo";
import { PublicTraceCollector, type PublicTraceAllowlist } from "./runtime-trace";

const ACCOUNT = "059214b3bd95f4adf743d960c23936dc";
const SCRIPT = "hdb-resale-visualizer";
const ROOT = ".neon-benchmark/runtime-canary";
const MAX_MS = 3_600_000;
const MAX_OUTPUT = 1_048_576;
if (!process.argv.includes("--capture-authorized"))
  throw new Error("Explicit authorized capture flag required");
if (existsSync(`${ROOT}/trace.json`))
  throw new Error("Preserve the existing trace; do not open a second session");

function publicAllowlist(): PublicTraceAllowlist {
  const db = new DatabaseSync(".neon-benchmark/source.sqlite", { readOnly: true });
  const addresses = new Set<string>(),
    towns = new Set<string>(),
    townSlugs = new Set<string>();
  const flatTypes = new Set<string>(),
    flatModels = new Set<string>(),
    suggestionQueries = new Set<string>();
  const addPrefixes = (text: string) => {
    const normalized = normalizeSuggestQuery(text);
    for (let length = 2; length <= Math.min(normalized.length, 64); length++)
      suggestionQueries.add(normalized.slice(0, length).trim());
  };
  try {
    const blocks = db
      .prepare(
        "SELECT address_key,town,block,street_name,postal_code,flat_types_json,flat_models_json FROM blocks LIMIT 20001",
      )
      .all();
    if (blocks.length > 20000) throw new Error("Offline dictionary exceeds its bound");
    for (const row of blocks) {
      addresses.add(String(row.address_key));
      towns.add(String(row.town));
      townSlugs.add(townToFilename(String(row.town)));
      addPrefixes(String(row.town));
      addPrefixes(String(row.street_name));
      addPrefixes(`${String(row.block)} ${String(row.street_name)}`);
      if (row.postal_code) addPrefixes(String(row.postal_code));
      for (const value of JSON.parse(String(row.flat_types_json)) as string[])
        flatTypes.add(value.toUpperCase());
      for (const value of JSON.parse(String(row.flat_models_json)) as string[])
        flatModels.add(value.toUpperCase());
    }
    const mrt = db.prepare("SELECT json FROM mrt_geojson WHERE kind='stations'").get();
    const geo = mrt
      ? (JSON.parse(String(mrt.json)) as { features?: { properties?: { stationName?: string } }[] })
      : {};
    for (const f of geo.features ?? [])
      if (f.properties?.stationName) addPrefixes(f.properties.stationName);
    return { addresses, towns, townSlugs, flatTypes, flatModels, suggestionQueries };
  } finally {
    db.close();
  }
}
const configPaths = [
  join(homedir(), "Library/Preferences/.wrangler/config/default.toml"),
  join(homedir(), ".wrangler/config/default.toml"),
];
const configPath = configPaths.find(existsSync);
if (!configPath) throw new Error("Existing Wrangler authentication unavailable");
const token = /^oauth_token\s*=\s*"([^"]+)"/m.exec(readFileSync(configPath, "utf8"))?.[1];
if (!token) throw new Error("Existing Wrangler OAuth unavailable");
async function api(method: "POST" | "DELETE", path: string, body?: unknown) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const data = (await response.json()) as {
    success?: boolean;
    result?: unknown;
    errors?: { code?: number }[];
  };
  if (!response.ok || !data.success)
    throw new Error(
      `Control API failed: HTTP ${response.status}; codes ${(data.errors ?? []).map((e) => e.code).join(",")}`,
    );
  return data.result;
}
const allow = publicAllowlist();
const startedMs = Date.now(),
  monotonicStart = performance.now();
const collector = new PublicTraceCollector(allow, startedMs, {
  maximumEligible: 500,
  maximumBytes: MAX_OUTPUT - 32768,
  maximumMs: MAX_MS,
});
let frames = 0,
  rawFrameBytes = 0,
  infoFrames = 0,
  samplingInfoFrames = 0;
let connected = false,
  tailId: string | null = null,
  deleted = false,
  socket: WebSocket | undefined;
let resolveStop: (() => void) | undefined,
  stopping = false;
const elapsed = () => performance.now() - monotonicStart;
const persist = () => {
  const trace = {
    source: "Cloudflare ephemeral real-time tail",
    startedAtUTC: new Date(startedMs).toISOString(),
    elapsedMs: Math.floor(elapsed()),
    limits: { maximumMs: MAX_MS, maximumEligible: 500, maximumSanitizedBytes: MAX_OUTPUT },
    connected,
    frames,
    rawFrameBytes,
    infoFrames,
    samplingInfoFrames,
    sampling: samplingInfoFrames
      ? "provider warning observed; incomplete trace"
      : "no provider warning observed; completeness not guaranteed",
    ...collector.snapshot(),
  };
  const encoded = JSON.stringify(trace, null, 2) + "\n";
  // Pretty printing could expand the payload; compact it before testing/persisting the cap.
  const compact = JSON.stringify(trace) + "\n";
  const output = Buffer.byteLength(encoded) <= MAX_OUTPUT - 16384 ? encoded : compact;
  if (Buffer.byteLength(output) > MAX_OUTPUT - 16384)
    throw new Error("Sanitized trace output bound exceeded");
  writeFileSync(`${ROOT}/trace.json`, output, { mode: 0o600 });
  writeFileSync(
    `${ROOT}/capture-control.json`,
    JSON.stringify(
      {
        tailId,
        connected,
        deleted,
        startedAtUTC: new Date(startedMs).toISOString(),
        stopReason: collector.stopReason,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
};
const stop = (reason: string) => {
  if (stopping) return;
  stopping = true;
  collector.stopReason ??= reason;
  socket?.close();
  resolveStop?.();
};
const deadline = setTimeout(() => stop("time-limit"), MAX_MS);
const heartbeat = setInterval(() => {
  persist();
  console.log(
    JSON.stringify({
      elapsedSeconds: Math.floor(elapsed() / 1000),
      eligible: collector.eligible,
      groups: collector.groups.length,
      connected,
    }),
  );
}, 60000);
process.on("SIGINT", () => stop("operator-stop"));
process.on("SIGTERM", () => stop("operator-stop"));
process.stdin.setEncoding("utf8");
process.stdin.on("data", (text: string) => {
  if (text.includes("STOP")) stop("operator-stop");
});
try {
  const record = (await api("POST", `/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/tails`, {
    filters: [{ method: ["GET"] }],
  })) as { id?: string; url?: string };
  if (!record.id || !/^[a-zA-Z0-9-]{1,128}$/.test(record.id) || !record.url)
    throw new Error("Unexpected ephemeral tail receipt");
  tailId = record.id;
  persist();
  if (elapsed() >= MAX_MS) stop("time-limit");
  else {
    const finished = new Promise<void>((resolve) => {
      resolveStop = resolve;
    });
    socket = new WebSocket(record.url, "trace-v1");
    socket.binaryType = "arraybuffer";
    socket.addEventListener("open", () => {
      connected = true;
      socket?.send(JSON.stringify({ debug: false }));
      persist();
      console.log(
        JSON.stringify({
          captureReady: true,
          maximumMinutes: 60,
          maximumEligible: 500,
          maximumSanitizedBytes: MAX_OUTPUT,
        }),
      );
    });
    socket.addEventListener("message", (event) => {
      if (stopping || elapsed() >= MAX_MS) {
        stop("time-limit");
        return;
      }
      const value: unknown = event.data;
      const buffer =
        typeof value === "string"
          ? Buffer.from(value)
          : value instanceof ArrayBuffer
            ? Buffer.from(value)
            : null;
      if (!buffer) {
        stop("unsupported-tail-frame");
        return;
      }
      frames++;
      rawFrameBytes += buffer.length;
      if (frames > 5000 || rawFrameBytes > 32 * 1024 * 1024) {
        stop("minimum-capture-raw-volume-stop");
        return;
      }
      if (buffer.length > 2 * 1024 * 1024) {
        stop("oversized-tail-frame");
        return;
      }
      let raw: unknown;
      try {
        raw = JSON.parse(buffer.toString("utf8"));
      } catch {
        stop("invalid-tail-frame");
        return;
      }
      const info = raw as { event?: { type?: unknown; message?: unknown } };
      if (info?.event?.type !== undefined && info.event.message !== undefined) {
        infoFrames++;
        if (typeof info.event.message === "string" && /sampl|drop/i.test(info.event.message))
          samplingInfoFrames++;
      } else collector.accept(raw, elapsed());
      persist();
      if (collector.stopReason) stop(collector.stopReason);
    });
    socket.addEventListener("error", () => stop("tail-socket-error"));
    socket.addEventListener("close", () => stop("tail-socket-closed"));
    await finished;
  }
} catch (error) {
  stop("capture-setup-or-control-error");
  // Only our fixed control error status/codes are safe to expose; never dump transport objects.
  const message =
    error instanceof Error && error.message.startsWith("Control API failed:")
      ? error.message
      : "Capture transport/setup failed";
  console.log(JSON.stringify({ captureError: message }));
} finally {
  stopping = true;
  socket?.close();
  clearTimeout(deadline);
  clearInterval(heartbeat);
  process.stdin.pause();
  if (tailId) {
    try {
      await api("DELETE", `/accounts/${ACCOUNT}/workers/scripts/${SCRIPT}/tails/${tailId}`);
      deleted = true;
    } catch {
      console.log(JSON.stringify({ tailDeletionFailed: true, tailId }));
    }
  }
  persist();
  console.log(
    JSON.stringify({
      captureFinished: true,
      elapsedSeconds: Math.floor(elapsed() / 1000),
      eligible: collector.eligible,
      groups: collector.groups.length,
      deleted,
      stopReason: collector.stopReason,
    }),
  );
  // Native WebSocket/HTTP handles can outlive a completed tail; the cleanup receipt is already synchronous.
  const completed =
    connected &&
    deleted &&
    ["operator-stop", "time-limit", "eligible-limit", "output-byte-limit"].includes(
      collector.stopReason ?? "",
    );
  process.stdout.write("", () => process.exit(completed ? 0 : 1));
}
