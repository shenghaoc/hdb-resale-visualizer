import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { NEON_REFRESH_BRANCH } from "../../scripts/lib/sync/neon";
import { resetUpstreamThrottleForTests } from "../../scripts/lib/sync/rate-limits";
import { runSyncNeon } from "../../scripts/sync-neon";
import {
  FakeClock,
  MRT_UPSTREAM,
  MUTATING_SQL,
  PROPERTY_UPSTREAM,
  addressKeys,
  createRefreshDatabase,
  manifestState,
  pgliteSession,
  refreshDependencies,
  resaleRows,
  seedBaseline,
  settledReceipt,
  tableCounts,
  type SqlEvent,
} from "../helpers/neonRefreshHarness";

/**
 * The resale rows are rejected when normalization drops any of them. The datasets that give those rows their context
 * (property, MRT, schools, supermarkets, hawker centres, parks) must fail closed the same way: a source that changed
 * shape has to stop the run, not publish empty or thinner facts over good ones.
 */
type Sources = Omit<Parameters<typeof refreshDependencies>[0], "client" | "clock" | "rows">;

const directories: string[] = [];

// Each test builds and runs a full refresh against an in-memory PGlite database (about 2.5 to 4 s on CI), so the 5 s
// default leaves no margin. A test that times out keeps running in the background and can reach the next test's fakes.
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  vi.stubEnv("ONEMAP_REQUEST_INTERVAL_MS", "1");
  // The run prints its receipt and the normalizers warn about skipped rows; neither matters here.
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  resetUpstreamThrottleForTests();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

type Receipt = ReturnType<typeof settledReceipt>;

