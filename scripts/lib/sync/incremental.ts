import { createHash } from "node:crypto";
import { jsonInsertStatements } from "./statements";
import type { TransactionRow } from "../schemas";
import type { D1Client, D1Statement } from "./d1";

export const TRANSACTION_COLUMNS = [
  "month",
  "town",
  "block",
  "street_name",
  "address_key",
  "flat_type",
  "storey_range",
  "floor_area_sqm",
  "lease_commence_year",
  "resale_price",
  "flat_model",
] as const;
export type StoredTransaction = TransactionRow & { id: number };
export type TransactionDelta = {
  inserts: StoredTransaction[];
  updates: StoredTransaction[];
  affectedBlocks: Set<string>;
  affectedTownTypes: Set<string>;
};

// Exact canonical tuples avoid digest collisions and delimiters inside source strings.
// Multiplicity is part of identity: equal source facts consume separate existing rowids.
export function transactionTuple(row: TransactionRow): string {
  return JSON.stringify(TRANSACTION_COLUMNS.map((column) => row[column] ?? null));
}

export function planTransactionDelta(
  previous: StoredTransaction[],
  incoming: TransactionRow[],
  options: { corrections?: Map<number, TransactionRow>; maxChangedRows?: number } = {},
): TransactionDelta {
  if (!incoming.length) throw new Error("Empty or partial source snapshot rejected");
  const available = new Map<string, number>();
  for (const row of incoming) {
    const tuple = transactionTuple(row);
    available.set(tuple, (available.get(tuple) ?? 0) + 1);
  }
  const consume = (row: TransactionRow): boolean => {
    const tuple = transactionTuple(row);
    const count = available.get(tuple) ?? 0;
    if (!count) return false;
    available.set(tuple, count - 1);
    return true;
  };
  const updates: StoredTransaction[] = [];
  const missing: number[] = [];
  const ids = new Set<number>();
  let maxId = 0;
  for (const row of previous) {
    if (!Number.isSafeInteger(row.id) || row.id < 1 || ids.has(row.id)) {
      throw new Error("Invalid existing integer transaction identity");
    }
    ids.add(row.id);
    maxId = Math.max(maxId, row.id);
    const correction = options.corrections?.get(row.id);
    if (correction) {
      if (!consume(correction)) throw new Error("Approved correction absent from source snapshot");
      if (transactionTuple(correction) !== transactionTuple(row))
        updates.push({ ...correction, id: row.id });
    } else if (!consume(row)) {
      missing.push(row.id);
    }
  }
  for (const id of options.corrections?.keys() ?? []) {
    if (!ids.has(id)) throw new Error("Correction references unknown rowid");
  }
  if (missing.length) {
    throw new Error(
      `Reconciliation required: ${missing.length} existing facts absent; disappearance is not deletion or an inferred correction`,
    );
  }
  const inserts: StoredTransaction[] = [];
  for (const [tuple, count] of [...available].sort(([a], [b]) => a.localeCompare(b))) {
    if (!count) continue;
    const values = JSON.parse(tuple) as unknown[];
    const row = Object.fromEntries(
      TRANSACTION_COLUMNS.map((column, index) => [column, values[index]]),
    ) as TransactionRow;
    for (let occurrence = 0; occurrence < count; occurrence++)
      inserts.push({ ...row, id: ++maxId });
  }
  if (!Number.isSafeInteger(maxId)) throw new Error("Transaction rowid exhausted");
  if (inserts.length + updates.length > (options.maxChangedRows ?? 1000)) {
    throw new Error("Suspicious massive delta rejected before writes");
  }
  const affectedBlocks = new Set<string>();
  const affectedTownTypes = new Set<string>();
  const affect = (row: TransactionRow) => {
    affectedBlocks.add(row.address_key);
    affectedTownTypes.add(JSON.stringify([row.town, row.flat_type]));
  };
  for (const row of [...inserts, ...updates]) affect(row);
  for (const row of previous) if (options.corrections?.has(row.id)) affect(row);
  return { inserts, updates, affectedBlocks, affectedTownTypes };
}

