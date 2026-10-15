import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createHash } from "node:crypto";
import { fetchCsvRows, fetchJson, fetchWithRetry } from "../../scripts/lib/sync/fetchers";

// Fetcher tests exercise request/response semantics; pacing has its own rate-limit suite.
vi.mock("../../scripts/lib/sync/rate-limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/lib/sync/rate-limits")>()),
  waitForUpstreamSlot: vi.fn().mockResolvedValue(undefined),
}));

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

describe("official data.gov.sg download flow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("initiates with GET and stops on access denial instead of polling", async () => {
    mockFetch.mockResolvedValueOnce(new Response("denied", { status: 403 }));
    await expect(fetchCsvRows("test-dataset")).rejects.toThrow("403");
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/initiate-download");
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.body).toBeUndefined();
  });
  it("captures exact delivered BOM bytes without changing the default parsed result", async () => {
    const body = new TextEncoder().encode("\uFEFFmonth,town\r\n2026-09,BEDOK\r\n");
    const respond = () => {
      mockFetch
        .mockResolvedValueOnce(new Response("{}"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { url: "https://example.test/fixture.csv" } })),
        )
        .mockResolvedValueOnce(new Response(body));
    };
    respond();
    const capture = vi.fn();
    const observed = await fetchCsvRows("fixture", capture);
    expect(observed).toEqual([{ month: "2026-09", town: "BEDOK" }]);
    expect(capture).toHaveBeenCalledOnce();
    expect(capture.mock.calls[0][0]).toEqual({
      datasetId: "fixture",
      bodySHA256: createHash("sha256").update(body).digest("hex"),
      bytes: body.length,
      rows: 1,
      capturedAtUTC: expect.any(String),
    });
    expect(Array.from(capture.mock.calls[0][1] as Uint8Array)).toEqual(Array.from(body));
    respond();
    expect(await fetchCsvRows("fixture")).toEqual(observed);
  });
  it("does not persist a CSV checkpoint when the parser rejects the body", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { url: "https://example.test/fixture.csv" } })),
      )
      .mockResolvedValueOnce(new Response('month,town\n2026-09,"unterminated'));
    const capture = vi.fn();
    await expect(fetchCsvRows("fixture", capture)).rejects.toThrow("CSV parse error");
    expect(capture).not.toHaveBeenCalled();
  });
});

it("scopes the optional data.gov.sg API key to official API hosts", async () => {
  vi.stubEnv("DATA_GOV_API_KEY", "fixture-key");
  const fetchMock = vi
    .fn()
    .mockImplementation(
      async () => new Response("{}", { headers: { "content-type": "application/json" } }),
    );
  vi.stubGlobal("fetch", fetchMock);
  try {
    await fetchJson("https://api-production.data.gov.sg/v2/public/api/datasets/fixture/metadata");
    await fetchJson("https://www.onemap.gov.sg/api/common/elastic/search");
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("x-api-key")).toBe("fixture-key");
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get("x-api-key")).toBeNull();
  } finally {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});
