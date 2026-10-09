import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { canonicalJson } from "../../scripts/lib/sync/neon";
import { mapBlockRow, BLOCK_COLUMNS } from "../../scripts/lib/sync/store";
import {
  compileNativeArtifactStage,
  preserveDetailOccurrenceIds,
  type NativeArtifactSnapshot,
} from "../../scripts/neon-benchmark/stage-artifacts";
import { applyDetailPaths, type StageItem } from "../../scripts/neon-benchmark/staged-plan";
import type { GeneratedArtifacts } from "../../scripts/lib/pipeline";
import type { BlockSummary, AddressDetail, Manifest } from "../../shared/data-types";

const timestamp = "2026-10-04T00:00:00.000Z";
function fixture(): Parameters<typeof compileNativeArtifactStage>[0] {
  const block = (
    JSON.parse(
      readFileSync("tests/fixtures/public-data/block-summaries.json", "utf8"),
    ) as BlockSummary[]
  )[0];
  const detail = JSON.parse(
    readFileSync(`tests/fixtures/public-data/details/${block.addressKey}.json`, "utf8"),
  ) as AddressDetail;
  const artifacts: GeneratedArtifacts = {
    manifest: JSON.parse(
      readFileSync("tests/fixtures/public-data/manifest.json", "utf8"),
    ) as Manifest,
    blockSummaries: [block],
    blocksByTown: {},
    details: { [block.addressKey]: detail },
    townFlatTypeTrend: [],
  };
  const values = mapBlockRow(block);
  const row = JSON.parse(
    canonicalJson(
      Object.fromEntries(
        BLOCK_COLUMNS.map((c, i) => [
          c,
          c.endsWith("_json") && typeof values[i] === "string"
            ? JSON.parse(values[i] as string)
            : values[i],
        ]),
      ),
    ),
  );
  const previous: NativeArtifactSnapshot = {
    blocks: [],
    block_details: [],
    comparisons: [],
    town_flat_type_trends: [],
    mrt_geojson: [],
    geocode_cache: [],
    walking_time_cache: [],
  };
  previous.blocks = [row];
  previous.block_details = [
    JSON.parse(canonicalJson({ address_key: block.addressKey, json: detail })),
  ];
  const geojson = { type: "FeatureCollection", features: [] };
  previous.mrt_geojson = [
    { kind: "exits", json: geojson, updated_at: "2026-08-29T00:00:00.000Z" },
    { kind: "stations", json: geojson, updated_at: "2026-08-29T00:00:00.000Z" },
  ];
  return {
    previous,
    artifacts,
    transactionInserts: [],
    exitsGeoJson: geojson,
    stationsGeoJson: geojson,
    stagedCaches: { geocode_cache: [], walking_time_cache: [] },
    updatedAtUTC: timestamp,
    detailOwnedPaths: [
      ["summary", "medianPrice"],
      ["summary", "coordinates", "lat"],
      ["monthlyTrend"],
      ["recentTransactions"],
    ],
  };
}
describe("native artifact adapter — offline fixture only", () => {
  it("initializes new detail occurrence IDs and rejects disappearing generated keys", () => {
    const input = fixture(),
      key = input.artifacts.blockSummaries[0].addressKey;
    input.previous.block_details = [];
    const plan = compileNativeArtifactStage(input);
    const inserted = plan.items.find((r) => r.table === "block_details")!;
    const json = inserted.after.json as Record<string, unknown>;
    expect(
      (json.recentTransactions as { id: string }[]).every((r) =>
        /^source:[a-f0-9]{64}:\d+$/.test(r.id),
      ),
    ).toBe(true);
    const disappeared = fixture();
    delete disappeared.artifacts.details[key];
    expect(() => compileNativeArtifactStage(disappeared)).toThrow("would lose entities");
  });
  it("retains duplicate occurrence presentation IDs and deterministically identifies only new occurrences", () => {
    const fact = {
      month: "2026-09",
      flatType: "4 ROOM",
      storeyRange: "01 TO 03",
      floorAreaSqm: 92,
      leaseCommenceDate: 2019,
      resalePrice: 625000,
      flatModel: "MODEL A",
    };
    const before = {
      recentTransactions: [
        { ...fact, id: "original-1" },
        { ...fact, id: "original-2" },
      ],
    };
    const next = {
      recentTransactions: [
        { ...fact, id: "builder-1" },
        { ...fact, id: "builder-2" },
        { ...fact, id: "builder-3" },
      ],
    };
    const result = preserveDetailOccurrenceIds(before, next);
    const rows = result.recentTransactions as { id: string }[];
    expect(rows.slice(0, 2).map((r) => r.id)).toEqual(["original-1", "original-2"]);
    expect(rows[2].id).toMatch(/^source:[a-f0-9]{64}:2$/);
    expect(preserveDetailOccurrenceIds(before, next)).toEqual(result);
    expect(next.recentTransactions[0].id).toBe("builder-1");
  });
  it("preserves comparison timestamps when evidence is unchanged", () => {
    const input = fixture();
    const comparison = JSON.parse(
      readFileSync(
        "tests/fixtures/public-data/comparisons/ang-mo-kio-104a-ang-mo-kio-st-11.json",
        "utf8",
      ),
    ) as NonNullable<GeneratedArtifacts["comparisons"]>[string];
    input.previous.comparisons = [
      { address_key: comparison.addressKey, json: JSON.parse(canonicalJson(comparison)) },
    ];
    input.artifacts.comparisons = {
      [comparison.addressKey]: { ...comparison, generatedAt: "new" },
    };
    expect(compileNativeArtifactStage(input).groups.comparisons.update).toBe(0);
  });
  it("skips unchanged artifacts, timestamps and JSONB-equivalent object order", () => {
    const input = fixture();
    expect(compileNativeArtifactStage(input).rows).toBe(0);
    input.previous.blocks[0] = Object.fromEntries(
      Object.entries(input.previous.blocks[0]).reverse(),
    );
    expect(compileNativeArtifactStage(input).rows).toBe(0);
  });
  it("patches native block columns and owned nested detail leaves without losing future siblings", () => {
    const input = fixture(),
      key = input.artifacts.blockSummaries[0].addressKey;
    input.artifacts.blockSummaries[0].medianPrice += 1000;
    input.artifacts.details[key].summary.medianPrice += 1000;
    input.artifacts.details[key].summary.coordinates.lat += 0.001;
    const old = input.previous.block_details[0].json as Record<string, unknown>;
    (old.summary as Record<string, unknown>).futureSummary = { preserve: true };
    old.futureRoot = true;
    const plan = compileNativeArtifactStage(input);
    expect(plan.groups.blocks.update).toBe(1);
    expect(plan.groups.block_details.update).toBe(1);
    const block = plan.items.find((r) => r.table === "blocks")!;
    expect(block.after).toEqual({ median_price: input.artifacts.blockSummaries[0].medianPrice });
    const staged = plan.items.find((r) => r.table === "block_details")!;
    const patched = applyDetailPaths(old, staged.detailPatches!);
    expect(patched.futureRoot).toBe(true);
    expect((patched.summary as Record<string, unknown>).futureSummary).toEqual({ preserve: true });
  });
  it("rejects unowned changes and permits explicitly owned null-to-object initialization", () => {
    const input = fixture(),
      key = input.artifacts.blockSummaries[0].addressKey;
    input.artifacts.details[key].summary.medianPrice += 1000;
    input.detailOwnedPaths = [];
    expect(() => compileNativeArtifactStage(input)).toThrow("unowned");
    input.detailOwnedPaths = [
      ["summary", "medianPrice"],
      ["summary", "coordinates", "lat"],
      ["summary", "coordinates", "lng"],
      ["summary", "coordinates"],
    ];
    const old = input.previous.block_details[0].json as Record<string, unknown>;
    (old.summary as Record<string, unknown>).coordinates = null;
    const plan = compileNativeArtifactStage(input);
    const patches = plan.items.find((r) => r.table === "block_details")!.detailPatches!;
    expect(patches.find((p) => p.path.join(".") === "summary.coordinates")?.before).toBeNull();
    expect(applyDetailPaths(old, patches).summary).toEqual(input.artifacts.details[key].summary);
  });
  it("does not silently delete an owned dictionary leaf", () => {
    const input = fixture(),
      key = input.artifacts.blockSummaries[0].addressKey;
    const old = input.previous.block_details[0].json as Record<string, unknown>;
    (old.summary as Record<string, unknown>).ownedFuture = 1;
    input.detailOwnedPaths.push(["summary", "ownedFuture"]);
    expect(Object.hasOwn(input.artifacts.details[key].summary, "ownedFuture")).toBe(false);
    expect(() => compileNativeArtifactStage(input)).toThrow("removal");
  });
  it("stages caches and MRT only when logical values change", () => {
    const input = fixture();
    input.previous.geocode_cache = [
      {
        cache_key: "a",
        lat: 1.3,
        lng: 103.8,
        postal_code: null,
        display_name: null,
        search_value: "A",
        updated_at: "2026-08-29T00:00:00.000Z",
      },
    ];
    input.stagedCaches.geocode_cache = [
      { ...input.previous.geocode_cache[0], updated_at: timestamp },
    ];
    expect(compileNativeArtifactStage(input).rows).toBe(0);
    input.stagedCaches.geocode_cache[0].lat = 1.31;
    const plan = compileNativeArtifactStage(input);
    expect(plan.groups.geocode_cache.update).toBe(1);
    expect(plan.items[0].after).toEqual({ lat: 1.31, updated_at: timestamp });
  });
  it("preserves duplicate-looking transaction facts as distinct integer insert identities", () => {
    const input = fixture();
    const fact = {
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
    const plan = compileNativeArtifactStage({
      ...input,
      transactionInserts: [
        { id: 11, ...fact },
        { id: 12, ...fact },
      ],
    });
    expect(plan.groups.transactions.insert).toBe(2);
    expect(plan.items.map((r: StageItem) => r.key.id)).toEqual([11, 12]);
  });
  it("rejects duplicate baseline keys and duplicated planned cache targets", () => {
    const input = fixture();
    input.previous.blocks.push(input.previous.blocks[0]);
    expect(() => compileNativeArtifactStage(input)).toThrow("Duplicate retained");
    const clean = fixture();
    const row = {
      cache_key: "a",
      lat: 1.3,
      lng: 103.8,
      postal_code: null,
      display_name: null,
      search_value: "A",
      updated_at: timestamp,
    };
    clean.stagedCaches.geocode_cache = [row, row];
    expect(() => compileNativeArtifactStage(clean)).toThrow("Duplicate staging");
  });
});
