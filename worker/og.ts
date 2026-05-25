import { rowToBlockSummary, townFilenameToCanonical, type BlockRow } from "../functions/_lib/d1";
import {
  escapeXml,
  formatCount,
  formatCurrency,
  mapBlockToOgProps,
  transactionWeightedMedian,
  type DataWindow,
  type TownAggregateRow,
} from "./og-utils";

type ManifestJson = {
  generatedAt?: string;
  dataWindow?: DataWindow;
};

/** SVG responses; route suffix is `.svg` until PNG rendering is available. */
const IMAGE_HEADERS = {
  "content-type": "image/svg+xml; charset=utf-8",
  "cache-control": "public, max-age=86400",
};

const MAX_OG_ADDRESS_KEY_LENGTH = 128;
const MAX_OG_TOWN_SLUG_LENGTH = 64;
const MANIFEST_CACHE_TTL_MS = 5 * 60 * 1000;

let manifestCache:
  | { expiresAt: number; version: string; dataWindow: DataWindow }
  | null = null;

async function readManifestMetadata(env: Env): Promise<{ version: string; dataWindow: DataWindow }> {
  const now = Date.now();
  if (manifestCache && manifestCache.expiresAt > now) {
    return { version: manifestCache.version, dataWindow: manifestCache.dataWindow };
  }

  const row = await env.DB.prepare("SELECT json FROM manifest WHERE id = 1").first<{ json: string }>();
  const parsed: ManifestJson = {};
  if (row) {
    try {
      Object.assign(parsed, JSON.parse(row.json) as ManifestJson);
    } catch (err) {
      console.error("Failed to parse manifest JSON:", err);
    }
  }
  const value = {
    version: parsed.generatedAt ?? "unknown",
    dataWindow: parsed.dataWindow ?? { minMonth: "N/A", maxMonth: "N/A" },
  };
  manifestCache = { expiresAt: now + MANIFEST_CACHE_TTL_MS, ...value };
  return value;
}

export function resetOgManifestCacheForTests(): void {
  manifestCache = null;
}

function buildCacheKey(request: Request, key: string, version: string): Request {
  const origin = new URL(request.url).origin;
  return new Request(`${origin}/__og-cache/${key}?v=${encodeURIComponent(version)}`);
}

function fallbackCard(request: Request): Response {
  return Response.redirect(`${new URL(request.url).origin}/og-card.png`, 302);
}

function blockCardSvg(props: ReturnType<typeof mapBlockToOgProps>): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" font-family="system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
  <rect width="1200" height="630" fill="#0f172a"/>
  <text x="48" y="80" fill="#94a3b8" font-size="30">${escapeXml(props.eyebrow)}</text>
  <text x="48" y="180" fill="#e2e8f0" font-size="64">${escapeXml(props.title)}</text>
  <text x="48" y="300" fill="#f8fafc" font-size="82">${escapeXml(props.medianPrice)}</text>
  <text x="48" y="380" fill="#94a3b8" font-size="28">$/SQM: ${escapeXml(props.pricePerSqm)} · LEASE: ${escapeXml(props.leaseCommenceYear)} · MRT WALK: ${escapeXml(props.mrtWalk)}</text>
  <text x="48" y="590" fill="#94a3b8" font-size="24">HDB Resale Explorer · Data window ${escapeXml(props.dataWindow)}</text>
