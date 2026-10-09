/** Native row diff over prepared artifacts/snapshot. No D1 SQL translation or network access. */
import { z } from "zod";
import { canonicalJson } from "../lib/sync/neon";
import { mapBlockRow, BLOCK_COLUMNS } from "../lib/sync/store";
import {
  applyDetailPaths,
  packStage,
  sha256,
  STAGE_DESCRIPTOR,
  type StageItem,
  type StageTable,
} from "./staged-plan";
import type { GeneratedArtifacts } from "../lib/pipeline";
import type { StoredTransaction } from "../lib/sync/incremental";

type Row = Record<string, z.infer<ReturnType<typeof z.json>>>;
type SnapshotTable = Exclude<StageTable, "transactions">;
export type NativeArtifactSnapshot = Record<SnapshotTable, Row[]>;
const record = z.record(z.string(), z.json());
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const keyFor = (table: StageTable, row: Row) =>
  canonicalJson(Object.fromEntries(STAGE_DESCRIPTOR[table].keys.map((k) => [k, row[k]])));
const object = (value: unknown) => record.parse(JSON.parse(canonicalJson(value)));
/** Same seven-field occurrence pool as store.ts: presentation IDs are retained, not reallocated. */
export function preserveDetailOccurrenceIds(before: Row, next: Row) {
  const output = structuredClone(next);
  const rows = z.array(record).parse(output.recentTransactions);
  const identity = (row: Row) =>
    JSON.stringify([
      row.month,
      row.flatType,
      row.storeyRange,
      row.floorAreaSqm,
      row.leaseCommenceDate,
      row.resalePrice,
      row.flatModel,
    ]);
  const oldIds = new Map<string, Row["id"][]>();
  for (const row of z.array(record).parse(before.recentTransactions ?? [])) {
    const key = identity(row),
      list = oldIds.get(key) ?? [];
    list.push(row.id);
    oldIds.set(key, list);
  }
  const occurrences = new Map<string, number>();
  for (const row of rows) {
    const key = identity(row),
      occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    row.id = oldIds.get(key)?.shift() ?? `source:${sha256(key)}:${occurrence}`;
  }
  output.recentTransactions = rows;
  return output;
}
function leaf(value: unknown, path: string[]): { exists: boolean; value: unknown } {
  let cursor = value;
  for (const part of path) {
    if (
      cursor === null ||
      typeof cursor !== "object" ||
      Array.isArray(cursor) ||
      !Object.hasOwn(cursor, part)
    )
      return { exists: false, value: undefined };
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return { exists: true, value: cursor };
}
function detailPatches(
  before: Row,
  next: Row,
  owned: string[][],
): NonNullable<StageItem["detailPatches"]> {
  const paths: string[][] = [];
  const visit = (value: unknown, path: string[]) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const old = leaf(before, path);
      // No stored object/siblings exist when an explicitly owned null/absent node is initialized.
      if (!old.exists || old.value === null) paths.push(path);
      else for (const [key, child] of Object.entries(value)) visit(child, [...path, key]);
    } else paths.push(path);
  };
  visit(next.summary, ["summary"]);
  for (const field of ["monthlyTrend", "recentTransactions"])
    if (Object.hasOwn(next, field)) paths.push([field]);
  const ownedSet = new Set(owned.map((p) => canonicalJson(p)));
  const changes: NonNullable<StageItem["detailPatches"]> = [];
  for (const path of paths) {
    const old = leaf(before, path),
      current = leaf(next, path);
    if (old.exists && same(old.value, current.value)) continue;
    if (!ownedSet.has(canonicalJson(path)))
      throw new Error("Derived detail changes an unowned path");
    changes.push({
      path,
      beforeExists: old.exists,
      before: old.exists ? z.json().parse(old.value) : null,
      after: z.json().parse(current.value),
    });
  }
  for (const path of owned)
    if (leaf(before, path).exists && !leaf(next, path).exists)
      throw new Error(
        "Owned detail dictionary removal requires an explicit reviewed deletion policy",
      );
  // Validates parent/old value; existing objects are always patched at owned leaves.
  applyDetailPaths(before, changes);
  return changes;
}