export async function readTransactionSnapshot(db: D1Client): Promise<StoredTransaction[]> {
  db.setPhase("transaction-preflight");
  const rows: StoredTransaction[] = [];
  let cursor = 0;
  const pageSize = 5000;
  while (true) {
    const page = await db.query<StoredTransaction>({
      sql: `SELECT id, ${TRANSACTION_COLUMNS.join(",")} FROM transactions WHERE id > ? ORDER BY id LIMIT ?`,
      params: [cursor, pageSize],
    });
    rows.push(...page);
    const report = db.usageReport();
    if (report.rowsRead === null || report.rowsWritten === null)
      throw new Error("Missing exact D1 usage metadata; cannot prove preflight budget");
    if (report.rowsRead > 2_000_000 || report.rowsWritten !== 0)
      throw new Error("Read-only preflight budget exceeded");
    if (page.length < pageSize) return rows;
    cursor = page[page.length - 1].id;
  }
}

export function transactionStatements(delta: TransactionDelta): D1Statement[] {
  const statements: D1Statement[] = [];
  const columns = ["id", ...TRANSACTION_COLUMNS];
  statements.push(
    ...jsonInsertStatements(
      "transactions",
      columns,
      delta.inserts.map((row) =>
        columns.map((column) => row[column as keyof StoredTransaction] ?? null),
      ),
    ),
  );
  for (const row of delta.updates) {
    statements.push({
      sql: `UPDATE transactions SET ${TRANSACTION_COLUMNS.map((column) => `${column} = ?`).join(",")} WHERE id = ?`,
      params: [...TRANSACTION_COLUMNS.map((column) => row[column] ?? null), row.id],
    });
  }
  return statements;
}

/** Stable build-time ordering IDs; no CSV position participates in detail selection. */
export function assignStableTransactionIds(
  source: import("../pipeline").ResaleTransaction[],
  stored: StoredTransaction[],
  delta: TransactionDelta,
  toRow: (row: import("../pipeline").ResaleTransaction) => TransactionRow | null,
): void {
  const updated = new Map(delta.updates.map((row) => [row.id, row]));
  const ids = new Map<string, number[]>();
  for (const row of [...stored.map((row) => updated.get(row.id) ?? row), ...delta.inserts].sort(
    (a, b) => a.id - b.id,
  )) {
    const key = transactionTuple(row);
    const list = ids.get(key) ?? [];
    list.push(row.id);
    ids.set(key, list);
  }
  const occurrences = new Map<string, number>();
  const duplicateSources = new Map<string, import("../pipeline").ResaleTransaction[]>();
  for (const row of source) {
    const fact = toRow(row);
    if (!fact) {
      const key = JSON.stringify([
        row.month,
        row.town,
        row.block,
        row.streetName,
        row.flatType,
        row.storeyRange,
        row.floorAreaSqm,
        row.leaseCommenceDate,
        row.resalePrice,
        row.flatModel,
        row.remainingLease,
      ]);
      const occurrence = occurrences.get(key) ?? 0;
      occurrences.set(key, occurrence + 1);
      row.id = `source:${createHash("sha256").update(key).digest("hex")}:${occurrence}`;
      continue;
    }
    const key = transactionTuple(fact);
    if ((ids.get(key)?.length ?? 0) > 1) {
      const group = duplicateSources.get(key) ?? [];
      group.push(row);
      duplicateSources.set(key, group);
      continue;
    }
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    const id = ids.get(key)?.[occurrence];
    if (id === undefined) throw new Error("Source occurrence missing from stable identity plan");
    row.id = `d1:${String(id).padStart(16, "0")}`;
  }
  // Stored duplicates may differ in presentation-only fields (e.g. remaining lease).
  // Assign their stable occurrence IDs by presentation, never by CSV arrival order.
  const presentation = (row: import("../pipeline").ResaleTransaction) =>
    JSON.stringify([row.flatType, row.remainingLease, row.pricePerSqm, row.pricePerSqft]);
  for (const [key, group] of duplicateSources) {
    group.sort((a, b) => presentation(a).localeCompare(presentation(b)));
    for (const [occurrence, row] of group.entries()) {
      const id = ids.get(key)?.[occurrence];
      if (id === undefined) throw new Error("Source duplicate missing from stable identity plan");
      row.id = `d1:${String(id).padStart(16, "0")}`;
    }
  }
}