async function attempt(
  sources: Sources = {},
  mode: "--plan" | "--apply" = "--apply",
  duringCapture?: (clock: FakeClock, original: Receipt) => Receipt | undefined,
) {
  const db = await createRefreshDatabase();
  const rows = resaleRows(20);
  await seedBaseline(db, addressKeys(rows));
  const clock = new FakeClock();
  const directory = mkdtempSync(path.join(tmpdir(), "neon-context-"));
  directories.push(directory);
  const usage = path.join(directory, "usage.json");
  const report = path.join(directory, "report.json");
  const original = settledReceipt(clock);
  writeFileSync(usage, JSON.stringify(original));
  const events: SqlEvent[] = [];
  const harness = refreshDependencies({
    client: pgliteSession(db, clock, events),
    clock,
    rows,
    ...sources,
  });
  const createClient = vi.fn(harness.deps.createClient!);
  const fetchCsvRows = harness.deps.fetchCsvRows!;
  let replacement: Receipt | undefined;
  let capturing = true;
  harness.deps.fetchCsvRows = async (...args) => {
    const rows = await fetchCsvRows(...args);
    if (capturing && duringCapture) {
      capturing = false;
      replacement = duringCapture(clock, original);
      if (replacement) writeFileSync(usage, JSON.stringify(replacement));
    }
    return rows;
  };
  vi.stubGlobal("fetch", harness.fetch);
  const before = { counts: await tableCounts(db), manifest: await manifestState(db) };
  let error: unknown;
  try {
    await runSyncNeon(
      [
        mode,
        "--reconcile-manual",
        "--branch",
        NEON_REFRESH_BRANCH,
        "--usage-before",
        usage,
        "--report",
        report,
      ],
      { ...harness.deps, createClient },
    );
  } catch (caught) {
    error = caught;
  }
  const untouched = async () => {
    expect(events.filter((event) => MUTATING_SQL.test(event.sql))).toEqual([]);
    expect(await tableCounts(db)).toEqual(before.counts);
    expect(await manifestState(db)).toEqual(before.manifest);
  };
  const receipt = () =>
    JSON.parse(readFileSync(report, "utf8")) as {
      unresolved: Record<string, number>;
      usageReceiptAtStart: Receipt;
      usageReceiptBeforeConnect: Receipt;
    };
  return { error, events, createClient, untouched, receipt, original, replacement };
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

const point = (name: string) => ({
  type: "Feature" as const,
  geometry: { type: "Point" as const, coordinates: [103.85, 1.3] },
  properties: { NAME: name },
});
const polygon = (name: string) => ({
  type: "Feature" as const,
  geometry: { type: "Polygon" as const, coordinates: [[[103.85, 1.3]]] },
  properties: { NAME: name },
});
const collection = (...features: unknown[]) => ({ type: "FeatureCollection", features });
const school = {
  school_name: "FIXTURE PRIMARY",
  postal_code: "460101",
  mainlevel_code: "PRIMARY",
  latitude: "1.33",
  longitude: "103.94",
};
const supermarket = { licensee_name: "FIXTURE MART", postal_code: "460101" };

describe("property dataset", () => {
  it("rejects a dataset whose rows no longer parse, before any database work", async () => {
    const reshaped = PROPERTY_UPSTREAM.map(({ blk_no, ...rest }) => ({
      block_number: blk_no,
      ...rest,
    }));
    const result = await attempt({ propertyRows: reshaped });
    expect(message(result.error)).toBe("Partial or invalid property source rejected");
    expect(result.createClient).not.toHaveBeenCalled();
    expect(result.events).toEqual([]);
  });

  it("rejects a dataset in which one row is unusable", async () => {
    const result = await attempt({ propertyRows: [...PROPERTY_UPSTREAM, { blk_no: "999" }] });
    expect(message(result.error)).toBe("Partial or invalid property source rejected");
    expect(result.createClient).not.toHaveBeenCalled();
  });

  it("rejects an empty dataset", async () => {
    const result = await attempt({ propertyRows: [] });
    expect(message(result.error)).toBe("Partial or invalid property source rejected");
    expect(result.createClient).not.toHaveBeenCalled();
  });
});

describe("MRT dataset", () => {
  it("rejects a dataset whose features no longer parse, before any database work", async () => {
    const reshaped = {
      ...MRT_UPSTREAM,
      features: MRT_UPSTREAM.features.map(
        ({ properties: { STATION_NA, ...rest }, ...feature }) => ({
          ...feature,
          properties: { STATION_NAME: STATION_NA, ...rest },
        }),
      ),
    };
    const result = await attempt({ mrtGeoJson: reshaped });
    expect(message(result.error)).toBe("Partial or invalid MRT source rejected");
    expect(result.createClient).not.toHaveBeenCalled();
    expect(result.events).toEqual([]);
  });

  it("rejects a dataset in which one feature is unusable", async () => {
    const result = await attempt({
      mrtGeoJson: {
        ...MRT_UPSTREAM,
        features: [
          ...MRT_UPSTREAM.features,
          { ...polygon("EXTRA"), properties: { STATION_NA: "X" } },
        ],
      },
    });
    expect(message(result.error)).toBe("Partial or invalid MRT source rejected");
    expect(result.createClient).not.toHaveBeenCalled();
  });

  it("rejects an empty dataset", async () => {
    const result = await attempt({ mrtGeoJson: collection() });
    expect(message(result.error)).toBe("Partial or invalid MRT source rejected");
    expect(result.createClient).not.toHaveBeenCalled();
  });
});

describe("amenity datasets", () => {
  const cases: [string, Sources, string][] = [
    [
      "schools whose name column is gone",
      { schoolRows: [{ name: "FIXTURE PRIMARY", mainlevel_code: "PRIMARY" }] },
      "schools: 1",
    ],
    [
      "a school row beside good ones",
      { schoolRows: [school, { mainlevel_code: "PRIMARY" }] },
      "schools: 1",
    ],
    [
      "supermarkets whose licensee column is gone",
      { supermarketRows: [{ licensee: "FIXTURE MART", postal_code: "460101" }] },
      "supermarkets: 1",
    ],
    [
      "a hawker feature that is not a point",
      { hawkerGeoJson: collection(point("A"), polygon("B")) },
      "hawkers: 1",
    ],
    [
      "park features that are not points",
      { parksGeoJson: collection(polygon("A"), polygon("B")) },
      "parks: 2",
    ],
  ];

  it.each(cases)("rejects %s and writes nothing", async (_title, sources, named) => {
    const result = await attempt(sources);
    expect(message(result.error)).toBe(`Partial or invalid amenity source rejected (${named})`);
    await result.untouched();
  });

  it("names every source that has unusable rows", async () => {
    const result = await attempt({
      schoolRows: [{ mainlevel_code: "PRIMARY" }, { mainlevel_code: "PRIMARY" }],
      parksGeoJson: collection(point("A"), polygon("B")),
    });
    expect(message(result.error)).toBe(
      "Partial or invalid amenity source rejected (schools: 2, parks: 1)",
    );
    await result.untouched();
  });

  it("still publishes rows that only lack coordinates, and counts them as unresolved", async () => {
    // Valid rows without a cached or source coordinate stay unresolved (no OneMap token here), as before.
    const result = await attempt(
      {
        schoolRows: [{ ...school, latitude: "", longitude: "" }],
        supermarketRows: [supermarket, { ...supermarket, licensee_name: "FIXTURE MART 2" }],
        hawkerGeoJson: collection(point("A")),
        parksGeoJson: collection(point("B")),
      },
      "--plan",
    );
    expect(result.error).toBeUndefined();
    expect(result.receipt().unresolved.amenitiesWithoutCoordinates).toBe(3);
  });
});

describe("usage receipt after source capture", () => {
  it("accepts a fresh replacement after the original expires and reports both receipts", async () => {
    const result = await attempt({}, "--plan", (clock, original) => {
      clock.advance(21 * 60 * 1000);
      return {
        ...settledReceipt(clock),
        networkTransferBytes: original.networkTransferBytes + 1,
        computeCUHours: original.computeCUHours + 1,
      };
    });
    expect(result.error).toBeUndefined();
    expect(result.receipt().usageReceiptAtStart).toEqual(result.original);
    expect(result.receipt().usageReceiptBeforeConnect).toEqual(result.replacement);
    await result.untouched();
  });

  it("rejects an unchanged receipt past 20 minutes before opening a database connection", async () => {
    const result = await attempt({}, "--plan", (clock) => {
      clock.advance(21 * 60 * 1000);
      return undefined;
    });
    expect(message(result.error)).toBe(
      "Neon baseline usage is stale, unsettled or outside the allowance period",
    );
    expect(result.createClient).not.toHaveBeenCalled();
  });

  it.each(["networkTransferBytes", "computeCUHours"] as const)(
    "rejects a fresh replacement with lower %s before opening a database connection",
    async (meter) => {
      const result = await attempt({}, "--plan", (clock, original) => {
        clock.advance(60 * 1000);
        return { ...settledReceipt(clock), [meter]: original[meter] - 1 };
      });
      expect(message(result.error)).toBe("Neon replacement usage receipt lowers a provider meter");
      expect(result.createClient).not.toHaveBeenCalled();
    },
  );
});
