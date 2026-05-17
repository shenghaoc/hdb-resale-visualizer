import { MAX_LEASE_DURATION, getCurrentYear } from "./constants";
import type {
  AddressDetailSummary,
  BlockSummary,
  NearestMrt,
  ShortlistItem,
} from "../types/data";

/**
 * Minimal shape required to build a comparison row. Accepts a subset of the
 * full `ShortlistRow` so this helper stays usable from places that have not
 * fetched the deep `comparison` artifact yet.
 */
export type ShortlistComparisonInputRow = {
  item: Pick<ShortlistItem, "addressKey" | "notes" | "targetPrice">;
  block: BlockSummary;
  detailSummary:
    | Pick<AddressDetailSummary, "pricePerSqmMedian" | "pricePerSqftMedian">
    | null;
};

export type ShortlistComparisonGapTone = "below" | "above" | "match";

export type ShortlistComparisonGap = {
  amount: number;
  tone: ShortlistComparisonGapTone;
};

export type ShortlistComparisonRow = {
  addressKey: string;
  address: string;
  town: string;
  flatTypeLabel: string | null;
  medianPrice: number;
  medianPricePerSqm: number | null;
  medianPricePerSqft: number | null;
  recentTransactionCount: number;
  leaseCommenceRange: [number, number];
  remainingLeaseYears: { min: number; max: number };
  nearestMrt: NearestMrt | null;
  targetPrice: number | null;
  targetGap: ShortlistComparisonGap | null;
  notes: string;
};

export type BuildShortlistComparisonRowsOptions = {
  /**
   * Override the current year for deterministic remaining-lease calculations
   * (primarily for unit tests).
   */
  currentYear?: number;
};

function computeTargetGap(
  targetPrice: number | null,
  medianPrice: number,
): ShortlistComparisonGap | null {
  if (targetPrice === null || !Number.isFinite(targetPrice)) {
    return null;
  }

  if (targetPrice === medianPrice) {
    return { amount: 0, tone: "match" };
  }

  const amount = Math.abs(targetPrice - medianPrice);
  return targetPrice > medianPrice
    ? { amount, tone: "below" }
    : { amount, tone: "above" };
}

function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

/**
 * Pure transform from the existing `shortlistRows` shape into a flat,
 * presentation-ready row used by the comparison view.
 *
 * The output deliberately contains only raw values (no formatting, no i18n)
 * so the same data can drive a table, card grid, or future export without
 * coupling to React or the active locale.
 */
export function buildShortlistComparisonRows<T extends ShortlistComparisonInputRow>(
  rows: readonly T[],
  options: BuildShortlistComparisonRowsOptions = {},
): ShortlistComparisonRow[] {
  const currentYear = options.currentYear ?? getCurrentYear();

  return rows.map((row) => {
    const { item, block, detailSummary } = row;
    const [commenceMin, commenceMax] = block.leaseCommenceRange;

    // commenceMin is the oldest commence year => fewest remaining lease years.
    // commenceMax is the most recent commence year => most remaining lease years.
    const remainingMinYears = clampNonNegative(
      MAX_LEASE_DURATION - (currentYear - commenceMin),
    );
    const remainingMaxYears = clampNonNegative(
      MAX_LEASE_DURATION - (currentYear - commenceMax),
    );

    return {
      addressKey: item.addressKey,
      address: `${block.block} ${block.streetName}`.trim(),
      town: block.town,
      flatTypeLabel: block.flatTypes.length > 0 ? block.flatTypes.join(", ") : null,
      medianPrice: block.medianPrice,
      medianPricePerSqm: detailSummary?.pricePerSqmMedian ?? null,
      medianPricePerSqft: detailSummary?.pricePerSqftMedian ?? null,
      recentTransactionCount: block.transactionCount,
      leaseCommenceRange: [commenceMin, commenceMax],
      remainingLeaseYears: {
        min: Math.min(remainingMinYears, remainingMaxYears),
        max: Math.max(remainingMinYears, remainingMaxYears),
      },
      nearestMrt: block.nearestMrt ?? null,
      targetPrice: item.targetPrice,
      targetGap: computeTargetGap(item.targetPrice, block.medianPrice),
      notes: item.notes ?? "",
    };
  });
}
