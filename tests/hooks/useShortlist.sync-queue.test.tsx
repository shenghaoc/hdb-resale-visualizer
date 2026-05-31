import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShortlist } from "@/hooks/useShortlist";
import { SyncRateLimitedError, pullShortlist, pushShortlist } from "@/lib/cloudSync";
import { SYNC_CODE_STORAGE_KEY } from "@/lib/constants";
import { SHORTLIST_SYNC_QUEUE_KEY } from "@/lib/shortlistSyncQueue";

vi.mock("@/lib/cloudSync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cloudSync")>();
  return {
    ...actual,
    pullShortlist: vi.fn(),
    pushShortlist: vi.fn(),
  };
});

const SYNC_CODE = "ABC123abc123ABC1";

function validItem(addressKey: string) {
  return { addressKey, notes: "", targetPrice: null, addedAt: "2026-04-20T00:00:00.000Z" };
}

describe("useShortlist offline sync queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    window.localStorage.setItem(SYNC_CODE_STORAGE_KEY, SYNC_CODE);
    vi.stubGlobal("navigator", { ...navigator, onLine: true });
    vi.mocked(pullShortlist).mockReset();
    vi.mocked(pushShortlist).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("queues a failed hydration push offline and flushes on reconnect", async () => {
    vi.mocked(pullShortlist).mockResolvedValue([validItem("cloud-only")]);
    vi.mocked(pushShortlist)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        syncCode: SYNC_CODE,
        items: [validItem("cloud-only")],
      });

    renderHook(() => useShortlist());

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

  it("backs off and retries when the server returns 429", async () => {
    vi.mocked(pullShortlist).mockResolvedValue([]);
    vi.mocked(pushShortlist).mockResolvedValueOnce({ syncCode: SYNC_CODE, items: [] });

    const { result } = renderHook(() => useShortlist());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    vi.mocked(pushShortlist).mockRejectedValueOnce(new SyncRateLimitedError(2));

    act(() => {
      result.current.toggle("addr-offline");
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
    // enable() mints a brand-new code, so start with no stored code.
    window.localStorage.removeItem(SYNC_CODE_STORAGE_KEY);

    const NEW_CODE = "NEW123abc123ABCD";
    // Default absorbs the reconcile push the debounced effect fires once the
    // freshly minted code activates; the first two calls are scripted below.
    vi.mocked(pushShortlist).mockResolvedValue({ syncCode: NEW_CODE, items: [validItem("local-1")] });
    vi.mocked(pushShortlist)
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ syncCode: NEW_CODE, items: [validItem("local-1")] });

    const { result } = renderHook(() => useShortlist());

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.toggle("local-1");
    });

    // First push (enable) fails "offline" -> coalesced into the queue with a
    // null sync code; no code minted yet.
    await act(async () => {
      await result.current.sync.enable();
      await vi.runAllTimersAsync();
    });

    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBeNull();
    expect(result.current.sync.code).toBeNull();

    // Reconnect: the flush mints the code, persists it, and clears the queue.
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.runAllTimersAsync();
    });

    expect(window.localStorage.getItem(SHORTLIST_SYNC_QUEUE_KEY)).toBeNull();
    expect(window.localStorage.getItem(SYNC_CODE_STORAGE_KEY)).toBe(NEW_CODE);
    expect(result.current.sync.code).toBe(NEW_CODE);
  });
});
