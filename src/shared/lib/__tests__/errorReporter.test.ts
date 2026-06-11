import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  initErrorReporting,
  reportBoundaryError,
  resetErrorReportingForTests,
  setErrorSink,
  type ErrorReport,
} from "../errorReporter";

describe("errorReporter", () => {
  beforeEach(() => {
    resetErrorReportingForTests();
    vi.stubEnv("DEV", false);
  });

  afterEach(() => {
    resetErrorReportingForTests();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reports boundary errors to the prod sink with a privacy-safe route", () => {
    const sink = vi.fn<(report: ErrorReport) => void>();
    setErrorSink(sink);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: { pathname: "/explore", search: "?town=BEDOK&selected=secret" },
    });

    const error = new Error("render boom");
    reportBoundaryError(error, { componentStack: "\n    in MapView" });

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toMatchObject({
      kind: "boundary",
      message: "render boom",
      stack: error.stack,
      componentStack: "\n    in MapView",
      route: "/explore",
    });
    expect(sink.mock.calls[0][0].timestamp).toEqual(expect.any(Number));
  });

  it("logs to console in dev instead of calling the prod sink", () => {
    vi.stubEnv("DEV", true);
    const sink = vi.fn<(report: ErrorReport) => void>();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    setErrorSink(sink);

    reportBoundaryError(new Error("dev boom"), { componentStack: "" });

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][0]).toBe("[error]");
    expect(sink).not.toHaveBeenCalled();
  });

  it("captures window error and unhandled rejection events once initialized", () => {
    const sink = vi.fn<(report: ErrorReport) => void>();
    setErrorSink(sink);
    initErrorReporting();

    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "Script failed",
        filename: "https://example.com/assets/app.js",
        lineno: 12,
        colno: 4,
        error: new Error("Script failed"),
      }),
    );

    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), {
        reason: new Error("Promise rejected"),
      }),
    );

    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink.mock.calls[0][0]).toMatchObject({
      kind: "uncaught",
      message: "Script failed",
    });
    expect(sink.mock.calls[1][0]).toMatchObject({
      kind: "unhandledrejection",
      message: "Promise rejected",
    });
  });

  it("appends filename:lineno:colno when an error event has no error object", () => {
    const sink = vi.fn<(report: ErrorReport) => void>();
    setErrorSink(sink);
    initErrorReporting();

    // e.g. a failed third-party <script> load: filename present, error null.
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "Script error",
        filename: "https://cdn.example.com/widget.js",
        lineno: 5,
        colno: 9,
      }),
    );

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0]).toMatchObject({
      kind: "uncaught",
      message: "Script error (https://cdn.example.com/widget.js:5:9)",
    });
  });

  it("does not register duplicate listeners when init is called twice", () => {
    const sink = vi.fn<(report: ErrorReport) => void>();
    setErrorSink(sink);
    initErrorReporting();
    initErrorReporting();

    window.dispatchEvent(new ErrorEvent("error", { message: "once", error: new Error("once") }));

    expect(sink).toHaveBeenCalledTimes(1);
  });
});
