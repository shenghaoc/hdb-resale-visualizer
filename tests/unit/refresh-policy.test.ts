import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  estimateMonthlyNeonTransfer,
  requiresSourceReconciliation,
  resolveReconciliationTrigger,
} from "../../scripts/lib/sync/refresh-policy";
import * as fetchers from "../../scripts/lib/sync/fetchers";
import * as sourceVersion from "../../scripts/lib/sync/source-version";
import { D1Client } from "../../scripts/lib/sync/d1";
import { runSyncData } from "../../scripts/sync-data";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("explicit monthly and manual reconciliation", () => {
  const now = Date.parse("2026-10-04T00:00:00Z");
  it("requires explicit intent and lets check-upstream remain observation only", () => {
    expect(resolveReconciliationTrigger([])).toBe("observe");
    expect(resolveReconciliationTrigger(["--plan"])).toBe("observe");
    expect(resolveReconciliationTrigger(["--reconcile-monthly"])).toBe("monthly");
    expect(resolveReconciliationTrigger(["--reconcile-manual"])).toBe("manual");
    expect(resolveReconciliationTrigger(["--force"])).toBe("manual");
    expect(resolveReconciliationTrigger(["--check-upstream", "--force"])).toBe("observe");
    expect(() => resolveReconciliationTrigger(["--reconcile-monthly", "--force"])).toThrow();
  });
  it("does not turn missing or old reconciliation state into an automatic trigger", () => {
    for (const previousReconciledAt of [undefined, "invalid", "2020-01-01", "2099-01-01"]) {
      expect(requiresSourceReconciliation({ trigger: "observe", previousReconciledAt, now })).toBe(
        false,
      );
    }
  });
  it("skips another monthly run after a published reconciliation in the same UTC month", () => {
    expect(
      requiresSourceReconciliation({
        trigger: "monthly",
        previousReconciledAt: "2026-10-01T00:00:00Z",
        now,
      }),
    ).toBe(false);
    expect(
      requiresSourceReconciliation({
        trigger: "monthly",
        previousReconciledAt: "2026-10-01T08:00:00+08:00",
        now,
      }),
    ).toBe(false);
    // More than seven days old still does not trigger again within that month.
    expect(
      requiresSourceReconciliation({
        trigger: "monthly",
        previousReconciledAt: "2026-10-01T00:00:00Z",
        now: Date.parse("2026-10-31T23:59:59Z"),
      }),
    ).toBe(false);
  });
  it("uses UTC month/year boundaries rather than a rolling interval", () => {
    expect(
      requiresSourceReconciliation({
        trigger: "monthly",
        previousReconciledAt: "2026-09-30T23:59:59Z",
        now,
      }),
    ).toBe(true);
    expect(
      requiresSourceReconciliation({
        trigger: "monthly",
        previousReconciledAt: "2025-10-04T00:00:00Z",
        now,
      }),
    ).toBe(true);
    expect(
      requiresSourceReconciliation({
        trigger: "monthly",
        previousReconciledAt: "2026-12-31T23:59:59Z",
        now: Date.parse("2027-01-01T00:00:00Z"),
      }),
    ).toBe(true);
  });
  it("does not trust missing, malformed or future state as a completed monthly run", () => {
    for (const previousReconciledAt of [undefined, "invalid", "2026-10-05T00:00:00Z"]) {
      expect(requiresSourceReconciliation({ trigger: "monthly", previousReconciledAt, now })).toBe(
        true,
      );
    }
    expect(() => requiresSourceReconciliation({ trigger: "monthly", now: NaN })).toThrow();
  });
  it("allows an explicit manual run even after this month's reconciliation", () => {
    expect(
      requiresSourceReconciliation({
        trigger: "manual",
        previousReconciledAt: new Date(now).toISOString(),
        now,
      }),
    ).toBe(true);
  });
});

