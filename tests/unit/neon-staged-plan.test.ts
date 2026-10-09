import { describe, expect, it } from "vite-plus/test";
import {
  applyDetailPaths,
  assertStageEnvelope,
  classifyManifest,
  COPY_STAGE_SQL,
  expectedModeReceipt,
  CREATE_STAGE_SQL,
  packStage,
  sha256,
  stageIdentity,
  stagePublicationId,
  stagedDml,
  STAGE_DIGEST_SQL,
  STAGE_TABLES,
  STAGE_UNIQUE_SQL,
  statementShape,
  verifyMutationReceipt,
  type PackedStage,
  type StageEnvelope,
  type StageItem,
} from "../../scripts/neon-benchmark/staged-plan";
import { sourceFactsSHA256 } from "../../scripts/lib/sync/neon-reconciliation";
import { MAX_FORECAST_WRITES } from "../../scripts/lib/sync/statements";
import { canonicalJson, validateNeonPublicationPlan } from "../../scripts/lib/sync/neon";
import type { Manifest } from "../../shared/data-types";
import type { TransactionRow } from "../../scripts/lib/schemas";

const fact: TransactionRow = {
  month: "2026-09",
  town: "TEST",
  block: "1",
  street_name: "TEST ST",
  address_key: "test-1",
  flat_type: "4 ROOM",
  storey_range: "01 TO 03",
  floor_area_sqm: 92,
  lease_commence_year: 2019,
  resale_price: 625000,
  flat_model: "MODEL A",
};
const insertion = (id: number): StageItem => ({
  table: "transactions",
  operation: "insert",
  key: { id },
  before: null,
  after: { id, ...fact },
});
const detail: StageItem = {
  table: "block_details",
  operation: "update",
  key: { address_key: "test-1" },
  before: {},
  after: {},
  detailPatches: [
    { path: ["summary", "coordinates", "lat"], before: 1.2, after: 1.3 },
    { path: ["summary", "medianPrice"], before: 600000, after: 625000 },
  ],
};
const next = {
  generatedAt: "2026-10-04T00:00:00Z",
  neonPublication: { publicationId: sha256("local-fixture") },
};
function envelope(plan: PackedStage): StageEnvelope {
  const e: StageEnvelope = {
    version: 1,
    status: "approved",
    intent: "manual-snapshot",
    decisionReference: "local fixture only; not actual catch-up approval",
    projectId: "wispy-mouse-67963002",
    branchId: "br-wispy-boat-b34glczl",
    sourceIdentity: {
      rawCSVBodySHA256: sha256("raw"),
      canonicalScopedFactsSHA256: sourceFactsSHA256([fact, fact]),
      baselineScopedFactsSHA256: sha256("baseline"),
      positiveFactsSHA256: sourceFactsSHA256(
        plan.items.filter((r) => r.table === "transactions").map((r) => r.after as TransactionRow),
      ),
      reconciliationReviewSHA256: sha256("fixture-policy"),
      baselineScopedRows: 10,
      incomingScopedRows: 12,
      exactIncomingOccurrences: plan.groups.transactions.insert,
      unresolvedCount: 1,
      historicalInputs: "retained-baseline-not-recaptured",
    },
    baselineManifestSHA256: sha256("baseline-manifest"),
    baselineHasBuildState: false,
    context: {
      rawHashes: { property: sha256("property") },
      normalizedSHA256: sha256("normalized"),
      missingGeocodeKeys: [],
      missingRoutingKeys: [],
      resolution: "cache-only-pinned",
    },
    unresolvedOccurrences: [
      {
        id: 5,
        tuple: { ...fact, month: "2026-07" },
        occurrenceCount: 1,
        remainingLease: "91 years 07 months",
        disposition: "retain-unresolved",
      },
    ],
    detailOwnedPaths: detail.detailPatches!.map((p) => p.path),
    stage: stageIdentity(plan),
    nextManifestSHA256: sha256(canonicalJson(next)),
    limits: {
      exactCopyBytes: plan.copyBytes,
      exactRows: plan.rows,
      maxTemporaryBytes: 1_000_000,
      reservedDatabaseGrowthBytes: 1_000_000,
      maxStatementMs: 120000,
      maxTransactionMs: 600000,
      maxLockWaitMs: 5000,
    },
  };
  e.nextManifestSHA256 = sha256(canonicalJson(nextFor(e)));
  return e;
}
const nextFor = (e: StageEnvelope) => ({
  ...next,
  neonPublication: { publicationId: stagePublicationId(e) },
});
const binding = (e: StageEnvelope) => ({
  sourceIdentity: e.sourceIdentity,
  baselineManifestSHA256: e.baselineManifestSHA256,
  baselineHasBuildState: e.baselineHasBuildState,
  context: e.context,
  unresolvedOccurrences: e.unresolvedOccurrences,
});

