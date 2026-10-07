import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const mock = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
  constructor: vi.fn(),
}));
vi.mock("pg", () => ({
  default: {
    Client: class {
      constructor(options: unknown) {
        mock.constructor(options);
      }
      connect = mock.connect;
      query = mock.query;
      end = mock.end;
      on = mock.on;
    },
  },
}));
import { createNeonPublicTransport } from "../../worker/neon-transport";
describe("request-scoped Neon read transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.connect.mockResolvedValue(undefined);
    mock.query.mockResolvedValue({ rows: [{ cnt: 1 }] });
    mock.end.mockResolvedValue(undefined);
  });
  const binding = { connectionString: "test-only" } as Hyperdrive;
  it("opens no connection for a warm cache hit or invalid body", async () => {
    const t = createNeonPublicTransport(binding);
    await t.snapshot(async () => new Response("invalid", { status: 400 }));
    await t.close();
    expect(mock.constructor).not.toHaveBeenCalled();
    expect(mock.query).not.toHaveBeenCalled();
  });
  it("pins parallel counts and all subsequent reads to one read-only snapshot", async () => {
    const t = createNeonPublicTransport(binding);
    await t.snapshot(async () => {
      await Promise.all([t.query("count1", []), t.query("count2", []), t.query("count3", [])]);
      await t.query("rows", [150]);
      await t.query("trends", []);
    });
    await t.close();
    expect(mock.connect).toHaveBeenCalledTimes(1);
    expect(mock.query.mock.calls.map((c) => c[0])).toEqual([
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "count1",
      "count2",
      "count3",
      "rows",
      "trends",
      "COMMIT",
    ]);
    expect(mock.end).toHaveBeenCalledTimes(1);
  });
  it("rolls back a caught trend failure while allowing the handler's raw-price fallback", async () => {
    const t = createNeonPublicTransport(binding);
    mock.query.mockImplementation(async (sql: string) => {
      if (sql === "trends") throw Error("hidden origin secret");
      return { rows: [] };
    });
    const response = await t.snapshot(async () => {
      await t.query("rows", []);
      await expect(t.query("trends", [])).rejects.toThrow("Public database read failed");
      return new Response("raw fallback");
    });
    expect(await response.text()).toBe("raw fallback");
    expect(mock.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    await t.close();
  });
  it("does not commit a response after an uncaught query failure or retry on D1", async () => {
    const t = createNeonPublicTransport(binding);
    mock.query.mockImplementation(async (sql: string) => {
      if (sql === "rows") throw Error("hidden secret");
      return { rows: [] };
    });
    await expect(t.snapshot(() => t.query("rows", []))).rejects.toThrow(
      "Public read snapshot failed",
    );
    await t.close();
    expect(mock.query.mock.calls.map((c) => c[0])).toEqual([
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "rows",
      "ROLLBACK",
    ]);
  });
  it("refuses to open a snapshot after an earlier read", async () => {
    const t = createNeonPublicTransport(binding);
    await t.query("rows", []);
    await expect(t.snapshot(async () => undefined)).rejects.toThrow("must precede queries");
    await t.close();
  });
});
