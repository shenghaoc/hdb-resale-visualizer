/** Bounded anonymous official context capture only. Never loads DB credentials or calls OneMap. */
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import Papa from "papaparse";
import { datasetMetadataSchema } from "../lib/schemas";
import {
  PROPERTY_DATASET_ID,
  MRT_DATASET_ID,
  MOE_SCHOOL_DATASET_ID,
  NEA_HAWKER_DATASET_ID,
  SFA_SUPERMARKET_DATASET_ID,
  NPARKS_PARKS_DATASET_ID,
} from "../lib/sync/constants";

const DATASETS = [
  { kind: "property", id: PROPERTY_DATASET_ID, format: "csv" },
  { kind: "mrt", id: MRT_DATASET_ID, format: "geojson" },
  { kind: "schools", id: MOE_SCHOOL_DATASET_ID, format: "csv" },
  { kind: "hawkers", id: NEA_HAWKER_DATASET_ID, format: "geojson" },
  { kind: "supermarkets", id: SFA_SUPERMARKET_DATASET_ID, format: "csv" },
  { kind: "parks", id: NPARKS_PARKS_DATASET_ID, format: "geojson" },
] as const;
const MAX_RESPONSE_BYTES = 16_000_000,
  MAX_TOTAL_BYTES = 32_000_000,
  MAX_REQUESTS = 48;
if (process.argv.slice(2).join(" ") !== "--capture-context-only")
  throw new Error("Explicit bounded public-context capture required");
const startedAtUTC = new Date().toISOString();
const directory = `.neon-benchmark/official-context-${startedAtUTC.replaceAll(":", "-").replaceAll(".", "-")}`;
mkdirSync(directory, { mode: 0o700 });
const deadline = AbortSignal.timeout(10 * 60_000);
const requests: {
  kind: string;
  datasetId: string;
  startedAtUTC: string;
  HTTPStatus: number | null;
  bytes: number;
  wallMs: number;
  success: boolean;
}[] = [];
let totalBytes = 0;
const lastRequest = { metadata: 0, download: 0 };
async function get(url: string, kind: string, datasetId: string, lane?: keyof typeof lastRequest) {
  if (requests.length >= MAX_REQUESTS) throw new Error("Public capture request bound exceeded");
  if (lane) {
    const gap = (lane === "download" ? 12_000 : 1_667) - (Date.now() - lastRequest[lane]);
    if (gap > 0) await new Promise((resolve) => setTimeout(resolve, gap));
    lastRequest[lane] = Date.now();
  }
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    !["data.gov.sg", "amazonaws.com", "cloudfront.net"].some(
      (host) => target.hostname === host || target.hostname.endsWith(`.${host}`),
    )
  )
    throw new Error("Unexpected official delivery host");
  const t = performance.now();
  const item = {
    kind,
    datasetId,
    startedAtUTC: new Date().toISOString(),
    HTTPStatus: null as number | null,
    bytes: 0,
    wallMs: 0,
    success: false,
  };
  requests.push(item);
  const chunks: Uint8Array[] = [];
  let response: Response | undefined;
  try {
    response = await fetch(target, {
      method: "GET",
      signal: AbortSignal.any([deadline, AbortSignal.timeout(30_000)]),
      redirect: "error",
    });
    item.HTTPStatus = response.status;
    if (!response.ok)
      throw new Error(`${kind} HTTP ${response.status}; no authentication or fallback attempted`);
    if (!response.body) throw new Error("Empty official response body");
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      item.bytes += value.length;
      totalBytes += value.length;
      if (item.bytes > MAX_RESPONSE_BYTES || totalBytes > MAX_TOTAL_BYTES) {
        await reader.cancel();
        throw new Error("Public capture response byte bound exceeded");
      }
      chunks.push(value);
    }
    item.success = true;
    return Buffer.concat(chunks);
  } finally {
    item.wallMs = performance.now() - t;
    if (!item.success) await response?.body?.cancel().catch(() => {});
  }
}
async function metadata(id: string) {
  const raw = JSON.parse(
    (
      await get(
        `https://api-production.data.gov.sg/v2/public/api/datasets/${id}/metadata`,
        "metadata",
        id,
        "metadata",
      )
    ).toString(),
  ) as { data: Record<string, unknown> };
  const checked = datasetMetadataSchema.parse(raw);
  if (checked.errorMsg || checked.data.datasetId !== id)
    throw new Error("Unexpected official metadata identity");
  return {
    datasetId: id,
    title: String(raw.data.name),
    lastUpdatedAt: new Date(checked.data.lastUpdatedAt).toISOString(),
    datasetSize: raw.data.datasetSize,
    format: raw.data.format,
  };
}
const captures: {
  kind: string;
  datasetId: string;
  format: string;
  path: string;
  SHA256: string;
  bytes: number;
  rawRows: number;
  retrievedAtUTC: string;
}[] = [];
const receipt: Record<string, unknown> = {
  startedAtUTC,
  directory,
  scope: "Six context datasets only; pinned transaction CSV unchanged",
  requests,
  captures,
  bounds: {
    maxResponseBytes: MAX_RESPONSE_BYTES,
    maxTotalBytes: MAX_TOTAL_BYTES,
    maxRequests: MAX_REQUESTS,
  },
  credentialsUsed: false,
  OneMapCalls: 0,
  NeonCalls: 0,
  D1Calls: 0,
  publication: false,
};
const save = () =>
  writeFileSync(
    `${directory}/receipt.json`,
    JSON.stringify({ ...receipt, receivedResponseBytes: totalBytes }, null, 2),
    { mode: 0o600 },
  );
