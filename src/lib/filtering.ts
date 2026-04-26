import type { BlockSummary, Coordinates, FilterState } from "@/types/data";
import { buildFilterOptions, canonicalFlatType } from "@/lib/filterOptions";

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

export type GeographicSearchIntent =
  | {
      type: "station";
      stationName: string;
      radiusMeters: number;
    }
  | {
      type: "coordinates";
      coordinates: Coordinates;
      radiusMeters: number;
    };

const STATION_SEARCH_CUE_WORDS = new Set(["near", "nearby", "around", "mrt", "station"]);
const STATION_NAME_STOP_WORDS = new Set(["mrt", "station"]);

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
let stationNamesCache: string[] | null = null;

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

// Memoize station name normalization since it's called repeatedly for every block's
// MRT stations during array filtering passes.
const normalizedStationNameCache = new Map<string, string>();

function normalizeStationName(stationName: string): string {
  const cached = normalizedStationNameCache.get(stationName);
  if (cached !== undefined) {
    return cached;
  }

  const tokens = tokenizeSearchText(stationName).map((token) => token.value);
  const normalized = tokens.filter((token) => !STATION_NAME_STOP_WORDS.has(token)).join(" ");

  evictCacheIfNeeded(normalizedStationNameCache, TOKENIZATION_CACHE_LIMIT);
  normalizedStationNameCache.set(stationName, normalized);

  return normalized;
}

function collectStationNames(blocks: BlockSummary[]): string[] {
  if (stationNamesCache) {
    return stationNamesCache;
  }

  const stationNames = new Set<string>();

  for (const block of blocks) {
    if (block.nearestMrt?.stationName) {
      stationNames.add(block.nearestMrt.stationName);
    }

    for (const nearbyMrt of block.nearbyMrts ?? []) {
      stationNames.add(nearbyMrt.stationName);
    }
  }

  stationNamesCache = Array.from(stationNames);
  return stationNamesCache;
}

function matchStationName(query: string, stationNames: string[]): string | null {
  const normalizedQuery = resolveSearchAliases(normalizeSearchText(query));
  if (!normalizedQuery) {
    return null;
  }

  const hasCueWords = normalizedQuery
    .split(" ")
    .some((token) => STATION_SEARCH_CUE_WORDS.has(token));
  const queryTokens = tokenizeSearchText(normalizedQuery)
    .map((token) => token.value)
    .filter((token) => !STATION_SEARCH_CUE_WORDS.has(token));

  if (queryTokens.length === 0) {
    return null;
  }

  let bestMatch: { stationName: string; score: number } | null = null;

  for (const stationName of stationNames) {
    const normalizedStation = normalizeStationName(stationName);
    const stationTokens = normalizedStation.split(" ").filter(Boolean);
    if (stationTokens.length === 0) {
      continue;
    }

    const exactStationMatch = normalizedQuery === normalizedStation;
    const allTokensMatch = queryTokens.every((queryToken) =>
      stationTokens.some(
        (stationToken) =>
          stationToken.includes(queryToken) ||
          queryToken.includes(stationToken) ||
          isNearMatch(stationToken, queryToken),
      ),
    );

    if (!allTokensMatch) {
      continue;
    }

    if (!hasCueWords && !exactStationMatch) {
      continue;
    }

    const score = queryTokens.reduce((total, queryToken) => {
      if (stationTokens.includes(queryToken)) {
        return total + 4;
      }
      if (stationTokens.some((stationToken) => stationToken.startsWith(queryToken))) {
        return total + 3;
      }
      if (
        stationTokens.some(
          (stationToken) =>
            stationToken.includes(queryToken) || queryToken.includes(stationToken),
        )
      ) {
        return total + 2;
      }
      return total + 1;
    }, exactStationMatch ? 8 : 0);

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { stationName, score };
    }
  }

  return bestMatch?.stationName ?? null;
}

function parseCoordinateSearch(query: string): Coordinates | null {
  const coordinateMatch = query.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!coordinateMatch) {
    return null;
  }

  const lat = Number(coordinateMatch[1]);
  const lng = Number(coordinateMatch[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const isSingaporeLikeCoordinates = lat >= 1 && lat <= 2 && lng >= 103 && lng <= 105;
  return isSingaporeLikeCoordinates ? { lat, lng } : null;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function computeDistanceMeters(left: Coordinates, right: Coordinates): number {
  const earthRadiusMeters = 6_371_000;
  const deltaLat = toRadians(right.lat - left.lat);
  const deltaLng = toRadians(right.lng - left.lng);
  const leftLat = toRadians(left.lat);
  const rightLat = toRadians(right.lat);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(leftLat) *
      Math.cos(rightLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

export function resolveGeographicSearchIntent(
  query: string,
  blocks: BlockSummary[],
  radiusMeters: number,
  userLocation?: Coordinates | null,
  nearMeQuery?: string,
): GeographicSearchIntent | null {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedNearMe = nearMeQuery ? normalizeSearchText(nearMeQuery) : "near me";

  if ((normalizedQuery === "near me" || normalizedQuery === normalizedNearMe) && userLocation) {
    return {
      type: "coordinates",
      coordinates: userLocation,
      radiusMeters,
    };
  }

  const coordinates = parseCoordinateSearch(query);
  if (coordinates) {
    return {
      type: "coordinates",
      coordinates,
      radiusMeters,
    };
  }

  const stationName = matchStationName(query, collectStationNames(blocks));
  if (!stationName) {
    return null;
  }

  return {
    type: "station",
    stationName,
    radiusMeters,
  };
}

export function matchesGeographicSearchIntent(
  block: BlockSummary,
  intent: GeographicSearchIntent,
): boolean {
  if (intent.type === "coordinates") {
    return computeDistanceMeters(block.coordinates, intent.coordinates) <= intent.radiusMeters;
  }

  const stationRecords = [block.nearestMrt, ...(block.nearbyMrts ?? [])].filter(
    (station): station is NonNullable<typeof station> => station !== null,
  );

  const normalizedIntentName = normalizeStationName(intent.stationName);
  return stationRecords.some(
    (station) =>
      normalizeStationName(station.stationName) === normalizedIntentName &&
      station.distanceMeters <= intent.radiusMeters,
  );
}

export function resetFilteringCachesForTests(): void {
  tokenizationCache.clear();
  normalizedStationNameCache.clear();
  blockTokensCache = new WeakMap<BlockSummary, string[]>();
  stationNamesCache = null;
}

export function matchesFilter(
  block: BlockSummary,
  filters: FilterState,
  geographicIntent?: GeographicSearchIntent | null,
): boolean {
  if (!geographicIntent && !searchMatchesBlock(block, filters.search)) {
    return false;
  }

  if (filters.town && block.town !== filters.town) {
    return false;
  }

  if (filters.flatType) {
    const canonicalSelectedFlatType = canonicalFlatType(filters.flatType);
    if (!block.flatTypes.some((type) => canonicalFlatType(type) === canonicalSelectedFlatType)) {
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
  return buildFilterOptions(blocks);
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
