import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchJson, fetchWithRetry } from "../../scripts/lib/sync/fetchers";

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

  it("retries HTTP 429 and then returns the successful response", async () => {
    const okResponse = new Response("ok", { status: 200 });
    mockFetch
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(okResponse);

    await expect(
      fetchWithRetry("https://example.test/limited", undefined, {
        attempts: 2,
        retryDelayMs: 0,
      }),
    ).resolves.toBe(okResponse);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("includes a JSON error body on non-retryable failures and does not retry", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "bad town" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      fetchWithRetry("https://example.test/bad", undefined, {
        attempts: 3,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow('Request failed for https://example.test/bad: 400: {"error":"bad town"}');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("still throws the status when a non-retryable body is not JSON", async () => {
    mockFetch.mockResolvedValueOnce(new Response("nope", { status: 400 }));

    await expect(
      fetchWithRetry("https://example.test/bad-text", undefined, {
        attempts: 2,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("Request failed for https://example.test/bad-text: 400");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws the last network error after the attempt budget is exhausted", async () => {
    mockFetch.mockRejectedValue(new Error("reset"));

    await expect(
      fetchWithRetry("https://example.test/down", undefined, {
        attempts: 2,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("reset");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("wraps a non-Error rejection so callers still get an Error", async () => {
    mockFetch.mockRejectedValueOnce("boom");

    await expect(
      fetchWithRetry("https://example.test/wrapped", undefined, {
        attempts: 1,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow("Request failed for https://example.test/wrapped");
  });
});

describe("fetchJson", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses JSON when the content type includes a charset", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    );

    await expect(fetchJson("https://example.test/payload")).resolves.toEqual({ ok: true });
  });

  it("rejects an HTML body instead of parsing it as JSON", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("<html>maintenance</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    await expect(fetchJson("https://example.test/html")).rejects.toThrow(
      "Expected JSON from https://example.test/html but got text/html",
    );
  });

  it("rejects a success response that omits a content type", async () => {
    const response = new Response('{"ok":true}', { status: 200 });
    response.headers.delete("content-type");
    mockFetch.mockResolvedValueOnce(response);

    await expect(fetchJson("https://example.test/untyped")).rejects.toThrow(
      'Expected JSON from https://example.test/untyped but got  — {"ok":true}',
    );
  });
});