describe("coordinator policy boundary", () => {
  it.each([
    { flags: [], reconciledAt: "2020-01-01", trigger: "observe" },
    { flags: ["--check-upstream", "--force"], reconciledAt: "2020-01-01", trigger: "observe" },
    { flags: ["--reconcile-monthly"], reconciledAt: "2026-10-01", trigger: "monthly" },
  ])(
    "reports changed hints without scanning the corpus: $trigger $flags",
    async ({ flags, reconciledAt, trigger }) => {
      vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-04T00:00:00Z"));
      vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account");
      vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "test-db");
      vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-token");
      vi.stubEnv("CLOUDFLARE_D1_ENDPOINT", "");
      const query = vi.spyOn(D1Client.prototype, "query").mockResolvedValue([
        {
          json: JSON.stringify({
            sources: { lastUpdatedAt: "2020-01-01" },
            syncBuildState: { sourceVersionHints: { resale: "old" }, reconciledAt },
          }),
        },
      ]);
      vi.spyOn(fetchers, "fetchJson").mockResolvedValue({
        code: 0,
        data: {
          collectionMetadata: {
            collectionId: "test",
            childDatasets: ["resale"],
            lastUpdatedAt: "2026-10-04T00:00:00Z",
          },
        },
      });
      vi.spyOn(sourceVersion, "fetchSourceVersionHints").mockResolvedValue({
        resale: "new",
        park: "new",
      });
      const download = vi
        .spyOn(fetchers, "fetchCsvRows")
        .mockRejectedValue(new Error("Unexpected corpus download"));
      const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
      await runSyncData(["--plan", ...flags]);
      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith({ sql: "SELECT json FROM manifest WHERE id = 1" });
      expect(download).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({
        reconciliationTrigger: trigger,
        reconciliationRequired: false,
        collectionHintChanged: true,
        sourceHintsChanged: true,
      });
    },
  );
  it("retains the remote production apply freeze for explicit manual intent", async () => {
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account");
    vi.stubEnv("CLOUDFLARE_D1_DATABASE_ID", "test-db");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "test-token");
    vi.stubEnv("CLOUDFLARE_D1_ENDPOINT", "");
    const query = vi.spyOn(D1Client.prototype, "query");
    await expect(runSyncData(["--reconcile-manual"])).rejects.toThrow(
      "Production sync remains frozen",
    );
    expect(query).not.toHaveBeenCalled();
  });
  it("keeps the monthly/manual workflow outside the active workflow directory", () => {
    const name = "refresh-data-monthly.yml";
    expect(existsSync(resolve(".github/workflows", name))).toBe(false);
    expect(existsSync(resolve(".github/workflows/refresh-data.yml"))).toBe(false);
    const candidate = readFileSync(resolve("docs/proposals", name), "utf8");
    expect(candidate).toContain('cron: "0 2 1 * *"');
    expect(candidate).toContain("workflow_dispatch:");
    expect(candidate).toContain("vp run sync-data --plan --reconcile-manual");
    expect(candidate).toContain("vp run sync-data --plan --reconcile-monthly");
  });
});

describe("monthly Neon transfer planning", () => {
  it("reserves one monthly reconciliation and 1 GB before allocating runtime headroom", () => {
    expect(estimateMonthlyNeonTransfer()).toMatchObject({
      reconciliationBytes: 493_707_924,
      runtimeHeadroomBytes: 3_506_292_076,
      remainingAfterReserveBytes: 3_506_292_076,
      fitsProposedReserve: true,
    });
    expect(estimateMonthlyNeonTransfer({ coldBootstrapEquivalents: 100 }).totalEstimatedBytes).toBe(
      1_793_438_024,
    );
    expect(estimateMonthlyNeonTransfer({ coldBootstrapEquivalents: 200 }).totalEstimatedBytes).toBe(
      3_093_168_124,
    );
  });
  it("charges manual runs to the same budget and detects reserve exhaustion", () => {
    expect(
      estimateMonthlyNeonTransfer({ manualReconciliations: 1, coldBootstrapEquivalents: 200 }),
    ).toMatchObject({
      totalEstimatedBytes: 3_586_876_048,
      remainingAfterReserveBytes: 413_123_952,
      fitsProposedReserve: true,
    });
    expect(
      estimateMonthlyNeonTransfer({ manualReconciliations: 2, coldBootstrapEquivalents: 200 })
        .fitsProposedReserve,
    ).toBe(false);
    expect(estimateMonthlyNeonTransfer({ coldBootstrapEquivalents: 269 }).fitsProposedReserve).toBe(
      true,
    );
    expect(estimateMonthlyNeonTransfer({ coldBootstrapEquivalents: 270 }).fitsProposedReserve).toBe(
      false,
    );
  });
  it("rejects malformed or overflowing workloads", () => {
    for (const count of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(() => estimateMonthlyNeonTransfer({ manualReconciliations: count })).toThrow();
      expect(() => estimateMonthlyNeonTransfer({ coldBootstrapEquivalents: count })).toThrow();
    }
  });
});
