import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { checkNeonPilotBudget, RUN_WINDOW_HOURS } from "../../scripts/lib/sync/neon-usage";
import {
  neonEndpointIdFromHost,
  readServingHyperdriveId,
} from "../../scripts/lib/sync/serving-config";

/**
 * Unsettled ("UNKNOWN as-of") Neon usage must count the endpoint that actually serves the site. The serving branch
 * is production-candidate-20261005 (br-rough-frost-b3e2ks1b) behind Hyperdrive origin ep-steep-water-b300tebo; the
 * previous check assumed the default `production` branch (ep-cool-glade-b3bjctpc) and omitted it.
 */

const COMMITTED_HYPERDRIVE_ID = "70f9a7f0a2f64851af0cccba58dcfb0c";
const SERVING_HOST = "ep-steep-water-b300tebo.c-4.ap-southeast-1.aws.neon.tech";
const now = Date.parse("2026-10-15T03:00:00Z");
const observedAt = "2026-10-15T02:55:00Z";

const benchmark = {
  endpointId: "ep-steep-moon-b35xjj4d",
  branchId: "br-wispy-boat-b34glczl",
  state: "idle",
  maxCU: 1,
  lastActiveAt: "2026-10-14T18:17:58Z",
  suspendedAt: "2026-10-14T18:23:00Z",
};
const serving = {
  endpointId: "ep-steep-water-b300tebo",
  branchId: "br-rough-frost-b3e2ks1b",
  state: "active",
  maxCU: 1,
  lastActiveAt: "2026-10-15T02:54:00Z",
  suspendedAt: null,
};
const defaultProduction = {
  endpointId: "ep-cool-glade-b3bjctpc",
  branchId: "br-broad-credit-b3bz9b61",
  state: "idle",
  maxCU: 2,
  lastActiveAt: "2026-10-08T00:03:08Z",
  suspendedAt: "2026-10-08T00:08:00Z",
};
const postgisSandbox = {
  endpointId: "ep-fixture-postgis-sandbox",
  branchId: "br-broad-cake-b3wl94ei",
  state: "idle",
  maxCU: 1,
  lastActiveAt: "2026-10-10T13:22:48Z",
  suspendedAt: "2026-10-10T13:28:00Z",
};

function unsettled(overrides: Record<string, unknown> = {}, endpoints: unknown[] = []) {
  return {
    projectId: "wispy-mouse-67963002",
    source: "neon-console",
    networkScope: "all-network-upper-bounds-public",
    periodStart: "2026-10-01T00:00:00Z",
    periodEnd: "2026-11-01T00:00:00Z",
    observedAt,
    settledThrough: null,
    usageAsOf: "UNKNOWN",
    networkTransferBytes: 1_048_962_365,
    transferResolutionBytes: 10_000_000,
    computeCUHours: 40,
    computeResolutionCUHours: 0.01,
    servingOrigin: {
      source: "cloudflare-hyperdrive",
      hyperdriveConfigId: COMMITTED_HYPERDRIVE_ID,
      host: SERVING_HOST,
      observedAt,
    },
    knownActivity: {
      observedAt,
      priorMeasuredReceivedBytes: 493_707_924,
      endpointInventory: "complete",
      endpoints: endpoints.length
        ? endpoints
        : [benchmark, serving, defaultProduction, postgisSandbox],
    },
    ...overrides,
  };
}

