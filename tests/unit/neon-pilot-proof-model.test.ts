// @vitest-environment node
import { describe, expect, it } from "vite-plus/test";
import { PILOT_LIMITS } from "../../scripts/neon-benchmark/pilot/accounting";
import {
  boundComparableRequest,
  boundProbe,
  boundQueryResult,
  canReserveServerWindow,
  WITHDRAWN_PHYSICAL_PROMISE,
} from "../../scripts/neon-benchmark/pilot/proof-model";

describe("separate application and managed-transport proof", () => {
  it("bounds nullable UTF-8 row payload and every length prefix, rather than counting API rows", () => {
    const result = boundQueryResult(
      [
        { name: "town", maximumTextBytes: 6 },
        { name: "value", maximumTextBytes: 32 },
      ],
      3,
    );
    expect(result.maximumRowBytes).toBe(7 + 8 + 38);
    expect(result.maximumDataRowBytes).toBe(159);
    expect(result.maximumRowDescriptionBytes).toBe(7 + 4 + 5 + 38);
    expect(result.maximumExpectedResultMessageBytes).toBeGreaterThan(159);
    expect(result.completeSocketBytesUpper).toBeNull();
  });
  it("fails closed on corrupt proof inputs and any widened frozen result cap", () => {
    for (const value of [-1, 0.1, Number.MAX_SAFE_INTEGER + 1])
      expect(() => boundQueryResult([{ name: "id", maximumTextBytes: value }], 1)).toThrow();
    expect(() => boundQueryResult([], 1)).toThrow();
    expect(() => boundQueryResult([{ name: "private;sql", maximumTextBytes: 2 }], 1)).toThrow();
    expect(() =>
      boundComparableRequest({
        transactionColumns: [{ name: "id", maximumTextBytes: 6 }],
        trendColumns: [{ name: "town", maximumTextBytes: 16 }],
        maximumTrendRows: 13_260,
        selectedTransactionRows: 151,
      }),
    ).toThrow();
  });
  it("counts full trend history separately from the 30 returned comparable cap", () => {
    const result = boundComparableRequest({
      transactionColumns: [{ name: "id", maximumTextBytes: 6 }],
      trendColumns: [{ name: "town", maximumTextBytes: 16 }],
      maximumTrendRows: 13_260,
    });
    expect(result.transactions.maximumRows).toBe(150);
    expect(result.trends?.maximumRows).toBe(13_260);
    expect(result.applicationResultBytesUpper).toBeGreaterThan(13_260 * 16);
  });
  it("reserves transaction failures, diagnostic commands and ten cleanup commands from the same ninety", () => {
    const result = boundProbe({
      requestResultBounds: [60_000, 60_000, 60_000],
      diagnosticStatements: 4,
      serverObservationStatements: 2,
      monthlyHeadroomBytes: 1_237_484_420,
    });
    expect(result.prospectiveApplicationCommands).toBe(3 * 9 + 4 + 2 + 10);
    expect(result.applicationProofFits).toBe(true);
    expect(
      boundProbe({
        requestResultBounds: Array<number>(10).fill(100),
        diagnosticStatements: 0,
        serverObservationStatements: 0,
        monthlyHeadroomBytes: 1_237_484_420,
      }).applicationProofFits,
    ).toBe(false);
  });
  it("requires the full server tail after client abort and retains forty-five seconds for cleanup", () => {
    expect(canReserveServerWindow(180_000)).toBe(true);
    expect(canReserveServerWindow(180_001)).toBe(false);
    expect(canReserveServerWindow(35_000)).toBe(true);
    expect(canReserveServerWindow(240_000)).toBe(false);
    expect(() => canReserveServerWindow(-1)).toThrow();
  });
  it("keeps finite result and compute planning distinct from opaque origin activity", () => {
    const result = boundProbe({
      requestResultBounds: [100],
      diagnosticStatements: 4,
      serverObservationStatements: 2,
      monthlyHeadroomBytes: 1_237_484_420,
    });
    expect(result.modeledCUHours).toBeGreaterThan(0.35);
    expect(result.computeModelFits).toBe(false);
    expect(result.opaqueOriginBytesUpper).toBeNull();
    expect(result.allServerSQLUpper).toBeNull();
    expect(result.managedTransportRiskProved).toBe(false);
    expect(result.remoteExecutionAuthorized).toBe(false);
  });
  it("explicitly withdraws the all-origin promise without changing existing budgets", () => {
    expect(WITHDRAWN_PHYSICAL_PROMISE).toContain("Withdrawn");
    expect(PILOT_LIMITS.receivedDatabaseBytes).toBe(25_000_000);
    expect(PILOT_LIMITS.applicationStatements).toBe(90);
    expect(PILOT_LIMITS.comparablePOSTs).toBe(3);
    expect(PILOT_LIMITS.statementTimeoutMs).toBe(60_000);
    expect(PILOT_LIMITS.computeCUHoursProxy).toBe(0.35);
  });
});
