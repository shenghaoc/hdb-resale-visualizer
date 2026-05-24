import { afterEach, describe, expect, it, vi } from "vitest";
import { D1Client } from "../../scripts/lib/sync/d1";

const config = {
  accountId: "acct",
  databaseId: "db-id",
  apiToken: "token",
};

describe("D1Client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a single statement as { sql, params }", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        sql: "SELECT json FROM manifest WHERE id = 1",
      });
      return new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: [{ results: [{ json: "{}" }] }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new D1Client(config);
    const rows = await client.query<{ json: string }>({
      sql: "SELECT json FROM manifest WHERE id = 1",
    });

    expect(rows).toEqual([{ json: "{}" }]);
  });

  it("sends multiple statements as { batch: [...] }", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        batch: [
          { sql: "DELETE FROM blocks" },
          { sql: "INSERT INTO blocks (address_key) VALUES (?)", params: ["abc"] },
        ],
      });
      return new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: [
            { success: true, meta: { changes: 0 } },
            { success: true, meta: { changes: 1 } },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new D1Client(config);
    await client.query([
      { sql: "DELETE FROM blocks" },
      { sql: "INSERT INTO blocks (address_key) VALUES (?)", params: ["abc"] },
    ]);

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
