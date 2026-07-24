import type {
  AddressDetail,
  AddressDetailSummary,
  AddressTrendPoint,
  BlockSummary,
  ComparisonArtifact,
  ShortlistItem,
} from "@/types/data";

export type ShortlistRow = {
  item: ShortlistItem;
  block: BlockSummary;
  detailSummary: AddressDetailSummary | null;
  monthlyTrend: AddressTrendPoint[];
  comparison: ComparisonArtifact | null;
};

export type BuildShortlistRowsInput = {
  blocks: readonly BlockSummary[];
  items: readonly ShortlistItem[];
  savedVisible: boolean;
  detailsByAddressKey: Readonly<Record<string, AddressDetail | null>>;
  comparisonsByAddressKey: Readonly<Record<string, ComparisonArtifact | null>>;
  selectedDetail: AddressDetail | null;
  selectedComparison: ComparisonArtifact | null;
};

/**
 * Build the artifact-backed rows used by the shortlist feature.
 *
 * Rows are created in shortlist item order, omit items without a matching
 * block, then receive the existing target-gap ordering used by the drawer.
 * The input collections are never mutated.
 */
export function buildShortlistRows({
  blocks,
  items,
  savedVisible,
  detailsByAddressKey,
  comparisonsByAddressKey,
  selectedDetail,
  selectedComparison,
}: BuildShortlistRowsInput): ShortlistRow[] {
  if (!savedVisible) {
    return [];
  }

  const blocksByAddressKey = new Map<string, BlockSummary>();
  for (const block of blocks) {
    blocksByAddressKey.set(block.addressKey, block);
  }

  const rows: ShortlistRow[] = [];
  for (const item of items) {
    const block = blocksByAddressKey.get(item.addressKey);
    if (!block) {
      continue;
    }

    const detail = detailsByAddressKey[item.addressKey];
    const comparison = comparisonsByAddressKey[item.addressKey];
    const selectedDetailMatches = selectedDetail?.summary.addressKey === item.addressKey;
    const selectedComparisonMatches = selectedComparison?.addressKey === item.addressKey;

    rows.push({
      item,
      block,
      detailSummary: detail?.summary ?? (selectedDetailMatches ? selectedDetail.summary : null),
      monthlyTrend:
        detail?.monthlyTrend ?? (selectedDetailMatches ? selectedDetail.monthlyTrend : []),
      comparison: comparison ?? (selectedComparisonMatches ? selectedComparison : null),
    });
  }

  return rows.sort((left, right) => {
    const leftGap =
      left.item.targetPrice !== null
        ? Math.abs(left.item.targetPrice - left.block.medianPrice)
        : Number.POSITIVE_INFINITY;
    const rightGap =
      right.item.targetPrice !== null
        ? Math.abs(right.item.targetPrice - right.block.medianPrice)
        : Number.POSITIVE_INFINITY;
    if (leftGap !== rightGap) {
      return leftGap - rightGap;
    }
    return left.item.addedAt.localeCompare(right.item.addedAt);
  });
}
