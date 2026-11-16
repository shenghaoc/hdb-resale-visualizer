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
  NEARBY_DAILY_MISS_BUDGET,
  NEARBY_ORIGIN_RATE_LIMIT,
  NEARBY_ORIGIN_RATE_LIMIT_KEY,
  NEARBY_RATE_LIMIT_PERIOD_SEC,
} from "../../shared/nearby-limits";
import { NEON_SPATIAL_MODES, parseNeonSpatialMode } from "../../shared/nearby-places";
import {
  NearbyDailyBudget,
  checkNearbyDailyBudget,
  consumeDailyBudget,
  parseDailyBudget,
} from "../../worker/nearby-budget";

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

  it("fails closed and logs when the client limiter throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await checkNearbyClientRateLimit(requestFrom("203.0.113.9"), limiter("throw"));
    expect(response?.status).toBe(503);
    expect(response?.headers.get("retry-after")).toBe("60");
    expect(response?.headers.get("cache-control")).toBe("no-store");
    expect(await response?.json()).toEqual({ error: "Nearby search is temporarily unavailable" });
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

  type Deployed = {
    vars: Record<string, string>;
    durable_objects: { bindings: { name: string; class_name: string }[] };
    migrations: { tag: string; new_sqlite_classes?: string[] }[];
  };
  const deployed = config as unknown as Deployed;

  it("selects the block-only mode, the only one besides off", () => {
    expect(NEON_SPATIAL_MODES).toEqual(["off", "blocks"]);
    expect(deployed.vars.NEON_SPATIAL_MODE).toBe("blocks");
    expect(parseNeonSpatialMode(deployed.vars.NEON_SPATIAL_MODE)).toBe("blocks");
    // The flag this mode replaced must not linger: nothing reads it any more.
    expect(deployed.vars).not.toHaveProperty("NEON_SPATIAL_ENABLED");
  });

  it("mirrors the global daily miss budget exactly", () => {
    expect(NEARBY_DAILY_MISS_BUDGET).toBe(20_000);
    expect(deployed.vars.NEARBY_DAILY_MISS_BUDGET).toBe(String(NEARBY_DAILY_MISS_BUDGET));
    expect(parseDailyBudget(deployed.vars.NEARBY_DAILY_MISS_BUDGET)).toBe(NEARBY_DAILY_MISS_BUDGET);
  });

  it("binds the budget to one SQLite-backed Durable Object class that the Worker exports", async () => {
    expect(deployed.durable_objects.bindings).toEqual([
      { name: "NEARBY_BUDGET", class_name: NearbyDailyBudget.name },
    ]);
    // SQLite-backed classes are the kind every Workers plan can create.
    expect(deployed.migrations).toEqual([
      { tag: "v1", new_sqlite_classes: [NearbyDailyBudget.name] },
    ]);
    const entry = readFileSync(join(process.cwd(), "worker/index.ts"), "utf8");
    expect(entry).toContain('export { NearbyDailyBudget } from "./nearby-budget";');
  });
});

