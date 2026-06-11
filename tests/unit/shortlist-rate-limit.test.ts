import { describe, expect, it, vi } from "vite-plus/test";
import {
  checkShortlistWriteRateLimit,
  shortlistWriteRateLimitKey,
  type ShortlistWriteRateLimiter,
} from "../../functions/_lib/shortlist-rate-limit";
import { SHORTLIST_WRITE_RATE_LIMIT_PERIOD_SEC } from "../../shared/shortlist-limits";

function makeLimiter(outcome: { success: boolean }): ShortlistWriteRateLimiter {
  return { limit: vi.fn().mockResolvedValue(outcome) };
}

describe("shortlistWriteRateLimitKey", () => {
  it("uses CF-Connecting-IP when present", () => {
    const request = new Request("https://example.com/api/shortlist", {
      method: "POST",
      headers: { "CF-Connecting-IP": "203.0.113.10" },
    });
    expect(shortlistWriteRateLimitKey(request)).toBe("203.0.113.10");
  });

  it("falls back to a stable key when CF-Connecting-IP is absent", () => {
    const request = new Request("https://example.com/api/shortlist", { method: "POST" });
    expect(shortlistWriteRateLimitKey(request)).toBe("unknown-ip");
  });
});

describe("checkShortlistWriteRateLimit", () => {
  it("returns 429 with Retry-After when the limiter rejects the key", async () => {
    const request = new Request("https://example.com/api/shortlist", {
      method: "POST",
      headers: { "CF-Connecting-IP": "203.0.113.10" },
    });
    const limiter = makeLimiter({ success: false });

    const response = await checkShortlistWriteRateLimit(request, limiter);
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe(
      String(SHORTLIST_WRITE_RATE_LIMIT_PERIOD_SEC),
    );
    await expect(response?.json()).resolves.toEqual({ error: "Too Many Requests" });
    expect(limiter.limit).toHaveBeenCalledWith({ key: "203.0.113.10" });
  });

  it("returns null when the limiter accepts the key", async () => {
    const request = new Request("https://example.com/api/shortlist", { method: "POST" });
    const limiter = makeLimiter({ success: true });
    await expect(checkShortlistWriteRateLimit(request, limiter)).resolves.toBeNull();
  });

  it("fails open (returns null) when the limiter throws", async () => {
    const request = new Request("https://example.com/api/shortlist", { method: "POST" });
    const limiter: ShortlistWriteRateLimiter = {
      limit: vi.fn().mockRejectedValue(new Error("UNKNOWN")),
    };
    await expect(checkShortlistWriteRateLimit(request, limiter)).resolves.toBeNull();
  });
});
