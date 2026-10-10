// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  nearbyStatementCeiling,
  reserveNearbyStatements,
  secondsUntilUtcMidnight,
  utcDay,
  type NearbyBudgetDatabase,
} from "../../functions/_lib/nearby-budget";
import {
  HYPERDRIVE_FREE_DAILY_STATEMENTS,
  NEARBY_DAILY_STATEMENT_CEILING,
  NEARBY_RATE_LIMIT_PERIOD_SEC,
  NEARBY_STATEMENTS_PER_MISS,
} from "../../shared/nearby-limits";

const migration = readFileSync(
  join(process.cwd(), "migrations/0012_nearby_statement_budget.sql"),
  "utf8",
);

/** D1's engine is SQLite, so the real migration and the real reservation statement run on real SQLite here. */
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(migration);
  const d1: NearbyBudgetDatabase = {
    prepare: (sql) => ({
      bind: (...values) => ({
        run: async () => ({
          meta: { changes: Number(sqlite.prepare(sql).run(...(values as never[])).changes) },
        }),
      }),
    }),
  };
  const rows = () =>
    sqlite.prepare("SELECT day, statements FROM nearby_statement_budget ORDER BY day").all() as {
      day: string;
      statements: number;
    }[];
  return { sqlite, d1, rows };
}

const noon = new Date("2026-10-10T12:00:00Z");

afterEach(() => vi.restoreAllMocks());

describe("the shipped numbers", () => {
  it("keep nearby search to a tenth of Hyperdrive's Free allowance, one statement per miss", () => {
    expect(HYPERDRIVE_FREE_DAILY_STATEMENTS).toBe(100_000);
    expect(NEARBY_DAILY_STATEMENT_CEILING).toBe(10_000);
    expect(NEARBY_DAILY_STATEMENT_CEILING * 10).toBeLessThanOrEqual(
      HYPERDRIVE_FREE_DAILY_STATEMENTS,
    );
    expect(NEARBY_STATEMENTS_PER_MISS).toBe(1);
  });

  it("are not overridden in wrangler.jsonc, so the constant is what runs", () => {
    const config = readFileSync(join(process.cwd(), "wrangler.jsonc"), "utf8");
    expect(config).not.toContain("NEARBY_DAILY_STATEMENT_CEILING");
  });
});

describe("reserveNearbyStatements", () => {
  it("grants until the day's ceiling is spent, then refuses with 503 and the time to midnight", async () => {
    const { d1, rows } = database();
    for (let i = 1; i <= 3; i++) expect(await reserveNearbyStatements(d1, "3", noon)).toBeNull();
    expect(rows()).toEqual([{ day: "2026-10-10", statements: 3 }]);

    const refused = await reserveNearbyStatements(d1, "3", noon);
    expect(refused?.status).toBe(503);
    expect(refused?.headers.get("cache-control")).toBe("no-store");
    expect(refused?.headers.get("retry-after")).toBe(String(12 * 3600));
    expect(await refused?.json()).toEqual({
      error: "Nearby search has reached its daily limit; try again after 00:00 UTC",
    });
    expect(rows()).toEqual([{ day: "2026-10-10", statements: 3 }]); // a refusal writes nothing
  });

  it("never lets concurrent callers pass the ceiling", async () => {
    const { d1, rows } = database();
    const outcomes = await Promise.all(
      Array.from({ length: 200 }, () => reserveNearbyStatements(d1, "50", noon)),
    );
    expect(outcomes.filter((outcome) => outcome === null)).toHaveLength(50);
    expect(outcomes.filter((outcome) => outcome?.status === 503)).toHaveLength(150);
    expect(rows()).toEqual([{ day: "2026-10-10", statements: 50 }]);
  });

  it("keeps one counter per UTC day: a new day starts from zero", async () => {
    const { d1, rows } = database();
    expect(await reserveNearbyStatements(d1, "1", new Date("2026-10-10T23:59:59Z"))).toBeNull();
    expect((await reserveNearbyStatements(d1, "1", new Date("2026-10-10T23:59:59Z")))?.status).toBe(
      503,
    );
    expect(await reserveNearbyStatements(d1, "1", new Date("2026-10-11T00:00:00Z"))).toBeNull();
    expect(rows()).toEqual([
      { day: "2026-10-10", statements: 1 },
      { day: "2026-10-11", statements: 1 },
    ]);
  });

  it("uses the shipped ceiling when none is configured", async () => {
    const { d1, sqlite } = database();
    sqlite
      .prepare("INSERT INTO nearby_statement_budget VALUES (?, ?)")
      .run("2026-10-10", NEARBY_DAILY_STATEMENT_CEILING - NEARBY_STATEMENTS_PER_MISS);
    expect(await reserveNearbyStatements(d1, undefined, noon)).toBeNull();
    expect((await reserveNearbyStatements(d1, undefined, noon))?.status).toBe(503);
  });

  describe("fails closed", () => {
    const quiet = () => vi.spyOn(console, "error").mockImplementation(() => {});

    it("without a D1 binding", async () => {
      const response = await reserveNearbyStatements(undefined, undefined, noon);
      expect(response?.status).toBe(503);
      expect(await response?.json()).toEqual({ error: "Nearby search is not configured" });
    });

    it.each(["", "abc", "0", "-1", "1.5", "1e3", " 10", "010", "100001", "9999999"])(
      "with a ceiling that is not a whole number within the Free allowance: %j",
      async (bad) => {
        const log = quiet();
        const { d1, rows } = database();
        const response = await reserveNearbyStatements(d1, bad, noon);
        expect(response?.status).toBe(503);
        expect(await response?.json()).toEqual({ error: "Nearby search is not configured" });
        expect(rows()).toEqual([]);
        expect(log).toHaveBeenCalledOnce();
      },
    );

    it("when the database throws, whether synchronously or asynchronously", async () => {
      const log = quiet();
      const sync: NearbyBudgetDatabase = {
        prepare: () => {
          throw new Error("no such table: nearby_statement_budget");
        },
      };
      const async_: NearbyBudgetDatabase = {
        prepare: () => ({
          bind: () => ({ run: () => Promise.reject(new Error("D1 unavailable")) }),
        }),
      };
      for (const db of [sync, async_]) {
        const response = await reserveNearbyStatements(db, undefined, noon);
        expect(response?.status).toBe(503);
        expect(response?.headers.get("retry-after")).toBe(String(NEARBY_RATE_LIMIT_PERIOD_SEC));
        expect(await response?.json()).toEqual({
          error: "Nearby search is temporarily unavailable",
        });
      }
      expect(log).toHaveBeenCalledTimes(2);
    });

    it("when the database does not answer in time", async () => {
      const log = quiet();
      vi.useFakeTimers();
      try {
        const hanging: NearbyBudgetDatabase = {
          prepare: () => ({ bind: () => ({ run: () => new Promise(() => {}) }) }),
        };
        const pending = reserveNearbyStatements(hanging, undefined, noon);
        await vi.advanceTimersByTimeAsync(2_001);
        expect((await pending)?.status).toBe(503);
        expect(log).toHaveBeenCalledOnce();
      } finally {
        vi.useRealTimers();
      }
    });

    it.each([
      ["no change count", {}],
      ["no metadata", undefined],
      ["two changes", { meta: { changes: 2 } }],
      ["a negative count", { meta: { changes: -1 } }],
    ])("when the answer is neither granted nor refused: %s", async (_label, answer) => {
      const log = quiet();
      const odd: NearbyBudgetDatabase = {
        prepare: () => ({ bind: () => ({ run: async () => answer as never }) }),
      };
      const response = await reserveNearbyStatements(odd, undefined, noon);
      expect(response?.status).toBe(503);
      expect(log).toHaveBeenCalledOnce();
    });
  });
});

