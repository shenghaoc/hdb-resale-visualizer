import type { BlockSummary, FilterState } from "@/types/data";

const SEARCH_STOP_WORDS = new Set(["block", "blk", "plus"]);
const SEARCH_ALIAS_REPLACEMENTS: Array<[string, string]> = [
  ["amk", "ang mo kio"],
  ["yew tee", "choa chu kang"],
];
const TOKEN_NORMALIZATIONS = new Map<string, string>([
  ["ave", "avenue"],
  ["av", "avenue"],
  ["rd", "road"],
  ["st", "street"],
  ["nth", "north"],
  ["sth", "south"],
  ["est", "east"],
  ["wst", "west"],
  ["bt", "bukit"],
  ["ck", "choa chu kang"],
]);

type SearchToken = {
  value: string;
  isNumericPrefix: boolean;
};

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveSearchAliases(value: string): string {
  let resolved = value;
  for (const [alias, canonical] of SEARCH_ALIAS_REPLACEMENTS) {
    const aliasRegex = new RegExp(`\\b${alias}\\b`, "g");
    resolved = resolved.replace(aliasRegex, canonical);
  }
  return resolved;
}

function normalizeToken(token: string): string {
  return TOKEN_NORMALIZATIONS.get(token) ?? token;
}

const TOKENIZATION_CACHE_LIMIT = 10_000;

function evictCacheIfNeeded<Key, Value>(cache: Map<Key, Value>, limit: number): void {
  if (cache.size < limit) {
    return;
  }

  const oldestKey = cache.keys().next().value;
  if (oldestKey !== undefined) {
    cache.delete(oldestKey);
  }
}

// Memoize tokenization since it's called repeatedly during filtering
// for the same block strings and search queries.
const tokenizationCache = new Map<string, SearchToken[]>();

function tokenizeSearchText(value: string): SearchToken[] {
  const cached = tokenizationCache.get(value);
  if (cached) {
    return cached;
  }

  const resolvedValue = resolveSearchAliases(normalizeSearchText(value));
  if (!resolvedValue) {
    evictCacheIfNeeded(tokenizationCache, TOKENIZATION_CACHE_LIMIT);
    tokenizationCache.set(value, []);
    return [];
  }

  const tokens = resolvedValue
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && !SEARCH_STOP_WORDS.has(token))
    .map((token) => {
      const numericPrefixMatch = token.match(/^(\d+)\+$/);
      if (numericPrefixMatch) {
        return {
          value: numericPrefixMatch[1] ?? token,
          isNumericPrefix: true,
        };
      }
      return {
        value: normalizeToken(token),
        isNumericPrefix: false,
      };
    });

  // Limit cache size to prevent memory leaks from arbitrary search inputs.
  evictCacheIfNeeded(tokenizationCache, TOKENIZATION_CACHE_LIMIT);
  tokenizationCache.set(value, tokens);

  return tokens;
}

function isNearMatch(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }

  if (left.length === right.length) {
    for (let index = 0; index < left.length - 1; index += 1) {
      if (
        left[index] === right[index + 1] &&
        left[index + 1] === right[index] &&
        left.slice(0, index) === right.slice(0, index) &&
        left.slice(index + 2) === right.slice(index + 2)
      ) {
        return true;
      }
    }
  }

  if (Math.abs(left.length - right.length) > 1) {
    return false;
  }

  // Fast path for very short values where typo-tolerance is too noisy.
  if (left.length < 3 || right.length < 3) {
    return false;
  }

  let edits = 0;
  let leftIndex = 0;
  let rightIndex = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    edits += 1;
    if (edits > 1) {
      return false;
    }

    if (left.length > right.length) {
      leftIndex += 1;
      continue;
    }

    if (right.length > left.length) {
      rightIndex += 1;
      continue;
    }

    leftIndex += 1;
    rightIndex += 1;
  }

  if (leftIndex < left.length || rightIndex < right.length) {
    edits += 1;
  }

  return edits <= 1;
}

// Cache block token values independently since block references might change
// but their underlying string values are stable.
let blockTokensCache = new WeakMap<BlockSummary, string[]>();

function searchMatchesBlock(block: BlockSummary, query: string): boolean {
  const searchTokens = tokenizeSearchText(query);
  if (searchTokens.length === 0) {
    return true;
  }

  let blockTokenValues = blockTokensCache.get(block);
  if (!blockTokenValues) {
    const searchableTokens = tokenizeSearchText(
      `${block.block} ${block.streetName} ${block.town} ${block.displayName ?? ""}`,
    );
    blockTokenValues = searchableTokens.map((token) => token.value);
    blockTokensCache.set(block, blockTokenValues);
  }

  return searchTokens.every((searchToken) => {
    if (searchToken.isNumericPrefix) {
      return blockTokenValues.some((candidate) => candidate.startsWith(searchToken.value));
    }

    return blockTokenValues.some(
      (candidate) =>
        candidate.includes(searchToken.value) ||
        searchToken.value.includes(candidate) ||
        isNearMatch(candidate, searchToken.value),
    );
  });
}

export function resetFilteringCachesForTests(): void {
  tokenizationCache.clear();
  blockTokensCache = new WeakMap<BlockSummary, string[]>();
}

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
  if (!searchMatchesBlock(block, filters.search)) {
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