describe("offline Postgres staged envelope (no database execution)", () => {
  it("distinguishes dotted dictionary keys from nested owned paths", () => {
    const dotted: StageItem = {
      ...detail,
      detailPatches: [
        { path: ["summary", "a.b"], before: 1, after: 2 },
        { path: ["summary", "a", "b"], before: 1, after: 2 },
      ],
    };
    expect(() => packStage([dotted])).not.toThrow();
    const plan = packStage([{ ...dotted, detailPatches: [dotted.detailPatches![1]] }]);
    const e = envelope(plan);
    e.detailOwnedPaths = [["summary", "a.b"]];
    expect(() => assertStageEnvelope(plan, e, binding(e), nextFor(e))).toThrow("Unowned");
  });
  it("quotes COPY text backslashes without doubling JSON quotes or emitting extra fields/records", () => {
    const value = 'quote " tab\t newline\n return\r unicode 星 😀 literal \\N \\.';
    const row: StageItem = {
      table: "comparisons",
      operation: "update",
      key: { address_key: "a" },
      before: { json: { value: "old" } },
      after: { json: { value } },
    };
    const plan = packStage([row]);
    expect(plan.copyText.split("\n")).toHaveLength(2);
    const fields = plan.copyText.slice(0, -1).split("\t");
    expect(fields).toHaveLength(2);
    expect(fields[0]).toBe("1");
    expect(fields[1]).toContain('"value"');
    const wire = fields[1].replace(/\\(.)/g, "$1"); // COPY text removes the quoted slash character.
    expect(JSON.parse(wire).after.json.value).toBe(value);
    expect(wire).toBe(plan.wires[0]);
    expect(COPY_STAGE_SQL).toContain("FORMAT text");
  });
  it("pins deterministic order, all table keys/payloads and exact COPY text byte encoding", () => {
    const a = packStage([insertion(11), insertion(12), detail]),
      b = packStage([detail, insertion(12), insertion(11)]);
    expect(stageIdentity(a)).toEqual(stageIdentity(b));
    expect(a.copyText).toBe(b.copyText);
    expect(a.groups.transactions.insert).toBe(2); // Legitimate equal facts keep separate IDs.
    expect(a.copyBytes).toBe(Buffer.byteLength(a.copyText));
    expect(a.copyText).toContain('"street_name"');
    expect(() =>
      assertStageEnvelope(a, envelope(a), binding(envelope(a)), nextFor(envelope(a))),
    ).not.toThrow();
  });
  it("rejects equal counts with different target keys", () => {
    const plan = packStage([insertion(11), detail]),
      e = envelope(plan);
    const changed = packStage([insertion(11), { ...detail, key: { address_key: "different" } }]);
    expect(changed.rows).toBe(plan.rows);
    expect(() => assertStageEnvelope(changed, e, binding(e), nextFor(e))).toThrow("identity drift");
  });
  it("rejects equal counts/keys with changed patches", () => {
    const plan = packStage([insertion(11), detail]),
      e = envelope(plan);
    const changed = packStage([
      insertion(11),
      { ...detail, detailPatches: detail.detailPatches!.map((p) => ({ ...p, after: 0 })) },
    ]);
    expect(changed.groups.block_details.keySHA256).toBe(plan.groups.block_details.keySHA256);
    expect(() => assertStageEnvelope(changed, e, binding(e), nextFor(e))).toThrow("identity drift");
  });
  it("rejects duplicate join targets even with different insert/update modes", () => {
    expect(() => packStage([insertion(11), insertion(11)])).toThrow("Duplicate staging target");
    expect(() => packStage([detail, detail])).toThrow("Duplicate staging target");
    expect(() =>
      packStage([
        { ...detail, key: { address_key: 1 } },
        { ...detail, key: { address_key: "1" } },
      ]),
    ).toThrow("key values");
  });
  it("refuses proposed/unknown input but accepts pinned cache omissions", () => {
    const p = packStage([insertion(11)]),
      e = envelope(p);
    expect(() =>
      assertStageEnvelope(p, { ...e, status: "proposed" }, binding(e), nextFor(e)),
    ).toThrow("manual review");
    const unresolved = {
      ...e,
      context: { ...e.context, missingGeocodeKeys: ["supermarket:000000"] },
    };
    unresolved.nextManifestSHA256 = sha256(canonicalJson(nextFor(unresolved)));
    expect(() =>
      assertStageEnvelope(p, unresolved, binding(unresolved), nextFor(unresolved)),
    ).not.toThrow();
    const unknown = { ...e, context: { ...e.context, resolution: "unknown" } };
    expect(() => assertStageEnvelope(p, unknown, binding(e), nextFor(e))).toThrow(
      "Incomplete context",
    );
  });
  it("binds exact incoming multiplicity independently of staging cardinality", () => {
    const p = packStage([insertion(11), insertion(12)]),
      e = envelope(p);
    const drift = {
      ...e,
      sourceIdentity: { ...e.sourceIdentity, positiveFactsSHA256: sourceFactsSHA256([fact]) },
    };
    expect(() => assertStageEnvelope(p, drift, binding(drift), nextFor(drift))).toThrow(
      "multiplicity drift",
    );
  });
  it("fails on source, baseline, retention and context identity changes", () => {
    const p = packStage([insertion(11)]),
      e = envelope(p),
      b = binding(e);
    for (const changed of [
      { ...b, sourceIdentity: { ...b.sourceIdentity, rawCSVBodySHA256: sha256("different CSV") } },
      { ...b, baselineManifestSHA256: sha256("different version") },
      { ...b, unresolvedOccurrences: [] },
      { ...b, context: { ...b.context, normalizedSHA256: sha256("different context") } },
    ])
      expect(() => assertStageEnvelope(p, e, changed, nextFor(e))).toThrow("identity drift");
  });
  it("cannot reuse a retained ID or introduce automatic transaction corrections/deletions", () => {
    const p = packStage([insertion(5)]),
      e = envelope(p);
    expect(() => assertStageEnvelope(p, e, binding(e), nextFor(e))).toThrow("Retained occurrence");
    expect(() => packStage([{ ...insertion(11), operation: "update" }])).toThrow(
      "No transaction corrections",
    );
    expect(() => packStage([{ ...insertion(11), operation: "delete" }])).toThrow();
  });
  it("preserves unknown roots and nested siblings when an owned detail path changes", () => {
    const old = {
      summary: {
        medianPrice: 600000,
        coordinates: { lat: 1.2, lng: 103.8, unknownAccuracy: "retained" },
        futureField: { keep: true },
      },
      monthlyTrend: [],
      recentTransactions: [],
      futureRoot: { keep: true },
    };
    const changed = applyDetailPaths(old, detail.detailPatches!);
    expect(changed).toEqual({
      ...old,
      summary: {
        ...old.summary,
        medianPrice: 625000,
        coordinates: { ...old.summary.coordinates, lat: 1.3 },
      },
    });
    expect(old.summary.coordinates.lat).toBe(1.2);
  });
  it("retains JSON null and array replacement semantics without accepting stale/missing parents", () => {
    expect(
      applyDetailPaths({ summary: { nullable: null }, monthlyTrend: [1], recentTransactions: [] }, [
        { path: ["summary", "nullable"], before: null, after: 1 },
        { path: ["monthlyTrend"], before: [1], after: [] },
      ]),
    ).toEqual({ summary: { nullable: 1 }, monthlyTrend: [], recentTransactions: [] });
    expect(() => applyDetailPaths({ summary: {} }, detail.detailPatches!)).toThrow("parent");
    expect(() =>
      applyDetailPaths({ summary: { coordinates: { lat: 0 } } }, detail.detailPatches!),
    ).toThrow("Stale");
    expect(
      applyDetailPaths({ summary: { unknown: true } }, [
        { path: ["summary", "postalCode"], beforeExists: false, before: null, after: "123456" },
      ]),
    ).toEqual({ summary: { unknown: true, postalCode: "123456" } });
    expect(() =>
      packStage([{ ...detail, detailPatches: [{ path: ["summary"], before: {}, after: {} }] }]),
    ).toThrow();
  });
  it("rejects overlapping/unowned paths and non-changing patches", () => {
    expect(() =>
      packStage([
        {
          ...detail,
          detailPatches: [
            { path: ["summary", "coordinates"], before: null, after: 1 },
            { path: ["summary", "coordinates", "lat"], before: 0, after: 1 },
          ],
        },
      ]),
    ).toThrow("Overlapping");
    const p = packStage([detail]),
      e = envelope(p);
    expect(() =>
      assertStageEnvelope(p, { ...e, detailOwnedPaths: [] }, binding(e), nextFor(e)),
    ).toThrow("Unowned");
    expect(() =>
      packStage([
        { ...detail, detailPatches: [{ path: ["summary", "medianPrice"], before: 1, after: 1 }] },
      ]),
    ).toThrow("unchanged");
  });
  it("refuses whole structured summary replacements that could erase unknown descendants", () => {
    expect(() =>
      packStage([
        {
          ...detail,
          detailPatches: [
            {
              path: ["summary", "coordinates"],
              before: { lat: 1, unknown: true },
              after: { lat: 2 },
            },
          ],
        },
      ]),
    ).toThrow("owned leaf patches");
  });
  it("has fail-closed row-size and immutable key checks", () => {
    expect(() =>
      packStage([
        {
          table: "comparisons",
          operation: "insert",
          key: { address_key: "a" },
          before: null,
          after: { address_key: "a", json: { oversized: "x".repeat(1_000_000) } },
        },
      ]),
    ).toThrow("size bound");
    expect(() =>
      packStage([
        {
          table: "blocks",
          operation: "update",
          key: { address_key: "a" },
          before: { address_key: "a" },
          after: { address_key: "b" },
        },
      ]),
    ).toThrow("non-key");
  });
  it("checks actual returned keysets/results, not rowCount alone", () => {
    const expected = { rows: 2, ordinalSHA256: sha256("1,2") };
    const ok = { affected_rows: "2", ordinal_sha256: expected.ordinalSHA256, results_match: true };
    expect(() => verifyMutationReceipt(ok, expected)).not.toThrow();
    expect(() => verifyMutationReceipt({ ...ok, ordinal_sha256: sha256("3,4") }, expected)).toThrow(
      "rollback",
    );
    expect(() => verifyMutationReceipt({ ...ok, results_match: false }, expected)).toThrow(
      "rollback",
    );
  });
  it("checks mixed insert/update modes against separate global-ordinal subsets", () => {
    const p = packStage([
      {
        table: "town_flat_type_trends",
        operation: "insert",
        key: { town: "TEST", flat_type: "4 ROOM", month: "2026-09" },
        before: null,
        after: {
          town: "TEST",
          flat_type: "4 ROOM",
          month: "2026-09",
          median_price: 625000,
          median_price_per_sqm: 6000,
          transaction_count: 1,
        },
      },
      {
        table: "town_flat_type_trends",
        operation: "update",
        key: { town: "TEST", flat_type: "4 ROOM", month: "2026-08" },
        before: { median_price: 600000 },
        after: { median_price: 620000 },
      },
    ]);
    for (const operation of ["insert", "update"] as const) {
      const expected = expectedModeReceipt(p, "town_flat_type_trends", operation);
      expect(expected.rows).toBe(1);
      expect(expected.ordinalSHA256).not.toBe(p.groups.town_flat_type_trends.ordinalSHA256);
      expect(() =>
        verifyMutationReceipt(
          { affected_rows: 1, ordinal_sha256: expected.ordinalSHA256, results_match: true },
          expected,
        ),
      ).not.toThrow();
    }
  });
  it("classifies lost acknowledgements by exact durable publication identity without timestamp churn", () => {
    const baseline = { generatedAt: "old" };
    expect(classifyManifest(next, baseline, next)).toBe("already-published");
    expect(classifyManifest(baseline, baseline, next)).toBe("baseline-retry-eligible");
    expect(classifyManifest({ ...next, generatedAt: "new timestamp" }, baseline, next)).toBe(
      "stale-review-required",
    );
    expect(
      classifyManifest(
        { ...next, neonPublication: { publicationId: sha256("other plan") } },
        baseline,
        next,
      ),
    ).toBe("stale-review-required");
  });
  it("counts COPY/schema/validation/transaction control independently of publication DML", () => {
    const groups = Object.fromEntries(
      STAGE_TABLES.map((t) => [t, { insert: 0, update: 0 }]),
    ) as PackedStage["groups"];
    groups.transactions.insert = 2595;
    groups.blocks.update = 4409;
    groups.block_details.update = 4424;
    groups.comparisons.update = 9640;
    groups.town_flat_type_trends.insert = 202;
    groups.town_flat_type_trends.update = 62;
    expect(statementShape(groups)).toMatchObject({
      dml: 6,
      nonDml: 14,
      sqlStatements: 20,
      roundTrips: 20,
    });
    expect(
      statementShape(
        Object.fromEntries(
          STAGE_TABLES.map((t) => [t, { insert: 1, update: t === "transactions" ? 0 : 1 }]),
        ) as PackedStage["groups"],
      ).sqlStatements,
    ).toBe(29);
  });
  it("uses session-scoped staging, typed composites, qualified targets and sparse changed-value updates", () => {
    expect(CREATE_STAGE_SQL).toContain("ON COMMIT DROP");
    expect(STAGE_UNIQUE_SQL).toContain("UNIQUE");
    expect(COPY_STAGE_SQL).toContain("FROM STDIN");
    expect(STAGE_DIGEST_SQL).toContain("sha256");
    expect(STAGE_DIGEST_SQL).toContain("chr(10)");
    const blockSQL = stagedDml("blocks", "update");
    expect(blockSQL).toContain("public.blocks");
    expect(blockSQL).toContain("CASE WHEN");
    expect(blockSQL).toContain("IS DISTINCT FROM");
    expect(blockSQL).toContain("results_match");
    expect(blockSQL).toContain("ordinal_sha256");
    expect(blockSQL).toContain("RETURNING s.ordinal");
    expect(blockSQL).toContain("FROM changed");
    expect(blockSQL).not.toContain("JOIN pg_temp.neon_publication_stage s ON");
    expect(stagedDml("geocode_cache", "update")).toContain("to_jsonb(r)->f.key");
    expect(stagedDml("mrt_geojson", "insert")).toContain(
      "jsonb_populate_record(NULL::public.mrt_geojson",
    );
    expect(stagedDml("block_details", "update")).toContain("detailBeforePgSHA256");
    expect(stagedDml("block_details", "update")).not.toContain("RECURSIVE");
    expect(stagedDml("transactions", "insert")).not.toContain("ON CONFLICT");
  });
  it("leaves the D1-era guard and existing publisher refusal intact", () => {
    expect(MAX_FORECAST_WRITES).toBe(25000);
    expect(() =>
      validateNeonPublicationPlan(
        { statements: [], changedRows: {}, forecastWriteUpperBound: 25659 },
        {} as Manifest,
      ),
    ).toThrow("safety bound");
  });
});

