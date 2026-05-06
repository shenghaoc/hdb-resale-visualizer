import Papa from "papaparse";

function getHeaders() {
  const apiKey = process.env.DATA_GOV_API_KEY;
  return apiKey ? { "x-api-key": apiKey } : {};
}

export async function sleep(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...getHeaders(), ...(init?.headers ?? {}) },
    });
    if (response.ok) return (await response.json()) as T;
    if (response.status === 429 || response.status >= 500) {
      lastError = new Error(`Request failed for ${url}: ${response.status}`);
      await sleep(2200 * (attempt + 1));
      continue;
    }
    throw new Error(`Request failed for ${url}: ${response.status}`);
  }
  throw lastError ?? new Error(`Request failed for ${url}`);
}

export async function getDatasetDownloadUrl(datasetId: string) {
  const base = `https://api-open.data.gov.sg/v1/public/api/datasets/${datasetId}`;
  try { await fetchJson(`${base}/initiate-download`, { method: "POST", body: JSON.stringify({}) }); } catch { /* noop: poll endpoint may still work */ }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const payload = await fetchJson<{ code: number; data?: { url?: string } }>(`${base}/poll-download`);
    const url = payload.data?.url;
    if (url) return url;
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for dataset download URL: ${datasetId}`);
}

export async function fetchCsvRows(datasetId: string) {
  const downloadUrl = await getDatasetDownloadUrl(datasetId);
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error(`Failed to download CSV for ${datasetId}: ${response.status}`);
  const csv = await response.text();
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(`CSV parse error for ${datasetId}: ${parsed.errors[0]?.message ?? "unknown"}`);
  return parsed.data;
}

export async function fetchGeoJson(datasetId: string) {
  const downloadUrl = await getDatasetDownloadUrl(datasetId);
  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error(`Failed to download GEOJSON for ${datasetId}: ${response.status}`);
  return (await response.json()) as { type: "FeatureCollection"; features: unknown[] };
}
