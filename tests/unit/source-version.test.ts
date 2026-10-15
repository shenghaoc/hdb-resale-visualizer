import { describe, expect, it } from "vite-plus/test";
import { sourceVersionHintsChanged } from "../../scripts/lib/sync/source-version";
import { datasetMetadataSchema, syncBuildStateSchema } from "../../scripts/lib/schemas";

it("validates official metadata without assuming a particular undocumented code value", () => {
  expect(
    datasetMetadataSchema.parse({
      code: 200,
      data: { datasetId: "test", lastUpdatedAt: "2026-08-29T00:00:00Z" },
    }).data.datasetId,
  ).toBe("test");
  expect(() =>
    datasetMetadataSchema.parse({ code: 0, data: { datasetId: "test", lastUpdatedAt: "invalid" } }),
  ).toThrow();
  expect(() =>
    syncBuildStateSchema.parse({
      contextDigest: "bad",
      algorithmVersion: 1,
      recentThreshold: "2026-08",
    }),
  ).toThrow();
});

describe("source hint observability", () => {
  it("reports unchanged inventories independently of refresh intent", () => {
    expect(
      sourceVersionHintsChanged({ park: "p1", resale: "v1" }, { resale: "v1", park: "p1" }),
    ).toBe(false);
  });
  it("reports changed and incomplete inventories", () => {
    expect(
      sourceVersionHintsChanged({ resale: "v1", park: "p1" }, { resale: "v1", park: "p2" }),
    ).toBe(true);
    expect(sourceVersionHintsChanged(undefined, { resale: "v1" })).toBe(true);
    expect(sourceVersionHintsChanged({ resale: "v1", park: "p1" }, { resale: "v1" })).toBe(true);
  });
});
