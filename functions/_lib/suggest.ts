import type { Suggestion } from "../../shared/data-types";

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

export type SuggestDb = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => {
      all: () => Promise<{ results?: unknown[] }>;
    };
  };
};

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
  let resolved = value.toLowerCase().replace(RE_NON_ALPHANUMERIC, " ").replace(RE_WHITESPACE, " ").trim();
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

async function queryDistinctTowns(db: SuggestDb, prefixPattern: string, containsPattern: string) {
  const prefix = await db
    .prepare(
      "SELECT DISTINCT town FROM blocks WHERE town LIKE ? ESCAPE '\\' COLLATE NOCASE LIMIT 20",
    )
    .bind(prefixPattern)
    .all();
  const prefixRows = (prefix.results ?? []) as { town: string }[];
  if (prefixRows.length >= GROUP_CAPS.town) {
    return prefixRows;
  }
  const substring = await db
    .prepare(
      "SELECT DISTINCT town FROM blocks WHERE town LIKE ? ESCAPE '\\' COLLATE NOCASE AND town NOT LIKE ? ESCAPE '\\' COLLATE NOCASE LIMIT 20",
    )
    .bind(containsPattern, prefixPattern)
    .all();
  return [...prefixRows, ...((substring.results ?? []) as { town: string }[])];
}

async function queryDistinctStreets(db: SuggestDb, prefixPattern: string, containsPattern: string) {
  const prefix = await db
    .prepare(
      "SELECT DISTINCT street_name FROM blocks WHERE street_name LIKE ? ESCAPE '\\' COLLATE NOCASE LIMIT 20",
    )
    .bind(prefixPattern)
    .all();
  const prefixRows = (prefix.results ?? []) as { street_name: string }[];
  if (prefixRows.length >= GROUP_CAPS.street) {
    return prefixRows;
  }
  const substring = await db
    .prepare(
      "SELECT DISTINCT street_name FROM blocks WHERE street_name LIKE ? ESCAPE '\\' COLLATE NOCASE AND street_name NOT LIKE ? ESCAPE '\\' COLLATE NOCASE LIMIT 20",
    )
    .bind(containsPattern, prefixPattern)
    .all();
  return [...prefixRows, ...((substring.results ?? []) as { street_name: string }[])];
}

async function queryBlocks(db: SuggestDb, prefixPattern: string, containsPattern: string) {
  const prefix = await db
    .prepare(
      "SELECT address_key, block, street_name FROM blocks WHERE (block || ' ' || street_name) LIKE ? ESCAPE '\\' COLLATE NOCASE LIMIT 20",
    )
    .bind(prefixPattern)
    .all();
  const prefixRows = (prefix.results ?? []) as {
    address_key: string;
    block: string;
    street_name: string;
  }[];
  if (prefixRows.length >= GROUP_CAPS.block) {
    return prefixRows;
  }
  const substring = await db
    .prepare(
      "SELECT address_key, block, street_name FROM blocks WHERE (block || ' ' || street_name) LIKE ? ESCAPE '\\' COLLATE NOCASE AND (block || ' ' || street_name) NOT LIKE ? ESCAPE '\\' COLLATE NOCASE LIMIT 20",
    )
    .bind(containsPattern, prefixPattern)
    .all();
  return [
    ...prefixRows,
    ...((substring.results ?? []) as { address_key: string; block: string; street_name: string }[]),
  ];
}

async function queryPostalCodes(db: SuggestDb, prefixPattern: string) {
  const result = await db
    .prepare(
      "SELECT DISTINCT postal_code FROM blocks WHERE postal_code IS NOT NULL AND postal_code LIKE ? ESCAPE '\\' COLLATE NOCASE LIMIT 20",
    )
    .bind(prefixPattern)
    .all();
  return (result.results ?? []) as { postal_code: string }[];
}

function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function buildLikePatterns(normalizedQuery: string): { prefixPattern: string; containsPattern: string } {
  const escaped = escapeLikePattern(normalizedQuery);
  return {
    prefixPattern: `${escaped}%`,
    containsPattern: `%${escaped}%`,
  };
}

type MrtStationGeoJson = {
  features?: { properties?: { stationName?: string } }[];
};

let cachedStationNames: string[] | null = null;

async function loadStationNames(db: SuggestDb): Promise<string[]> {
  if (cachedStationNames) {
    return cachedStationNames;
  }
  const result = await db.prepare("SELECT json FROM mrt_geojson WHERE kind = ?").bind("stations").all();
  const row = (result.results ?? [])[0] as { json?: string } | undefined;
  if (!row?.json) {
    return [];
  }
  const parsed = JSON.parse(row.json) as MrtStationGeoJson;
  const names = new Set<string>();
  for (const feature of parsed.features ?? []) {
    const stationName = feature.properties?.stationName;
    if (stationName) {
      names.add(stationName);
    }
  }
  cachedStationNames = Array.from(names);
  return cachedStationNames;
}

export async function buildSuggestions(
  db: SuggestDb,
  normalizedQuery: string,
  stationNames?: string[],
): Promise<Suggestion[]> {
  const { prefixPattern, containsPattern } = buildLikePatterns(normalizedQuery);
  const isNumeric = RE_NUMERIC_QUERY.test(normalizedQuery);

  const [townRows, streetRows, blockRows, postalRows, mrtNames] = await Promise.all([
    isNumeric ? Promise.resolve([]) : queryDistinctTowns(db, prefixPattern, containsPattern),
    isNumeric ? Promise.resolve([]) : queryDistinctStreets(db, prefixPattern, containsPattern),
    queryBlocks(db, prefixPattern, containsPattern),
    isNumeric ? queryPostalCodes(db, prefixPattern) : Promise.resolve([]),
    isNumeric ? Promise.resolve([]) : (stationNames ? Promise.resolve(stationNames) : loadStationNames(db)),
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
