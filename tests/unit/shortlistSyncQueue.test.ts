import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  SHORTLIST_SYNC_QUEUE_KEY,
  clearPendingShortlistPush,
  enqueuePendingShortlistPush,
  hasPendingShortlistPush,
  readPendingShortlistPush,
} from "@/features/shortlist/shortlistSyncQueue";

function validItem(addressKey: string) {
  return { addressKey, notes: "", targetPrice: null, addedAt: "2026-04-20T00:00:00.000Z" };
}

describe("shortlistSyncQueue", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("coalesces multiple enqueues to the latest snapshot", () => {
    enqueuePendingShortlistPush("CODE123abc123ABC1", [validItem("a")]);
    enqueuePendingShortlistPush("CODE123abc123ABC1", [validItem("b")]);

    const pending = readPendingShortlistPush();
    expect(pending?.items.map((item) => item.addressKey)).toEqual(["b"]);
  });

  it("clears the queue after clearPendingShortlistPush", () => {
    enqueuePendingShortlistPush(null, [validItem("a")]);
    expect(hasPendingShortlistPush()).toBe(true);
    clearPendingShortlistPush();
    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).toBeNull();
    expect(hasPendingShortlistPush()).toBe(false);
  });

  it("returns null for corrupted queue payloads", () => {
    window.localStorage.setItem(SHORTLIST_SYNC_QUEUE_KEY, "{not valid");
    expect(readPendingShortlistPush()).toBeNull();
  });

  it("returns null for valid JSON that fails the schema", () => {
    // `items` must be an array — a type mismatch should be rejected by Zod,
    // not surfaced as a malformed pending push.
    window.localStorage.setItem(
      SHORTLIST_SYNC_QUEUE_KEY,
      JSON.stringify({ syncCode: "CODE123abc123ABC1", items: "not-an-array" }),
    );
    expect(readPendingShortlistPush()).toBeNull();
  });
});
