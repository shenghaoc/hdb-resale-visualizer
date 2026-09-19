import { describe, expect, it, vi } from "vite-plus/test";
import { onRequestPost } from "../../functions/api/comparable-transactions";

const listing = {
  town: "ANG MO KIO",
  block: "123A",
  streetName: "ANG MO KIO AVE 1",
  flatType: "4 ROOM",
  storeyRange: "07 TO 09",
  floorAreaSqm: 93,
  leaseCommenceYear: 1990,
  referenceMonth: "2026-04",
};

function makeDb(
  options: {
    sameBlockCount?: number;
    sameStreetCount?: number;
    sameTownCount?: number;
    transactionRows?: Record<string, unknown>[];
    bindSpy?: (sql: string, params: unknown[]) => void;
  } = {},
): D1Database {
  return {
    prepare: vi.fn((sql: string) => {
      const statement = {
        bind: vi.fn((...params: unknown[]) => {
          options.bindSpy?.(sql, params);
          return statement;
        }),
        first: vi.fn(async () => {
          if (!sql.includes("COUNT(*)")) return null;
          if (sql.includes("block = ?2")) return { cnt: options.sameBlockCount ?? 0 };
          if (sql.includes("street_name")) return { cnt: options.sameStreetCount ?? 0 };
          return { cnt: options.sameTownCount ?? 0 };
        }),
        all: vi.fn(async () => ({ results: options.transactionRows ?? [] })),
      };
      return statement;
    }),
  } as unknown as D1Database;
}

async function postComparable(
  body: BodyInit | null,
  options: {
    url?: string;
    db?: D1Database;
  } = {},
): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" });
  if (typeof body === "string") {
    headers.set("content-length", String(new TextEncoder().encode(body).byteLength));
  }

  const request = new Request(options.url ?? "https://example.test/api/comparable-transactions", {
    method: "POST",
    headers,
    body,
  });

  return onRequestPost({
    request,
    env: { DB: options.db ?? makeDb() },
    params: {},
    waitUntil: vi.fn(),
    next: vi.fn(),
    data: {},
  } as unknown as EventContext<Env, string, Record<string, unknown>>);
}

function sameBlockD1Row(id: number): Record<string, unknown> {
  return {
    id,
    month: "2026-03",
    town: "ANG MO KIO",
    block: "123A",
    street_name: "ANG MO KIO AVE 1",
    address_key: "ang-mo-kio-123a-ang-mo-kio-ave-1",
    flat_type: "4 ROOM",
    storey_range: "07 TO 09",
    floor_area_sqm: 93,
    lease_commence_year: 1990,
    resale_price: 600_000,
    flat_model: "MODEL A",
  };
}

