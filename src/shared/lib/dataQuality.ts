import type { Manifest } from "@/types/data";

export type DataSyncState = "fresh" | "stale" | "missing" | "partial";

export type DataQualityState = {
  latestMonthUsed: string | null;
  generatedAt: string | null;
  lastSyncedAt: string | null;
  sourceLabels: string[];
  /** data.gov.sg resale collection identifier, when present (provenance). */
  resaleCollectionId: string | null;
  /** Number of data.gov.sg resale dataset identifiers, for provenance. */
  resaleDatasetCount: number;
  syncState: DataSyncState;
};

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const STALE_METADATA_MONTHS = 3;

function isMonth(value: string | null | undefined): value is string {
  return typeof value === "string" && MONTH_PATTERN.test(value);
}

function isIsoDateTime(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false;
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
  if (!isoDateRegex.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function currentMonth(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function monthsBetween(olderMonth: string, newerMonth: string): number {
  const olderYear = Number(olderMonth.slice(0, 4));
  const olderMon = Number(olderMonth.slice(5, 7));
  const newerYear = Number(newerMonth.slice(0, 4));
  const newerMon = Number(newerMonth.slice(5, 7));
  return (newerYear - olderYear) * 12 + (newerMon - olderMon);
}

export function deriveDataQualityState(
  manifest: Partial<Manifest> | null,
  now: Date = new Date(),
): DataQualityState {
  const rawMaxMonth = manifest?.dataWindow?.maxMonth;
  const latestMonthUsed = isMonth(rawMaxMonth) ? rawMaxMonth : null;
  const rawGeneratedAt = manifest?.generatedAt;
  const generatedAt = isIsoDateTime(rawGeneratedAt) ? rawGeneratedAt : null;
  const rawLastUpdatedAt = manifest?.sources?.lastUpdatedAt;
  const lastSyncedAt = isIsoDateTime(rawLastUpdatedAt) ? rawLastUpdatedAt : null;

  const resaleCollectionId =
    typeof manifest?.sources?.resaleCollectionId === "string"
      ? manifest.sources.resaleCollectionId
      : null;
  const resaleDatasetCount = manifest?.sources?.resaleDatasetIds?.length ?? 0;

  const sourceLabels: string[] = [];
  if (resaleCollectionId || resaleDatasetCount > 0) {
    sourceLabels.push("data.gov.sg");
  }
  if (manifest?.sources?.propertyDatasetId || manifest?.sources?.mrtDatasetId) {
    sourceLabels.push("OneMap");
  }

  const hasAnyMetadata =
    latestMonthUsed != null ||
    generatedAt != null ||
    lastSyncedAt != null ||
    sourceLabels.length > 0;
  const hasCompleteMetadata =
    latestMonthUsed != null &&
    generatedAt != null &&
    lastSyncedAt != null &&
    sourceLabels.length > 0;

  let syncState: DataSyncState;
  if (!hasAnyMetadata) {
    syncState = "missing";
  } else if (!hasCompleteMetadata) {
    syncState = "partial";
  } else {
    syncState = "fresh";
  }

  if (
    latestMonthUsed != null &&
    monthsBetween(latestMonthUsed, currentMonth(now)) > STALE_METADATA_MONTHS
  ) {
    syncState = "stale";
  }

  return {
    latestMonthUsed,
    generatedAt,
    lastSyncedAt,
    sourceLabels,
    resaleCollectionId,
    resaleDatasetCount,
    syncState,
  };
}
