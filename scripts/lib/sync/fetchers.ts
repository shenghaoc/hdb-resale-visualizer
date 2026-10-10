import Papa from "papaparse";
import { createHash } from "node:crypto";
import { classifyUpstreamService, sleep, waitForUpstreamSlot } from "./rate-limits";

function getHeaders(): Record<string, string> {
  const apiKey = process.env.DATA_GOV_API_KEY;
  return apiKey ? { "x-api-key": apiKey } : {};
}

function getJsonHeaders(url: string, headers?: RequestInit["headers"]): Headers {
  const hostname = new URL(url).hostname;
  const dataGov = hostname === "api-open.data.gov.sg" || hostname === "api-production.data.gov.sg";
  const nextHeaders = new Headers({
    "content-type": "application/json",
    ...(dataGov ? getHeaders() : {}),
  });
  new Headers(headers).forEach((value, key) => {
    nextHeaders.set(key, value);
  });
  return nextHeaders;
}

function shouldRetryStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

type FetchRetryOptions = {
  attempts?: number;
  retryDelayMs?: number;
};

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  { attempts = 6, retryDelayMs = 2200 }: FetchRetryOptions = {},
): Promise<Response> {
  const safeUrl = (() => {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  })();
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(`Request failed for ${safeUrl}`);
      if (attempt < attempts - 1) {
        await sleep(retryDelayMs * (attempt + 1));
      }
      continue;
    }

    if (response.ok) return response;
    if (!shouldRetryStatus(response.status)) {
      // Try to read D1 error body for diagnostics before throwing.
      let detail = "";
      try {
        const b = (await response.json()) as Record<string, unknown>;
        detail = ": " + JSON.stringify(b);
      } catch {
        /* ignore */
      }
      throw new Error(`Request failed for ${safeUrl}: ${response.status}${detail}`);
    }

    lastError = new Error(`Request failed for ${safeUrl}: ${response.status}`);
    if (attempt < attempts - 1) {
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError ?? new Error(`Request failed for ${safeUrl}`);
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const upstreamService = classifyUpstreamService(url);
  if (upstreamService) {
    await waitForUpstreamSlot(upstreamService);
  }
  const response = await fetchWithRetry(url, {
    ...init,
    headers: getJsonHeaders(url, init?.headers),
  });
  const ct = response.headers.get("content-type") ?? "";
  if (!ct.includes("application/json") && !ct.includes("text/plain")) {
    const preview = await response.text().catch(() => "");
    throw new Error(
      `Expected JSON from ${url} but got ${ct}${preview ? ` — ${preview.slice(0, 200)}` : ""}`,
    );
  }
  return (await response.json()) as T;
}

async function getDatasetDownloadUrl(datasetId: string) {
  const base = `https://api-open.data.gov.sg/v1/public/api/datasets/${datasetId}`;
  // Official download flow uses GET; access denial is terminal, not a poll fallback.
  await fetchJson(`${base}/initiate-download`);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const payload = await fetchJson<{ code: number; data?: { url?: string } }>(
      `${base}/poll-download`,
    );
    const url = payload.data?.url;
    if (url) return url;
  }
  throw new Error(`Timed out waiting for dataset download URL: ${datasetId}`);
}

export type CsvCapture = {
  datasetId: string;
  bodySHA256: string;
  bytes: number;
  rows: number;
  capturedAtUTC: string;
};
export async function fetchCsvRows(
  datasetId: string,
  capture?: (receipt: CsvCapture, body: Uint8Array) => void,
) {
  const downloadUrl = await getDatasetDownloadUrl(datasetId);
  const response = await fetchWithRetry(downloadUrl);
  // The existing D1 caller retains its text path. Optional Neon evidence captures raw delivered bytes.
  const body = capture ? new Uint8Array(await response.arrayBuffer()) : undefined;
  const csv = body ? new TextDecoder().decode(body) : await response.text();
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0)
    throw new Error(`CSV parse error for ${datasetId}: ${parsed.errors[0]?.message ?? "unknown"}`);
  if (capture && body)
    capture(
      {
        datasetId,
        bodySHA256: createHash("sha256").update(body).digest("hex"),
        bytes: body.byteLength,
        rows: parsed.data.length,
        capturedAtUTC: new Date().toISOString(),
      },
      body,
    );
  return parsed.data;
}

export async function fetchGeoJson(datasetId: string) {
  const downloadUrl = await getDatasetDownloadUrl(datasetId);
  const response = await fetchWithRetry(downloadUrl);
  return (await response.json()) as { type: "FeatureCollection"; features: unknown[] };
}