describe("comparable-transactions API", () => {
  it("does not report a trend-query failure when there are no comparables to adjust", async () => {
    const response = await postComparable(JSON.stringify(listing), {
      url: "https://example.test/api/comparable-transactions?adjust=time",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      comparables: [],
      caveats: ["No comparable transactions found for this listing."],
      adjustmentApplied: false,
      adjustmentCaveats: [],
    });
  });

  it("rejects invalid JSON and schema payloads before querying D1", async () => {
    const invalidJson = await postComparable("{");
    expect(invalidJson.status).toBe(400);
    await expect(invalidJson.json()).resolves.toEqual({ error: "Invalid JSON" });

    const invalidBody = await postComparable(JSON.stringify({ ...listing, floorAreaSqm: 0 }));
    expect(invalidBody.status).toBe(400);
    await expect(invalidBody.json()).resolves.toEqual({ error: "Invalid request body" });
  });

  it("rejects lease commence years outside the documented HDB window", async () => {
    const tooOld = await postComparable(JSON.stringify({ ...listing, leaseCommenceYear: 1959 }));
    expect(tooOld.status).toBe(400);

    const tooNew = await postComparable(JSON.stringify({ ...listing, leaseCommenceYear: 2127 }));
    expect(tooNew.status).toBe(400);
  });

  it("rejects unknown or oversized ?adjust values without running the engine", async () => {
    const unknown = await postComparable(JSON.stringify(listing), {
      url: "https://example.test/api/comparable-transactions?adjust=price",
    });
    expect(unknown.status).toBe(400);
    await expect(unknown.json()).resolves.toEqual({
      error: 'Invalid ?adjust value. Expected "time".',
    });

    const oversized = await postComparable(JSON.stringify(listing), {
      url: `https://example.test/api/comparable-transactions?adjust=${"t".repeat(21)}`,
    });
    expect(oversized.status).toBe(400);
    await expect(oversized.json()).resolves.toEqual({
      error: "Invalid ?adjust value — exceeds maximum length.",
    });
  });

  it("requires a content-length within the listing payload budget", async () => {
    const missing = await onRequestPost({
      request: {
        url: "https://example.test/api/comparable-transactions",
        headers: new Headers({ "content-type": "application/json" }),
        body: { getReader: () => ({ read: async () => ({ done: true }) }) },
      } as unknown as Request,
      env: { DB: makeDb() },
      params: {},
      waitUntil: vi.fn(),
      next: vi.fn(),
      data: {},
    } as unknown as EventContext<Env, string, Record<string, unknown>>);
    expect(missing.status).toBe(411);

    const tooLarge = await onRequestPost({
      request: {
        url: "https://example.test/api/comparable-transactions",
        headers: new Headers({
          "content-type": "application/json",
          "content-length": "8193",
        }),
        body: { getReader: () => ({ read: async () => ({ done: true }) }) },
      } as unknown as Request,
      env: { DB: makeDb() },
      params: {},
      waitUntil: vi.fn(),
      next: vi.fn(),
      data: {},
    } as unknown as EventContext<Env, string, Record<string, unknown>>);
    expect(tooLarge.status).toBe(413);
  });

  it("canonicalizes the listing flat type before counting and fetching rows", async () => {
    const binds: Array<{ sql: string; params: unknown[] }> = [];
    const db = makeDb({
      sameBlockCount: 8,
      transactionRows: Array.from({ length: 8 }, (_, i) => sameBlockD1Row(i + 1)),
      bindSpy: (sql, params) => binds.push({ sql, params }),
    });

    const response = await postComparable(JSON.stringify({ ...listing, flatType: "4 room" }), {
      db,
    });

    expect(response.status).toBe(200);
    expect(binds.some(({ params }) => params.includes("4 ROOM"))).toBe(true);
    expect(binds.some(({ params }) => params.includes("4 room"))).toBe(false);
  });

  it("derives string transaction ids and price per sqm from D1 rows", async () => {
    const response = await postComparable(JSON.stringify(listing), {
      db: makeDb({
        sameBlockCount: 8,
        transactionRows: [
          { ...sameBlockD1Row(42), floor_area_sqm: 0, resale_price: 600_000 },
          ...Array.from({ length: 7 }, (_, i) => sameBlockD1Row(i + 1)),
        ],
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      comparables: Array<{
        transactionId: string;
        storeyRange: string;
        pricePerSqm: number;
        resalePrice: number;
      }>;
      sameBlockCount: number;
    };

    expect(body.sameBlockCount).toBe(8);
    expect(body.comparables.length).toBeGreaterThan(0);
    expect(body.comparables.every((row) => typeof row.transactionId === "string")).toBe(true);
    expect(body.comparables.map((row) => row.transactionId)).toContain("42");
    expect(body.comparables.find((row) => row.transactionId === "42")).toMatchObject({
      storeyRange: "07 TO 09",
      resalePrice: 600_000,
      pricePerSqm: 0,
    });
    expect(body.comparables.find((row) => row.transactionId === "1")).toMatchObject({
      pricePerSqm: 6451.61,
    });
  });
});
