import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  checkNearbyClientRateLimit,
  checkNearbyOriginRateLimit,
  nearbyClientRateLimitKey,
  type NearbyRateLimiter,
} from "../../functions/_lib/nearby-rate-limit";
import {
  NEARBY_CLIENT_RATE_LIMIT,
  NEARBY_ORIGIN_RATE_LIMIT,
  NEARBY_ORIGIN_RATE_LIMIT_KEY,
  NEARBY_RATE_LIMIT_PERIOD_SEC,
} from "../../shared/nearby-limits";

const requestFrom = (ip?: string) =>
  new Request("https://example.com/api/nearby-places", {
    headers: ip === undefined ? {} : { "CF-Connecting-IP": ip },
  });

const limiter = (outcome: "allow" | "deny" | "throw") => {
  const limit = vi.fn(async (_options: { key: string }) => {
    if (outcome === "throw") throw new Error("limiter unavailable");
    return { success: outcome === "allow" };
  });
  return { limit } satisfies NearbyRateLimiter;
};

/** Minimal JSONC reader: strips comments outside strings, then trailing commas. */
function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i];
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      i = text.indexOf("*/", i + 2) + 1;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

describe("nearbyClientRateLimitKey", () => {
  it.each([
    ["203.0.113.9", "203.0.113.9"],
    ["  203.0.113.9 ", "203.0.113.9"],
    ["::ffff:203.0.113.9", "203.0.113.9"],
    ["2001:db8:1:2:aaaa:bbbb:cccc:dddd", "v6:2001:0db8:0001:0002"],
    ["2001:DB8:1:2::1", "v6:2001:0db8:0001:0002"],
    ["2001:db8:1:2:ffff:ffff:ffff:ffff", "v6:2001:0db8:0001:0002"],
    ["2001:db8:1:3::1", "v6:2001:0db8:0001:0003"],
    ["::1", "v6:0000:0000:0000:0000"],
    ["fe80::1%en0", "v6:fe80:0000:0000:0000"],
    ["2001:db8::", "v6:2001:0db8:0000:0000"],
  ])("maps %s to %s", (address, key) => {
    expect(nearbyClientRateLimitKey(requestFrom(address))).toBe(key);
  });

  it("puts every address of one IPv6 /64 in one bucket and different /64s in different ones", () => {
    const keys = [
      "2001:db8:aaaa:bbbb::1",
      "2001:db8:aaaa:bbbb:1:2:3:4",
      "2001:db8:aaaa:bbbb:ffff:ffff:ffff:ffff",
    ].map((address) => nearbyClientRateLimitKey(requestFrom(address)));
    expect(new Set(keys).size).toBe(1);
    expect(nearbyClientRateLimitKey(requestFrom("2001:db8:aaaa:bbbc::1"))).not.toBe(keys[0]);
  });

  it.each([
    undefined,
    "",
    "   ",
    "not-an-ip",
    "999.1.1.1",
    "1.2.3",
    "1:2:3:4:5:6:7:8:9",
    "::g",
    "1::2::3",
  ])("falls back to one stable key for a missing or malformed address: %j", (address) => {
    expect(nearbyClientRateLimitKey(requestFrom(address))).toBe("unknown-ip");
  });
});

describe("checkNearbyClientRateLimit", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lets an allowed request through and keys the limiter on the client", async () => {
    const l = limiter("allow");
    expect(await checkNearbyClientRateLimit(requestFrom("203.0.113.9"), l)).toBeNull();
    expect(l.limit).toHaveBeenCalledExactlyOnceWith({ key: "203.0.113.9" });
  });

  it("answers 429 with Retry-After and no-store when the client is over the limit", async () => {
    const response = await checkNearbyClientRateLimit(requestFrom("203.0.113.9"), limiter("deny"));
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBe(String(NEARBY_RATE_LIMIT_PERIOD_SEC));
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(await response?.json()).toEqual({ error: "Too Many Requests" });
  });

  it("fails closed with 503 when the binding is missing", async () => {
    const response = await checkNearbyClientRateLimit(requestFrom("203.0.113.9"), undefined);
    expect(response?.status).toBe(503);
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(await response?.json()).toEqual({ error: "Nearby search is not configured" });
  });

  it("fails open and logs when the limiter itself throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await checkNearbyClientRateLimit(requestFrom("203.0.113.9"), limiter("throw")),
    ).toBeNull();
    expect(log).toHaveBeenCalledOnce();
  });
});

describe("checkNearbyOriginRateLimit", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shares one counter per location across all clients", async () => {
    const l = limiter("allow");
    expect(await checkNearbyOriginRateLimit(l)).toBeNull();
    expect(l.limit).toHaveBeenCalledExactlyOnceWith({ key: NEARBY_ORIGIN_RATE_LIMIT_KEY });
  });

  it("answers 503 (the service protecting itself, not a client error) when the budget is spent", async () => {
    const response = await checkNearbyOriginRateLimit(limiter("deny"));
    expect(response?.status).toBe(503);
    expect(response?.headers.get("retry-after")).toBe(String(NEARBY_RATE_LIMIT_PERIOD_SEC));
    expect(response?.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed when the binding is missing", async () => {
    const response = await checkNearbyOriginRateLimit(undefined);
    expect(response?.status).toBe(503);
    expect(await response?.json()).toEqual({ error: "Nearby search is not configured" });
  });

  it("fails closed when the limiter itself throws: refuses the request, logs, and never lets it through", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await checkNearbyOriginRateLimit(limiter("throw"));
    expect(response?.status).toBe(503);
    expect(response?.headers.get("retry-after")).toBe(String(NEARBY_RATE_LIMIT_PERIOD_SEC));
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(await response?.json()).toEqual({ error: "Nearby search is temporarily unavailable" });
    expect(log).toHaveBeenCalledOnce();
    expect(String(log.mock.calls[0][0])).toContain("refusing request");
  });
});

describe("wrangler.jsonc rate limit bindings", () => {
  const config = parseJsonc(readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8")) as {
    ratelimits: { name: string; namespace_id: string; simple: { limit: number; period: number } }[];
  };
  const binding = (name: string) => config.ratelimits.find((entry) => entry.name === name);

  it("matches the documented constants, so the two cannot drift apart", () => {
    expect(binding("NEARBY_IP_LIMITER")?.simple).toEqual({
      limit: NEARBY_CLIENT_RATE_LIMIT,
      period: NEARBY_RATE_LIMIT_PERIOD_SEC,
    });
    expect(binding("NEARBY_ORIGIN_LIMITER")?.simple).toEqual({
      limit: NEARBY_ORIGIN_RATE_LIMIT,
      period: NEARBY_RATE_LIMIT_PERIOD_SEC,
    });
  });

  it("uses a window the binding supports and a namespace id of its own", () => {
    expect([10, 60]).toContain(NEARBY_RATE_LIMIT_PERIOD_SEC);
    const ids = config.ratelimits.map((entry) => entry.namespace_id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the spatial release gate closed", () => {
    // Opening the gate is a separate, approved rollout (docs/architecture/postgis-nearby.md).
    const vars = (config as unknown as { vars: Record<string, string> }).vars;
    expect(vars.NEON_SPATIAL_ENABLED).toBe("false");
  });
});
