import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  SyncCodeNotFoundError,
  SyncRateLimitedError,
  pullShortlist,
  pushShortlist,
} from "@/features/shortlist/cloudSync";
import { useLocalShortlist } from "@/features/shortlist/useLocalShortlist";
import { useShortlistSync } from "@/features/shortlist/useShortlistSync";
import {
  enqueuePendingShortlistPush,
  SHORTLIST_SYNC_QUEUE_KEY,
} from "@/features/shortlist/shortlistSyncQueue";
import { SHORTLIST_STORAGE_KEY, SYNC_CODE_STORAGE_KEY } from "@/shared/lib/constants";

vi.mock("@/features/shortlist/cloudSync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/shortlist/cloudSync")>();
  return {
    ...actual,
    pullShortlist: vi.fn(),
    pushShortlist: vi.fn(),
  };
});

const SYNC_CODE = "ABC123abc123ABC1";

function validItem(addressKey: string, notes = "") {
  return {
    addressKey,
    notes,
    targetPrice: null as number | null,
    addedAt: "2026-04-20T00:00:00.000Z",
  };
}

function mockLocation(search = ""): void {
  Object.defineProperty(window, "location", {
    value: { href: `http://localhost/${search}`, pathname: "/", search },
    writable: true,
  });
}

/** Compose local store + sync hook the same way `useShortlist` does. */
function useSyncHarness() {
  const local = useLocalShortlist();
  const sync = useShortlistSync({
    items: local.items,
    itemsRef: local.itemsRef,
    replaceItems: local.replaceItems,
  });
  return { local, sync };
}

