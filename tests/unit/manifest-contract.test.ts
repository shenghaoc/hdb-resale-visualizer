// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";
import { onRequestGet } from "../../functions/api/manifest";
import type { Manifest } from "../../shared/data-types";
import { MANIFEST_CONTRACT, projectManifestContract } from "../../shared/manifest-contract";
import { PUBLICATION_MARKER_KEY, stampPublicationMarker } from "../../shared/publication-state";
import { manifestSchema } from "../../src/shared/lib/dataSchemas";

/** What D1 stores and serves today: only contract keys, in declaration order. */
const d1Manifest = {
  schemaVersion: "2.0.0",
  generatedAt: "2026-08-29T01:37:16.797Z",
  dataWindow: { minMonth: "1990-01", maxMonth: "2026-08" },
  sources: {
    resaleCollectionId: "189",
    resaleDatasetIds: ["d_a", "d_b"],
    propertyDatasetId: "d_p",
    mrtDatasetId: "d_m",
    moeSchoolDatasetId: "d_s",
    neaHawkerDatasetId: "d_h",
    sfaSupermarketDatasetId: "d_f",
    nparksParksDatasetId: "d_n",
    lastUpdatedAt: "2026-08-29T02:10:36+08:00",
  },
  filterOptions: { towns: ["BEDOK"], flatTypes: ["4 ROOM"], flatModels: ["Improved"] },
  counts: { blocks: 9730, transactions: 985533, towns: 27, mrtStations: 190, comparisons: 9730 },
};

/** PostgreSQL JSONB returns object keys shortest-first, then bytewise. */
function jsonbOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonbOrder);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
        .map((key) => [key, jsonbOrder((value as Record<string, unknown>)[key])]),
    );
  return value;
}

/** A Neon publication: newer values, JSONB key order, plus internal publisher bookkeeping. */
const neonStored = jsonbOrder({
  ...d1Manifest,
  generatedAt: "2026-10-04T15:30:00.000Z",
  counts: { ...d1Manifest.counts, transactions: 988128 },
  syncBuildState: {
    reconciledAt: "2026-10-04T15:30:00.000Z",
    contextDigest: "abc",
    algorithmVersion: 1,
  },
  neonPublication: { publicationId: "4794aa04f6c9" },
  neonReconciliation: {
    version: 1,
    entries: [
      { id: 550818, status: "unresolved-retained", fact: { town: "TOA PAYOH", block: "58" } },
    ],
  },
}) as Record<string, unknown>;

const INTERNAL_KEYS = [
  "syncBuildState",
  "neonPublication",
  "neonReconciliation",
  PUBLICATION_MARKER_KEY,
];

