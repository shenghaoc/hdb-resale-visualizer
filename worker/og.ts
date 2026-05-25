import { rowToBlockSummary, townFilenameToCanonical, type BlockRow } from "../functions/_lib/d1";

type DataWindow = { minMonth: string; maxMonth: string };

type ManifestJson = {
  generatedAt?: string;
  dataWindow?: DataWindow;
};

type TownAggregateRow = {
  town: string;
  median_price: number;
  transaction_count: number;
};

/** SVG responses; route suffix is `.svg` until PNG rendering is available. */
const IMAGE_HEADERS = {
  "content-type": "image/svg+xml; charset=utf-8",
  "cache-control": "public, max-age=31536000, immutable",
};

const MAX_OG_ADDRESS_KEY_LENGTH = 128;
const MAX_OG_TOWN_SLUG_LENGTH = 64;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatWalkMinutes(seconds: number | null): string {
  if (seconds === null || seconds < 0) return "N/A";
  const minutes = Math.round(seconds / 60);
  if (minutes <= 0) return "< 1 min";
  return `${minutes} min`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lower = sorted[mid - 1];
  const upper = sorted[mid];
  if (lower === undefined || upper === undefined) return null;
  return (lower + upper) / 2;
}

export function mapBlockToOgProps(block: ReturnType<typeof rowToBlockSummary>, dataWindow: DataWindow) {
  const walkingSeconds =
    block.nearestMrt && typeof block.nearestMrt === "object" && "walkingTimeSeconds" in block.nearestMrt
      ? ((block.nearestMrt as { walkingTimeSeconds?: number }).walkingTimeSeconds ?? null)
      : null;

  return {
    eyebrow: block.town,
    title: `${block.block} ${block.streetName}`,
    medianPrice: formatCurrency(block.medianPrice),
    pricePerSqm: formatCurrency(block.pricePerSqmMedian),
    leaseCommenceYear: String(block.leaseCommenceRange?.[0] ?? "N/A"),
    mrtWalk: formatWalkMinutes(walkingSeconds),
    dataWindow: `${dataWindow.minMonth} → ${dataWindow.maxMonth}`,
  };
}

async function readManifestMetadata(env: Env): Promise<{ version: string; dataWindow: DataWindow }> {
  const row = await env.DB.prepare("SELECT json FROM manifest WHERE id = 1").first<{ json: string }>();
  const parsed = row ? (JSON.parse(row.json) as ManifestJson) : {};
  return {
    version: parsed.generatedAt ?? "unknown",
    dataWindow: parsed.dataWindow ?? { minMonth: "N/A", maxMonth: "N/A" },
  };
}

function buildCacheKey(request: Request, key: string, version: string): Request {
  const origin = new URL(request.url).origin;
  return new Request(`${origin}/__og-cache/${key}?v=${encodeURIComponent(version)}`);
}

function fallbackCard(request: Request): Response {
  return Response.redirect(`${new URL(request.url).origin}/og-card.png`, 302);
}

export async function handleBlockOg(request: Request, env: Env, addressKey: string): Promise<Response> {
  if (addressKey.length > MAX_OG_ADDRESS_KEY_LENGTH) return fallbackCard(request);

  // Manifest version keys the immutable cache; one D1 read per request even on cache hits.
  const { version, dataWindow } = await readManifestMetadata(env);
  const cacheKey = buildCacheKey(request, `block/${addressKey}`, version);

  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const row = await env.DB.prepare("SELECT * FROM blocks WHERE address_key = ?").bind(addressKey).first<BlockRow>();
  if (!row) return fallbackCard(request);

  const props = mapBlockToOgProps(rowToBlockSummary(row), dataWindow);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0f172a"/><text x="48" y="80" fill="#94a3b8" font-size="30">${escapeXml(props.eyebrow)}</text><text x="48" y="180" fill="#e2e8f0" font-size="64">${escapeXml(props.title)}</text><text x="48" y="300" fill="#f8fafc" font-size="82">${escapeXml(props.medianPrice)}</text><text x="48" y="380" fill="#94a3b8" font-size="28">$/SQM: ${escapeXml(props.pricePerSqm)} · LEASE: ${escapeXml(props.leaseCommenceYear)} · MRT WALK: ${escapeXml(props.mrtWalk)}</text><text x="48" y="590" fill="#94a3b8" font-size="24">HDB Resale Explorer · Data window ${escapeXml(props.dataWindow)}</text></svg>`;

  const response = new Response(svg, { headers: IMAGE_HEADERS });
  await caches.default.put(cacheKey, response.clone());
  return response;
}

export async function handleCompareOg(request: Request, env: Env, townA: string, townB: string): Promise<Response> {
  if (townA.length > MAX_OG_TOWN_SLUG_LENGTH || townB.length > MAX_OG_TOWN_SLUG_LENGTH) {
    return fallbackCard(request);
  }

  const canonicalA = townFilenameToCanonical(townA);
  const canonicalB = townFilenameToCanonical(townB);

  // Manifest version keys the immutable cache; one D1 read per request even on cache hits.
  const { version } = await readManifestMetadata(env);
  const cacheKey = buildCacheKey(request, `compare/${townA}/${townB}`, version);

  const cached = await caches.default.match(cacheKey);
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

  const aMedian = median(aRows.map((r) => r.median_price));
  const bMedian = median(bRows.map((r) => r.median_price));
  if (aMedian === null || bMedian === null) return fallbackCard(request);

  const aTransactions = aRows.reduce((sum, row) => sum + row.transaction_count, 0);
  const bTransactions = bRows.reduce((sum, row) => sum + row.transaction_count, 0);
  const delta = aMedian - bMedian;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#111827"/><text x="48" y="72" fill="#cbd5e1" font-size="32">Town Comparison</text><text x="48" y="130" fill="white" font-size="40">${escapeXml(canonicalA)}</text><text x="48" y="200" fill="white" font-size="56">${escapeXml(formatCurrency(aMedian))}</text><text x="48" y="250" fill="#cbd5e1" font-size="30">Transactions: ${aTransactions}</text><text x="648" y="130" fill="white" font-size="40">${escapeXml(canonicalB)}</text><text x="648" y="200" fill="white" font-size="56">${escapeXml(formatCurrency(bMedian))}</text><text x="648" y="250" fill="#cbd5e1" font-size="30">Transactions: ${bTransactions}</text><text x="48" y="580" fill="#cbd5e1" font-size="36">Delta: ${escapeXml(formatCurrency(delta))}</text></svg>`;

  const response = new Response(svg, { headers: IMAGE_HEADERS });
  await caches.default.put(cacheKey, response.clone());
  return response;
}