describe("atomicity contract model witness — not PostgreSQL evidence", () => {
  const baseline = { generatedAt: "old" };
  const original = {
    manifest: baseline,
    transactions: [{ id: 5, ...fact, month: "2026-07" }],
    details: {
      summary: { medianPrice: 600000, coordinates: { lat: 1.2, lng: 103.8 }, unknownNested: true },
      futureRoot: true,
    },
  };
  function transactionModel(failure: "copy" | "before-manifest" | "lost-commit" | null) {
    const durable = structuredClone(original),
      draft = structuredClone(durable);
    try {
      if (failure === "copy") throw new Error("interrupted COPY before publication");
      draft.transactions.push({ id: 11, ...fact }, { id: 12, ...fact });
      draft.details = applyDetailPaths(
        draft.details,
        detail.detailPatches!,
      ) as typeof draft.details;
      if (failure === "before-manifest") throw new Error("injected before manifest");
      const committed = { ...draft, manifest: next };
      return {
        state: committed,
        outcome: failure === "lost-commit" ? "unknown-client" : "committed",
      };
    } catch {
      return { state: durable, outcome: "rolled-back" };
    }
  }
  it.each(["copy", "before-manifest"] as const)(
    "requires no durable mutation after %s failure",
    (failure) => {
      expect(transactionModel(failure).state).toEqual(original);
    },
  );
  it("retains unresolved identity and duplicate multiplicity through a successful modeled commit", () => {
    const { state } = transactionModel(null);
    expect(state.transactions.map((r) => r.id)).toEqual([5, 11, 12]);
    expect(state.transactions[0].month).toBe("2026-07");
    expect(state.details.futureRoot).toBe(true);
  });
  it("recovers an acknowledged-lost modeled commit as a zero-mutation replay", () => {
    const first = transactionModel("lost-commit");
    expect(first.outcome).toBe("unknown-client");
    expect(classifyManifest(first.state.manifest, baseline, next)).toBe("already-published");
    const replay = structuredClone(first.state);
    expect(replay).toEqual(first.state);
    expect(replay.transactions).toHaveLength(3);
  });
  it("rejects a second concurrent plan after the first plan changes the baseline", () => {
    const first = transactionModel(null),
      other = { ...next, generatedAt: "other" };
    expect(classifyManifest(first.state.manifest, baseline, other)).toBe("stale-review-required");
  });
});
