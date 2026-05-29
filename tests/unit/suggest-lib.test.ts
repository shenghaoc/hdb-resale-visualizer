import { describe, expect, it } from "vitest";
import {
  buildSuggestions,
  MAX_SUGGEST_QUERY_LENGTH,
  normalizeSuggestQuery,
  parseSuggestRequest,
  type SuggestDb,
} from "../../functions/_lib/suggest";

function mockDb(handlers: Record<string, () => Promise<{ results?: unknown[] }>>): SuggestDb {
  return {
    prepare: (sql: string) => ({
      bind: () => ({
        all: async () => {
          for (const [key, handler] of Object.entries(handlers)) {
            if (sql.includes(key)) {
              return handler();
            }
          }
          return { results: [] };
        },
      }),
    }),
  };
}

describe("suggest lib", () => {
  it("rejects oversized q", () => {
    const parsed = parseSuggestRequest(
      new URL(`http://localhost/api/suggest?q=${"a".repeat(MAX_SUGGEST_QUERY_LENGTH + 1)}`),
    );
    expect(parsed.ok).toBe(false);
  });

  it("rejects query shorter than minimum length", () => {
    const parsed = parseSuggestRequest(new URL("http://localhost/api/suggest?q=a"));
    expect(parsed.ok).toBe(false);
  });

  it("normalises aliases", () => {
    expect(normalizeSuggestQuery("AMK")).toBe("ang mo kio");
  });

  it("ranks exact town before substring", async () => {
    const db = mockDb({
      "DISTINCT town": async () => ({
        results: [{ town: "BEDOK" }, { town: "BEDOK NORTH" }],
      }),
    });
    const suggestions = await buildSuggestions(db, "bedok", []);
    const towns = suggestions.filter((s) => s.group === "town");
    expect(towns[0]?.label).toContain("Bedok");
    expect(towns[0]?.group).toBe("town");
    if (towns[0]?.group === "town") {
      expect(towns[0].town).toBe("BEDOK");
    }
  });

  it("includes postal suggestions for numeric queries", async () => {
    const db = mockDb({
      "postal_code": async () => ({
        results: [{ postal_code: "460108" }],
      }),
    });
    const suggestions = await buildSuggestions(db, "460", []);
    expect(suggestions.some((s) => s.group === "postal")).toBe(true);
  });

  it("caps total suggestions", async () => {
    const manyTowns = Array.from({ length: 20 }, (_, i) => ({ town: `TOWN ${i}` }));
    const db = mockDb({
      "DISTINCT town": async () => ({ results: manyTowns }),
      "street_name": async () => ({ results: [] }),
      "address_key": async () => ({ results: [] }),
    });
    const suggestions = await buildSuggestions(db, "town", []);
    expect(suggestions.length).toBeLessThanOrEqual(10);
  });
});
