import { beforeEach, describe, expect, it } from "vite-plus/test";
import { onRequestGet } from "../../functions/api/suggest";
import { resetStationNamesCacheForTests } from "../../functions/_lib/suggest";
import { createD1PublicData } from "../../worker/public-data-d1";

beforeEach(() => {
  resetStationNamesCacheForTests();
});

describe("/api/suggest handler", () => {
  it("returns 400 for short query", async () => {
    const ctx = {
      request: new Request("http://localhost/api/suggest?q=a"),
      publicData: createD1PublicData({
        prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }),
      } as unknown as D1Database),
    } as unknown as Parameters<typeof onRequestGet>[0];
    const resp = await onRequestGet(ctx);
    expect(resp.status).toBe(400);
  });

  it("returns suggestions payload", async () => {
    const ctx = {
      request: new Request("http://localhost/api/suggest?q=bedok"),
      publicData: createD1PublicData({
        prepare: (sql: string) => ({
          bind: () => ({
            all: async () => {
              if (sql.includes("DISTINCT town")) {
                return { results: [{ town: "BEDOK" }] };
              }
              return { results: [] };
            },
            // The MRT station read: nothing synced.
            first: async () => null,
          }),
        }),
      } as unknown as D1Database),
    } as unknown as Parameters<typeof onRequestGet>[0];
    const resp = await onRequestGet(ctx);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { suggestions: unknown[] };
    expect(body.suggestions.length).toBeGreaterThan(0);
  });
});
