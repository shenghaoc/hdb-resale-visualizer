/**
 * Pure utility functions shared between worker/og.ts and its tests.
 *
 * Extracted so tests can import these without pulling in Cloudflare-specific
 * types (Env, caches.default) that don't exist in the DOM compilation context.
 */
import { rowToBlockSummary } from "../functions/_lib/d1";

export type DataWindow = { minMonth: string; maxMonth: string };

export type TownAggregateRow = {
  town: string;
  median_price: number;
  transaction_count: number;
};

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-SG").format(value);
}

function formatWalkMinutes(seconds: number | null): string {
  if (seconds === null || seconds < 0 || !Number.isFinite(seconds)) return "N/A";
  const minutes = Math.round(seconds / 60);
  if (minutes <= 0) return "< 1 min";
  return `${minutes} min`;
}

/** Volume-weighted median of block-level medians (weights = transaction_count). */
export function transactionWeightedMedian(rows: TownAggregateRow[]): number | null {
  const weighted = rows.filter(
    (row) =>
      typeof row.median_price === "number" &&
      !Number.isNaN(row.median_price) &&
      row.transaction_count > 0,
  );
  if (weighted.length === 0) return null;

  const totalWeight = weighted.reduce((sum, row) => sum + row.transaction_count, 0);
  const sorted = [...weighted].sort((a, b) => a.median_price - b.median_price);
  let cumulative = 0;
  const half = totalWeight / 2;

  for (const row of sorted) {
    cumulative += row.transaction_count;
    if (cumulative >= half) return row.median_price;
  }

  return sorted[sorted.length - 1]?.median_price ?? null;
}

export function mapBlockToOgProps(
  block: ReturnType<typeof rowToBlockSummary>,
  dataWindow: DataWindow,
) {
  const walkingSeconds =
    block.nearestMrt &&
    typeof block.nearestMrt === "object" &&
    "walkingTimeSeconds" in block.nearestMrt &&
    typeof (block.nearestMrt as { walkingTimeSeconds?: unknown }).walkingTimeSeconds === "number"
      ? (block.nearestMrt as { walkingTimeSeconds: number }).walkingTimeSeconds
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
