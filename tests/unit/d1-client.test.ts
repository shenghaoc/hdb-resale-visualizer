import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { D1Client } from "../../scripts/lib/sync/d1";

// Retry backoff is real time otherwise; the delays are not what these tests are about.
vi.mock("../../scripts/lib/sync/rate-limits", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../scripts/lib/sync/rate-limits")>()),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

const config = {
  accountId: "acct",
  databaseId: "db-id",
  apiToken: "token",
};

function parseRequestBody(init?: RequestInit): unknown {
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected JSON request body string");
  }
  return JSON.parse(body);
}

describe("D1Client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a single statement as { sql, params }", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(parseRequestBody(init)).toEqual({
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
      expect(parseRequestBody(init)).toEqual({
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

  it("caps batch insert chunk size to D1 100-bound-param limit", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = parseRequestBody(init) as { sql: string; params: unknown[] };
      const rowCount = (body.sql.match(/\(\?/g) ?? []).length;
      expect(rowCount).toBeLessThanOrEqual(4);
      return new Response(
        JSON.stringify({
          success: true,
          errors: [],
          result: [{ success: true, meta: { changes: rowCount } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const columns = Array.from({ length: 23 }, (_, index) => `col_${index}`);
    const client = new D1Client(config);
    await client.batchInsert({
      table: "blocks",
      columns,
      rows: Array.from({ length: 10 }, (_, rowIndex) => rowIndex),
      mapRow: (rowIndex) => columns.map((column) => `${column}_${rowIndex}`),
      chunkSize: 50,
    });

    expect(fetchMock).toHaveBeenCalled();
  });

  it("joins D1 error messages and falls back when the error list is empty", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          success: false,
          errors: [{ message: "no such table: blocks" }, { message: "auth failed" }],
          result: [],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: false, errors: [], result: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new D1Client(config);

    await expect(client.query({ sql: "SELECT 1" })).rejects.toThrow(
      "D1: no such table: blocks; auth failed",
    );
    await expect(client.query({ sql: "SELECT 1" })).rejects.toThrow("D1: D1 query failed");
  });

  it("rejects a 200 body that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    const client = new D1Client(config);

    await expect(client.query({ sql: "SELECT 1" })).rejects.toThrow("D1: invalid JSON response");
  });

  it("returns rows from the last statement and an empty list when results are missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          errors: [],
          result: [{ results: [{ id: 1 }] }, { results: [{ id: 2 }] }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ success: true, errors: [], result: [{ success: true }] }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new D1Client(config);

    await expect(
      client.query([{ sql: "DELETE FROM blocks" }, { sql: "SELECT id FROM blocks" }]),
    ).resolves.toEqual([{ id: 2 }]);
    await expect(client.query({ sql: "DELETE FROM blocks" })).resolves.toEqual([]);
  });

  it("rejects a row whose column count does not match before calling D1", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new D1Client(config);

    await expect(
      client.batchInsert({
        table: "blocks",
        columns: ["address_key", "town"],
        rows: [1],
        mapRow: () => ["only-one"],
      }),
    ).rejects.toThrow("batchInsert(blocks): row provided 1 values for 2 columns");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes an empty preDelete table and upserts with INSERT OR REPLACE", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      jsonResponse({ success: true, errors: [], result: [{ success: true }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new D1Client(config);

    await client.batchInsert({
      table: "blocks",
      columns: ["address_key"],
      rows: [],
      mapRow: () => [],
      preDelete: true,
    });
    await client.batchInsert({
      table: "walking_time_cache",
      columns: ["cache_key", "walking_time_seconds"],
      rows: ["k"],
      mapRow: () => ["k", 90],
      upsert: true,
    });

    expect(parseRequestBody(fetchMock.mock.calls[0]?.[1])).toEqual({
      sql: "DELETE FROM blocks",
      params: [],
    });
    expect(parseRequestBody(fetchMock.mock.calls[1]?.[1])).toEqual({
      sql: "INSERT OR REPLACE INTO walking_time_cache (cache_key,walking_time_seconds) VALUES (?,?)",
      params: ["k", 90],
    });
  });

  it("makes every statement conditional on a guard, inside the statement itself", async () => {
    // One result per statement, like the REST API: the client rejects any other count.
    const fetchMock = vi.fn<typeof fetch>(async (_url, init) => {
      const { batch } = parseRequestBody(init) as { batch?: unknown[] };
      return jsonResponse({
        success: true,
        errors: [],
        result: (batch ?? [null]).map(() => ({ success: true })),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new D1Client(config);
    const guard = "(SELECT 1) = 1";

    await client.batchInsert({
      table: "blocks",
      columns: ["address_key", "town"],
      rows: ["a", "b", "c"],
      mapRow: (key) => [key, "BEDOK"],
      chunkSize: 2,
      preDelete: true,
      guard,
    });
    await client.batchInsert({
      table: "blocks",
      columns: ["address_key"],
      rows: [],
      mapRow: () => [],
      preDelete: true,
      guard,
    });
    await client.batchInsert({
      table: "walking_time_cache",
      columns: ["cache_key", "walking_time_seconds"],
      rows: ["k"],
      mapRow: () => ["k", 90],
      upsert: true,
      guard,
    });
    await client.truncate("comparisons", guard);

    const bodies = fetchMock.mock.calls.map((call) => parseRequestBody(call[1]));
    // The rows come from a VALUES subquery so a WHERE can sit between the data and the write, and the bound
    // parameters are unchanged (D1 allows 100 per statement, so the guard must never be a parameter).
    expect(bodies[0]).toEqual({
      batch: [
        { sql: "DELETE FROM blocks WHERE (SELECT 1) = 1" },
        {
          sql: "INSERT INTO blocks (address_key,town) SELECT column1,column2 FROM (VALUES (?,?),(?,?)) WHERE (SELECT 1) = 1",
          params: ["a", "BEDOK", "b", "BEDOK"],
        },
      ],
    });
    expect(bodies[1]).toEqual({
      sql: "INSERT INTO blocks (address_key,town) SELECT column1,column2 FROM (VALUES (?,?)) WHERE (SELECT 1) = 1",
      params: ["c", "BEDOK"],
    });
    expect(bodies[2]).toEqual({ sql: "DELETE FROM blocks WHERE (SELECT 1) = 1", params: [] });
    expect(bodies[3]).toEqual({
      sql: "INSERT OR REPLACE INTO walking_time_cache (cache_key,walking_time_seconds) SELECT column1,column2 FROM (VALUES (?,?)) WHERE (SELECT 1) = 1",
      params: ["k", 90],
    });
    expect(bodies[4]).toEqual({ sql: "DELETE FROM comparisons WHERE (SELECT 1) = 1", params: [] });
  });

  it("does not call D1 for an empty insert without preDelete", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new D1Client(config);

    await client.batchInsert({
      table: "blocks",
      columns: ["address_key"],
      rows: [],
      mapRow: () => [],
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("transient failures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends exactly one attempt by default, so a request is never applied twice", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("busy", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new D1Client(config).query({ sql: "SELECT 1" })).rejects.toThrow("503");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries network errors, HTTP 429 and 5xx when the caller opts in", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("reset"))
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }))
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          errors: [],
          result: [{ success: true, results: [{ n: 1 }] }],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(new D1Client(config, { retry: true }).query({ sql: "SELECT 1" })).resolves.toEqual(
      [{ n: 1 }],
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});

describe("exact D1 metadata accounting", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("sums every batch statement including index writes, labeled by phase/table", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              result: [
                {
                  success: true,
                  results: [],
                  meta: { changes: 1, duration: 2, rows_read: 3, rows_written: 8 },
                },
                {
                  success: true,
                  results: [],
                  meta: { changes: 2, duration: 4, rows_read: 5, rows_written: 16 },
                },
              ],
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const db = new D1Client(config);
    db.setPhase("publish");
    await db.query([
      { sql: "INSERT INTO transactions VALUES (?)", params: [1] },
      { sql: "UPDATE blocks SET town=?", params: ["TEST"] },
    ]);
    expect(db.usageReport()).toMatchObject({
      rowsRead: 8,
      rowsWritten: 24,
      durationMs: 6,
      statements: 2,
    });
    expect(db.usage.map((record) => [record.phase, record.table])).toEqual([
      ["publish", "transactions"],
      ["publish", "blocks"],
    ]);
  });
  it("marks absent metrics and timeouts UNKNOWN, never zero or retried writes", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network timeout"));
    vi.stubGlobal("fetch", fetchMock);
    const db = new D1Client(config);
    await expect(db.execute("INSERT INTO transactions VALUES (?)", [1])).rejects.toThrow("timeout");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(db.usageReport()).toMatchObject({
      rowsRead: null,
      rowsWritten: null,
      durationMs: null,
      statements: 1,
    });
  });
  it("rejects per-result failure and missing result count while retaining metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              result: [{ success: false, meta: { rows_read: 5, rows_written: 0 } }],
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    );
    const db = new D1Client(config);
    await expect(
      db.query([{ sql: "SELECT * FROM blocks" }, { sql: "SELECT * FROM manifest" }]),
    ).rejects.toThrow("D1 query failed");
    expect(db.usageReport().rowsRead).toBeNull();
    expect(db.usage[0].rowsRead).toBe(5);
  });
});

it("extra REST results invalidate aggregate certainty", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            result: [
              { success: true, meta: { rows_read: 1, rows_written: 0, duration: 1 } },
              { success: true, meta: { rows_read: 99, rows_written: 0, duration: 1 } },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    ),
  );
  const db = new D1Client(config);
  await expect(db.query({ sql: "SELECT * FROM manifest" })).rejects.toThrow();
  expect(db.usageReport()).toMatchObject({ rowsRead: null, rowsWritten: null, durationMs: null });
  vi.unstubAllGlobals();
});

it("retains exact statement metadata from a failed non-2xx JSON response without retry", async () => {
  const mock = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        success: false,
        errors: [{ message: "budget exhausted" }],
        result: [
          { success: false, meta: { rows_read: 7, rows_written: 2, duration: 3, changes: 0 } },
        ],
      }),
      { status: 429, headers: { "content-type": "application/json" } },
    ),
  );
  vi.stubGlobal("fetch", mock);
  try {
    const db = new D1Client(config);
    await expect(db.query({ sql: "SELECT * FROM blocks" })).rejects.toThrow("budget exhausted");
    expect(mock).toHaveBeenCalledOnce();
    expect(db.usageReport()).toMatchObject({ rowsRead: 7, rowsWritten: 2, durationMs: 3 });
    expect(db.usage[0].success).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
