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
  shouldSort: false,
};

let fuseIndex: Fuse<BlockSummary> | null = null;
let lastBlocks: readonly BlockSummary[] | null = null;

function ensureFuseIndex(blocks: readonly BlockSummary[]): Fuse<BlockSummary> {
  if (!fuseIndex || lastBlocks !== blocks) {
    fuseIndex = new Fuse(blocks, FUSE_OPTIONS);
    lastBlocks = blocks;
  }
  return fuseIndex;
}

/**
 * Returns a Set of addressKeys for blocks matching the query via Fuse.js fuzzy search.
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

  const index = ensureFuseIndex(blocks);
  const results = index.search(query, { limit: Math.min(blocks.length, 500) });

  if (results.length === 0) {
    return new Set<string>();
  }

  const matchSet = new Set<string>();
  for (const result of results) {
    matchSet.add(result.item.addressKey);
  }
  return matchSet;
}

export function resetSearchFuseForTests(): void {
  fuseIndex = null;
  lastBlocks = null;
}
