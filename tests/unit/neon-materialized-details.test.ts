import { describe, expect, it } from "vite-plus/test";
import fc from "fast-check";
import { canonicalJson } from "../../scripts/lib/sync/neon";
import {
  packStage,
  sha256,
  applyDetailPaths,
  type StageItem,
} from "../../scripts/neon-benchmark/staged-plan";
import {
  materializeDetailStage,
  assertMaterializedDetails,
} from "../../scripts/neon-benchmark/materialized-details";

const digest = sha256("test-only PG representation placeholder; no engine claim");
function fixture(old: Record<string, unknown>, patches: NonNullable<StageItem["detailPatches"]>) {
  return materializeDetailStage(
    packStage([
      {
        table: "block_details",
        operation: "update",
        key: { address_key: "fixture" },
        before: {},
        after: {},
        detailPatches: patches,
      },
    ]),
    new Map([["fixture", old]]),
    new Map([["fixture", digest]]),
  );
}
const owned = [
  ["summary", "value"],
  ["summary", "optional"],
  ["monthlyTrend"],
  ["recentTransactions"],
];
describe("materialized detail ownership and deterministic derivation", () => {
  it("preserves unknown roots, nested siblings, null/absence, arrays and presentation IDs", () => {
    const old = {
      unknown: { nullable: null, array: [false, { text: "雪\\\t\n" }] },
      summary: { value: 1, sibling: { keep: true } },
      monthlyTrend: [{ month: "2026-08" }],
      recentTransactions: [{ id: 550818, price: 1 }],
    };
    const r = fixture(old, [
      { path: ["summary", "value"], before: 1, after: null },
      { path: ["summary", "optional"], beforeExists: false, before: null, after: null },
      { path: ["monthlyTrend"], before: old.monthlyTrend, after: [] },
      {
        path: ["recentTransactions"],
        before: old.recentTransactions,
        after: [{ id: 550818, price: 2 }],
      },
    ]);
    assertMaterializedDetails(r.plan, r.derivations, owned, r.identity);
    expect(r.plan.items[0].after.json).toEqual({
      ...old,
      summary: { value: null, sibling: { keep: true }, optional: null },
      monthlyTrend: [],
      recentTransactions: [{ id: 550818, price: 2 }],
    });
    expect(old.summary.value).toBe(1);
    expect(Object.hasOwn(old.summary, "optional")).toBe(false);
  });
  it("seeded differential preserves arbitrary unowned JSON and array order", () => {
    fc.assert(
      fc.property(
        fc.jsonValue(),
        fc.array(fc.jsonValue(), { maxLength: 12 }),
        fc.integer({ min: -1000000, max: 1000000 }),
        (unknown, array, value) => {
          const old = { unknown, summary: { value, sibling: unknown }, recentTransactions: array };
          const patches = [{ path: ["summary", "value"], before: value, after: value + 1 }];
          const r = fixture(old, patches);
          assertMaterializedDetails(r.plan, r.derivations, owned, r.identity);
          expect(canonicalJson(r.plan.items[0].after.json)).toBe(
            canonicalJson(applyDetailPaths(old, patches)),
          );
          expect(r.plan.items[0].after.json).toEqual({
            ...old,
            summary: { value: value + 1, sibling: unknown },
          });
          expect(r.identity.totalFinalBytes).toBe(
            Buffer.byteLength(canonicalJson(r.plan.items[0].after.json)),
          );
        },
      ),
      { seed: 20261004, numRuns: 300 },
    );
  });
  it("treats special JSON property names as own data rather than prototypes", () => {
    const after = applyDetailPaths({ summary: { value: 1 } }, [
      {
        path: ["summary", "__proto__"],
        beforeExists: false,
        before: null,
        after: { untouched: true },
      },
    ]);
    expect(Object.hasOwn(after.summary as object, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).untouched).toBeUndefined();
    expect(() =>
      applyDetailPaths({ summary: {} }, [
        {
          path: ["summary", "constructor", "prototype", "value"],
          beforeExists: false,
          before: null,
          after: 1,
        },
      ]),
    ).toThrow("parent");
  });
  it.each([
    "oldDocument",
    "patch",
    "digest",
    "finalDocument",
    "identity",
    "count",
    "target",
    "unowned",
  ])("rejects pinned %s drift", (drift) => {
    const r = fixture({ summary: { value: 1 }, unknown: { retained: true } }, [
      { path: ["summary", "value"], before: 1, after: 2 },
    ]);
    let paths = owned;
    switch (drift) {
      case "oldDocument":
        r.derivations[0].oldDocument.unknown = null;
        break;
      case "patch":
        r.derivations[0].patches[0].after = 3;
        break;
      case "digest":
        r.derivations[0].beforePgSHA256 = sha256("changed");
        break;
      case "finalDocument":
        r.plan.items[0].after.json = { summary: { value: 2 } };
        break;
      case "identity":
        r.identity.totalOldBytes++;
        break;
      case "count":
        r.derivations.push(r.derivations[0]);
        break;
      case "target":
        r.derivations[0].addressKey = "wrong";
        break;
      case "unowned":
        paths = [];
        break;
    }
    expect(() => assertMaterializedDetails(r.plan, r.derivations, paths, r.identity)).toThrow();
  });
  it("rejects malformed loaded derivations and missing server digests", () => {
    const r = fixture({ summary: { value: 1 } }, [
      { path: ["summary", "value"], before: 1, after: 2 },
    ]);
    r.derivations[0].oldDocument.value = Number.NaN;
    expect(() => assertMaterializedDetails(r.plan, r.derivations, owned, r.identity)).toThrow();
    expect(() =>
      materializeDetailStage(
        packStage([
          {
            table: "block_details",
            operation: "update",
            key: { address_key: "fixture" },
            before: {},
            after: {},
            detailPatches: [{ path: ["summary", "value"], before: 1, after: 2 }],
          },
        ]),
        new Map([["fixture", { summary: { value: 1 } }]]),
        new Map(),
      ),
    ).toThrow("digest");
  });
});
