import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useShortlist } from "@/features/shortlist/useShortlist";
import { SHORTLIST_STORAGE_KEY } from "@/shared/lib/constants";

function clearStorage() {
  window.localStorage.clear();
}

function writeStorage(items: object[]) {
  window.localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(items));
}

function mockLocation(search = ""): void {
  Object.defineProperty(window, "location", {
    value: { href: `http://localhost/${search}`, pathname: "/", search },
    writable: true,
  });
}

describe("useShortlist public composition", () => {
  beforeEach(() => {
    clearStorage();
    mockLocation("");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes exactly the public shortlist surface", () => {
    const { result } = renderHook(() => useShortlist());
    const keys = Object.keys(result.current).sort();
    expect(keys).toEqual(["has", "isFull", "items", "restore", "sync", "toggle", "update"]);
    expect(result.current).not.toHaveProperty("itemsRef");
    expect(result.current).not.toHaveProperty("replaceItems");
  });

  it("defaults sync to local with a null code", () => {
    const { result } = renderHook(() => useShortlist());
    expect(result.current.sync.code).toBeNull();
    expect(result.current.sync.status).toBe("local");
  });

  it("loads persisted items through the public hook", () => {
    writeStorage([
      { addressKey: "addr-a", notes: "nice", targetPrice: 500000, addedAt: "2026-01-01T00:00:00Z" },
    ]);

    const { result } = renderHook(() => useShortlist());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.addressKey).toBe("addr-a");
    expect(result.current.has("addr-a")).toBe(true);
  });

  it("delegates local toggle, update, restore, and has", () => {
    const { result } = renderHook(() => useShortlist());

    act(() => {
      result.current.toggle("addr-a");
      result.current.toggle("addr-b");
    });
    act(() => {
      result.current.update("addr-a", { notes: "updated", targetPrice: 750000 });
    });

    const removed = result.current.items[0]!;
    act(() => {
      result.current.toggle("addr-a");
    });
    act(() => {
      result.current.restore(removed, 0);
    });

    expect(result.current.items.map((item) => item.addressKey)).toEqual(["addr-a", "addr-b"]);
    expect(result.current.items[0]?.notes).toBe("updated");
    expect(result.current.items[0]?.targetPrice).toBe(750000);
    expect(result.current.has("addr-a")).toBe(true);
    expect(result.current.has("missing")).toBe(false);
    expect(result.current.isFull).toBe(false);
  });
});
