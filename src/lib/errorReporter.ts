import type { ErrorInfo } from "react";

export type ErrorReportKind = "uncaught" | "unhandledrejection" | "boundary";

export type ErrorReport = {
  kind: ErrorReportKind;
  message: string;
  stack?: string;
  componentStack?: string;
  /** Pathname only — query strings may contain addresses, filters, or sync codes. */
  route: string;
  timestamp: number;
};

export type ErrorSink = (report: ErrorReport) => void;

let prodSink: ErrorSink | null = null;
let initialized = false;

function isDev(): boolean {
  return import.meta.env.DEV;
}

export function setErrorSink(sink: ErrorSink | null): void {
  prodSink = sink;
}

function privacySafeRoute(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname;
}

function dispatchErrorReport(report: ErrorReport): void {
  if (isDev()) {
    console.error("[error]", report);
    return;
  }
  prodSink?.(report);
}

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message || error.name || "Error",
      stack: error.stack,
    };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch {
    return { message: "Unknown error" };
  }
}

export function reportBoundaryError(error: Error, info: ErrorInfo): void {
  dispatchErrorReport({
    kind: "boundary",
    message: error.message || error.name || "Error",
    stack: error.stack,
    componentStack: info.componentStack ?? undefined,
    route: privacySafeRoute(),
    timestamp: Date.now(),
  });
}

function handleErrorEvent(event: ErrorEvent): void {
  const normalized = event.error
    ? normalizeError(event.error)
    : { message: event.message || "Uncaught error" };

  const message =
    event.filename && !event.error
      ? `${normalized.message} (${event.filename}:${event.lineno}:${event.colno})`
      : normalized.message;

  dispatchErrorReport({
    kind: "uncaught",
    message,
    stack: normalized.stack,
    route: privacySafeRoute(),
    timestamp: Date.now(),
  });
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const normalized = normalizeError(event.reason);
  dispatchErrorReport({
    kind: "unhandledrejection",
    message: normalized.message,
    stack: normalized.stack,
    route: privacySafeRoute(),
    timestamp: Date.now(),
  });
}

export function initErrorReporting(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("error", handleErrorEvent);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
}

export function resetErrorReportingForTests(): void {
  initialized = false;
  prodSink = null;
}
