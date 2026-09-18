import { describe, expect, it, vi } from "vite-plus/test";
import { onRequestPost } from "../../functions/api/comparable-transactions";

const CANDIDATE = {
  town: "ANG MO KIO",
  block: "123A",
  streetName: "ANG MO KIO AVE 1",
  flatType: "4 ROOM",
  storeyRange: "07 TO 09",
  floorAreaSqm: 93,
  leaseCommenceYear: 1990,
  referenceMonth: "2026-04",
};

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

function makeDbWithNoTransactions(): D1Database {
  return makeDbWithTransactions([]);
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

async function postComparables(db: D1Database, adjust = ""): Promise<Response> {
  const body = JSON.stringify(CANDIDATE);
  const url = adjust
    ? `https://example.test/api/comparable-transactions?${adjust}`
    : "https://example.test/api/comparable-transactions";
  const request = new Request(url, {
    method: "POST",
    headers: {
      "content-length": String(new TextEncoder().encode(body).byteLength),
      "content-type": "application/json",
    },
    body,
  });

  return onRequestPost({
    request,
    env: { DB: db },
    params: {},
    waitUntil: vi.fn(),
    next: vi.fn(),
    data: {},
  } as unknown as EventContext<Env, string, Record<string, unknown>>);
}

describe("comparable-transactions API", () => {
  it("does not report a trend-query failure when there are no comparables to adjust", async () => {
    const response = await postComparables(makeDbWithNoTransactions(), "adjust=time");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      comparables: [],
      caveats: ["No comparable transactions found for this listing."],
      adjustmentApplied: false,
      adjustmentCaveats: [],
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

    const response = await postComparables(makeDbWithTransactions(rows));
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

    const response = await postComparables(makeDbWithTransactions(rows));
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

    const response = await postComparables(makeDbWithTransactions(rows));
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
