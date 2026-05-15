import type { AddressDetailTransaction } from "@/types/data";

const FLAT_TYPE_ORDER = [
  "1 ROOM",
  "2 ROOM",
  "3 ROOM",
  "4 ROOM",
  "5 ROOM",
  "EXECUTIVE",
  "MULTI-GENERATION",
] as const;

export type FlatTypeLadderEntry = {
  flatType: string;
  medianPrice: number | null;
  transactionCount: number;
};

/** Stable median for non-empty numeric arrays (used in tests and derivation). */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    throw new RangeError("median: empty input");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    const v = sorted.at(mid);
    if (v === undefined) throw new RangeError("median: unreachable");
    return v;
  }
  const lower = sorted.at(mid - 1);
  const upper = sorted.at(mid);
  if (lower === undefined || upper === undefined) throw new RangeError("median: unreachable");
  return (lower + upper) / 2;
}

function groupByFlatType(transactions: readonly Pick<AddressDetailTransaction, "flatType" | "resalePrice">[]) {
  const map = new Map<string, number[]>();
  for (const tx of transactions) {
    const list = map.get(tx.flatType) ?? [];
    list.push(tx.resalePrice);
    map.set(tx.flatType, list);
  }
  return map;
}

/**
 * Derive a price ladder for the given flat types present on a block or town.
 * Missing flat types (in availableFlatTypes but no transactions) are represented with medianPrice: null.
 * Output is sorted by canonical flat type order.
 */
export function deriveFlatTypePriceLadder(
  availableFlatTypes: readonly string[],
  transactions: readonly Pick<AddressDetailTransaction, "flatType" | "resalePrice">[],
): FlatTypeLadderEntry[] {
  const byType = groupByFlatType(transactions);
  const relevant = Array.from(new Set(availableFlatTypes));

  const ordered = FLAT_TYPE_ORDER.filter((ft) => relevant.includes(ft));
  const extras = relevant.filter((ft) => !(FLAT_TYPE_ORDER as readonly string[]).includes(ft)).sort();

  return [...ordered, ...extras].map((flatType) => {
    const prices = byType.get(flatType) ?? [];
    return {
      flatType,
      medianPrice: prices.length > 0 ? Math.round(median(prices)) : null,
      transactionCount: prices.length,
    };
  });
}
