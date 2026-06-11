/**
 * Handler-logic tests for the opt-in shortlist sync API. Uses a minimal
 * in-memory fake of the D1 `prepare().bind().first()/run()` surface.
 */
import { describe, expect, it } from "vite-plus/test";
import {
  handleShortlistGet,
  handleShortlistPush,
  type SyncDB,
} from "../../functions/_lib/shortlist";
import { MAX_SYNC_BODY_BYTES } from "../../shared/shortlist-limits";

type Row = { items_json: string; updated_at: string };

function makeFakeDB(): { db: SyncDB; rows: Map<string, Row> } {
  const rows = new Map<string, Row>();

  const prepare = (sql: string) => {
    let args: unknown[] = [];
    const stmt = {
      bind(...bound: unknown[]) {
        args = bound;
        return stmt;
      },
      first<T>(): Promise<T | null> {
        const codeHash = args[0] as string;
        const row = rows.get(codeHash);
        return Promise.resolve((row ? { items_json: row.items_json } : null) as T | null);
      },
      run(): Promise<{ meta?: { changes?: number } }> {
        if (sql.startsWith("INSERT")) {
          rows.set(args[0] as string, {
            items_json: args[1] as string,
            updated_at: args[2] as string,
          });
        } else if (sql.startsWith("UPDATE")) {
          // bind order: items_json, updated_at, code_hash
          rows.set(args[2] as string, {
            items_json: args[0] as string,
            updated_at: args[1] as string,
          });
        }
        return Promise.resolve({ meta: { changes: 1 } });
      },
    };
    return stmt;
  };

  return { db: { prepare }, rows };
}

function item(addressKey: string, addedAt = "2026-04-20T00:00:00.000Z", notes = "") {
  return { addressKey, notes, targetPrice: null, addedAt };
}

describe("handleShortlistPush", () => {
  it("mints a code and stores items when no code is supplied", async () => {
    const { db, rows } = makeFakeDB();
    const res = await handleShortlistPush(db, JSON.stringify({ items: [item("a")] }));

    expect(res.status).toBe(200);
    const body = res.body as { syncCode: string; items: { addressKey: string }[] };
    expect(body.syncCode).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    expect(body.items.map((i) => i.addressKey)).toEqual(["a"]);
    expect(rows.size).toBe(1);
  });

  it("stores the incoming items directly on a known code (no server-side merge)", async () => {
    const { db } = makeFakeDB();
    const minted = (
      await handleShortlistPush(
        db,
        JSON.stringify({ items: [item("a", "2026-04-20T00:00:00.000Z")] }),
      )
    ).body as { syncCode: string };

    const res = await handleShortlistPush(
      db,
      JSON.stringify({ syncCode: minted.syncCode, items: [item("b", "2026-04-21T00:00:00.000Z")] }),
    );
    const body = res.body as { items: { addressKey: string }[] };

    expect(res.status).toBe(200);
    // Server stores the client's items directly — no merge. The client is
    // responsible for merging when pulling before pushing (hydration / link).
    // This prevents deleted items from being resurrected by server-side merge.
    expect(body.items.map((i) => i.addressKey).sort()).toEqual(["b"]);
  });

  it("rejects an unknown (well-formed) code with 404", async () => {
    const { db } = makeFakeDB();
    const res = await handleShortlistPush(
      db,
      JSON.stringify({ syncCode: "AAAAAAAAAAAAAAAA", items: [item("a")] }),
    );
    expect(res.status).toBe(404);
  });

  it("rejects an oversized body with 413", async () => {
    const { db } = makeFakeDB();
    const huge = "x".repeat(MAX_SYNC_BODY_BYTES + 1);
    const res = await handleShortlistPush(
      db,
      JSON.stringify({ items: [item("a", undefined, huge)] }),
    );
    expect(res.status).toBe(413);
  });

  it("rejects invalid JSON with 400", async () => {
    const { db } = makeFakeDB();
    expect((await handleShortlistPush(db, "not json")).status).toBe(400);
  });

  it("rejects an invalid payload with 400", async () => {
    const { db } = makeFakeDB();
    const res = await handleShortlistPush(db, JSON.stringify({ items: [{ addressKey: 123 }] }));
    expect(res.status).toBe(400);
  });
});

describe("handleShortlistGet", () => {
  it("returns stored items for a known code", async () => {
    const { db } = makeFakeDB();
    const minted = (await handleShortlistPush(db, JSON.stringify({ items: [item("a")] }))).body as {
      syncCode: string;
    };

    const res = await handleShortlistGet(db, minted.syncCode);
    const body = res.body as { items: { addressKey: string }[] };

    expect(res.status).toBe(200);
    expect(body.items.map((i) => i.addressKey)).toEqual(["a"]);
  });

  it("returns 404 for an unknown code", async () => {
    const { db } = makeFakeDB();
    expect((await handleShortlistGet(db, "AAAAAAAAAAAAAAAA")).status).toBe(404);
  });

  it("returns 404 for a malformed code", async () => {
    const { db } = makeFakeDB();
    expect((await handleShortlistGet(db, "bad code")).status).toBe(404);
  });
});
