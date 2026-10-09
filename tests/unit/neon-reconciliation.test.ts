import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  assignNeonTransactionIds,
  checkCadenceGrowth,
  includeRetainedSourceRows,
  isNeonPublicationReplay,
  neonManifestSHA256,
  planNeonReconciliation,
  requireApprovedNeonReview,
  sourceFactsSHA256,
  NeonReconciliationPolicyError,
  type NeonManifest,
  type NeonReconciliationReview,
} from "../../scripts/lib/sync/neon-reconciliation";
import {
  NEON_REFRESH_BRANCH,
  NEON_REFRESH_PROJECT,
  NeonPlanningStore,
  publishNeon,
  type PgQuery,
} from "../../scripts/lib/sync/neon";
import {
  assignStableTransactionIds,
  planTransactionDelta,
  transactionStatements,
  TRANSACTION_COLUMNS,
  type StoredTransaction,
} from "../../scripts/lib/sync/incremental";
import { buildArtifacts, type ResaleTransaction } from "../../scripts/lib/pipeline";
import { runSyncNeon } from "../../scripts/sync-neon";
afterEach(() => vi.restoreAllMocks());
const policy = {
  scopeDatasetId: "d_8b84c4ee58e3cfc0ece0d773c8ca6abc" as const,
  scopeMinMonth: "2017-01" as const,
  evidenceQuality: "uncalibrated-recurring-policy" as const,
  independentSnapshotIntervals: 0 as const,
  relativeCeiling: 0.005 as const,
  absoluteCeiling: 1000 as const,
  maxMonthlyElapsedDays: 35,
  maxManualElapsedDays: 35,
};
const sourceTime = "2026-10-04T06:03:06.149Z";
function setup(missing = [2, 3]) {
  const previous: StoredTransaction[] = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1,
    month: "2026-08",
    town: i % 3 === 2 ? "OTHER" : "BEDOK",
    block: String(i % 3),
    street_name: "TEST ST",
    address_key: `block-${i % 3}`,
    flat_type: "4 ROOM",
    storey_range: "01 TO 03",
    floor_area_sqm: 90,
    lease_commence_year: 1980,
    resale_price: 500000 + i,
    flat_model: "MODEL A",
  }));
  previous[1] = { ...previous[0], id: 2 };
  previous[2] = { ...previous[0], id: 3 };
  const incoming = previous.filter((row) => !missing.includes(row.id));
  const manifest = { generatedAt: "2026-09-04T01:37:16.797Z" } as NeonManifest;
  const review: NeonReconciliationReview = {
    version: 1,
    projectId: NEON_REFRESH_PROJECT,
    branchId: NEON_REFRESH_BRANCH,
    reviewStatus: "approved",
    decisionReference: "test-only explicit retention decision",
    initialSourceFactsSHA256: sourceFactsSHA256(incoming),
    initialBaselineManifestSHA256: neonManifestSHA256(manifest),
    maxNewRetentions: 5,
    maxOutstandingRetentions: 5,
    maxCorrections: 0,
    maxRemovals: 0,
    growth: policy,
    retentions: previous
      .filter((row) => missing.includes(row.id))
      .map(({ id, ...fact }) => ({
        id,
        fact,
        disposition: "retain-unresolved",
        remainingLease: "52 years",
        possibleReplacementTuples: [],
        evidence: "Exact retained snapshot; no removal authority",
      })),
  };
  return { previous, incoming, manifest, review, intent: "manual" as const };
}
function first(s: Omit<Parameters<typeof planNeonReconciliation>[0], "capturedAtUTC"> = setup()) {
  return planNeonReconciliation({ ...s, capturedAtUTC: sourceTime });
}
function presentation(row: StoredTransaction): ResaleTransaction {
  return {
    id: `source:${row.id}`,
    month: row.month,
    town: row.town,
    block: row.block,
    streetName: row.street_name,
    addressKey: row.address_key,
    flatType: row.flat_type,
    storeyRange: row.storey_range,
    floorAreaSqm: row.floor_area_sqm,
    leaseCommenceDate: row.lease_commence_year ?? 0,
    resalePrice: row.resale_price,
    flatModel: row.flat_model,
    remainingLease: "52 years",
    pricePerSqm: Number((row.resale_price / row.floor_area_sqm).toFixed(2)),
    pricePerSqft: Number((row.resale_price / row.floor_area_sqm / 10.7639).toFixed(2)),
  };
}
describe("durable exact retention accounting", () => {
  it("rejects a proposed review before source/database network calls", async () => {
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected network"));
    const directory = mkdtempSync(join(tmpdir(), "hdb-proposed-review-"));
    const reviewPath = join(directory, "review.json");
    writeFileSync(reviewPath, JSON.stringify({ ...setup().review, reviewStatus: "proposed" }), {
      mode: 0o600,
    });
    try {
      await expect(
        runSyncNeon([
          "--apply",
          "--reconcile-manual",
          "--branch",
          NEON_REFRESH_BRANCH,
          "--reconciliation-review",
          reviewPath,
        ]),
      ).rejects.toThrow("explicit reviewed decision");
      expect(network).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it("preserves integer IDs/multiplicity without mutating stored input", () => {
    const s = setup(),
      old = JSON.stringify(s.previous),
      p = first(s);
    expect(p.delta.inserts).toEqual([]);
    expect(p.delta.updates).toEqual([]);
    expect(p.state.entries.map((entry) => [entry.id, entry.occurrenceCount, entry.status])).toEqual(
      [
        [2, 1, "unresolved-retained"],
        [3, 1, "unresolved-retained"],
      ],
    );
    expect(p.sourceFacts).toBe(998);
    expect(p.storedFacts).toBe(1000);
    expect(p.retainedOccurrences).toBe(2);
    expect(JSON.stringify(s.previous)).toBe(old);
  });
  it("keeps a repeated catch-up ledger unchanged with zero new data", () => {
    const s = setup(),
      p = first(s);
    const replay = planNeonReconciliation({
      ...s,
      manifest: { ...s.manifest, neonReconciliation: p.state },
      capturedAtUTC: "2026-10-04T07:00:00Z",
    });
    expect(replay.newlyMissingIds).toEqual([]);
    expect(replay.delta.inserts).toEqual([]);
    expect(replay.retainedOccurrences).toBe(2);
    expect(replay.state).toEqual(p.state);
  });
  it("consumes partial duplicate reappearances before inserts and retains history", () => {
    const s = setup(),
      p = first(s);
    const partial = planNeonReconciliation({
      ...s,
      incoming: [...s.incoming, s.previous[1]],
      manifest: { ...s.manifest, neonReconciliation: p.state },
      capturedAtUTC: "2026-10-05T06:00:00Z",
    });
    expect(partial.reappearedIds).toEqual([2]);
    expect(partial.missing.map((row) => row.id)).toEqual([3]);
    expect(partial.delta.inserts).toEqual([]);
    expect(partial.state.acceptedSource.scopedSourceRows).toBe(999);
    const complete = planNeonReconciliation({
      ...s,
      incoming: s.previous,
      manifest: { ...s.manifest, neonReconciliation: partial.state },
      capturedAtUTC: "2026-10-06T06:00:00Z",
    });
    expect(complete.reappearedIds).toEqual([3]);
    expect(complete.retainedOccurrences).toBe(0);
    expect(complete.delta.inserts).toEqual([]);
    expect(complete.state.entries).toHaveLength(2);
    const extra = planNeonReconciliation({
      ...s,
      incoming: [...s.previous, s.previous[0]],
      manifest: { ...s.manifest, neonReconciliation: complete.state },
      capturedAtUTC: "2026-10-07T06:00:00Z",
    });
    expect(extra.delta.inserts).toHaveLength(1);
    expect(extra.delta.inserts[0].id).toBe(1001);
    const absentAgain = planNeonReconciliation({
      ...s,
      manifest: { ...s.manifest, neonReconciliation: complete.state },
      capturedAtUTC: "2026-10-07T06:00:00Z",
    });
    expect(absentAgain.newlyMissingIds).toEqual([]);
    expect(absentAgain.state.entries[0].firstObservedMissingAt).toBe(sourceTime);
  });
  it("preserves retained presentation IDs when duplicate leases sort before the real source", () => {
    const s = setup();
    s.review.retentions[0].remainingLease = "51 years";
    s.review.retentions[1].remainingLease = "50 years";
    const p = first(s),
      effective = includeRetainedSourceRows(s.incoming.map(presentation), p);
    assignNeonTransactionIds(effective, s.previous, p, s.incoming.length);
    expect(effective[0].id).toBe("d1:0000000000000001");
    expect(effective.at(-2)?.id).toBe("d1:0000000000000002");
    expect(effective.at(-1)?.id).toBe("d1:0000000000000003");
    expect(new Set(effective.map((row) => row.id)).size).toBe(1000);
  });
  it("treats a month-only candidate as a separate insert plus visible retained absence", () => {
    const s = setup([7]),
      candidate = { ...s.previous[6], month: "2026-09" };
    const { id: _id, ...tuple } = candidate;
    const incoming = [...s.incoming, candidate];
    const review = {
      ...s.review,
      initialSourceFactsSHA256: sourceFactsSHA256(incoming),
      retentions: [{ ...s.review.retentions[0], possibleReplacementTuples: [tuple] }],
    };
    const p = planNeonReconciliation({ ...s, incoming, review, capturedAtUTC: sourceTime });
    expect(p.delta.updates).toEqual([]);
    expect(p.delta.inserts.map((row) => row.month)).toEqual(["2026-09"]);
    expect(p.state.entries[0]).toMatchObject({
      id: 7,
      status: "unresolved-retained",
      possibleReplacementRowIds: [1001],
    });
  });
  it("reports unapproved absences and rejects duplicate ledger/checkpoint corruption", () => {
    const s = setup(),
      p = first(s);
    try {
      planNeonReconciliation({
        ...s,
        incoming: s.incoming.filter((row) => row.id !== 8),
        manifest: { ...s.manifest, neonReconciliation: p.state },
        capturedAtUTC: "2026-10-05T06:00:00Z",
      });
      throw new Error("must fail");
    } catch (error) {
      expect(error).toBeInstanceOf(NeonReconciliationPolicyError);
      expect((error as NeonReconciliationPolicyError).discrepancy.newlyMissingIds).toEqual([8]);
    }
    expect(() => first({ ...s, review: { ...s.review, maxOutstandingRetentions: 1 } })).toThrow(
      "Independent disappearance",
    );
    expect(() =>
      planNeonReconciliation({
        ...s,
        manifest: {
          ...s.manifest,
          neonReconciliation: { ...p.state, entries: [...p.state.entries, p.state.entries[0]] },
        },
        capturedAtUTC: sourceTime,
      }),
    ).toThrow("Duplicate durable");
    expect(() =>
      planNeonReconciliation({
        ...s,
        manifest: {
          ...s.manifest,
          neonReconciliation: {
            ...p.state,
            acceptedSource: { ...p.state.acceptedSource, sourceFactRows: 999 },
          },
        },
        capturedAtUTC: sourceTime,
      }),
    ).toThrow("checkpoint/retained");
    expect(() =>
      requireApprovedNeonReview({
        ...s.review,
        retentions: [...s.review.retentions, s.review.retentions[0]],
      }),
    ).toThrow("Duplicate retention");
  });
  it("updates raw-CSV checkpoints even when facts match; next-month acceptance advances too", () => {
    const s = setup(),
      csv = { datasetId: policy.scopeDatasetId, bodySHA256: "a".repeat(64), bytes: 100, rows: 998 };
    const p = planNeonReconciliation({ ...s, capturedAtUTC: sourceTime, csvs: [csv] });
    const changed = planNeonReconciliation({
      ...s,
      manifest: { ...s.manifest, neonReconciliation: p.state },
      capturedAtUTC: "2026-10-05T06:00:00Z",
      csvs: [{ ...csv, bodySHA256: "b".repeat(64) }],
    });
    expect(changed.delta.inserts).toEqual([]);
    expect(changed.state.acceptedSource.csvs[0].bodySHA256).toBe("b".repeat(64));
    const month = planNeonReconciliation({
      ...s,
      manifest: { ...s.manifest, neonReconciliation: p.state },
      capturedAtUTC: "2026-11-01T06:00:00Z",
      csvs: [csv],
    });
    expect(month.state.acceptedSource.capturedAtUTC).toBe("2026-11-01T06:00:00Z");
  });
  it("keeps decimal values/permutation identity and fails incorrect source/manifest approvals", () => {
    const s = setup([7]);
    s.previous[6].resale_price = 500006.55;
    s.review.retentions[0].fact.resale_price = 500006.55;
    const p = first(s);
    expect(p.missing[0].resale_price).toBe(500006.55);
    expect(
      first({
        ...s,
        previous: s.previous.slice().reverse(),
        incoming: s.incoming.slice().reverse(),
      }).state,
    ).toEqual(p.state);
    expect(() =>
      first({ ...s, review: { ...s.review, initialSourceFactsSHA256: "0".repeat(64) } }),
    ).toThrow("reviewed tuple/source");
    expect(() =>
      first({ ...s, manifest: { ...s.manifest, generatedAt: "2026-09-05T00:00:00Z" } }),
    ).toThrow("reviewed tuple/source");
  });
  it("rebuilds artifacts from retained union, preserving unrelated entities and historic fallback", () => {
    const s = setup([7]),
      candidate = { ...s.previous[6], resale_price: 600000 };
    const incoming = [...s.incoming, candidate],
      { id: _id, ...tuple } = candidate;
    const p = planNeonReconciliation({
      ...s,
      incoming,
      review: {
        ...s.review,
        initialSourceFactsSHA256: sourceFactsSHA256(incoming),
        retentions: [{ ...s.review.retentions[0], possibleReplacementTuples: [tuple] }],
      },
      capturedAtUTC: sourceTime,
    });
    const effective = includeRetainedSourceRows(incoming.map(presentation), p);
    assignNeonTransactionIds(effective, s.previous, p, incoming.length);
    const input = {
      propertyInfo: [],
      mrtExits: [],
      parks: [{ name: "FIXTURE PARK", lat: 1.3, lng: 103.8 }],
      geocodes: Object.fromEntries(
        [0, 1, 2].map((i) => [
          `block-${i}`,
          { lat: 1.3, lng: 103.8, displayName: null, postalCode: null, searchValue: "TEST ST" },
        ]),
      ),
      metadata: { lastUpdatedAt: "fixture" },
    };
    const old = s.previous.map(presentation);
    assignStableTransactionIds(
      old,
      s.previous,
      planTransactionDelta(s.previous, s.previous),
      (row) => ({
        month: row.month,
        town: row.town,
        block: row.block,
        street_name: row.streetName,
        address_key: row.addressKey,
        flat_type: row.flatType,
        storey_range: row.storeyRange,
        floor_area_sqm: row.floorAreaSqm,
        lease_commence_year: row.leaseCommenceDate,
        resale_price: row.resalePrice,
        flat_model: row.flatModel,
      }),
    );
    const previous = buildArtifacts({ ...input, transactions: old }),
      next = buildArtifacts({
        ...input,
        transactions: effective,
        incremental: { previous, delta: p.delta },
      }),
      full = buildArtifacts({ ...input, transactions: effective });
    expect(next.blockSummaries).toEqual(full.blockSummaries);
    expect(next.details).toEqual(full.details);
    expect(next.townFlatTypeTrend).toEqual(full.townFlatTypeTrend);
    expect(next.details["block-2"]).toBe(previous.details["block-2"]);
    expect(next.comparisons?.["block-2"]).toBe(previous.comparisons?.["block-2"]);
    const historic = { ...effective[0], month: "2016-01", addressKey: "old-only", block: "OLD" };
    const timeAxis = Array.from({ length: 27 }, (_, index) => ({
      ...effective[1],
      id: `axis-${index}`,
      month: new Date(Date.UTC(2024, 7 + index, 1)).toISOString().slice(0, 7),
    }));
    const baseline = buildArtifacts({
      ...input,
      geocodes: { ...input.geocodes, "old-only": input.geocodes["block-0"] },
      transactions: [...effective, ...timeAxis, historic],
    });
    expect(baseline.details["old-only"].summary.transactionCount).toBe(1);
    expect(baseline.details["old-only"].summary.medianPrice).toBe(historic.resalePrice);
    const retainedRecent = { ...historic, month: "2026-05", resalePrice: 258000 };
    const retainedBuild = buildArtifacts({
      ...input,
      geocodes: { ...input.geocodes, "old-only": input.geocodes["block-0"] },
      transactions: [...effective, ...timeAxis, historic, retainedRecent],
    });
    expect(retainedBuild.details["old-only"].summary.transactionCount).toBe(1);
    expect(retainedBuild.details["old-only"].summary.medianPrice).toBe(258000);
  });
});

describe("scope-correct cadence and exact one-time exception", () => {
  const base = {
    policy,
    intent: "manual" as const,
    baselineSourceRows: 239330,
    baselineCapturedAtUTC: "2026-09-04T01:37:16.797Z",
    capturedAtUTC: sourceTime,
    insertions: 1000,
  };
  it("keeps the ordinary 1000 absolute cap, active-scope relative cap and fixed gap limit", () => {
    expect(checkCadenceGrowth(base)).toMatchObject({
      allowedInsertions: 1000,
      relativeCeiling: 1196,
      independentSnapshotIntervals: 0,
    });
    expect(() => checkCadenceGrowth({ ...base, insertions: 1001 })).toThrow("guard");
    expect(() => checkCadenceGrowth({ ...base, baselineSourceRows: 1000, insertions: 6 })).toThrow(
      "6 > 5",
    );
    const start = Date.parse(base.baselineCapturedAtUTC);
    for (const intent of ["monthly", "manual"] as const) {
      expect(() =>
        checkCadenceGrowth({
          ...base,
          intent,
          capturedAtUTC: new Date(start + 35 * 86400000).toISOString(),
        }),
      ).not.toThrow();
      expect(() =>
        checkCadenceGrowth({
          ...base,
          intent,
          capturedAtUTC: new Date(start + 35 * 86400000 + 1).toISOString(),
        }),
      ).toThrow("checkpoint gap");
    }
    expect(() =>
      checkCadenceGrowth({ ...base, baselineCapturedAtUTC: "2026-10-05T00:00:00Z" }),
    ).toThrow();
    expect(() => checkCadenceGrowth({ ...base, capturedAtUTC: "2027-10-04T00:00:00Z" })).toThrow();
  });
  it("rejects automatic/manual fallback and historical additions, preserving the D1 guard", () => {
    const s = setup([]);
    expect(() => first({ ...s, intent: undefined as never })).toThrow("Explicit");
    const incoming = [...s.incoming, { ...s.previous[0], month: "2016-01" }];
    expect(() => first({ ...s, incoming })).toThrow("Historical-source additions");
    expect(() =>
      planTransactionDelta(s.previous, [
        ...s.previous,
        ...Array.from({ length: 1001 }, (_, i) => ({ ...s.previous[0], resale_price: 800000 + i })),
      ]),
    ).toThrow("massive delta");
  });
  it("does not dilute the active denominator with untouched historic rows", () => {
    const s = setup([]),
      historical = s.previous.map((row) => ({ ...row, id: row.id + 1000, month: "2016-01" })),
      positive = Array.from({ length: 6 }, (_, i) => ({
        ...s.previous[0],
        resale_price: 800000 + i,
      }));
    expect(() =>
      first({
        ...s,
        previous: [...s.previous, ...historical],
        incoming: [...s.incoming, ...historical, ...positive],
      }),
    ).toThrow("6 > 5");
  });
  function exception() {
    const s = setup(),
      positive = Array.from({ length: 6 }, (_, i) => ({
        ...s.previous[0],
        resale_price: 800000 + i,
      }));
    const incoming = [...s.incoming, ...positive];
    const csv = {
      datasetId: policy.scopeDatasetId,
      bodySHA256: "f".repeat(64),
      bytes: 1000,
      rows: incoming.length,
    };
    const review = {
      ...s.review,
      initialSourceFactsSHA256: sourceFactsSHA256(incoming),
      oneTimeAllowance: {
        baselineScopedFactsSHA256: sourceFactsSHA256(s.previous),
        incomingScopedFactsSHA256: sourceFactsSHA256(incoming),
        rawCSVBodySHA256: csv.bodySHA256,
        positiveFactsSHA256: sourceFactsSHA256(positive),
        baselineScopedRows: 1000,
        incomingScopedRows: incoming.length,
        exactInserts: 6,
        exactMissingIds: [2, 3],
        maxElapsedDays: 62,
        rationale: "Fixture exact one-time manual decision only",
      },
    };
    return { ...s, incoming, review, csvs: [csv] };
  }
  it("accepts only a manually reviewed exact snapshot/diff and consumes the allowance once", () => {
    const s = exception(),
      p = first(s);
    expect(p.growth.acceptance).toBe("exact-reviewed-one-time-allowance");
    expect(p.delta.inserts).toHaveLength(6);
    expect(p.state.appliedOneTimeAllowance).toEqual(s.review.oneTimeAllowance);
    const replay = planNeonReconciliation({
      ...s,
      previous: [...s.previous, ...p.delta.inserts],
      manifest: { ...s.manifest, neonReconciliation: p.state },
      capturedAtUTC: "2026-10-04T07:00:00Z",
    });
    expect(replay.growth.acceptance).toBe("recurring-guard");
    expect(replay.delta.inserts).toEqual([]);
    expect(replay.state).toEqual(p.state);
    expect(() => first({ ...s, intent: "monthly" as never })).toThrow("guard");
    expect(() => first({ ...s, csvs: [{ ...s.csvs[0], bodySHA256: "e".repeat(64) }] })).toThrow(
      "guard",
    );
    expect(() =>
      first({
        ...s,
        review: {
          ...s.review,
          oneTimeAllowance: { ...s.review.oneTimeAllowance, positiveFactsSHA256: "0".repeat(64) },
        },
      }),
    ).toThrow("guard");
  });
  it("permits a longer gap only via the exact manual allowance, bounded to 62 days", () => {
    const s = exception(),
      start = Date.parse(s.manifest.generatedAt!);
    expect(() =>
      planNeonReconciliation({
        ...s,
        capturedAtUTC: new Date(start + 62 * 86400000).toISOString(),
      }),
    ).not.toThrow();
    expect(() =>
      planNeonReconciliation({
        ...s,
        capturedAtUTC: new Date(start + 62 * 86400000 + 1).toISOString(),
      }),
    ).toThrow("checkpoint gap");
  });
});

describe("durable ledger publication boundary", () => {
  it("commits facts and ledger together, restores both on interruption and replays without inserts", () => {
    const s = setup(),
      incoming = [...s.incoming, { ...s.previous[0], resale_price: 900000 }],
      review = { ...s.review, initialSourceFactsSHA256: sourceFactsSHA256(incoming) },
      p = first({ ...s, incoming, review });
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
      db.exec(readFileSync("migrations/0009_transactions_normalize.sql", "utf8"));
      const columns = ["id", ...TRANSACTION_COLUMNS];
      const insert = db.prepare(
        `INSERT INTO transactions (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
      );
      for (const row of s.previous)
        insert.run(...columns.map((column) => row[column as keyof StoredTransaction]));
      const updateManifest = db.prepare("UPDATE manifest SET json=?,updated_at=? WHERE id=1");
      db.prepare("INSERT INTO manifest VALUES(1,?,?)").run(JSON.stringify(s.manifest), sourceTime);
      const next = { ...s.manifest, neonReconciliation: p.state };
      const apply = () => {
        for (const statement of transactionStatements(p.delta))
          db.prepare(statement.sql).run(...((statement.params ?? []) as SQLInputValue[]));
        updateManifest.run(JSON.stringify(next), sourceTime);
      };
      db.exec("BEGIN");
      apply();
      // A lost client response before the commit leaves no authoritative publication.
      db.exec("ROLLBACK");
      expect(db.prepare("SELECT count(*) AS n FROM transactions").get()?.n).toBe(1000);
      expect(JSON.parse(String(db.prepare("SELECT json FROM manifest").get()?.json))).toEqual(
        s.manifest,
      );
      db.exec("BEGIN");
      apply();
      db.exec("COMMIT");
      const stored = db
        .prepare(`SELECT ${columns.join(",")} FROM transactions ORDER BY id`)
        .all() as StoredTransaction[];
      const published = JSON.parse(
        String(db.prepare("SELECT json FROM manifest").get()?.json),
      ) as NeonManifest;
      expect(stored).toHaveLength(1001);
      expect(
        stored
          .filter((row) => row.resale_price === s.previous[0].resale_price)
          .map((row) => row.id),
      ).toEqual([1, 2, 3]);
      expect(published.neonReconciliation).toEqual(p.state);
      const replay = planNeonReconciliation({
        previous: stored,
        incoming,
        manifest: published,
        review,
        capturedAtUTC: "2026-10-04T07:00:00Z",
        intent: "manual",
      });
      expect(replay.delta.inserts).toEqual([]);
      expect(replay.delta.updates).toEqual([]);
      expect(replay.state).toEqual(p.state);
    } finally {
      db.close();
    }
  });
  it("includes ledger/checkpoint only in the final manifest and rolls back a late failure", async () => {
    const s = setup(),
      p = first(s),
      next = { ...s.manifest, neonReconciliation: p.state };
    const query = vi.fn<PgQuery>().mockImplementation(async (sql, params) => {
      if (sql.startsWith("UPDATE manifest")) {
        expect(JSON.parse(String(params?.[0])).neonReconciliation).toEqual(p.state);
        throw new Error("injected manifest failure");
      }
      return { rows: sql.includes("FOR UPDATE") ? [{ matches: true }] : [], rowCount: 1 };
    });
    const plan = {
      statements: transactionStatements(p.delta),
      changedRows: { transactions: 0 },
      forecastWriteUpperBound: 1,
    };
    await expect(
      publishNeon(
        query,
        new NeonPlanningStore(query),
        plan,
        next,
        JSON.stringify(s.manifest),
        sourceTime,
      ),
    ).rejects.toThrow("injected");
    expect(query.mock.calls.map(([sql]) => sql.split(" ")[0])).toEqual([
      "BEGIN",
      "SELECT",
      "UPDATE",
      "ROLLBACK",
    ]);
    expect(s.manifest.neonReconciliation).toBeUndefined();
  });
  it("skips exact same-month replay but never altered ledger, pending mutations or next month", () => {
    const s = setup(),
      p = first(s),
      previous = { ...s.manifest, generatedAt: sourceTime, neonReconciliation: p.state },
      next = { ...previous, generatedAt: "2026-10-04T07:00:00Z" };
    expect(isNeonPublicationReplay(previous, next, 0)).toBe(true);
    expect(isNeonPublicationReplay(previous, next, 1)).toBe(false);
    expect(
      isNeonPublicationReplay(previous, { ...next, generatedAt: "2026-11-04T00:00:00Z" }, 0),
    ).toBe(false);
    expect(
      isNeonPublicationReplay(
        previous,
        {
          ...next,
          neonReconciliation: {
            ...p.state,
            entries: p.state.entries.map((e) => ({ ...e, evidence: "different" })),
          },
        },
        0,
      ),
    ).toBe(false);
  });
});
