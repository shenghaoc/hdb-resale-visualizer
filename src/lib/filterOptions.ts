import type { BlockSummary, FilterOptions } from "@/types/data";

export function canonicalFlatType(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === "MULTI GENERATION") {
    return "MULTI-GENERATION";
  }

  return normalized;
}

export function normalizeFlatModel(value: string): string | null {
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

export function sortFlatTypes(flatTypes: string[]): string[] {
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

export function buildFilterOptions(
  blocks: Array<Pick<BlockSummary, "town" | "flatTypes" | "flatModels">>,
): FilterOptions {
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
