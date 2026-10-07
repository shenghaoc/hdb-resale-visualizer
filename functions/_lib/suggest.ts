import type { Suggestion } from "../../shared/data-types";
import type { NameMatch, PublicData } from "./public-data";

export const MAX_SUGGEST_QUERY_LENGTH = 256;
export const MIN_SUGGEST_QUERY_LENGTH = 2;
export const SUGGEST_TOTAL_CAP = 10;

const GROUP_CAPS = {
  town: 3,
  street: 3,
  block: 3,
  mrt: 2,
  postal: 2,
} as const;

const RE_NON_ALPHANUMERIC = /[^a-z0-9+]+/g;
const RE_WHITESPACE = /\s+/g;
const RE_NUMERIC_QUERY = /^\d+$/;

const SEARCH_ALIAS_REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/\bamk\b/g, "ang mo kio"],
  [/\byew tee\b/g, "choa chu kang"],
];

export type ParsedSuggestRequest =
  | { ok: true; normalizedQuery: string; rawQuery: string }
  | { ok: false; error: string };

/** The public reads suggestions use. */
export type SuggestReads = Pick<
  PublicData,
  "townsMatching" | "streetsMatching" | "blocksMatching" | "postalCodesStartingWith" | "mrtGeoJson"
>;

type RankedCandidate = {
  value: string;
  label: string;
  rank: MatchRank;
  payload: Suggestion;
};

type MatchRank = "exact" | "prefix" | "substring";

const RANK_ORDER: Record<MatchRank, number> = {
  exact: 0,
  prefix: 1,
  substring: 2,
};

export function normalizeSuggestQuery(value: string): string {
  let resolved = value
    .toLowerCase()
    .replace(RE_NON_ALPHANUMERIC, " ")
    .replace(RE_WHITESPACE, " ")
    .trim();
  for (const [aliasRegex, canonical] of SEARCH_ALIAS_REPLACEMENTS) {
    resolved = resolved.replace(aliasRegex, canonical);
  }
  return resolved;
}

export function parseSuggestRequest(url: URL): ParsedSuggestRequest {
  const raw = url.searchParams.get("q") ?? "";
  if (raw.length > MAX_SUGGEST_QUERY_LENGTH) {
    return { ok: false, error: "query parameter too long" };
  }
  const normalizedQuery = normalizeSuggestQuery(raw);
  if (!normalizedQuery || normalizedQuery.length < MIN_SUGGEST_QUERY_LENGTH) {
    return { ok: false, error: "query too short" };
  }
  return { ok: true, normalizedQuery, rawQuery: raw };
}

function classifyMatch(normalizedValue: string, normalizedQuery: string): MatchRank | null {
  if (normalizedValue === normalizedQuery) {
    return "exact";
  }
  if (normalizedValue.startsWith(normalizedQuery)) {
    return "prefix";
  }
  if (normalizedValue.includes(normalizedQuery)) {
    return "substring";
  }
  return null;
}

function normalizeField(value: string): string {
  return value.toLowerCase().replace(RE_NON_ALPHANUMERIC, " ").replace(RE_WHITESPACE, " ").trim();
}

function rankCandidates(
  values: Iterable<{ value: string; label: string; payload: RankedCandidate["payload"] }>,
  normalizedQuery: string,
  cap: number,
): RankedCandidate[] {
  const ranked: RankedCandidate[] = [];
  for (const entry of values) {
    const rank = classifyMatch(normalizeField(entry.value), normalizedQuery);
    if (!rank) {
      continue;
    }
    ranked.push({ value: entry.value, label: entry.label, rank, payload: entry.payload });
  }

  ranked.sort((a, b) => {
    const rankDiff = RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
    if (rankDiff !== 0) {
      return rankDiff;
    }
    return a.label.localeCompare(b.label);
  });

  return ranked.slice(0, cap);
}

