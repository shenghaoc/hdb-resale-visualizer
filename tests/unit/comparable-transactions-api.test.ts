import { describe, expect, it, vi } from "vite-plus/test";
import { onRequestPost } from "../../functions/api/comparable-transactions";

function makeDbWithNoTransactions(): D1Database {
  const statement = {
    bind: vi.fn(() => statement),
    first: vi.fn(async () => ({ cnt: 0 })),
    all: vi.fn(async () => ({ results: [] })),
  };

  return {
    prepare: vi.fn(() => statement),
  } as unknown as D1Database;
}

describe("comparable-transactions API", () => {
  it("does not report a trend-query failure when there are no comparables to adjust", async () => {
    const body = JSON.stringify({
      town: "ANG MO KIO",
      block: "123A",
      streetName: "ANG MO KIO AVE 1",
      flatType: "4 ROOM",
      storeyRange: "07 TO 09",
      floorAreaSqm: 93,
      leaseCommenceYear: 1990,
      referenceMonth: "2026-04",
    });
    const request = new Request("https://example.test/api/comparable-transactions?adjust=time", {
      method: "POST",
      headers: {
        "content-length": String(new TextEncoder().encode(body).byteLength),
        "content-type": "application/json",
      },
      body,
    });

    const response = await onRequestPost({
      request,
      env: { DB: makeDbWithNoTransactions() },
      params: {},
      waitUntil: vi.fn(),
      next: vi.fn(),
      data: {},
    } as unknown as EventContext<Env, string, Record<string, unknown>>);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      comparables: [],
      caveats: ["No comparable transactions found for this listing."],
      adjustmentApplied: false,
      adjustmentCaveats: [],
    });
  });
});
