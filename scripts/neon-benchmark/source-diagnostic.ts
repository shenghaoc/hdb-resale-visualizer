import {
  transactionTuple,
  TRANSACTION_COLUMNS,
  type StoredTransaction,
} from "../lib/sync/incremental";
import type { TransactionRow } from "../lib/schemas";

/** Evidence only. Never proposes a winner, applies corrections or permits deletion. */
export function compareSourceOccurrences(
  previous: StoredTransaction[],
  incoming: TransactionRow[],
) {
  const available = new Map<string, { row: TransactionRow; count: number }>();
  for (const row of incoming) {
    const key = transactionTuple(row),
      entry = available.get(key);
    if (entry) entry.count++;
    else available.set(key, { row, count: 1 });
  }
  const missing: StoredTransaction[] = [];
  for (const row of previous) {
    const entry = available.get(transactionTuple(row));
    if (entry?.count) entry.count--;
    else missing.push(row);
  }
  const unmatchedIncoming = [...available.values()].filter((entry) => entry.count);
  const oneFieldCandidates = missing.map((old) => ({
    oldId: old.id,
    candidates: unmatchedIncoming.flatMap(({ row, count }) => {
      const changed = TRANSACTION_COLUMNS.filter(
        (column) => JSON.stringify(old[column] ?? null) !== JSON.stringify(row[column] ?? null),
      );
      return changed.length === 1
        ? [
            {
              changedField: changed[0],
              oldValue: old[changed[0]],
              newValue: row[changed[0]],
              incomingMultiplicity: count,
              incomingTuple: row,
            },
          ]
        : [];
    }),
  }));
  return {
    previousRows: previous.length,
    incomingRows: incoming.length,
    matchedOccurrences: previous.length - missing.length,
    missingOccurrences: missing,
    unmatchedIncomingTupleCount: unmatchedIncoming.length,
    unmatchedIncomingOccurrenceCount: unmatchedIncoming.reduce((n, entry) => n + entry.count, 0),
    oneFieldCandidates,
  };
}
