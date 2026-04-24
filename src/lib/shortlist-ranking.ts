export type CompareMode = "median" | "lease" | "mrt" | "target-gap";

type SortableShortlistRow = {
  item: {
    targetPrice: number | null;
  };
  block: {
    medianPrice: number;
    leaseCommenceRange: [number, number];
    nearestMrt?: {
      distanceMeters: number;
    } | null;
  };
};

export function getPrimaryCompareValue(row: SortableShortlistRow, compareMode: CompareMode) {
  if (compareMode === "median") {
    return row.block.medianPrice;
  }

  if (compareMode === "lease") {
    return -row.block.leaseCommenceRange[1];
  }

  if (compareMode === "mrt") {
    return row.block.nearestMrt?.distanceMeters ?? Number.POSITIVE_INFINITY;
  }

  return row.item.targetPrice === null
    ? Number.POSITIVE_INFINITY
    : Math.abs(row.item.targetPrice - row.block.medianPrice);
}

export function rankShortlistRows<T extends SortableShortlistRow>(
  rows: T[],
  compareMode: CompareMode,
) {
  return [...rows].sort((left, right) => {
    const primary = getPrimaryCompareValue(left, compareMode) - getPrimaryCompareValue(right, compareMode);
    if (primary !== 0) {
      return primary;
    }

    const byMedian = left.block.medianPrice - right.block.medianPrice;
    if (byMedian !== 0) {
      return byMedian;
    }

    return right.block.leaseCommenceRange[1] - left.block.leaseCommenceRange[1];
  });
}
