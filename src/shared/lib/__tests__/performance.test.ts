import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initPerformanceReporting,
  resetPerformanceReportingForTests,
  setWebVitalSink,
  type WebVitalReport,
} from "../performance";

const { onCLS, onINP, onLCP } = vi.hoisted(() => ({
  onLCP: vi.fn<(callback: (metric: unknown) => void) => void>(),
  onINP: vi.fn<(callback: (metric: unknown) => void) => void>(),
  onCLS: vi.fn<(callback: (metric: unknown) => void) => void>(),
}));

vi.mock("web-vitals", () => ({
  onLCP,
  onINP,
  onCLS,
}));

describe("performance reporting", () => {
  beforeEach(() => {
    resetPerformanceReportingForTests();
    onLCP.mockClear();
    onINP.mockClear();
    onCLS.mockClear();
    vi.stubEnv("DEV", false);
  });

  afterEach(() => {
    resetPerformanceReportingForTests();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("registers LCP, INP, and CLS observers once", () => {
    initPerformanceReporting();
    initPerformanceReporting();

    expect(onLCP).toHaveBeenCalledTimes(1);
    expect(onINP).toHaveBeenCalledTimes(1);
    expect(onCLS).toHaveBeenCalledTimes(1);
  });

  it("forwards vitals to the prod sink with a privacy-safe route", () => {
    const sink = vi.fn<(report: WebVitalReport) => void>();
    setWebVitalSink(sink);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: { pathname: "/explore", search: "?town=BEDOK" },
    });

    initPerformanceReporting();

    const metric = {
      name: "LCP",
      value: 1800,
      rating: "good",
      navigationType: "navigate",
    } as const;

    onLCP.mock.calls[0][0](metric);

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toMatchObject({
      name: "LCP",
      value: 1800,
      rating: "good",
      route: "/explore",
      navigationType: "navigate",
    });
    expect(sink.mock.calls[0][0].timestamp).toEqual(expect.any(Number));
  });

  it("logs to console in dev instead of calling the prod sink", () => {
    vi.stubEnv("DEV", true);
    const sink = vi.fn<(report: WebVitalReport) => void>();
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    setWebVitalSink(sink);

    initPerformanceReporting();
    onCLS.mock.calls[0][0]({ name: "CLS", value: 0.05, rating: "good" });

    expect(consoleInfo).toHaveBeenCalledTimes(1);
    expect(consoleInfo.mock.calls[0][0]).toBe("[vitals]");
    expect(sink).not.toHaveBeenCalled();
  });
});