try {
  receipt.before = await Promise.resolve().then(async () => {
    const result = [];
    for (const dataset of DATASETS) result.push(await metadata(dataset.id));
    return result;
  });
  save();
  for (const dataset of DATASETS) {
    const base = `https://api-open.data.gov.sg/v1/public/api/datasets/${dataset.id}`;
    // Official guide permits non-CSV datasets to go directly to poll-download.
    if (dataset.format === "csv")
      await get(`${base}/initiate-download`, "initiate", dataset.id, "download");
    let delivery: string | undefined;
    for (let attempt = 0; attempt < 4 && !delivery; attempt++) {
      const poll = JSON.parse(
        (await get(`${base}/poll-download`, "poll", dataset.id, "download")).toString(),
      ) as { data?: { url?: string } };
      delivery = poll.data?.url;
    }
    if (!delivery) throw new Error("Official context download not ready within bounded polls");
    const body = await get(delivery, "body", dataset.id);
    const file = `${directory}/${dataset.id}.${dataset.format}`;
    let rawRows: number;
    if (dataset.format === "csv") {
      const parsed = Papa.parse<Record<string, string>>(body.toString(), {
        header: true,
        skipEmptyLines: true,
      });
      if (parsed.errors.length) throw new Error("Official context CSV parser rejected body");
      rawRows = parsed.data.length;
    } else {
      const raw = JSON.parse(body.toString()) as { type?: string; features?: unknown[] };
      if (raw.type !== "FeatureCollection" || !Array.isArray(raw.features))
        throw new Error("Official context GeoJSON shape rejected");
      rawRows = raw.features.length;
    }
    if (!rawRows) throw new Error("Empty official context dataset rejected");
    writeFileSync(file, body, { mode: 0o600 });
    captures.push({
      kind: dataset.kind,
      datasetId: dataset.id,
      format: dataset.format,
      path: file,
      SHA256: createHash("sha256").update(body).digest("hex"),
      bytes: body.length,
      rawRows,
      retrievedAtUTC: new Date().toISOString(),
    });
    save();
    console.log(JSON.stringify({ captured: dataset.kind, bytes: body.length, rawRows }));
  }
  const after = [];
  for (const dataset of DATASETS) after.push(await metadata(dataset.id));
  receipt.after = after;
  receipt.contextMetadataStableDuringCapture =
    JSON.stringify(receipt.before) === JSON.stringify(after);
  if (!receipt.contextMetadataStableDuringCapture)
    throw new Error("Context metadata changed during capture; no forecast authorized");
  receipt.success = true;
  receipt.finishedAtUTC = new Date().toISOString();
  save();
  console.log(
    JSON.stringify({
      directory,
      requestCount: requests.length,
      receivedResponseBytes: totalBytes,
      success: true,
    }),
  );
} catch (error) {
  receipt.success = false;
  receipt.error =
    error instanceof Error
      ? error.message.replace(/https?:\/\/[^\s]+/g, "[redacted URL]")
      : "Unknown public capture failure";
  receipt.finishedAtUTC = new Date().toISOString();
  save();
  console.error(JSON.stringify({ directory, success: false, error: receipt.error }));
  process.exitCode = 1;
}
