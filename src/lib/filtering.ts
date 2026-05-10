import type { BlockSummary, Coordinates, FilterState } from "@/types/data";
import { getCurrentYear, MAX_LEASE_DURATION } from '@/lib/constants';
import { buildFilterOptions, canonicalFlatType } from "@shared/filter-options";
import { resolveMultilingualSearchAliases } from "@/lib/i18n/domain";

const SEARCH_STOP_WORDS = new Set(["block", "blk", "plus"]);
// Pre-compile alias regex patterns at module level to avoid repeated RegExp
// allocations. This is especially important for the initial search pass
// where many unique block addresses are processed.
const SEARCH_ALIAS_REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/\bamk\b/g, "ang mo kio"],
  [/\byew tee\b/g, "choa chu kang"],
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
  isPostalCodeCandidate: boolean;
  allowReverseMatch: boolean;
};

type BlockSearchTokens = {
  values: string[];
  postalCode: string | null;
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
  return resolveMultilingualSearchAliases(value)
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveSearchAliases(value: string): string {
  let resolved = value;
  for (const [aliasRegex, canonical] of SEARCH_ALIAS_REPLACEMENTS) {
    resolved = resolved.replace(aliasRegex, canonical);
  }
  return resolved;
}

function normalizeToken(token: string): string {
  return TOKEN_NORMALIZATIONS.get(token) ?? token;
}

function createSearchToken(value: string, isNumericPrefix: boolean): SearchToken {
  return {
    value,
    isNumericPrefix,
    isPostalCodeCandidate: /^\d{3,6}$/.test(value),
    allowReverseMatch: !/^\d{3,}$/.test(value),
  };
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
        return createSearchToken(numericPrefixMatch[1] ?? token, true);
      }
      return createSearchToken(normalizeToken(token), false);
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
let blockTokensCache = new WeakMap<BlockSummary, BlockSearchTokens>();
let blockCanonicalFlatTypesCache = new WeakMap<BlockSummary, string[]>();
let stationNamesCache: string[] | null = null;
let stationNamesSourceRef: BlockSummary[] | null = null;
let townNamesCache: Set<string> | null = null;
let townNamesSourceRef: BlockSummary[] | null = null;

// Cache canonical flat type values per filter string to avoid re-running
// `canonicalFlatType` (which performs `.trim().toUpperCase()`) on every block
// in the 10,000+ iteration `matchesFilter` loop.
const filterFlatTypeCache = new Map<string, string>();

function getCanonicalFlatTypes(block: BlockSummary): string[] {
  let canonical = blockCanonicalFlatTypesCache.get(block);
  if (!canonical) {
    canonical = block.flatTypes.map(canonicalFlatType);
    blockCanonicalFlatTypesCache.set(block, canonical);
  }
  return canonical;
}

function searchMatchesBlock(block: BlockSummary, query: string): boolean {
  const searchTokens = tokenizeSearchText(query);
  if (searchTokens.length === 0) {
    return query.trim().length === 0;
  }

  let blockTokens = blockTokensCache.get(block);
  if (!blockTokens) {
    const searchableTokens = tokenizeSearchText(
      `${block.block} ${block.streetName} ${block.town} ${block.displayName ?? ""}`,
    );
    blockTokens = {
      values: searchableTokens.map((token) => token.value),
      postalCode: block.postalCode ? normalizeSearchText(block.postalCode) : null,
    };
    blockTokensCache.set(block, blockTokens);
  }

  return searchTokens.every((searchToken) => {
    const postalCodeMatches =
      blockTokens.postalCode !== null &&
      searchToken.isPostalCodeCandidate &&
      blockTokens.postalCode.startsWith(searchToken.value);

    if (searchToken.isNumericPrefix) {
      return (
        postalCodeMatches ||
        blockTokens.values.some((candidate) => candidate.startsWith(searchToken.value))
      );
    }

    return (
      postalCodeMatches ||
      blockTokens.values.some(
        (candidate) =>
          candidate.includes(searchToken.value) ||
          (searchToken.allowReverseMatch && searchToken.value.includes(candidate)) ||
          isNearMatch(candidate, searchToken.value),
      )
    );
  });
}

type NormalizedStationTokens = {
  normalized: string;
  tokens: string[];
  tokenSet: Set<string>;
};

const stationTokensAndNormalizedCache = new Map<string, NormalizedStationTokens>();

function getStationTokensAndNormalized(stationName: string): NormalizedStationTokens {
  const cached = stationTokensAndNormalizedCache.get(stationName);
  if (cached !== undefined) {
    return cached;
  }

  // Reuse tokenized station names during query matching.
  // `matchStationName` runs this per station per search, so caching avoids repeated
  // split/filter allocations and reduces hot-path work for MRT intent parsing.
  // The tokenSet avoids repeated .includes() scans in the scoring inner loop.
  const tokens = tokenizeSearchText(stationName)
    .map((t) => t.value)
    .filter((v) => !STATION_NAME_STOP_WORDS.has(v));
  const normalized = tokens.join(" ");
  const result: NormalizedStationTokens = { tokens, normalized, tokenSet: new Set(tokens) };

  evictCacheIfNeeded(stationTokensAndNormalizedCache, TOKENIZATION_CACHE_LIMIT);
  stationTokensAndNormalizedCache.set(stationName, result);
  return result;
}

function normalizeStationName(stationName: string): string {
  return getStationTokensAndNormalized(stationName).normalized;
}

function collectStationNames(blocks: BlockSummary[]): string[] {
  if (stationNamesCache && stationNamesSourceRef === blocks) {
    return stationNamesCache;
  }

  if (blocks.length === 0) {
    return [];
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
  stationNamesSourceRef = blocks;
  return stationNamesCache;
}

function collectTownNames(blocks: BlockSummary[]): Set<string> {
  if (townNamesCache && townNamesSourceRef === blocks) {
    return townNamesCache;
  }

  const rawTowns = new Set<string>();
  for (const block of blocks) {
    rawTowns.add(block.town);
  }

  const townNames = new Set<string>();
  for (const town of rawTowns) {
    townNames.add(normalizeSearchText(town));
  }

  townNamesCache = townNames;
  townNamesSourceRef = blocks;
  return townNames;
}

function matchStationName(
  query: string,
  stationNames: string[],
  townNames: Set<string>,
): string | null {
  const rawNormalizedQuery = normalizeSearchText(query);
  const normalizedQuery = resolveSearchAliases(rawNormalizedQuery);
  if (!normalizedQuery) {
    return null;
  }

  const isTownMatch = townNames.has(rawNormalizedQuery);
  const hasCueWords = normalizedQuery
    .split(" ")
    .some((token) => STATION_SEARCH_CUE_WORDS.has(token));

  // If the query exactly matches a town name (e.g. "Bedok", "Ang Mo Kio") and has no cue
  // words like "MRT" or "near", do not resolve it as a station intent. This prevents
  // radius-based station filtering from incorrectly hiding town-wide results.
  if (isTownMatch && !hasCueWords) {
    return null;
  }

  const queryTokens = tokenizeSearchText(normalizedQuery)
    .map((token) => token.value)
    .filter((token) => !STATION_SEARCH_CUE_WORDS.has(token));

  if (queryTokens.length === 0) {
    return null;
  }

  let bestMatch: { stationName: string; score: number } | null = null;

  for (const stationName of stationNames) {
    const { tokens: stationTokens, normalized: normalizedStation, tokenSet: stationTokenSet } =
      getStationTokensAndNormalized(stationName);
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
      if (stationTokenSet.has(queryToken)) {
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

  const stationName = matchStationName(
    query,
    collectStationNames(blocks),
    collectTownNames(blocks),
  );
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

  let normalizedIntentName: string | undefined;

  // Avoid intermediate array allocations and spreads in the hot filter loop.
  // Check cheap numeric distance bounds before evaluating expensive station name normalization.
  if (block.nearestMrt !== null && block.nearestMrt.distanceMeters <= intent.radiusMeters) {
    normalizedIntentName = normalizeStationName(intent.stationName);
    if (normalizeStationName(block.nearestMrt.stationName) === normalizedIntentName) {
      return true;
    }
  }

  if (block.nearbyMrts) {
    return block.nearbyMrts.some((station) => {
      if (station.distanceMeters <= intent.radiusMeters) {
        normalizedIntentName = normalizedIntentName ?? normalizeStationName(intent.stationName);
        return normalizeStationName(station.stationName) === normalizedIntentName;
      }
      return false;
    });
  }

  return false;
}

export function resetFilteringCachesForTests(): void {
  tokenizationCache.clear();
  stationTokensAndNormalizedCache.clear();
  filterFlatTypeCache.clear();
  blockTokensCache = new WeakMap<BlockSummary, BlockSearchTokens>();
  blockCanonicalFlatTypesCache = new WeakMap<BlockSummary, string[]>();
  stationNamesCache = null;
  stationNamesSourceRef = null;
  townNamesCache = null;
  townNamesSourceRef = null;
}

export function matchesFilter(
  block: BlockSummary,
  filters: FilterState,
  geographicIntent?: GeographicSearchIntent | null,
): boolean {
  // Execute cheaper comparisons first to short-circuit early and avoid expensive checks
  if (filters.town && block.town !== filters.town) {
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
    const maxRemainingLease = MAX_LEASE_DURATION - (getCurrentYear() - block.leaseCommenceRange[1]);
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

  if (filters.mrtMax !== null && block.nearestMrt === null) {
    return false;
  }

  if (filters.flatModel && !block.flatModels.includes(filters.flatModel)) {
    return false;
  }

  if (filters.flatType) {
    // Use a cached value for the filter's canonical flat type instead of re-evaluating
    // .trim().toUpperCase() for every single block in the 10,000+ iteration loop.
    let canonicalSelectedFlatType = filterFlatTypeCache.get(filters.flatType);
    if (canonicalSelectedFlatType === undefined) {
      canonicalSelectedFlatType = canonicalFlatType(filters.flatType);
      filterFlatTypeCache.set(filters.flatType, canonicalSelectedFlatType);
    }
    if (!getCanonicalFlatTypes(block).includes(canonicalSelectedFlatType)) {
      return false;
    }
  }

  // Move expensive regex/tokenization text search check to the very end
  // so cheaper bounds checks can short-circuit first.
  if (!geographicIntent && filters.search && !searchMatchesBlock(block, filters.search)) {
    return false;
  }

  return true;
}

export function getFilterOptions(blocks: BlockSummary[]) {
  return buildFilterOptions(blocks);
}