describe("public manifest contract", () => {
  it("does not change a manifest that already satisfies the contract (what D1 serves today)", () => {
    const projected = projectManifestContract(d1Manifest);
    expect(JSON.stringify(projected)).toBe(JSON.stringify(d1Manifest));
  });

  it("drops internal publication keys and restores the contract's key order from a Neon row", () => {
    expect(Object.keys(neonStored)).toContain("neonReconciliation");
    const projected = projectManifestContract(neonStored) as Record<string, unknown>;
    expect(Object.keys(projected)).toEqual([...MANIFEST_CONTRACT.top]);
    for (const key of INTERNAL_KEYS) expect(projected).not.toHaveProperty(key);
    expect(Object.keys(projected.counts as object)).toEqual([...MANIFEST_CONTRACT.counts]);
    expect(Object.keys(projected.dataWindow as object)).toEqual([...MANIFEST_CONTRACT.dataWindow]);
    expect(Object.keys(projected.sources as object)).toEqual([...MANIFEST_CONTRACT.sources]);
    // Values are preserved exactly; only keys and their order are constrained.
    expect(projected.generatedAt).toBe("2026-10-04T15:30:00.000Z");
    expect((projected.counts as { transactions: number }).transactions).toBe(988128);
  });

  it("never lets an unknown nested key through either", () => {
    const projected = projectManifestContract({
      ...d1Manifest,
      counts: { ...d1Manifest.counts, internalRowIds: [1, 2, 3] },
      sources: { ...d1Manifest.sources, publisherToken: "x" },
    }) as { counts: object; sources: object };
    expect(projected.counts).not.toHaveProperty("internalRowIds");
    expect(projected.sources).not.toHaveProperty("publisherToken");
  });

  it("omits optional contract keys that are absent instead of inventing them", () => {
    const { generatedAt: _generatedAt, ...withoutGeneratedAt } = d1Manifest;
    const projected = projectManifestContract(withoutGeneratedAt) as Record<string, unknown>;
    expect(projected).not.toHaveProperty("generatedAt");
    expect(Object.keys(projected)).toEqual(
      MANIFEST_CONTRACT.top.filter((key) => key !== "generatedAt"),
    );
  });

  it("passes non-object values through untouched", () => {
    expect(projectManifestContract(null)).toBeNull();
    expect(projectManifestContract([1])).toEqual([1]);
    expect(projectManifestContract("x")).toBe("x");
  });

  it("is what GET /api/manifest actually returns, whatever the backend stored", async () => {
    const respond = async (stored: unknown) => {
      const env = {
        DB: { prepare: () => ({ first: async () => ({ json: JSON.stringify(stored) }) }) },
      };
      const response = await onRequestGet({ env } as unknown as Parameters<typeof onRequestGet>[0]);
      return { response, text: await response.text() };
    };
    const neon = await respond(neonStored);
    expect(neon.response.status).toBe(200);
    expect(Object.keys(JSON.parse(neon.text))).toEqual([...MANIFEST_CONTRACT.top]);
    for (const key of INTERNAL_KEYS) expect(neon.text).not.toContain(key);
    expect(neon.text).not.toContain("unresolved-retained");
    const d1 = await respond(d1Manifest);
    expect(d1.text).toBe(JSON.stringify(d1Manifest));
  });

  it("never exposes the D1 publication marker the publisher stamps while a publication runs", async () => {
    const stamped = await stampPublicationMarker(
      JSON.stringify(d1Manifest),
      "2026-10-07T01:00:00.000Z",
      "owner-a",
    );
    expect(stamped).toContain(PUBLICATION_MARKER_KEY);
    const env = { DB: { prepare: () => ({ first: async () => ({ json: stamped }) }) } };
    const response = await onRequestGet({ env } as unknown as Parameters<typeof onRequestGet>[0]);
    // The response during a publication is exactly what clients get before and after it.
    expect(await response.text()).toBe(JSON.stringify(d1Manifest));
  });

  it("answers 404 while only the first publication's placeholder exists", async () => {
    const placeholder = await stampPublicationMarker(null, "2026-10-07T01:00:00.000Z", "owner-a");
    const env = { DB: { prepare: () => ({ first: async () => ({ json: placeholder }) }) } };
    const response = await onRequestGet({ env } as unknown as Parameters<typeof onRequestGet>[0]);
    // Same as before any manifest existed: the placeholder holds no contract field and is not a manifest.
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain(PUBLICATION_MARKER_KEY);
  });

  it("stays equal to the frontend schema and the shared Manifest type", () => {
    const shape = (schema: unknown): string[] => {
      const node = schema as {
        shape?: object;
        def?: { innerType?: { shape?: object } };
        unwrap?: () => { shape?: object };
      };
      return Object.keys(node.shape ?? node.def?.innerType?.shape ?? node.unwrap?.().shape ?? {});
    };
    const fields = manifestSchema.shape;
    expect(shape(manifestSchema).sort()).toEqual([...MANIFEST_CONTRACT.top].sort());
    expect(shape(fields.dataWindow).sort()).toEqual([...MANIFEST_CONTRACT.dataWindow].sort());
    expect(shape(fields.sources).sort()).toEqual([...MANIFEST_CONTRACT.sources].sort());
    expect(shape(fields.filterOptions).sort()).toEqual([...MANIFEST_CONTRACT.filterOptions].sort());
    expect(shape(fields.counts).sort()).toEqual([...MANIFEST_CONTRACT.counts].sort());
    // Compile-time guard: adding a key to Manifest fails type-checking here until the contract is updated.
    const everyKey: Required<Manifest> = {
      schemaVersion: "",
      generatedAt: "",
      dataWindow: { minMonth: "", maxMonth: "" },
      sources: {},
      filterOptions: { towns: [], flatTypes: [], flatModels: [] },
      counts: { blocks: 0, transactions: 0, towns: 0, mrtStations: 0 },
    };
    expect(Object.keys(everyKey).sort()).toEqual([...MANIFEST_CONTRACT.top].sort());
  });

  it("keeps a projected Neon manifest valid for the frontend", () => {
    expect(manifestSchema.safeParse(projectManifestContract(neonStored)).success).toBe(true);
  });
});
