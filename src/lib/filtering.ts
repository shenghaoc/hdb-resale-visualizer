import type { BlockSummary, FilterState } from "@/types/data";

export function matchesFilter(block: BlockSummary, filters: FilterState): boolean {
  const search = filters.search.trim().toLowerCase();
  const address = `${block.block} ${block.streetName}`.toLowerCase();

  if (search && !address.includes(search) && !block.town.toLowerCase().includes(search)) {
    return false;
  }

  if (filters.town && block.town !== filters.town) {
    return false;
  }

  if (filters.flatType && !block.flatTypes.includes(filters.flatType)) {
    return false;
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
      flatTypes.add(flatType);
    }
    for (const flatModel of block.flatModels) {
      flatModels.add(flatModel);
    }
  }

  return {
    towns: [...towns].sort(),
    flatTypes: [...flatTypes].sort(),
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
