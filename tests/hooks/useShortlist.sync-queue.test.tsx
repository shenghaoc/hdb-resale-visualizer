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
});
