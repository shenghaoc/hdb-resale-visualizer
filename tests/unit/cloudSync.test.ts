import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { SHORTLIST_WRITE_RATE_LIMIT_PERIOD_SEC } from "@shared/shortlist-limits";
import {
  isRetriableSyncError,
  pullShortlist,
  pushShortlist,
  SyncCodeNotFoundError,
  SyncRateLimitedError,
} from "@/features/shortlist/cloudSync";
import type { ShortlistItem } from "@/types/data";

const VALID_ITEM: ShortlistItem = {
  addressKey: "bedok-123",
  notes: "",
  targetPrice: null,
  addedAt: "2026-04-20T00:00:00.000Z",
};

function jsonResponse(
  payload: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("isRetriableSyncError", () => {
  it.each([
    [new SyncCodeNotFoundError(), false],
    [new SyncRateLimitedError(2), true],
    [new TypeError("Failed to fetch"), true],
    [new Error("Sync failed (503)"), true],
    [new Error("Sync failed (408)"), true],
    [new Error("Sync failed (500)"), true],
    [new Error("Sync failed (400)"), false],
    [new Error("Sync failed (404)"), false],
    [new Error("Sync response missing code"), false],
  ])("classifies %s as retriable=%s", (error, expected) => {
    expect(isRetriableSyncError(error)).toBe(expected);
  });
});

describe("pushShortlist", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mints a sync code when the client has none and returns the server set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        syncCode: "minted-sync-code-1234",
        items: [VALID_ITEM],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(pushShortlist(null, [VALID_ITEM])).resolves.toEqual({
      syncCode: "minted-sync-code-1234",
      items: [expect.objectContaining({ addressKey: "bedok-123" })],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shortlist",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ items: [VALID_ITEM] }),
      }),
    );
  });

  it("throws SyncCodeNotFoundError on 404 so callers can drop the code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Not Found" }, 404)));

    await expect(pushShortlist("dead-code-dead-code", [VALID_ITEM])).rejects.toBeInstanceOf(
      SyncCodeNotFoundError,
    );
  });

  it("uses Retry-After when the server rate-limits", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: "Too Many Requests" }, 429, { "Retry-After": "12" }),
        ),
    );

    await expect(pushShortlist("abc123abc123abc1", [VALID_ITEM])).rejects.toMatchObject({
      name: "SyncRateLimitedError",
      retryAfterSec: 12,
    });
  });

  it("falls back to the documented rate-limit window when Retry-After is missing or invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: "Too Many Requests" }, 429, { "Retry-After": "nope" }),
        ),
    );

    await expect(pushShortlist("abc123abc123abc1", [VALID_ITEM])).rejects.toMatchObject({
      name: "SyncRateLimitedError",
      retryAfterSec: SHORTLIST_WRITE_RATE_LIMIT_PERIOD_SEC,
    });
  });

  it("drops malformed server items instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          syncCode: "abc123abc123abc1",
          items: [
            {
              addressKey: "",
              notes: "empty key",
              targetPrice: null,
              addedAt: "2026-04-20T00:00:00.000Z",
            },
            VALID_ITEM,
            { notes: "missing addressKey" },
          ],
        }),
      ),
    );

    const result = await pushShortlist("abc123abc123abc1", [VALID_ITEM]);
    expect(result.items.map((item) => item.addressKey)).toEqual(["bedok-123"]);
  });

  it("throws when a mint response omits the sync code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: [] })));

    await expect(pushShortlist(null, [])).rejects.toThrow("Sync response missing code");
  });

  it("surfaces non-404 HTTP failures as Sync failed (status)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Bad Request" }, 400)));

    await expect(pushShortlist("abc123abc123abc1", [VALID_ITEM])).rejects.toThrow(
      "Sync failed (400)",
    );
  });
});

describe("pullShortlist", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes sync codes that would otherwise split the path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [VALID_ITEM] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(pullShortlist("abc/123?x=1")).resolves.toHaveLength(1);
    // This test is about path encoding, so match the request options loosely:
    // an exact match would break whenever an unrelated option such as `cache`
    // is added to the pull request.
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/shortlist/abc%2F123%3Fx%3D1",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
  });

  it("throws SyncCodeNotFoundError on 404", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: "Not Found" }, 404)));

    await expect(pullShortlist("abc123abc123abc1")).rejects.toBeInstanceOf(SyncCodeNotFoundError);
  });

  it("sanitizes a non-array payload to an empty shortlist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ items: { not: "an-array" } })));

    await expect(pullShortlist("abc123abc123abc1")).resolves.toEqual([]);
  });
});