describe("serving endpoint in unsettled usage", () => {
  it("resolves the serving endpoint from the Hyperdrive bound in wrangler.jsonc and reserves its run window", () => {
    expect(readServingHyperdriveId()).toBe(COMMITTED_HYPERDRIVE_ID);
    const result = checkNeonPilotBudget(unsettled(), now);
    expect(result.servingEndpointId).toBe("ep-steep-water-b300tebo");
    expect(result.servingRunWindowComputeReserve).toBeCloseTo(serving.maxCU * RUN_WINDOW_HOURS);
    expect(result.totalComputeUpperAfterPilot).toBeCloseTo(
      40 + 0.01 + 10 + serving.maxCU * RUN_WINDOW_HOURS + RUN_WINDOW_HOURS,
    );
  });

  it("regression: refuses the old inventory that listed only the benchmark and the default production branch", () => {
    expect(() => checkNeonPilotBudget(unsettled({}, [benchmark, defaultProduction]), now)).toThrow(
      "omits the serving endpoint",
    );
  });

  it("refuses unsettled usage without the serving origin", () => {
    expect(() => checkNeonPilotBudget(unsettled({ servingOrigin: undefined }), now)).toThrow(
      "requires the serving Hyperdrive origin",
    );
  });

  it("refuses an origin from a Hyperdrive other than the one wrangler.jsonc binds", () => {
    const origin = { ...unsettled().servingOrigin, hyperdriveConfigId: "f".repeat(32) };
    expect(() => checkNeonPilotBudget(unsettled({ servingOrigin: origin }), now)).toThrow(
      "not the Hyperdrive configuration bound in wrangler.jsonc",
    );
    // The committed binding is read at check time, not compiled in.
    expect(() =>
      checkNeonPilotBudget(unsettled(), now, { servingHyperdriveId: () => "e".repeat(32) }),
    ).toThrow("not the Hyperdrive configuration bound in wrangler.jsonc");
  });

  it("refuses to refresh when the serving origin is the refresh write target", () => {
    const origin = {
      ...unsettled().servingOrigin,
      host: "ep-steep-moon-b35xjj4d.c-4.ap-southeast-1.aws.neon.tech",
    };
    expect(() => checkNeonPilotBudget(unsettled({ servingOrigin: origin }), now)).toThrow(
      "serving Hyperdrive origin is the refresh write target",
    );
  });

  it("refuses an origin host it cannot map to one direct endpoint, and a stale origin reading", () => {
    for (const host of [
      "ep-steep-water-b300tebo-pooler.c-4.ap-southeast-1.aws.neon.tech",
      "ep-steep-water-b300tebo.c-2.us-east-1.aws.neon.tech",
      "db.example.com",
    ])
      expect(() =>
        checkNeonPilotBudget(
          unsettled({ servingOrigin: { ...unsettled().servingOrigin, host } }),
          now,
        ),
      ).toThrow("not a direct Neon endpoint host");
    const stale = { ...unsettled().servingOrigin, observedAt: "2026-10-15T02:00:00Z" };
    expect(() => checkNeonPilotBudget(unsettled({ servingOrigin: stale }), now)).toThrow(
      "observation is stale",
    );
  });

  it("refuses an inventory not attested complete, duplicates, or the serving endpoint on the benchmark branch", () => {
    const partial = unsettled();
    (partial.knownActivity as Record<string, unknown>).endpointInventory = "partial";
    expect(() => checkNeonPilotBudget(partial, now)).toThrow();
    expect(() =>
      checkNeonPilotBudget(unsettled({}, [benchmark, serving, serving, defaultProduction]), now),
    ).toThrow("Duplicate endpoint");
    expect(() =>
      checkNeonPilotBudget(
        unsettled({}, [benchmark, { ...serving, branchId: "br-wispy-boat-b34glczl" }]),
        now,
      ),
    ).toThrow("must not be on the isolated benchmark branch");
  });

  it("refuses an unrelated endpoint that is still active: its consumption has no bound", () => {
    const activeSandbox = { ...postgisSandbox, state: "active", suspendedAt: null };
    expect(() =>
      checkNeonPilotBudget(
        unsettled({}, [benchmark, serving, defaultProduction, activeSandbox]),
        now,
      ),
    ).toThrow("Unbounded activity: endpoint ep-fixture-postgis-sandbox is active");
  });

  it("the serving reserve is counted: compute that fitted without it no longer fits", () => {
    // 89.3 + 0.01 + 10 + pilot window fits under 100 CU-hours; the serving window on top does not.
    expect(89.3 + 0.01 + 10 + RUN_WINDOW_HOURS).toBeLessThan(100);
    expect(() => checkNeonPilotBudget(unsettled({ computeCUHours: 89.3 }), now)).toThrow(
      "Insufficient measured Free headroom",
    );
  });

  it("leaves settled (REPORTED) receipts unchanged: provider totals already cover every endpoint", () => {
    const settled = {
      ...unsettled({ servingOrigin: undefined, knownActivity: undefined }),
      usageAsOf: "REPORTED",
      networkScope: "public-only",
      settledThrough: "2026-10-15T02:30:00Z",
    };
    expect(checkNeonPilotBudget(settled, now)).toMatchObject({
      servingEndpointId: null,
      servingRunWindowComputeReserve: 0,
    });
  });
});

describe("serving configuration", () => {
  it("maps only direct endpoint hosts in the refresh region", () => {
    expect(neonEndpointIdFromHost(SERVING_HOST)).toBe("ep-steep-water-b300tebo");
    expect(() =>
      neonEndpointIdFromHost("ep-steep-water-b300tebo-pooler.c-4.ap-southeast-1.aws.neon.tech"),
    ).toThrow();
  });

  it("requires exactly one HDB_PUBLIC_NEON binding with a real id", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "wrangler-"));
    const write = (body: string) => {
      const file = path.join(dir, `${Math.random()}.jsonc`);
      writeFileSync(file, body);
      return file;
    };
    expect(
      readServingHyperdriveId(
        write(
          `{\n  // comment\n  "hyperdrive": [{ "binding": "HDB_PUBLIC_NEON", "id": "${COMMITTED_HYPERDRIVE_ID}", },],\n}`,
        ),
      ),
    ).toBe(COMMITTED_HYPERDRIVE_ID);
    expect(() => readServingHyperdriveId(write(`{ "hyperdrive": [] }`))).toThrow("exactly one");
    expect(() =>
      readServingHyperdriveId(
        write(`{ "hyperdrive": [{ "binding": "HDB_PUBLIC_NEON", "id": "${"0".repeat(32)}" }] }`),
      ),
    ).toThrow("exactly one");
  });
});