</svg>`;
}

function compareCardSvg(input: {
  canonicalA: string;
  canonicalB: string;
  aMedian: number;
  bMedian: number;
  aTransactions: number;
  bTransactions: number;
}): string {
  const delta = input.aMedian - input.bMedian;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" font-family="system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif">
  <rect width="1200" height="630" fill="#111827"/>
  <text x="48" y="72" fill="#cbd5e1" font-size="32">Town Comparison</text>
  <text x="48" y="130" fill="white" font-size="40">${escapeXml(input.canonicalA)}</text>
  <text x="48" y="200" fill="white" font-size="56">${escapeXml(formatCurrency(input.aMedian))}</text>
  <text x="48" y="250" fill="#cbd5e1" font-size="30">Transactions: ${formatCount(input.aTransactions)}</text>
  <text x="648" y="130" fill="white" font-size="40">${escapeXml(input.canonicalB)}</text>
  <text x="648" y="200" fill="white" font-size="56">${escapeXml(formatCurrency(input.bMedian))}</text>
  <text x="648" y="250" fill="#cbd5e1" font-size="30">Transactions: ${formatCount(input.bTransactions)}</text>
  <text x="48" y="580" fill="#cbd5e1" font-size="36">Delta: ${escapeXml(formatCurrency(delta))}</text>
</svg>`;
}

export async function handleBlockOg(request: Request, env: Env, addressKey: string): Promise<Response> {
  if (addressKey.length > MAX_OG_ADDRESS_KEY_LENGTH) return fallbackCard(request);

  const { version, dataWindow } = await readManifestMetadata(env);
  const cacheKey = buildCacheKey(request, `block/${encodeURIComponent(addressKey)}`, version);

  let cached: Response | undefined;
  try {
    cached = await caches.default.match(cacheKey);
  } catch (err) {
    console.warn("Cache match failed:", err);
  }
  if (cached) return cached;

  const row = await env.DB.prepare("SELECT * FROM blocks WHERE address_key = ?").bind(addressKey).first<BlockRow>();
  if (!row) return fallbackCard(request);

  const props = mapBlockToOgProps(rowToBlockSummary(row), dataWindow);
  const response = new Response(blockCardSvg(props), { headers: IMAGE_HEADERS });
  try {
    await caches.default.put(cacheKey, response.clone());
  } catch (err) {
    console.warn("Cache put failed:", err);
  }
  return response;
}

export async function handleCompareOg(request: Request, env: Env, townA: string, townB: string): Promise<Response> {
  if (townA.length > MAX_OG_TOWN_SLUG_LENGTH || townB.length > MAX_OG_TOWN_SLUG_LENGTH) {
    return fallbackCard(request);
  }

  const canonicalA = townFilenameToCanonical(townA);
  const canonicalB = townFilenameToCanonical(townB);

  const { version } = await readManifestMetadata(env);
  const cacheKey = buildCacheKey(request, `compare/${encodeURIComponent(townA)}/${encodeURIComponent(townB)}`, version);

  let cached: Response | undefined;
  try {
    cached = await caches.default.match(cacheKey);
  } catch (err) {
    console.warn("Cache match failed:", err);
  }
  if (cached) return cached;

  const rows = await env.DB.prepare("SELECT town, median_price, transaction_count FROM blocks WHERE town IN (?, ?)")
    .bind(canonicalA, canonicalB)
    .all<TownAggregateRow>();

  const grouped = new Map<string, TownAggregateRow[]>();
  for (const row of rows.results ?? []) {
    const existing = grouped.get(row.town) ?? [];
    existing.push(row);
    grouped.set(row.town, existing);
  }

  const aRows = grouped.get(canonicalA) ?? [];
  const bRows = grouped.get(canonicalB) ?? [];
  if (aRows.length === 0 || bRows.length === 0) return fallbackCard(request);

  const aMedian = transactionWeightedMedian(aRows);
  const bMedian = transactionWeightedMedian(bRows);
  if (aMedian === null || bMedian === null) return fallbackCard(request);

  const aTransactions = aRows.reduce((sum, row) => sum + row.transaction_count, 0);
  const bTransactions = bRows.reduce((sum, row) => sum + row.transaction_count, 0);

  const response = new Response(
    compareCardSvg({
      canonicalA,
      canonicalB,
      aMedian,
      bMedian,
      aTransactions,
      bTransactions,
    }),
    { headers: IMAGE_HEADERS },
  );
  try {
    await caches.default.put(cacheKey, response.clone());
  } catch (err) {
    console.warn("Cache put failed:", err);
  }
  return response;
}
