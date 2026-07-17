import type { Manifest } from "@/types/data";
import { isIsoInstant } from "@shared/isoDateTime";
import { isYearMonth, yearMonthIndex } from "@shared/yearMonth";

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

const STALE_METADATA_MONTHS = 3;

function isMonth(value: string | null | undefined): value is string {
  return isYearMonth(value);
}

function isIsoDateTime(value: string | null | undefined): value is string {
  return isIsoInstant(value);
}

function currentMonth(now: Date = new Date()): string {
  if (isNaN(now.getTime())) return "";
  return now.toISOString().slice(0, 7);
}

export function monthsBetween(olderMonth: string, newerMonth: string): number {
  const olderIndex = yearMonthIndex(olderMonth);
  const newerIndex = yearMonthIndex(newerMonth);
  return olderIndex === null || newerIndex === null ? Number.NaN : newerIndex - olderIndex;
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
