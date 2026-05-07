import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "../../scripts/lib/sync/fetchers";

const mockFetch = vi.fn<typeof fetch>();

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries transient response statuses", async () => {
    const okResponse = new Response("ok", { status: 200 });
    mockFetch
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(okResponse);

    await expect(
      fetchWithRetry("https://example.test/data.csv", undefined, {
        attempts: 2,
        retryDelayMs: 0,
      }),
    ).resolves.toBe(okResponse);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries network failures", async () => {
    const okResponse = new Response("ok", { status: 200 });
    mockFetch.mockRejectedValueOnce(new Error("reset")).mockResolvedValueOnce(okResponse);

    await expect(
      fetchWithRetry("https://example.test/data.geojson", undefined, {
        attempts: 2,
        retryDelayMs: 0,
      }),
    ).resolves.toBe(okResponse);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient response statuses", async () => {
    mockFetch.mockResolvedValueOnce(new Response("missing", { status: 404 }));

    await expect(
      fetchWithRetry("https://example.test/missing.csv", undefined, {
        attempts: 2,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("Request failed for https://example.test/missing.csv: 404");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
