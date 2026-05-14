import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useShortlist } from "@/hooks/useShortlist";
import { MAX_SHORTLIST_ITEMS, SHORTLIST_STORAGE_KEY } from "@/lib/constants";

// Control localStorage through the jsdom environment directly
function clearStorage() {
  window.localStorage.clear();
}

function writeStorage(items: object[]) {
  window.localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(items));
}

describe("useShortlist", () => {
  beforeEach(() => {
    clearStorage();
    // Reset URL to plain pathname
    Object.defineProperty(window, "location", {
      value: { search: "", pathname: "/" },
      writable: true,
    });
  });

  it("initialises with an empty list when storage is empty", () => {
    const { result } = renderHook(() => useShortlist());
    expect(result.current.items).toHaveLength(0);
  });

  it("loads persisted items from localStorage on mount", () => {
    const saved = [
      { addressKey: "addr-a", notes: "nice", targetPrice: 500000, addedAt: "2026-01-01T00:00:00Z" },
    ];
    writeStorage(saved);

    const { result } = renderHook(() => useShortlist());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.addressKey).toBe("addr-a");
  });

  it("handles corrupted localStorage gracefully (returns empty list)", () => {
    window.localStorage.setItem(SHORTLIST_STORAGE_KEY, "not valid json{{{{");

    const { result } = renderHook(() => useShortlist());
    expect(result.current.items).toHaveLength(0);
  });

  it("toggle adds a new item", () => {
    const { result } = renderHook(() => useShortlist());

    act(() => {
      result.current.toggle("addr-new");
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.addressKey).toBe("addr-new");
  });

  it("toggle removes an existing item", () => {
    const { result } = renderHook(() => useShortlist());

    act(() => {
      result.current.toggle("addr-a");
    });
    act(() => {
      result.current.toggle("addr-a");
    });

    expect(result.current.items).toHaveLength(0);
  });

  it("toggle does not exceed MAX_SHORTLIST_ITEMS", () => {
    const { result } = renderHook(() => useShortlist());

    for (let i = 0; i < MAX_SHORTLIST_ITEMS + 5; i++) {
      act(() => {
        result.current.toggle(`addr-${i}`);
      });
    }

    expect(result.current.items).toHaveLength(MAX_SHORTLIST_ITEMS);
  });

  it("isFull is true when at capacity", () => {
    const { result } = renderHook(() => useShortlist());

    for (let i = 0; i < MAX_SHORTLIST_ITEMS; i++) {
      act(() => {
        result.current.toggle(`addr-${i}`);
      });
    }

    expect(result.current.isFull).toBe(true);
  });

  it("isFull is false when below capacity", () => {
    const { result } = renderHook(() => useShortlist());

    act(() => {
      result.current.toggle("addr-a");
    });

    expect(result.current.isFull).toBe(false);
  });

  it("update patches a specific item by addressKey", () => {
    const { result } = renderHook(() => useShortlist());

    act(() => {
      result.current.toggle("addr-a");
    });
    act(() => {
      result.current.update("addr-a", { notes: "great view", targetPrice: 750000 });
    });

    const item = result.current.items.find((i) => i.addressKey === "addr-a");
    expect(item?.notes).toBe("great view");
    expect(item?.targetPrice).toBe(750000);
  });

  it("update does not affect other items", () => {
    const { result } = renderHook(() => useShortlist());

    act(() => {
      result.current.toggle("addr-a");
      result.current.toggle("addr-b");
    });
    act(() => {
      result.current.update("addr-a", { notes: "updated" });
    });

    const itemB = result.current.items.find((i) => i.addressKey === "addr-b");
    expect(itemB?.notes).toBe("");
  });

  it("has returns true for items in the list", () => {
    const { result } = renderHook(() => useShortlist());

    act(() => {
      result.current.toggle("addr-a");
    });

    expect(result.current.has("addr-a")).toBe(true);
    expect(result.current.has("addr-missing")).toBe(false);
  });

  it("persists items to localStorage when list changes", () => {
    const { result } = renderHook(() => useShortlist());

    act(() => {
      result.current.toggle("addr-a");
    });

    const raw = window.localStorage.getItem(SHORTLIST_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { addressKey: string }[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.addressKey).toBe("addr-a");
  });

  it("loads from URL shortlist param and clears it", () => {
    // Encode a shortlist item in the URL
    const items = [
      { addressKey: "addr-url", notes: "", targetPrice: null, addedAt: "2026-01-01T00:00:00Z" },
    ];
    const encoded = Buffer.from(JSON.stringify(items)).toString("base64");

    const replaceSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { search: `?shortlist=${encoded}`, pathname: "/" },
      writable: true,
    });
    Object.defineProperty(window, "history", {
      value: { replaceState: replaceSpy },
      writable: true,
    });

    const { result } = renderHook(() => useShortlist());

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.addressKey).toBe("addr-url");
    expect(replaceSpy).toHaveBeenCalled();
  });

  it("new item has empty notes and null targetPrice by default", () => {
    const { result } = renderHook(() => useShortlist());

    act(() => {
      result.current.toggle("addr-default");
    });

    const item = result.current.items[0];
    expect(item?.notes).toBe("");
    expect(item?.targetPrice).toBeNull();
  });
});