describe("useShortlistSync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    mockLocation("");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    vi.mocked(pullShortlist).mockReset();
    vi.mocked(pushShortlist).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // --- Default / hydration ---

  it("defaults to local status without a stored code", () => {
    const { result } = renderHook(() => useSyncHarness());
    expect(result.current.sync.code).toBeNull();
    expect(result.current.sync.status).toBe("local");
  });

  it("begins hydration as syncing when a stored code is present", () => {
    window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, SYNC_CODE);
    vi.mocked(pullShortlist).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useSyncHarness());
    expect(result.current.sync.code).toBe(SYNC_CODE);
    expect(result.current.sync.status).toBe("syncing");
  });

  it("hydrates by pulling before pushing and merges cloud with local", async () => {
    window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, SYNC_CODE);
    window.localStorage.setItem(
      SHORTLIST_STORAGE_KEY,
      JSON.stringify([validItem("local-only", "keep me")]),
    );

    const callOrder: string[] = [];
    vi.mocked(pullShortlist).mockImplementation(async () => {
      callOrder.push("pull");
      return [validItem("cloud-only")];
    });
    vi.mocked(pushShortlist).mockImplementation(async (_code, items) => {
      callOrder.push("push");
      return { syncCode: SYNC_CODE, items };
    });

    const { result } = renderHook(() => useSyncHarness());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(callOrder).toEqual(["pull", "push"]);
    expect(vi.mocked(pullShortlist)).toHaveBeenCalledWith(SYNC_CODE);
    const pushedItems = vi.mocked(pushShortlist).mock.calls[0]?.[1] ?? [];
    expect(pushedItems.map((i) => i.addressKey).sort()).toEqual(["cloud-only", "local-only"]);
    expect(result.current.local.items.map((i) => i.addressKey).sort()).toEqual([
      "cloud-only",
      "local-only",
    ]);
    expect(result.current.local.items.find((i) => i.addressKey === "local-only")?.notes).toBe(
      "keep me",
    );
    expect(result.current.sync.status).toBe("synced");
  });

  it("never pushes stale local state before hydration completes", async () => {
    window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, SYNC_CODE);
    window.localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify([validItem("stale-local")]));

    let resolvePull!: (items: ReturnType<typeof validItem>[]) => void;
    vi.mocked(pullShortlist).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePull = resolve;
        }),
    );
    vi.mocked(pushShortlist).mockResolvedValue({
      syncCode: SYNC_CODE,
      items: [validItem("cloud-only")],
    });

    renderHook(() => useSyncHarness());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    // Debounce window elapsed while hydration is still waiting on pull.
    expect(vi.mocked(pushShortlist)).not.toHaveBeenCalled();

    await act(async () => {
      resolvePull([validItem("cloud-only")]);
      await vi.runAllTimersAsync();
    });

    expect(vi.mocked(pushShortlist)).toHaveBeenCalledTimes(1);
    const pushed = vi.mocked(pushShortlist).mock.calls[0]?.[1] ?? [];
    expect(pushed.map((i) => i.addressKey).sort()).toEqual(["cloud-only", "stale-local"]);
  });

  it("drops a missing stored code back to local", async () => {
    window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, SYNC_CODE);
    vi.mocked(pullShortlist).mockRejectedValue(new SyncCodeNotFoundError());

    const { result } = renderHook(() => useSyncHarness());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.sync.code).toBeNull();
    expect(result.current.sync.status).toBe("local");
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBeNull();
  });

  // --- enable ---

  it("enable mints and persists a code", async () => {
    const NEW_CODE = "NEW123abc123ABCD";
    vi.mocked(pushShortlist).mockResolvedValue({
      syncCode: NEW_CODE,
      items: [validItem("local-1")],
    });

    const { result } = renderHook(() => useSyncHarness());

    act(() => {
      result.current.local.toggle("local-1");
    });

    await act(async () => {
      await result.current.sync.enable();
    });

    expect(result.current.sync.code).toBe(NEW_CODE);
    expect(result.current.sync.status).toBe("synced");
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBe(NEW_CODE);
    expect(vi.mocked(pushShortlist)).toHaveBeenCalledWith(
      null,
      expect.arrayContaining([expect.objectContaining({ addressKey: "local-1" })]),
    );
  });

  it("enable queues payload on retriable failure", async () => {
    vi.mocked(pushShortlist).mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useSyncHarness());

    act(() => {
      result.current.local.toggle("local-1");
    });

    await act(async () => {
      await result.current.sync.enable();
    });

    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBeNull();
    expect(result.current.sync.code).toBeNull();
    expect(result.current.sync.status).toBe("synced");
  });

  it("enable throws and surfaces error for non-retriable failures", async () => {
    vi.mocked(pushShortlist).mockRejectedValue(new Error("Sync failed (400)"));

    const { result } = renderHook(() => useSyncHarness());

    act(() => {
      result.current.local.toggle("local-1");
    });

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.sync.enable();
      } catch (error) {
        thrown = error;
      }
    });

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("Sync failed (400)");
    expect(result.current.sync.status).toBe("error");
    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).toBeNull();
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBeNull();
  });

  it("enable queues payload on rate limit", async () => {
    vi.mocked(pushShortlist).mockRejectedValue(new SyncRateLimitedError(2));

    const { result } = renderHook(() => useSyncHarness());

    act(() => {
      result.current.local.toggle("local-1");
    });

    await act(async () => {
      await result.current.sync.enable();
    });

    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).not.toBeNull();
    expect(result.current.sync.status).toBe("synced");
  });

  // --- link ---

  it("link pulls, merges, applies, then pushes", async () => {
    window.localStorage.setItem(
      SHORTLIST_STORAGE_KEY,
      JSON.stringify([validItem("local-only", "mine")]),
    );

    const callOrder: string[] = [];
    vi.mocked(pullShortlist).mockImplementation(async () => {
      callOrder.push("pull");
      return [validItem("cloud-only")];
    });
    vi.mocked(pushShortlist).mockImplementation(async (code, items) => {
      callOrder.push("push");
      return { syncCode: code ?? SYNC_CODE, items };
    });

    const { result } = renderHook(() => useSyncHarness());

    await act(async () => {
      await result.current.sync.link(SYNC_CODE);
    });

    // link() itself always pull-then-push; a subsequent debounced reconcile push
    // may follow after ready becomes true (same as production).
    expect(callOrder[0]).toBe("pull");
    expect(callOrder[1]).toBe("push");
    expect(vi.mocked(pullShortlist)).toHaveBeenCalledWith(SYNC_CODE);
    const firstPushItems = vi.mocked(pushShortlist).mock.calls[0]?.[1] ?? [];
    expect(firstPushItems.map((i) => i.addressKey).sort()).toEqual(["cloud-only", "local-only"]);
    expect(result.current.sync.code).toBe(SYNC_CODE);
    expect(result.current.sync.status).toBe("synced");
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBe(SYNC_CODE);
    expect(result.current.local.items.map((i) => i.addressKey).sort()).toEqual([
      "cloud-only",
      "local-only",
    ]);
    expect(result.current.local.items.find((i) => i.addressKey === "local-only")?.notes).toBe(
      "mine",
    );
  });

  it("link pull failure rejects and does not save the code", async () => {
    vi.mocked(pullShortlist).mockRejectedValue(new SyncCodeNotFoundError());

    const { result } = renderHook(() => useSyncHarness());

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.sync.link(SYNC_CODE);
      } catch (error) {
        thrown = error;
      }
    });

    expect(thrown).toBeInstanceOf(SyncCodeNotFoundError);
    expect(result.current.sync.code).toBeNull();
    expect(result.current.sync.status).toBe("error");
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBeNull();
    expect(vi.mocked(pushShortlist)).not.toHaveBeenCalled();
  });

  it("link push failure queues the merged payload when retriable", async () => {
    window.localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify([validItem("local-only")]));
    vi.mocked(pullShortlist).mockResolvedValue([validItem("cloud-only")]);
    vi.mocked(pushShortlist).mockRejectedValue(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useSyncHarness());

    await act(async () => {
      await result.current.sync.link(SYNC_CODE);
    });

    expect(result.current.sync.code).toBe(SYNC_CODE);
    expect(result.current.sync.status).toBe("synced");
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBe(SYNC_CODE);
    // link() attempted the merged payload before enqueueing on retriable failure.
    const firstPushItems = vi.mocked(pushShortlist).mock.calls[0]?.[1] ?? [];
    expect(firstPushItems.map((i) => i.addressKey).sort()).toEqual(["cloud-only", "local-only"]);
    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).not.toBeNull();
    const queued = JSON.parse(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)!);
    expect(queued.syncCode).toBe(SYNC_CODE);
  });

  // --- Debounced push ---

  it("debounced local changes push after 1000 ms and skip unchanged snapshots", async () => {
    window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, SYNC_CODE);
    vi.mocked(pullShortlist).mockResolvedValue([]);
    vi.mocked(pushShortlist).mockImplementation(async (code, items) => ({
      syncCode: code ?? SYNC_CODE,
      items,
    }));

    const { result } = renderHook(() => useSyncHarness());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const pushesAfterHydration = vi.mocked(pushShortlist).mock.calls.length;
    expect(pushesAfterHydration).toBe(1);

    act(() => {
      result.current.local.toggle("addr-new");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(999);
    });
    expect(vi.mocked(pushShortlist).mock.calls.length).toBe(pushesAfterHydration);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(vi.mocked(pushShortlist).mock.calls.length).toBe(pushesAfterHydration + 1);

    // Unchanged snapshot after success must not push again.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(vi.mocked(pushShortlist).mock.calls.length).toBe(pushesAfterHydration + 1);
  });

  // --- Offline queue / reconnect ---

  it("queues a failed hydration push offline and flushes on reconnect", async () => {
    window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, SYNC_CODE);

    vi.mocked(pullShortlist).mockResolvedValue([validItem("cloud-only")]);
    vi.mocked(pushShortlist)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        syncCode: SYNC_CODE,
        items: [validItem("cloud-only")],
      });

    renderHook(() => useSyncHarness());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.runAllTimersAsync();
    });

    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).toBeNull();
    expect(vi.mocked(pushShortlist).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("defers null-code queue flush while offline and mints on reconnect", async () => {
    // enable() mint path: queue has syncCode null and ready is still false, so
    // the debounced push path cannot run — only flushPendingPush can mint.
    const NEW_CODE = "OFF123abc123ABCD";
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });

    vi.mocked(pushShortlist)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue({
        syncCode: NEW_CODE,
        items: [validItem("local-1")],
      });

    const { result } = renderHook(() => useSyncHarness());

    act(() => {
      result.current.local.toggle("local-1");
    });

    await act(async () => {
      await result.current.sync.enable();
    });

    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).not.toBeNull();
    expect(result.current.sync.code).toBeNull();
    const pushesWhileQueued = vi.mocked(pushShortlist).mock.calls.length;

    // Offline: queue flush must wait.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(vi.mocked(pushShortlist).mock.calls.length).toBe(pushesWhileQueued);
    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBeNull();

    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.runAllTimersAsync();
    });

    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).toBeNull();
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBe(NEW_CODE);
    expect(result.current.sync.code).toBe(NEW_CODE);
    expect(vi.mocked(pushShortlist).mock.calls.length).toBeGreaterThan(pushesWhileQueued);
  });

  it("backs off and retries when the server returns 429", async () => {
    window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, SYNC_CODE);

    vi.mocked(pullShortlist).mockResolvedValue([]);
    vi.mocked(pushShortlist).mockResolvedValueOnce({ syncCode: SYNC_CODE, items: [] });

    const { result } = renderHook(() => useSyncHarness());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    vi.mocked(pushShortlist).mockRejectedValueOnce(new SyncRateLimitedError(2));

    act(() => {
      result.current.local.toggle("addr-offline");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).not.toBeNull();

    vi.mocked(pushShortlist).mockResolvedValueOnce({
      syncCode: SYNC_CODE,
      items: [validItem("addr-offline")],
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).toBeNull();
    expect(vi.mocked(pushShortlist).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("queues an offline enable() and mints a code on reconnect flush", async () => {
    const NEW_CODE = "NEW123abc123ABCD";
    const mockedPushShortlist = vi.mocked(pushShortlist);

    mockedPushShortlist.mockResolvedValue({
      syncCode: NEW_CODE,
      items: [validItem("local-1")],
    });
    mockedPushShortlist
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ syncCode: NEW_CODE, items: [validItem("local-1")] });

    const { result } = renderHook(() => useSyncHarness());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.local.toggle("local-1");
    });

    await act(async () => {
      await result.current.sync.enable();
      await vi.runAllTimersAsync();
    });

    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBeNull();
    expect(result.current.sync.code).toBeNull();

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.runAllTimersAsync();
    });

    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).toBeNull();
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBe(NEW_CODE);
    expect(result.current.sync.code).toBe(NEW_CODE);
  });

  it("defers existing-code queue flush until hydration completes", async () => {
    window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, SYNC_CODE);
    enqueuePendingShortlistPush(SYNC_CODE, [validItem("queued")]);

    let resolvePull!: (items: ReturnType<typeof validItem>[]) => void;
    vi.mocked(pullShortlist).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePull = resolve;
        }),
    );
    vi.mocked(pushShortlist).mockResolvedValue({
      syncCode: SYNC_CODE,
      items: [validItem("cloud")],
    });

    renderHook(() => useSyncHarness());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    // Queue must not flush while hydration is pending.
    expect(vi.mocked(pushShortlist)).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).not.toBeNull();

    await act(async () => {
      resolvePull([validItem("cloud")]);
      await vi.runAllTimersAsync();
    });

    // Successful hydration clears the queue itself.
    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).toBeNull();
    expect(vi.mocked(pushShortlist)).toHaveBeenCalledTimes(1);
  });

  it("does not clear newer queued data after an older in-flight flush", async () => {
    // No stored code: flush path for null-code queue (enable mint) can run
    // without waiting on hydration.
    const NEW_CODE = "NEW123abc123ABCD";
    let resolveFirst!: (value: { syncCode: string; items: ReturnType<typeof validItem>[] }) => void;
    let callCount = 0;
    vi.mocked(pushShortlist).mockImplementation((code, items) => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve({
        syncCode: code ?? NEW_CODE,
        items,
      });
    });

    enqueuePendingShortlistPush(null, [validItem("old")]);

    renderHook(() => useSyncHarness());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // First flush is in flight with "old". Overwrite queue with newer payload.
    enqueuePendingShortlistPush(null, [validItem("new")]);

    await act(async () => {
      resolveFirst({ syncCode: "OLD123abc123ABCD", items: [validItem("old")] });
      await vi.runAllTimersAsync();
    });

    // Newer payload should have been re-flushed and cleared; not lost.
    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).toBeNull();
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBe(NEW_CODE);
    const pushedAddressKeys = vi
      .mocked(pushShortlist)
      .mock.calls.map((call) => call[1]?.[0]?.addressKey);
    expect(pushedAddressKeys).toContain("new");
  });

  it("does not resurrect sync after disable cancels an in-flight queue flush", async () => {
    const NEW_CODE = "NEW123abc123ABCD";
    let resolvePush!: (value: { syncCode: string; items: ReturnType<typeof validItem>[] }) => void;
    vi.mocked(pushShortlist).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePush = resolve;
        }),
    );
    enqueuePendingShortlistPush(null, [validItem("queued")]);

    const { result } = renderHook(() => useSyncHarness());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.mocked(pushShortlist)).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.sync.disable();
    });

    await act(async () => {
      resolvePush({ syncCode: NEW_CODE, items: [validItem("queued")] });
      await vi.runAllTimersAsync();
    });

    expect(result.current.sync.code).toBeNull();
    expect(result.current.sync.status).toBe("local");
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBeNull();
    expect(result.current.local.items).toEqual([]);
  });

  it("ignores an in-flight enable after disable", async () => {
    const NEW_CODE = "NEW123abc123ABCD";
    let resolvePush!: (value: { syncCode: string; items: ReturnType<typeof validItem>[] }) => void;
    vi.mocked(pushShortlist).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePush = resolve;
        }),
    );

    const { result } = renderHook(() => useSyncHarness());
    let enablePromise!: Promise<void>;
    await act(async () => {
      enablePromise = result.current.sync.enable();
      await Promise.resolve();
    });

    act(() => {
      result.current.sync.disable();
    });

    await act(async () => {
      resolvePush({ syncCode: NEW_CODE, items: [] });
      await enablePromise;
    });

    expect(result.current.sync.code).toBeNull();
    expect(result.current.sync.status).toBe("local");
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBeNull();
  });

  // --- disable / cleanup / cancellation ---

  it("disable removes the code but leaves local items untouched", async () => {
    window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, SYNC_CODE);
    window.localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify([validItem("keep-me")]));
    vi.mocked(pullShortlist).mockResolvedValue([validItem("keep-me")]);
    vi.mocked(pushShortlist).mockResolvedValue({
      syncCode: SYNC_CODE,
      items: [validItem("keep-me")],
    });

    const { result } = renderHook(() => useSyncHarness());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.local.items).toHaveLength(1);

    await act(async () => {
      result.current.sync.disable();
    });

    expect(result.current.sync.code).toBeNull();
    expect(result.current.sync.status).toBe("local");
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBeNull();
    expect(result.current.local.items.map((i) => i.addressKey)).toEqual(["keep-me"]);
  });

  it("unmount clears the rate-limit retry timer", async () => {
    window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, SYNC_CODE);
    vi.mocked(pullShortlist).mockResolvedValue([]);
    vi.mocked(pushShortlist).mockResolvedValueOnce({ syncCode: SYNC_CODE, items: [] });

    const { result, unmount } = renderHook(() => useSyncHarness());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    vi.mocked(pushShortlist).mockRejectedValueOnce(new SyncRateLimitedError(5));

    act(() => {
      result.current.local.toggle("addr-rl");
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).not.toBeNull();
    const pushesBeforeUnmount = vi.mocked(pushShortlist).mock.calls.length;

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    // Retry timer was cleared on unmount — no additional flush push.
    expect(vi.mocked(pushShortlist).mock.calls.length).toBe(pushesBeforeUnmount);
  });

  it("ignores stale/cancelled async hydration results after unmount", async () => {
    window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, SYNC_CODE);

    let resolvePull!: (items: ReturnType<typeof validItem>[]) => void;
    vi.mocked(pullShortlist).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePull = resolve;
        }),
    );
    vi.mocked(pushShortlist).mockResolvedValue({
      syncCode: SYNC_CODE,
      items: [validItem("cloud")],
    });

    const { unmount } = renderHook(() => useSyncHarness());

    unmount();

    await act(async () => {
      resolvePull([validItem("cloud")]);
      await vi.runAllTimersAsync();
    });

    // Cancelled path must not push or clear storage.
    expect(vi.mocked(pushShortlist)).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBe(SYNC_CODE);
  });
});