describe("helpers", () => {
  it("names the UTC day and counts down to its end, never below the limiter window", () => {
    expect(utcDay(new Date("2026-10-10T23:59:59.999Z"))).toBe("2026-10-10");
    expect(utcDay(new Date("2026-10-11T00:00:00.000Z"))).toBe("2026-10-11");
    expect(secondsUntilUtcMidnight(new Date("2026-10-10T00:00:00Z"))).toBe(86_400);
    expect(secondsUntilUtcMidnight(new Date("2026-10-10T18:00:00Z"))).toBe(6 * 3600);
    expect(secondsUntilUtcMidnight(new Date("2026-10-10T23:59:59Z"))).toBe(60);
    expect(secondsUntilUtcMidnight(new Date("2026-12-31T12:00:00Z"))).toBe(12 * 3600);
  });

  it("reads the configured ceiling strictly", () => {
    expect(nearbyStatementCeiling(undefined)).toBe(NEARBY_DAILY_STATEMENT_CEILING);
    expect(nearbyStatementCeiling("1")).toBe(1);
    expect(nearbyStatementCeiling("100000")).toBe(HYPERDRIVE_FREE_DAILY_STATEMENTS);
    expect(nearbyStatementCeiling("100001")).toBeNull();
    expect(nearbyStatementCeiling("0")).toBeNull();
    expect(nearbyStatementCeiling("12abc")).toBeNull();
  });
});

describe("migrations/0012_nearby_statement_budget.sql", () => {
  it("is additive and idempotent", () => {
    expect(migration).toMatch(/^CREATE TABLE IF NOT EXISTS nearby_statement_budget/m);
    expect(migration).not.toMatch(/\b(DROP|ALTER|DELETE|UPDATE)\b/i);
    const { sqlite } = database();
    expect(() => sqlite.exec(migration)).not.toThrow();
  });

  it("only accepts a YYYY-MM-DD day and a non-negative count", () => {
    const { sqlite } = database();
    const insert = (day: string, statements: number) =>
      sqlite.prepare("INSERT INTO nearby_statement_budget VALUES (?, ?)").run(day, statements);
    expect(() => insert("2026-10-10", 0)).not.toThrow();
    expect(() => insert("today", 1)).toThrow();
    expect(() => insert("2026-10-1", 1)).toThrow();
    expect(() => insert("2026-10-11", -1)).toThrow();
    expect(() => insert("2026-10-10", 1)).toThrow(); // one row per day
  });
});
