import { describe, expect, it } from "vitest";
import { onRequestGet } from "../../functions/api/suggest";

describe("/api/suggest handler", () => {
  it("returns 400 for short query", async () => {
    const ctx = {
      request: new Request("http://localhost/api/suggest?q=a"),
      env: { DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) } },
    } as unknown as Parameters<typeof onRequestGet>[0];
    const resp = await onRequestGet(ctx);
    expect(resp.status).toBe(400);
  });

  it("returns suggestions payload", async () => {
    const ctx = {
      request: new Request("http://localhost/api/suggest?q=bedok"),
      env: {
        DB: {
          prepare: (sql: string) => ({
            bind: () => ({
              all: async () => {
                if (sql.includes("DISTINCT town")) {
                  return { results: [{ town: "BEDOK" }] };
                }
                if (sql.includes("mrt_geojson")) {
                  return { results: [] };
                }
                return { results: [] };
              },
            }),
          }),
        },
      },
    } as unknown as Parameters<typeof onRequestGet>[0];
    const resp = await onRequestGet(ctx);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { suggestions: unknown[] };
    expect(body.suggestions.length).toBeGreaterThan(0);
  });
});
