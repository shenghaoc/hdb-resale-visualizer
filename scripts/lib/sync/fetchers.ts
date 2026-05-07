import Papa from "papaparse";

function getHeaders(): Record<string, string> {
  const apiKey = process.env.DATA_GOV_API_KEY;
  return apiKey ? { "x-api-key": apiKey } : {};
}

function getJsonHeaders(headers?: RequestInit["headers"]): Headers {
  const nextHeaders = new Headers({ "content-type": "application/json", ...getHeaders() });
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

export async function sleep(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  { attempts = 6, retryDelayMs = 2200 }: FetchRetryOptions = {},
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(`Request failed for ${url}`);
      if (attempt < attempts - 1) {
        await sleep(retryDelayMs * (attempt + 1));
      }
      continue;
    }

    if (response.ok) return response;
    if (!shouldRetryStatus(response.status)) {
      throw new Error(`Request failed for ${url}: ${response.status}`);
    }

    lastError = new Error(`Request failed for ${url}: ${response.status}`);
    if (attempt < attempts - 1) {
      await sleep(retryDelayMs * (attempt + 1));
    }
  }

  throw lastError ?? new Error(`Request failed for ${url}`);
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithRetry(url, {
    ...init,
    headers: getJsonHeaders(init?.headers),
  });
  return (await response.json()) as T;
}

export async function getDatasetDownloadUrl(datasetId: string) {
  const base = `https://api-open.data.gov.sg/v1/public/api/datasets/${datasetId}`;
  try {
    await fetchJson(`${base}/initiate-download`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch {
    // Some datasets expose the file directly through poll-download without initiation.
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const payload = await fetchJson<{ code: number; data?: { url?: string } }>(
      `${base}/poll-download`,
    );
    const url = payload.data?.url;
    if (url) return url;
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for dataset download URL: ${datasetId}`);
}

export async function fetchCsvRows(datasetId: string) {
  const downloadUrl = await getDatasetDownloadUrl(datasetId);
  const response = await fetchWithRetry(downloadUrl);
  const csv = await response.text();
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(`CSV parse error for ${datasetId}: ${parsed.errors[0]?.message ?? "unknown"}`);
  return parsed.data;
}

export async function fetchGeoJson(datasetId: string) {
  const downloadUrl = await getDatasetDownloadUrl(datasetId);
  const response = await fetchWithRetry(downloadUrl);
  return (await response.json()) as { type: "FeatureCollection"; features: unknown[] };
}
