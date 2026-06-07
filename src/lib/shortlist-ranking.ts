export type CompareMode = "median-asc" | "median-desc" | "lease" | "mrt" | "target-gap";

type SortableShortlistRow = {
  item: {
    targetPrice: number | null;
    decisionStatus?: "considering" | "viewing booked" | "offered" | "rejected" | "kiv" | "dropped";
  };
  block: {
    medianPrice: number;
    leaseCommenceRange: [number, number];
    nearestMrt?: {
      distanceMeters: number;
    } | null;
  };
};

function getPrimaryCompareValue(row: SortableShortlistRow, compareMode: CompareMode) {
  if (compareMode === "median-asc") {
    return row.block.medianPrice;
  }

  if (compareMode === "median-desc") {
    return -row.block.medianPrice;
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

const decisionStatusPriority: Record<string, number> = {
  considering: 0,
  "viewing booked": 1,
  offered: 2,
  kiv: 3,
  rejected: 4,
  dropped: 5,
};

const NO_STATUS_PRIORITY = 9;

function getDecisionStatusPriority(status?: SortableShortlistRow["item"]["decisionStatus"]) {
  return status === undefined ? NO_STATUS_PRIORITY : decisionStatusPriority[status];
}

function comparePrimaryValues(left: number, right: number) {
  const leftIsFinite = Number.isFinite(left);
  const rightIsFinite = Number.isFinite(right);

  if (!leftIsFinite && !rightIsFinite) {
    return 0;
  }

  if (!leftIsFinite) {
    return 1;
  }

  if (!rightIsFinite) {
    return -1;
  }

  return left - right;
}

export function rankShortlistRows<T extends SortableShortlistRow>(
  rows: T[],
  compareMode: CompareMode,
) {
  return [...rows].sort((left, right) => {
    const primary = comparePrimaryValues(
      getPrimaryCompareValue(left, compareMode),
      getPrimaryCompareValue(right, compareMode),
    );
    if (primary !== 0) {
      return primary;
    }

    const statusPriority = getDecisionStatusPriority(left.item.decisionStatus) - getDecisionStatusPriority(right.item.decisionStatus);
    if (statusPriority !== 0) {
      return statusPriority;
    }

    const byMedian = left.block.medianPrice - right.block.medianPrice;
    if (byMedian !== 0) {
      return byMedian;
    }

    return right.block.leaseCommenceRange[1] - left.block.leaseCommenceRange[1];
  });
}
