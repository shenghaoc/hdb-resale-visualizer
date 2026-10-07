import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  classifyUpstreamService,
  resetUpstreamThrottleForTests,
  upstreamIntervalMs,
  waitForUpstreamSlot,
} from "../../scripts/lib/sync/rate-limits";

describe("rate-limits", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetUpstreamThrottleForTests();
  });

  it("uses the strictest anonymous dataset download interval (2/10s vs 5/min)", () => {
    vi.stubEnv("DATA_GOV_API_KEY", "");
    expect(upstreamIntervalMs("data-gov-dataset-download")).toBe(12_000);
  });

  it("uses dev dataset download limits when an API key is present", () => {
    vi.stubEnv("DATA_GOV_API_KEY", "test-key");
    vi.stubEnv("DATA_GOV_API_KEY_TIER", "dev");
    expect(upstreamIntervalMs("data-gov-dataset-download")).toBe(2500);
  });

  it("uses prod dataset download limits when tier is production", () => {
    vi.stubEnv("DATA_GOV_API_KEY", "test-key");
    vi.stubEnv("DATA_GOV_API_KEY_TIER", "production");
    expect(upstreamIntervalMs("data-gov-dataset-download")).toBe(1000);
  });

  it("classifies data.gov.sg collection metadata as v2 realtime", () => {
    expect(
      classifyUpstreamService(
        "https://api-production.data.gov.sg/v2/public/api/collections/189/metadata",
      ),
    ).toBe("data-gov-v2-realtime");
  });

  it("classifies dataset download endpoints separately from v2 realtime", () => {
    expect(
      classifyUpstreamService(
        "https://api-open.data.gov.sg/v1/public/api/datasets/d_abc/poll-download",
      ),
    ).toBe("data-gov-dataset-download");
  });

  it("classifies OneMap routing separately from search and ignores unknown hosts", () => {
    expect(classifyUpstreamService("https://www.onemap.gov.sg/api/public/routingsvc/route")).toBe(
      "onemap-routing",
    );
    expect(classifyUpstreamService("https://www.onemap.gov.sg/api/common/elastic/search")).toBe(
      "onemap-search",
    );
    expect(classifyUpstreamService("https://example.test/route")).toBeNull();
    expect(classifyUpstreamService("not a url")).toBeNull();
  });

  it("falls back to a 1s OneMap interval when the override is missing or not positive", () => {
    vi.stubEnv("ONEMAP_REQUEST_INTERVAL_MS", "nope");
    expect(upstreamIntervalMs("onemap-search")).toBe(1000);
    vi.stubEnv("ONEMAP_REQUEST_INTERVAL_MS", "0");
    expect(upstreamIntervalMs("onemap-routing")).toBe(1000);
    vi.stubEnv("ONEMAP_REQUEST_INTERVAL_MS", "-5");
    expect(upstreamIntervalMs("onemap-search")).toBe(1000);
  });

  it("honours a positive OneMap interval override", () => {
    vi.stubEnv("ONEMAP_REQUEST_INTERVAL_MS", "250");
    expect(upstreamIntervalMs("onemap-routing")).toBe(250);
  });

  it("uses the anonymous v2 realtime interval of 6 requests per 10 seconds", () => {
    vi.stubEnv("DATA_GOV_API_KEY", "");
    expect(upstreamIntervalMs("data-gov-v2-realtime")).toBe(1667);
  });

  it("waits at least the configured interval between requests for the same service", async () => {
    vi.stubEnv("DATA_GOV_API_KEY", "test-key");
    vi.stubEnv("DATA_GOV_API_KEY_TIER", "prod");
    const startedAt = performance.now();
    await waitForUpstreamSlot("data-gov-dataset-download");
    await waitForUpstreamSlot("data-gov-dataset-download");
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(990);
  });

  it("serializes concurrent waiters so they do not burst past the rate limit", async () => {
    vi.stubEnv("DATA_GOV_API_KEY", "test-key");
    vi.stubEnv("DATA_GOV_API_KEY_TIER", "prod");
    const startedAt = performance.now();
    await Promise.all([
      waitForUpstreamSlot("onemap-search"),
      waitForUpstreamSlot("onemap-search"),
      waitForUpstreamSlot("onemap-search"),
    ]);
    // Three prod-tier slots at 1000ms each → third waiter should finish ~2s after start.
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(1990);
  });
});
