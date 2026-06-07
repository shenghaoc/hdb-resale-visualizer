import { MAX_LEASE_DURATION, getCurrentYear } from "../../shared/lib/constants";
import { getDataConfidenceLabelKey, type DataConfidenceLabelKey } from "@/features/listing-check/confidence";
import type {
  AddressDetailSummary,
  BlockSummary,
  NearestMrt,
  ShortlistItem,
} from "@/types/data";

/**
 * Minimal shape required to build a comparison row. Accepts a subset of the
 * full `ShortlistRow` so this helper stays usable from places that have not
 * fetched the deep `comparison` artifact yet.
 */
export type ShortlistComparisonInputRow = {
  item: Pick<
    ShortlistItem,
    | "addressKey"
    | "notes"
    | "buyerNotes"
    | "targetPrice"
    | "askingPrice"
    | "fairRangeLow"
    | "fairRangeMedian"
    | "fairRangeHigh"
    | "suggestedOfferCeiling"
    | "buyerOpeningOffer"
    | "decisionStatus"
  >;
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

export type ShortlistComparisonCaveatKey =
  | "shortlist.compare.caveat.noFairRange"
  | "shortlist.compare.caveat.noMrt"
  | "shortlist.compare.caveat.lowConfidence";

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
  buyerNotes: string;
  askingPrice: number | null;
  fairRangeLow: number | null;
  fairRangeMedian: number | null;
  fairRangeHigh: number | null;
  suggestedOfferCeiling: number | null;
  decisionStatus?: ShortlistItem["decisionStatus"];
  deltaVsFairMedian: ShortlistComparisonGap | null;
  confidenceLevelLabel: DataConfidenceLabelKey;
  caveatKeys: ShortlistComparisonCaveatKey[];
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

function isFiniteNumber(value: number | null | undefined): value is number {
  return Number.isFinite(value);
}

function computeDeltaVsReference(
  reference: number | null,
  candidate: number | null,
): ShortlistComparisonGap | null {
  if (reference === null || candidate === null) {
    return null;
  }

  if (reference === candidate) {
    return { amount: 0, tone: "match" };
  }

  const amount = Math.abs(candidate - reference);
  return candidate > reference
    ? { amount, tone: "above" }
    : { amount, tone: "below" };
}

function buildCaveats(item: ShortlistComparisonInputRow["item"], nearestMrt: NearestMrt | null, recentTransactionCount: number): ShortlistComparisonCaveatKey[] {
  const caveats: ShortlistComparisonCaveatKey[] = [];
  if (item.fairRangeLow == null || item.fairRangeMedian == null || item.fairRangeHigh == null) {
    caveats.push("shortlist.compare.caveat.noFairRange");
  }
  if (nearestMrt === null) {
    caveats.push("shortlist.compare.caveat.noMrt");
  }
  if (getDataConfidenceLabelKey(recentTransactionCount) === "confidence.low.label") {
    caveats.push("shortlist.compare.caveat.lowConfidence");
  }
  return caveats;
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
    const [commenceMin, commenceMax] = block.leaseCommenceRange ?? [0, 0];

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
      buyerNotes: item.buyerNotes ?? item.notes ?? "",
      askingPrice: isFiniteNumber(item.askingPrice) ? item.askingPrice : null,
      fairRangeLow: isFiniteNumber(item.fairRangeLow) ? item.fairRangeLow : null,
      fairRangeMedian: isFiniteNumber(item.fairRangeMedian) ? item.fairRangeMedian : null,
      fairRangeHigh: isFiniteNumber(item.fairRangeHigh) ? item.fairRangeHigh : null,
      suggestedOfferCeiling: isFiniteNumber(item.suggestedOfferCeiling)
        ? item.suggestedOfferCeiling
        : null,
      decisionStatus: item.decisionStatus,
      deltaVsFairMedian: computeDeltaVsReference(isFiniteNumber(item.fairRangeMedian) ? item.fairRangeMedian : null, block.medianPrice),
      confidenceLevelLabel: getDataConfidenceLabelKey(block.transactionCount),
      caveatKeys: buildCaveats(item, block.nearestMrt ?? null, block.transactionCount),
    };
  });
}