function toTitleCaseWords(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function formatStationLabel(stationName: string): string {
  const short = stationName.replace(/\s+mrt\s+station$/i, "").trim();
  return `${toTitleCaseWords(short)} MRT`;
}

function buildTownSuggestions(rows: { town: string }[], normalizedQuery: string): Suggestion[] {
  const seen = new Set<string>();
  const candidates: { value: string; label: string; payload: Suggestion }[] = [];
  for (const row of rows) {
    if (seen.has(row.town)) {
      continue;
    }
    seen.add(row.town);
    const label = toTitleCaseWords(row.town);
    candidates.push({
      value: row.town,
      label,
      payload: { group: "town", label, town: row.town },
    });
  }
  return rankCandidates(candidates, normalizedQuery, GROUP_CAPS.town).map((item) => item.payload);
}

function buildStreetSuggestions(
  rows: { street_name: string }[],
  normalizedQuery: string,
): Suggestion[] {
  const seen = new Set<string>();
  const candidates: { value: string; label: string; payload: Suggestion }[] = [];
  for (const row of rows) {
    if (seen.has(row.street_name)) {
      continue;
    }
    seen.add(row.street_name);
    const label = toTitleCaseWords(row.street_name);
    candidates.push({
      value: row.street_name,
      label,
      payload: { group: "street", label, search: row.street_name },
    });
  }
  return rankCandidates(candidates, normalizedQuery, GROUP_CAPS.street).map((item) => item.payload);
}

function buildBlockSuggestions(
  rows: { address_key: string; block: string; street_name: string }[],
  normalizedQuery: string,
): Suggestion[] {
  const seen = new Set<string>();
  const candidates: { value: string; label: string; payload: Suggestion }[] = [];
  for (const row of rows) {
    if (seen.has(row.address_key)) {
      continue;
    }
    seen.add(row.address_key);
    const label = `${row.block} ${toTitleCaseWords(row.street_name)}`;
    const value = `${row.block} ${row.street_name}`;
    candidates.push({
      value,
      label,
      payload: { group: "block", label, addressKey: row.address_key },
    });
  }
  return rankCandidates(candidates, normalizedQuery, GROUP_CAPS.block).map((item) => item.payload);
}

function buildPostalSuggestions(
  rows: { postal_code: string }[],
  normalizedQuery: string,
): Suggestion[] {
  const seen = new Set<string>();
  const candidates: { value: string; label: string; payload: Suggestion }[] = [];
  for (const row of rows) {
    const postal = row.postal_code;
    if (!postal || seen.has(postal)) {
      continue;
    }
    seen.add(postal);
    candidates.push({
      value: postal,
      label: postal,
      payload: { group: "postal", label: postal, search: postal },
    });
  }
  return rankCandidates(candidates, normalizedQuery, GROUP_CAPS.postal).map((item) => item.payload);
}

function buildMrtSuggestions(stationNames: string[], normalizedQuery: string): Suggestion[] {
  const candidates: { value: string; label: string; payload: Suggestion }[] = [];
  for (const stationName of stationNames) {
    const label = formatStationLabel(stationName);
    candidates.push({
      value: stationName,
      label,
      payload: { group: "mrt", label, stationName },
    });
  }
  return rankCandidates(candidates, normalizedQuery, GROUP_CAPS.mrt).map((item) => item.payload);
}

/** Prefix matches first; substring matches only when they cannot fill the group. */
async function matchNames<Row>(
  match: (match: NameMatch) => Promise<Row[]>,
  query: string,
  cap: number,
): Promise<Row[]> {
  const prefixRows = await match({ query, position: "prefix" });
  if (prefixRows.length >= cap) {
    return prefixRows;
  }
  return [...prefixRows, ...(await match({ query, position: "substring" }))];
}

type MrtStationGeoJson = {
  features?: { properties?: { stationName?: string } }[];
};

let cachedStationNamesPromise: Promise<string[]> | null = null;

export function resetStationNamesCacheForTests(): void {
  cachedStationNamesPromise = null;
}

async function loadStationNames(reads: SuggestReads): Promise<string[]> {
  if (cachedStationNamesPromise) {
    return cachedStationNamesPromise;
  }
  cachedStationNamesPromise = (async () => {
    try {
      const json = await reads.mrtGeoJson("stations");
      if (!json) {
        return [];
      }
      const parsed = JSON.parse(json) as MrtStationGeoJson;
      const names = new Set<string>();
      for (const feature of parsed.features ?? []) {
        const stationName = feature.properties?.stationName;
        if (stationName) {
          names.add(stationName);
        }
      }
      return Array.from(names);
    } catch (error) {
      console.error("loadStationNames: failed to load or parse mrt_geojson", error);
      cachedStationNamesPromise = null;
      return [];
    }
  })();
  return cachedStationNamesPromise;
}

export async function buildSuggestions(
  reads: SuggestReads,
  normalizedQuery: string,
  stationNames?: string[],
): Promise<Suggestion[]> {
  const isNumeric = RE_NUMERIC_QUERY.test(normalizedQuery);

  const [townRows, streetRows, blockRows, postalRows, mrtNames] = await Promise.all([
    isNumeric
      ? Promise.resolve([])
      : matchNames(reads.townsMatching, normalizedQuery, GROUP_CAPS.town),
    isNumeric
      ? Promise.resolve([])
      : matchNames(reads.streetsMatching, normalizedQuery, GROUP_CAPS.street),
    isNumeric && normalizedQuery.length >= 5
      ? Promise.resolve([])
      : matchNames(reads.blocksMatching, normalizedQuery, GROUP_CAPS.block),
    isNumeric ? reads.postalCodesStartingWith(normalizedQuery) : Promise.resolve([]),
    isNumeric
      ? Promise.resolve([])
      : stationNames
        ? Promise.resolve(stationNames)
        : loadStationNames(reads),
  ]);

  const grouped: Suggestion[] = [
    ...buildTownSuggestions(townRows, normalizedQuery),
    ...buildStreetSuggestions(streetRows, normalizedQuery),
    ...buildBlockSuggestions(blockRows, normalizedQuery),
    ...buildMrtSuggestions(mrtNames, normalizedQuery),
    ...(isNumeric ? buildPostalSuggestions(postalRows, normalizedQuery) : []),
  ];

  return grouped.slice(0, SUGGEST_TOTAL_CAP);
}
