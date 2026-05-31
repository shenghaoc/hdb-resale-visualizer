import { onCLS, onINP, onLCP, type Metric } from "web-vitals";

export type WebVitalName = "LCP" | "INP" | "CLS";

export type WebVitalReport = {
  name: WebVitalName;
  value: number;
  rating: Metric["rating"];
  /** Pathname only — query strings may contain addresses, filters, or sync codes. */
  route: string;
  timestamp: number;
  navigationType?: Metric["navigationType"];
};

export type WebVitalSink = (report: WebVitalReport) => void;

let prodSink: WebVitalSink | null = null;
let initialized = false;

function isDev(): boolean {
  return import.meta.env.DEV;
}

export function setWebVitalSink(sink: WebVitalSink | null): void {
  prodSink = sink;
}

function privacySafeRoute(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname;
}

const WEB_VITAL_NAMES = new Set<WebVitalName>(["LCP", "INP", "CLS"]);

function isWebVitalName(name: Metric["name"]): name is WebVitalName {
  return WEB_VITAL_NAMES.has(name as WebVitalName);
}

function dispatchVital(metric: Metric): void {
  // Only the three metrics registered below are forwarded; the runtime guard
  // also narrows metric.name to WebVitalName, removing the need for a cast.
  if (!isWebVitalName(metric.name)) return;

  const report: WebVitalReport = {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    route: privacySafeRoute(),
    timestamp: Date.now(),
    navigationType: metric.navigationType,
  };

  if (isDev()) {
    console.info("[vitals]", report);
    return;
  }
  prodSink?.(report);
}

export function initPerformanceReporting(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  onLCP(dispatchVital);
  onINP(dispatchVital);
  onCLS(dispatchVital);
}

export function resetPerformanceReportingForTests(): void {
  initialized = false;
  prodSink = null;
}
