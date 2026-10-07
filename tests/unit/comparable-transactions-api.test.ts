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

/** Canned D1: fixed counts and rows whatever the SQL, for request-handling tests. */
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

type RawTx = {
  id: number;
  month: string;
  town: string;
  block: string;
  street_name: string;
  address_key: string;
  flat_type: string;
  storey_range: string;
  floor_area_sqm: number;
  lease_commence_year: number;
  resale_price: number;
  flat_model: string;
};

function matchesSql(sql: string, row: RawTx, params: unknown[]): boolean {
  if (sql.includes("town = ?1 AND block = ?2 AND flat_type = ?3")) {
    return row.town === params[0] && row.block === params[1] && row.flat_type === params[2];
  }
  if (sql.includes("street_name = ?1 AND flat_type = ?2")) {
    return row.street_name === params[0] && row.flat_type === params[1];
  }
  if (sql.includes("town = ?1 AND flat_type = ?2")) {
    return row.town === params[0] && row.flat_type === params[1];
  }
  return false;
}

/**
 * In-memory D1 that evaluates the WHERE and LIMIT of the handler's queries, for
 * tests that depend on which rows each query returns.
 */
function makeDbWithTransactions(rows: RawTx[]): D1Database {
  return {
    prepare(sql: string) {
      const statement = {
        params: [] as unknown[],
        bind(...args: unknown[]) {
          statement.params = args;
          return statement;
        },
        async first() {
          const matched = rows.filter((row) => matchesSql(sql, row, statement.params));
          if (sql.includes("COUNT(*)")) {
            return { cnt: matched.length };
          }
          return matched[0] ?? null;
        },
        async all() {
          const matched = rows
            .filter((row) => matchesSql(sql, row, statement.params))
            .sort((a, b) => b.month.localeCompare(a.month));
          const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
          const results = limitMatch ? matched.slice(0, Number(limitMatch[1])) : matched;
          return { results };
        },
      };
      return statement;
    },
  } as unknown as D1Database;
}

function tx(
  overrides: Partial<RawTx> & Pick<RawTx, "id" | "month" | "block" | "street_name">,
): RawTx {
  return {
    town: "ANG MO KIO",
    address_key: `ang-mo-kio-${overrides.block.toLowerCase()}-ang-mo-kio-ave-1`,
    flat_type: "4 ROOM",
    storey_range: "07 TO 09",
    floor_area_sqm: 93,
    lease_commence_year: 1990,
    resale_price: 500000,
    flat_model: "MODEL A",
    ...overrides,
  };
}

function recentTownRows(count: number, startId: number): RawTx[] {
  return Array.from({ length: count }, (_, index) =>
    tx({
      id: startId + index,
      month: "2026-04",
      block: `9${String(index).padStart(3, "0")}`,
      street_name: "ANG MO KIO AVE 10",
      resale_price: 800000,
    }),
  );
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

  it("keeps older same-block sales when the town recency window is full", async () => {
    const sameBlockIds = [1, 2, 3, 4];
    const rows = [
      ...sameBlockIds.map((id) =>
        tx({
          id,
          month: "2023-06",
          block: "123A",
          street_name: "ANG MO KIO AVE 1",
          resale_price: 500000,
        }),
      ),
      tx({
        id: 5,
        month: "2023-06",
        block: "124B",
        street_name: "ANG MO KIO AVE 1",
        resale_price: 510000,
      }),
      tx({
        id: 6,
        month: "2023-05",
        block: "125C",
        street_name: "ANG MO KIO AVE 1",
        resale_price: 515000,
      }),
      tx({
        id: 7,
        month: "2023-04",
        block: "126D",
        street_name: "ANG MO KIO AVE 1",
        resale_price: 520000,
      }),
      ...recentTownRows(200, 100),
    ];

    const response = await postComparable(JSON.stringify(listing), {
      db: makeDbWithTransactions(rows),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      comparables: Array<{ transactionId: string; block: string }>;
      sameBlockCount: number;
      sameStreetCount: number;
      sameTownCount: number;
      widenedSearch: boolean;
    };

    expect(payload.sameBlockCount).toBe(4);
    expect(payload.sameStreetCount).toBe(7);
    expect(payload.sameTownCount).toBe(207);
    expect(payload.widenedSearch).toBe(true);
    const comparableIds = payload.comparables.map((row) => row.transactionId);
    for (const id of sameBlockIds) {
      expect(comparableIds).toContain(String(id));
    }
    expect(payload.comparables.some((row) => row.block === "123A")).toBe(true);
  });

  it("keeps older same-block sales when the street recency window is full", async () => {
    const sameBlockIds = [1, 2, 3, 4];
    const rows = [
      ...sameBlockIds.map((id) =>
        tx({
          id,
          month: "2023-06",
          block: "123A",
          street_name: "ANG MO KIO AVE 1",
          resale_price: 500000,
        }),
      ),
      ...Array.from({ length: 200 }, (_, index) =>
        tx({
          id: 100 + index,
          month: "2026-04",
          block: `8${String(index).padStart(3, "0")}`,
          street_name: "ANG MO KIO AVE 1",
          resale_price: 800000,
        }),
      ),
    ];

    const response = await postComparable(JSON.stringify(listing), {
      db: makeDbWithTransactions(rows),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      comparables: Array<{ transactionId: string; block: string }>;
      sameBlockCount: number;
      sameStreetCount: number;
      widenedSearch: boolean;
    };

    expect(payload.sameBlockCount).toBe(4);
    expect(payload.sameStreetCount).toBe(204);
    expect(payload.widenedSearch).toBe(true);
    const comparableIds = payload.comparables.map((row) => row.transactionId);
    for (const id of sameBlockIds) {
      expect(comparableIds).toContain(String(id));
    }
  });

  it("uses same-block evidence without widening when the block has enough sales", async () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, index) =>
        tx({
          id: index + 1,
          month: `2025-${String(index + 1).padStart(2, "0")}`,
          block: "123A",
          street_name: "ANG MO KIO AVE 1",
          resale_price: 550000,
        }),
      ),
      ...recentTownRows(200, 100),
    ];

    const response = await postComparable(JSON.stringify(listing), {
      db: makeDbWithTransactions(rows),
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      comparables: Array<{ block: string }>;
      sameBlockCount: number;
      widenedSearch: boolean;
    };

    expect(payload.sameBlockCount).toBe(8);
    expect(payload.widenedSearch).toBe(false);
    expect(payload.comparables).toHaveLength(8);
    expect(payload.comparables.every((row) => row.block === "123A")).toBe(true);
  });
});
