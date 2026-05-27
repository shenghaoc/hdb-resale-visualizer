import { describe, expect, it } from "vitest";
import {
  purgeStaleShortlists,
  shortlistRetentionCutoff,
  type SyncDB,
} from "../../functions/_lib/shortlist";
import { SHORTLIST_RETENTION_DAYS } from "../../shared/shortlist-limits";

type Row = { items_json: string; updated_at: string; created_at: string };

function makeFakeDB(initialRows: Record<string, Row>): {
  db: SyncDB;
  rows: Map<string, Row>;
  deleteCalls: Array<{ sql: string; args: unknown[] }>;
} {
  const rows = new Map(Object.entries(initialRows));
  const deleteCalls: Array<{ sql: string; args: unknown[] }> = [];

  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind(...bound: unknown[]) {
        args = bound;
        return stmt;
      },
      first<T>(): Promise<T | null> {
        return Promise.resolve(null);
      },
      run(): Promise<{ meta: { changes: number } }> {
        if (sql.startsWith("DELETE")) {
          deleteCalls.push({ sql, args: [...args] });
          const cutoff = args[0] as string;
          let changes = 0;
          for (const [hash, row] of rows.entries()) {
            if (row.updated_at < cutoff) {
              rows.delete(hash);
              changes += 1;
            }
          }
          return Promise.resolve({ meta: { changes } });
        }
        return Promise.resolve({ meta: { changes: 0 } });
      },
    };
    return stmt;
  };

  return { db: { prepare }, rows, deleteCalls };
}

describe("shortlistRetentionCutoff", () => {
  it("subtracts SHORTLIST_RETENTION_DAYS from the supplied clock", () => {
    const now = new Date("2026-05-27T12:00:00.000Z");
    const cutoff = shortlistRetentionCutoff(now);
    const expected = new Date(now.getTime() - SHORTLIST_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    expect(cutoff).toBe(expected.toISOString());
  });
});

describe("purgeStaleShortlists", () => {
  it("deletes only rows older than the retention window with a parameterized cutoff", async () => {
    const { db, rows, deleteCalls } = makeFakeDB({
      stale: {
        items_json: "[]",
        updated_at: "2025-01-01T00:00:00.000Z",
        created_at: "2025-01-01T00:00:00.000Z",
      },
      fresh: {
        items_json: "[]",
        updated_at: "2026-05-01T00:00:00.000Z",
        created_at: "2026-05-01T00:00:00.000Z",
      },
    });

    const now = new Date("2026-05-27T12:00:00.000Z");
    const deleted = await purgeStaleShortlists(db, now);

    expect(deleted).toBe(1);
    expect(rows.has("stale")).toBe(false);
    expect(rows.has("fresh")).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]?.sql).toBe("DELETE FROM shortlists WHERE updated_at < ?");
    expect(deleteCalls[0]?.args).toEqual([shortlistRetentionCutoff(now)]);
  });
});
