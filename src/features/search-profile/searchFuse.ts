import Fuse from "fuse.js";
import type { BlockSummary } from "@/types/data";

const FUSE_OPTIONS = {
  keys: [
    { name: "town", weight: 0.4 },
    { name: "streetName", weight: 0.3 },
    { name: "block", weight: 0.15 },
    { name: "displayName", weight: 0.1 },
    { name: "postalCode", weight: 0.05 },
  ],
  threshold: 0.4,
  ignoreLocation: true,
  findAllMatches: false,
  minMatchCharLength: 2,
  shouldSort: true,
};
/**
 * Upper bound on matches returned by either search path.
 *
 * Fuse.js applies it to ranked results. The structured index applies it while
 * building, so a field shared by more blocks than this keeps the first
 * `SEARCH_MATCH_LIMIT` in corpus order — an arbitrary subset, not the most
 * relevant one. Both paths have always truncated at this size; only the
 * ordering of the surviving subset differs between them.
 */
export const SEARCH_MATCH_LIMIT = 500;
type StructuredFieldIndex = ReadonlyMap<number, ReadonlyMap<string, readonly string[]>>;

let fuseIndex: Fuse<BlockSummary> | null = null;
let lastBlocks: readonly BlockSummary[] | null = null;
let lastQuery = "";
let lastQueryResult: ReadonlySet<string> | null = null;
let structuredFieldIndex: StructuredFieldIndex | null = null;

function normalizeStructuredField(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toUpperCase() ?? "";
}

function isSingleEditAway(left: string, right: string): boolean {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;

  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length >= right.length) leftIndex += 1;
    if (right.length >= left.length) rightIndex += 1;
  }

  return edits + (left.length - leftIndex) + (right.length - rightIndex) <= 1;
}

function ensureStructuredFieldIndex(blocks: readonly BlockSummary[]): StructuredFieldIndex {
  if (structuredFieldIndex) return structuredFieldIndex;
  const index = new Map<number, Map<string, string[]>>();
  for (const block of blocks) {
    const fields = [
      normalizeStructuredField(block.town),
      normalizeStructuredField(block.streetName),
      normalizeStructuredField(block.block),
      normalizeStructuredField(block.displayName),
      normalizeStructuredField(block.postalCode),
    ];
    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
      const field = fields[fieldIndex]!;
      if (!field || fields.indexOf(field) !== fieldIndex) continue;
      let lengthBucket = index.get(field.length);
      if (!lengthBucket) {
        lengthBucket = new Map<string, string[]>();
        index.set(field.length, lengthBucket);
      }
      const matches = lengthBucket.get(field);
      if (matches) {
        if (matches.length < SEARCH_MATCH_LIMIT) matches.push(block.addressKey);
      } else {
        lengthBucket.set(field, [block.addressKey]);
      }
    }
  }
  structuredFieldIndex = index;
  return structuredFieldIndex;
}

function getStructuredFieldMatches(
  blocks: readonly BlockSummary[],
  normalizedQuery: string,
): ReadonlySet<string> | null {
  const index = ensureStructuredFieldIndex(blocks);
  const exactMatches = index.get(normalizedQuery.length)?.get(normalizedQuery);
  if (exactMatches) return new Set(exactMatches);

  // No exact hit, so every field whose length is within one of the query has to
  // be checked. This runs on free-text queries too — including the partial
  // prefixes typed on the way to a real one — before they fall through to Fuse,
  // so it is pure added cost on that path. It stays bounded: only three length
  // buckets are visited and each comparison is O(query length). The e2e P95
  // budget measures a free-text query precisely so this cost is covered.
  const oneEditMatches = new Set<string>();
  for (
    let candidateLength = normalizedQuery.length - 1;
    candidateLength <= normalizedQuery.length + 1;
    candidateLength += 1
  ) {
    const candidates = index.get(candidateLength);
    if (!candidates) continue;
    for (const [field, addressKeys] of candidates) {
      if (!isSingleEditAway(field, normalizedQuery)) continue;
      for (const addressKey of addressKeys) {
        oneEditMatches.add(addressKey);
        if (oneEditMatches.size === SEARCH_MATCH_LIMIT) return oneEditMatches;
      }
    }
  }
  return oneEditMatches.size > 0 ? oneEditMatches : null;
}

function ensureBlockCorpus(blocks: readonly BlockSummary[]): void {
  if (lastBlocks !== blocks) {
    fuseIndex = null;
    lastBlocks = blocks;
    lastQuery = "";
    lastQueryResult = null;
    structuredFieldIndex = null;
  }
}

function ensureFuseIndex(blocks: readonly BlockSummary[]): Fuse<BlockSummary> {
  ensureBlockCorpus(blocks);
  fuseIndex ??= new Fuse(blocks, FUSE_OPTIONS);
  return fuseIndex;
}

/**
 * Returns exact or one-edit whole-field matches for common structured queries,
 * falling back to Fuse.js for broader free text.
 * Returns null if the query is empty (to signal "no search filter").
 */
export function getFuseMatchedKeys(
  blocks: readonly BlockSummary[],
  query: string,
): ReadonlySet<string> | null {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) {
    return null;
  }

  ensureBlockCorpus(blocks);
  if (trimmed === lastQuery && lastQueryResult) {
    return lastQueryResult;
  }
  const structuredMatches = getStructuredFieldMatches(blocks, normalizeStructuredField(trimmed));
  if (structuredMatches) {
    lastQuery = trimmed;
    lastQueryResult = structuredMatches;
    return lastQueryResult;
  }

  const results = ensureFuseIndex(blocks).search(trimmed, {
    limit: Math.min(blocks.length, SEARCH_MATCH_LIMIT),
  });

  if (results.length === 0) {
    lastQuery = trimmed;
    lastQueryResult = new Set<string>();
    return lastQueryResult;
  }

  const matchSet = new Set<string>();
  for (const result of results) {
    matchSet.add(result.item.addressKey);
  }
  lastQuery = trimmed;
  lastQueryResult = matchSet;
  return lastQueryResult;
}

export function resetSearchFuseForTests(): void {
  fuseIndex = null;
  lastBlocks = null;
  lastQuery = "";
  lastQueryResult = null;
  structuredFieldIndex = null;
}
