import { describe, expect, it } from "vite-plus/test";
import { translate } from "../scripts/lib/sync/neon-translate";
describe("isolated PostgreSQL publication adapter", () => {
  it("keeps duplicate-looking facts distinct through their integer identities", () => {
    const params = [
      JSON.stringify([
        [1, "4 ROOM"],
        [2, "4 ROOM"],
      ]),
    ];
    const result = translate(
      {
        sql: "INSERT INTO transactions (id,flat_type) SELECT json_extract(value,'$[0]'),json_extract(value,'$[1]') FROM json_each(?)",
        params,
      },
      { "transactions.id": "int8", "transactions.flat_type": "text" },
    );
    expect(result.sql).toContain("jsonb_array_elements($1::jsonb)");
    expect(result.sql).not.toMatch(/DISTINCT|ON CONFLICT/);
    expect(JSON.parse(String(result.params?.[0]))).toEqual([
      [1, "4 ROOM"],
      [2, "4 ROOM"],
    ]);
  });
  it("patches only requested detail fields and preserves the rest of the JSONB document", () => {
    const sql =
      "UPDATE block_details SET json=json_set(block_details.json,'$.summary',json_extract(patch.value,'$[1]'),'$.monthlyTrend',json_extract(patch.value,'$[2]')) FROM json_each(?) AS patch WHERE block_details.address_key=json_extract(patch.value,'$[0]')";
    const result = translate({ sql, params: ['[["a",null,[]]]'] }, {});
    expect(result.sql).toContain(
      "jsonb_set(jsonb_set(block_details.json,'{summary}',patch.value->1,true),'{monthlyTrend}',patch.value->2,true)",
    );
    expect(result.sql).toContain("WHERE block_details.address_key=patch.value->>0");
    expect(result.sql).not.toContain("recentTransactions");
  });
  it("retains every component of a composite trend key", () => {
    const result = translate(
      {
        sql: "UPDATE town_flat_type_trends SET median_price=json_extract(patch.value,'$[3]') FROM json_each(?) AS patch WHERE town_flat_type_trends.town=json_extract(patch.value,'$[0]') AND town_flat_type_trends.flat_type=json_extract(patch.value,'$[1]') AND town_flat_type_trends.month=json_extract(patch.value,'$[2]')",
        params: ["[]"],
      },
      {
        "town_flat_type_trends.median_price": "float8",
        "town_flat_type_trends.town": "text",
        "town_flat_type_trends.flat_type": "text",
        "town_flat_type_trends.month": "text",
      },
    );
    expect(result.sql).toContain("town_flat_type_trends.town=(patch.value->>0)::text");
    expect(result.sql).toContain("town_flat_type_trends.flat_type=(patch.value->>1)::text");
    expect(result.sql).toContain("town_flat_type_trends.month=(patch.value->>2)::text");
  });
  it("upserts staged cache rows without delete/reinsert semantics", () => {
    const result = translate(
      {
        sql: "INSERT OR REPLACE INTO geocode_cache (cache_key,lat,lng) VALUES (?,?,?)",
        params: ["a", 1.3, 103.8],
      },
      {},
    );
    expect(result.sql).toBe(
      "INSERT INTO geocode_cache (cache_key,lat,lng) VALUES ($1,$2,$3) ON CONFLICT(cache_key) DO UPDATE SET lat=excluded.lat,lng=excluded.lng",
    );
  });
  it("rejects unrecognized SQL and uncalibrated columns", () => {
    expect(() => translate({ sql: "DELETE FROM transactions" }, {})).toThrow(
      "Unsupported publisher shape",
    );
    expect(() =>
      translate(
        {
          sql: "INSERT INTO transactions (unknown) SELECT json_extract(value,'$[0]') FROM json_each(?)",
        },
        {},
      ),
    ).toThrow("Unknown benchmark column");
  });
});
