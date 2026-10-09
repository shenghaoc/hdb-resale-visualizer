// @vitest-environment node
import { describe, expect, it, vi } from "vite-plus/test";
import {
  PilotHttpError,
  type HttpFailureKind,
  type HttpReceipt,
} from "../../scripts/neon-benchmark/pilot/evidence";
import {
  ROUTING_SETTLE_INTERVAL_MS,
  ROUTING_SETTLE_WINDOW_MS,
  isPlatformRouteNotFound,
  settleRouting,
  type RoutingSettleClock,
} from "../../scripts/neon-benchmark/pilot/routing-settle";

const PLATFORM_PAGE_SHA256 = "2000e6b28a1517ba1268e1649cd3163326ef839492edfdba31e8959830580976";

function receipt(overrides: Partial<HttpReceipt>): HttpReceipt {
  return {
    id: "http1",
    sequence: 1,
    method: "GET",
    label: "worker1",
    startedAtUTC: "2026-10-07T00:00:00.000Z",
    endedAtUTC: "2026-10-07T00:00:00.100Z",
    stage: "parse",
    responseAvailable: true,
    status: 404,
    contentType: "text/html",
    requestURL: "https://fixture.invalid/control/ready",
    responseURL: "https://fixture.invalid/control/ready",
    redirected: false,
    redirectChain: null,
    finalMethod: "UNKNOWN",
    redirectMode: "manual",
    responseHeaders: {},
    deployment: null,
    applicationStatementsBefore: 0,
    applicationAccountingAvailableBefore: true,
    applicationStatementsAfter: 0,
    applicationAccountingAvailableAfter: true,
    requestBodyBytes: 0,
    responseBodyBytes: 19_984,
    responseSHA256: PLATFORM_PAGE_SHA256,
    bodySnippet: "",
    failure: "http-status",
    failureStage: "parse",
    errorName: null,
    protocolReceivedBytes: null,
    protocolSentBytes: null,
    providerObservationAvailable: false,
    finalEvidenceWriteFailed: false,
    transportCode: null,
    ...overrides,
  };
}
const httpError = (
  overrides: Partial<HttpReceipt>,
  classification: HttpFailureKind = "http-status",
) => new PilotHttpError(classification, receipt(overrides));
const platform404 = () => httpError({});

function fakeClock() {
  let at = 1_000_000;
  const sleeps: number[] = [];
  const clock: RoutingSettleClock = {
    now: () => at,
    sleep: async (ms) => {
      sleeps.push(ms);
      at += ms;
    },
  };
  return { clock, sleeps, advance: (ms: number) => (at += ms) };
}

describe("isolated Worker routing settle", () => {
  it("recognizes only the platform HTML 404 signature", () => {
    expect(isPlatformRouteNotFound(platform404())).toBe(true);
    expect(isPlatformRouteNotFound(httpError({ contentType: "application/json" }))).toBe(false);
    expect(isPlatformRouteNotFound(httpError({ contentType: "text/plain" }))).toBe(false);
    expect(isPlatformRouteNotFound(httpError({ contentType: null }))).toBe(false);
    expect(isPlatformRouteNotFound(httpError({ status: 403 }))).toBe(false);
    expect(isPlatformRouteNotFound(httpError({ status: 409 }))).toBe(false);
    expect(isPlatformRouteNotFound(httpError({ status: 307 }))).toBe(false);
    expect(isPlatformRouteNotFound(httpError({ status: null }, "transport"))).toBe(false);
    expect(isPlatformRouteNotFound(new Error("404"))).toBe(false);
    expect(isPlatformRouteNotFound({ receipt: receipt({}) })).toBe(false);
  });

  it("returns a routed response immediately without waiting", async () => {
    const { clock, sleeps } = fakeClock();
    const attempt = vi.fn().mockResolvedValue({ status: 200 });
    const settled = await settleRouting(attempt, clock);
    expect(settled).toEqual({
      result: { status: 200 },
      platformNotFoundAttempts: 0,
      platformNotFoundSHA256: [],
      waitedMs: 0,
    });
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("waits through the platform page, then returns the first routed response", async () => {
    const { clock, sleeps } = fakeClock();
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(platform404())
      .mockRejectedValueOnce(platform404())
      .mockRejectedValueOnce(platform404())
      .mockResolvedValueOnce({ status: 200 });
    const settled = await settleRouting(attempt, clock);
    expect(settled.result).toEqual({ status: 200 });
    expect(settled.platformNotFoundAttempts).toBe(3);
    expect(settled.platformNotFoundSHA256).toEqual([
      PLATFORM_PAGE_SHA256,
      PLATFORM_PAGE_SHA256,
      PLATFORM_PAGE_SHA256,
    ]);
    expect(settled.waitedMs).toBe(3 * ROUTING_SETTLE_INTERVAL_MS);
    expect(sleeps).toEqual([1000, 1000, 1000]);
    expect(attempt).toHaveBeenCalledTimes(4);
  });

  it("stops after the reserved window and rethrows the platform error unchanged", async () => {
    const { clock, sleeps } = fakeClock();
    const final = platform404();
    const attempt = vi.fn().mockRejectedValue(final);
    await expect(settleRouting(attempt, clock)).rejects.toBe(final);
    expect(attempt).toHaveBeenCalledTimes(
      ROUTING_SETTLE_WINDOW_MS / ROUTING_SETTLE_INTERVAL_MS + 1,
    );
    expect(sleeps.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(ROUTING_SETTLE_WINDOW_MS);
  });

  it("never sleeps past the window when attempts themselves are slow", async () => {
    const { clock, sleeps, advance } = fakeClock();
    const final = platform404();
    const attempt = vi.fn(async () => {
      advance(9_000);
      throw final;
    });
    await expect(settleRouting(attempt, clock)).rejects.toBe(final);
    // 9s + 1s sleep, 9s + 1s sleep, 9s => next sleep would exceed the 28s window.
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(sleeps).toEqual([1000, 1000]);
  });

  it("is bounded even if the clock never advances", async () => {
    const final = platform404();
    const attempt = vi.fn().mockRejectedValue(final);
    const frozen: RoutingSettleClock = { now: () => 5, sleep: async () => {} };
    await expect(settleRouting(attempt, frozen)).rejects.toBe(final);
    expect(attempt).toHaveBeenCalledTimes(
      ROUTING_SETTLE_WINDOW_MS / ROUTING_SETTLE_INTERVAL_MS + 1,
    );
  });

  it.each([
    ["Worker JSON 404", httpError({ contentType: "application/json" })],
    ["Worker plain 404", httpError({ contentType: "text/plain" })],
    ["authentication refusal", httpError({ status: 403, contentType: "text/plain" })],
    ["durable control refusal", httpError({ status: 409, contentType: "application/json" })],
    ["redirect", httpError({ status: 307, contentType: null })],
    ["transport failure", httpError({ status: null, contentType: null }, "transport")],
    ["timeout", httpError({ status: null, contentType: null }, "timeout")],
    ["unrelated error", new Error("unexpected")],
  ])("does not retry a %s", async (_name, error) => {
    const { clock, sleeps } = fakeClock();
    const attempt = vi.fn().mockRejectedValue(error);
    await expect(settleRouting(attempt, clock)).rejects.toBe(error);
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it("stops at once when a later attempt fails differently", async () => {
    const { clock, sleeps } = fakeClock();
    const other = httpError({ status: 403, contentType: "text/plain" });
    const attempt = vi.fn().mockRejectedValueOnce(platform404()).mockRejectedValueOnce(other);
    await expect(settleRouting(attempt, clock)).rejects.toBe(other);
    expect(attempt).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([1000]);
  });
});
