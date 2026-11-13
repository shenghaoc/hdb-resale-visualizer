import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NEON_REFRESH_BRANCH, NEON_REFRESH_PROJECT } from "../../scripts/lib/sync/neon";
import { runSyncNeon, type SyncNeonDependencies } from "../../scripts/sync-neon";
import {
  FIXTURE_HYPERDRIVE_ID,
  FakeClock,
  REFRESH_URL,
  inventory,
  settledReceipt,
} from "../helpers/neonRefreshHarness";

/**
 * `--source-capture-directory` must be `.neon-benchmark/<name>`, and `.neon-benchmark/` is gitignored, so on a
 * clean checkout it does not exist. A reviewed reconciliation has to create it, but must still refuse a run
 * folder that is already there: an earlier capture is evidence and is never reused or overwritten.
 */
const SHA = "a".repeat(64);
const APPROVED_REVIEW = {
  version: 1,
  projectId: NEON_REFRESH_PROJECT,
  branchId: NEON_REFRESH_BRANCH,
  reviewStatus: "approved",
  decisionReference: "test-only decision",
  initialSourceFactsSHA256: SHA,
  initialBaselineManifestSHA256: SHA,
  maxNewRetentions: 0,
  maxOutstandingRetentions: 0,
  maxCorrections: 0,
  maxRemovals: 0,
  retentions: [],
  growth: {
    scopeDatasetId: "d_8b84c4ee58e3cfc0ece0d773c8ca6abc",
    scopeMinMonth: "2017-01",
    evidenceQuality: "uncalibrated-recurring-policy",
    independentSnapshotIntervals: 0,
    relativeCeiling: 0.005,
    absoluteCeiling: 1000,
    maxMonthlyElapsedDays: 35,
    maxManualElapsedDays: 35,
  },
};
const STOPPED = "stopped once the capture folder exists";

describe("reviewed reconciliation source capture folder", () => {
  const startingDirectory = process.cwd();
  let workDirectory: string;
  let argv: (runName: string) => string[];
  let deps: (fetchCsvRows: unknown) => Partial<SyncNeonDependencies>;

  beforeEach(() => {
    workDirectory = mkdtempSync(join(tmpdir(), "hdb-capture-"));
    const clock = new FakeClock();
    writeFileSync(join(workDirectory, "review.json"), JSON.stringify(APPROVED_REVIEW));
    writeFileSync(join(workDirectory, "usage.json"), JSON.stringify(settledReceipt(clock)));
    argv = (runName) => [
      "--plan",
      "--reconcile-manual",
      "--branch",
      NEON_REFRESH_BRANCH,
      "--reconciliation-review",
      join(workDirectory, "review.json"),
      "--usage-before",
      join(workDirectory, "usage.json"),
      "--report",
      join(workDirectory, "report.json"),
      "--source-capture-directory",
      `.neon-benchmark/${runName}`,
    ];
    deps = (fetchCsvRows) => ({
      env: { NEON_REFRESH_DATABASE_URL: REFRESH_URL },
      now: () => clock.now,
      fetchSourceInventory: async () => inventory(),
      fetchCsvRows: fetchCsvRows as SyncNeonDependencies["fetchCsvRows"],
      servingHyperdriveId: () => FIXTURE_HYPERDRIVE_ID,
    });
    // The capture folder is relative to the working directory, as it is for an operator.
    process.chdir(workDirectory);
  });

  afterEach(() => {
    process.chdir(startingDirectory);
    rmSync(workDirectory, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("creates the missing gitignored parent and a private run folder on a clean checkout", async () => {
    expect(existsSync(".neon-benchmark")).toBe(false);
    const fetchCsvRows = vi.fn().mockRejectedValue(new Error(STOPPED));

    await expect(runSyncNeon(argv("run-1"), deps(fetchCsvRows))).rejects.toThrow(STOPPED);

    expect(fetchCsvRows).toHaveBeenCalledOnce();
    expect(statSync(".neon-benchmark").mode & 0o777).toBe(0o700);
    expect(statSync(".neon-benchmark/run-1").isDirectory()).toBe(true);
    expect(statSync(".neon-benchmark/run-1").mode & 0o777).toBe(0o700);
  });

  it("accepts a new run folder beside an earlier one", async () => {
    mkdirSync(".neon-benchmark/earlier", { recursive: true, mode: 0o700 });
    const fetchCsvRows = vi.fn().mockRejectedValue(new Error(STOPPED));

    await expect(runSyncNeon(argv("run-2"), deps(fetchCsvRows))).rejects.toThrow(STOPPED);

    expect(statSync(".neon-benchmark/run-2").isDirectory()).toBe(true);
    expect(existsSync(".neon-benchmark/earlier")).toBe(true);
  });

  it("refuses a run folder that already exists and leaves its contents alone", async () => {
    mkdirSync(".neon-benchmark/run-3", { recursive: true, mode: 0o700 });
    writeFileSync(".neon-benchmark/run-3/receipt.json", "an earlier capture");
    const fetchCsvRows = vi.fn();

    await expect(runSyncNeon(argv("run-3"), deps(fetchCsvRows))).rejects.toThrow(/EEXIST/);

    expect(fetchCsvRows).not.toHaveBeenCalled();
    expect(readFileSync(".neon-benchmark/run-3/receipt.json", "utf8")).toBe("an earlier capture");
  });
});