export function compileNativeArtifactStage(input: {
  previous: NativeArtifactSnapshot;
  artifacts: GeneratedArtifacts;
  transactionInserts: StoredTransaction[];
  exitsGeoJson: unknown;
  stationsGeoJson: unknown;
  stagedCaches: { geocode_cache: Row[]; walking_time_cache: Row[] };
  updatedAtUTC: string;
  detailOwnedPaths: string[][];
}) {
  z.iso.datetime().parse(input.updatedAtUTC);
  const items: StageItem[] = input.transactionInserts.map((r) => ({
    table: "transactions",
    operation: "insert",
    key: { id: r.id },
    before: null,
    after: object(r),
  }));
  const next: Record<SnapshotTable, Row[]> = {
    blocks: input.artifacts.blockSummaries.map((block) => {
      const values = mapBlockRow(block);
      return object(
        Object.fromEntries(
          BLOCK_COLUMNS.map((c, i) => [
            c,
            c.endsWith("_json") && typeof values[i] === "string"
              ? JSON.parse(values[i] as string)
              : values[i],
          ]),
        ),
      );
    }),
    block_details: Object.entries(input.artifacts.details).map(([address_key, json]) =>
      object({ address_key, json }),
    ),
    comparisons: Object.entries(input.artifacts.comparisons ?? {}).map(([address_key, json]) =>
      object({ address_key, json }),
    ),
    town_flat_type_trends: input.artifacts.townFlatTypeTrend.map((p) =>
      object({
        town: p.town,
        flat_type: p.flatType,
        month: p.month,
        median_price: p.medianPrice,
        median_price_per_sqm: p.medianPricePerSqm,
        transaction_count: p.transactionCount,
      }),
    ),
    mrt_geojson: [
      object({ kind: "exits", json: input.exitsGeoJson, updated_at: input.updatedAtUTC }),
      object({ kind: "stations", json: input.stationsGeoJson, updated_at: input.updatedAtUTC }),
    ],
    geocode_cache: input.stagedCaches.geocode_cache,
    walking_time_cache: input.stagedCaches.walking_time_cache,
  };
  for (const table of Object.keys(next) as SnapshotTable[]) {
    const descriptor = STAGE_DESCRIPTOR[table];
    const oldByKey = new Map(input.previous[table].map((r) => [keyFor(table, r), r]));
    if (oldByKey.size !== input.previous[table].length)
      throw new Error("Duplicate retained artifact key");
    for (const raw of next[table]) {
      const row = record.parse(raw);
      const key = Object.fromEntries(descriptor.keys.map((k) => [k, row[k]]));
      const before = oldByKey.get(keyFor(table, row));
      oldByKey.delete(keyFor(table, row));
      if (!before) {
        if (table === "block_details")
          row.json = preserveDetailOccurrenceIds(
            { recentTransactions: [] },
            record.parse(row.json),
          );
        items.push({ table, operation: "insert", key, before: null, after: row });
        continue;
      }
      if (table === "block_details") {
        const changes = detailPatches(
          record.parse(before.json),
          preserveDetailOccurrenceIds(record.parse(before.json), record.parse(row.json)),
          input.detailOwnedPaths,
        );
        if (changes.length)
          items.push({
            table,
            operation: "update",
            key,
            before: {},
            after: {},
            detailPatches: changes,
          });
        continue;
      }
      if (table === "comparisons") {
        const oldJson = record.parse(before.json),
          nextJson = record.parse(row.json);
        if (same(oldJson, { ...nextJson, generatedAt: oldJson.generatedAt }))
          row.json = { ...nextJson, generatedAt: oldJson.generatedAt };
      }
      const fields = descriptor.columns.filter(
        (c) => !descriptor.keys.includes(c) && c !== "updated_at" && !same(before[c], row[c]),
      );
      if (!fields.length) continue;
      if (descriptor.columns.includes("updated_at")) fields.push("updated_at");
      items.push({
        table,
        operation: "update",
        key,
        before: Object.fromEntries(fields.map((c) => [c, before[c]])),
        after: Object.fromEntries(fields.map((c) => [c, row[c]])),
      });
    }
    if (!["geocode_cache", "walking_time_cache"].includes(table) && oldByKey.size)
      throw new Error(
        `Complete generated ${table} would lose entities; reviewed deletion unsupported`,
      );
  }
  return packStage(items);
}