describe("global daily miss budget (the Durable Object's counter)", () => {
  const DAY = Date.parse("2026-11-16T00:00:00Z");
  const memory = (initial?: unknown) => {
    const values = new Map<string, unknown>(initial === undefined ? [] : [["day", initial]]);
    return {
      values,
      get: vi.fn(async (key: string) => values.get(key)),
      put: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
    };
  };

  it("grants statements up to the limit and refuses every one after it", async () => {
    const storage = memory();
    for (let used = 1; used <= 3; used++)
      expect(await consumeDailyBudget(storage, 3, DAY + used)).toEqual({
        allowed: true,
        day: "2026-11-16",
        used,
        limit: 3,
      });
    for (let extra = 0; extra < 5; extra++)
      expect(await consumeDailyBudget(storage, 3, DAY + 10 + extra)).toMatchObject({
        allowed: false,
        used: 3,
      });
    // A refusal writes nothing: the stored count never passes the limit.
    expect(storage.put).toHaveBeenCalledTimes(3);
    expect(storage.values.get("day")).toEqual({ day: "2026-11-16", used: 3 });
  });

  it("starts again from zero at UTC midnight, not 24 hours after the first statement", async () => {
    const storage = memory();
    const lastSecond = Date.parse("2026-11-16T23:59:59.999Z");
    expect((await consumeDailyBudget(storage, 1, lastSecond)).allowed).toBe(true);
    expect((await consumeDailyBudget(storage, 1, lastSecond)).allowed).toBe(false);
    expect(await consumeDailyBudget(storage, 1, lastSecond + 1)).toEqual({
      allowed: true,
      day: "2026-11-17",
      used: 1,
      limit: 1,
    });
    // 08:00 in Singapore is the same UTC day as 00:00 UTC: no second reset.
    expect(
      (await consumeDailyBudget(storage, 1, Date.parse("2026-11-17T08:00:00+08:00"))).allowed,
    ).toBe(false);
  });

  it("records the statement before granting it, so a failed write grants nothing", async () => {
    const storage = memory();
    storage.put.mockRejectedValueOnce(new Error("storage unavailable"));
    await expect(consumeDailyBudget(storage, 5, DAY)).rejects.toThrow("storage unavailable");
    expect(storage.values.has("day")).toBe(false);
  });

  it.each([
    [null],
    ["2026-11-16"],
    [{ day: "2026-11-16" }],
    [{ day: 20261116, used: 1 }],
    [{ day: "2026-11-16", used: -1 }],
    [{ day: "2026-11-16", used: 1.5 }],
  ])(
    "treats a stored value it does not understand (%j) as a spent day, never as zero",
    async (stored) => {
      const storage = memory(stored);
      expect(await consumeDailyBudget(storage, 5, DAY)).toMatchObject({ allowed: false });
      expect(storage.put).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["20000", 20_000],
    ["1", 1],
    [undefined, null],
    ["", null],
    ["0", null],
    ["-5", null],
    ["2e4", null],
    ["20000.0", null],
    [" 20000", null],
    ["20001", null],
    ["9999999999", null],
  ])("parses the configured budget %j as %j", (value, expected) => {
    expect(parseDailyBudget(value)).toBe(expected);
  });

  it("the object answers POST /consume and nothing else", async () => {
    const storage = memory();
    const object = new NearbyDailyBudget({ storage });
    const consume = (limit: string, method = "POST", path = "/consume") =>
      object.fetch(new Request(`https://nearby-budget${path}?limit=${limit}`, { method }));
    const granted = await consume("2");
    expect(granted.status).toBe(200);
    expect(await granted.json()).toMatchObject({ allowed: true, used: 1, limit: 2 });
    expect((await consume("2", "GET")).status).toBe(400);
    expect((await consume("2", "POST", "/reset")).status).toBe(400);
    expect((await consume("0")).status).toBe(400);
    expect((await consume("20001")).status).toBe(400);
    // None of the refused calls counted.
    expect(storage.values.get("day")).toMatchObject({ used: 1 });
  });
});

describe("checkNearbyDailyBudget", () => {
  const namespace = (fetch: (input: string, init?: RequestInit) => Promise<Response>) => ({
    idFromName: vi.fn((name: string) => name),
    get: vi.fn(() => ({ fetch })),
  });
  const decision = (allowed: unknown) => async () => Response.json({ allowed });

  it("admits a granted statement and refuses a spent day until the next UTC midnight", async () => {
    expect(await checkNearbyDailyBudget(namespace(decision(true)), "20000")).toBeNull();
    const now = Date.parse("2026-11-16T23:00:00Z");
    const refused = await checkNearbyDailyBudget(namespace(decision(false)), "20000", now);
    expect(refused?.status).toBe(503);
    expect(refused?.headers.get("retry-after")).toBe("3600");
    expect(refused?.headers.get("cache-control")).toBe("no-store");
  });

  it("fails closed, logged, when the object cannot answer", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const fetch of [
      async () => Promise.reject(new Error("object unavailable")),
      async () => new Response("no", { status: 503 }),
      async () => new Response("not json"),
      decision("true"),
      decision(undefined),
    ]) {
      const refused = await checkNearbyDailyBudget(namespace(fetch as never), "20000");
      expect(refused?.status).toBe(503);
      expect(refused?.headers.get("cache-control")).toBe("no-store");
    }
    expect(log).toHaveBeenCalledTimes(5);
    log.mockRestore();
  });

  it("refuses without asking when the binding or the budget is missing or invalid", async () => {
    const asked = namespace(decision(true));
    for (const [binding, limit] of [
      [undefined, "20000"],
      [asked, undefined],
      [asked, "0"],
      [asked, "20001"],
    ] as const) {
      const refused = await checkNearbyDailyBudget(binding, limit);
      expect(refused?.status).toBe(503);
      expect(await refused?.json()).toEqual({ error: "Nearby search is not configured" });
    }
    expect(asked.get).not.toHaveBeenCalled();
  });
});
