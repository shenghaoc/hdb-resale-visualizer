import type { BlockSummary, FilterState } from "@/types/data";

function canonicalFlatType(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === "MULTI GENERATION") {
    return "MULTI-GENERATION";
  }

  return normalized;
}

function normalizeFlatModel(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();

  if (!normalized) {
    return null;
  }

  if (/^(?:-|N\/A|NA|UNKNOWN|NONE|NULL)$/.test(normalized)) {
    return null;
  }

  if (/^MAX FLOOR \d+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function sortFlatTypes(flatTypes: string[]): string[] {
  const order = [
    "1 ROOM",
    "2 ROOM",
    "3 ROOM",
    "4 ROOM",
    "5 ROOM",
    "EXECUTIVE",
    "MULTI-GENERATION",
  ];

  const rank = new Map(order.map((item, index) => [item, index]));
  return [...flatTypes].sort((left, right) => {
    const leftRank = rank.get(left);
    const rightRank = rank.get(right);

    if (leftRank !== undefined && rightRank !== undefined) {
      return leftRank - rightRank;
    }

    if (leftRank !== undefined) {
      return -1;
    }

    if (rightRank !== undefined) {
      return 1;
    }

    return left.localeCompare(right);
  });
}

export function matchesFilter(block: BlockSummary, filters: FilterState): boolean {
  const search = filters.search.trim().toLowerCase();
  const address = `${block.block} ${block.streetName}`.toLowerCase();

  if (search && !address.includes(search) && !block.town.toLowerCase().includes(search)) {
    return false;
  }

  if (filters.town && block.town !== filters.town) {
    return false;
  }

  if (filters.flatType) {
    const canonicalSelectedFlatType = canonicalFlatType(filters.flatType);
    const canonicalBlockFlatTypes = new Set(block.flatTypes.map(canonicalFlatType));
    if (!canonicalBlockFlatTypes.has(canonicalSelectedFlatType)) {
      return false;
    }
  }

  if (filters.flatModel && !block.flatModels.includes(filters.flatModel)) {
    return false;
  }

  if (filters.budgetMin !== null && block.medianPrice < filters.budgetMin) {
    return false;
  }

  if (filters.budgetMax !== null && block.medianPrice > filters.budgetMax) {
    return false;
  }

  if (filters.areaMin !== null && block.floorAreaRange[1] < filters.areaMin) {
    return false;
  }

  if (filters.areaMax !== null && block.floorAreaRange[0] > filters.areaMax) {
    return false;
  }

  if (filters.remainingLeaseMin !== null) {
    const currentYear = new Date().getFullYear();
    const maxRemainingLease = 99 - (currentYear - block.leaseCommenceRange[1]);
    if (maxRemainingLease < filters.remainingLeaseMin) {
      return false;
    }
  }

  if (filters.startMonth !== null && block.availableDateRange[1] < filters.startMonth) {
    return false;
  }

  if (filters.endMonth !== null && block.availableDateRange[0] > filters.endMonth) {
    return false;
  }

  if (
    filters.mrtMax !== null &&
    block.nearestMrt !== null &&
    block.nearestMrt.distanceMeters > filters.mrtMax
  ) {
    return false;
  }

  return !(filters.mrtMax !== null && block.nearestMrt === null);
}

export function getFilterOptions(blocks: BlockSummary[]) {
  const towns = new Set<string>();
  const flatTypes = new Set<string>();
  const flatModels = new Set<string>();

  for (const block of blocks) {
    towns.add(block.town);
    for (const flatType of block.flatTypes) {
      flatTypes.add(canonicalFlatType(flatType));
    }
    for (const flatModel of block.flatModels) {
      const normalized = normalizeFlatModel(flatModel);
      if (normalized) {
        flatModels.add(normalized);
      }
    }
  }

  return {
    towns: [...towns].sort(),
    flatTypes: sortFlatTypes([...flatTypes]),
    flatModels: [...flatModels].sort(),
  };
}

export function getSelectionByAddressKey(
  blocks: BlockSummary[],
  addressKey: string | null,
): BlockSummary | null {
  if (!addressKey) {
    return null;
  }

  return blocks.find((block) => block.addressKey === addressKey) ?? null;
}
