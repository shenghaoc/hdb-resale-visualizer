import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useLocalShortlist } from "@/features/shortlist/useLocalShortlist";
import { MAX_SHORTLIST_ITEMS, SHORTLIST_STORAGE_KEY } from "@/shared/lib/constants";

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

describe("useLocalShortlist", () => {
  beforeEach(() => {
    clearStorage();
    mockLocation("");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Initialization ---

  it("initialises with an empty list when storage is empty", () => {
    const { result } = renderHook(() => useLocalShortlist());
    expect(result.current.items).toHaveLength(0);
  });

  it("loads persisted items from localStorage on mount", () => {
    const saved = [
      { addressKey: "addr-a", notes: "nice", targetPrice: 500000, addedAt: "2026-01-01T00:00:00Z" },
    ];
    writeStorage(saved);

    const { result } = renderHook(() => useLocalShortlist());
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.addressKey).toBe("addr-a");
  });

  it("handles corrupted localStorage gracefully (returns empty list)", () => {
    window.localStorage.setItem(SHORTLIST_STORAGE_KEY, "not valid json{{{{");

    const { result } = renderHook(() => useLocalShortlist());
    expect(result.current.items).toHaveLength(0);
  });

  // --- URL import ---

  it("loads from URL shortlist param and clears it", () => {
    const items = [
      { addressKey: "addr-url", notes: "", targetPrice: null, addedAt: "2026-01-01T00:00:00Z" },
    ];
    const encoded = Buffer.from(JSON.stringify(items)).toString("base64");

    mockLocation(`?shortlist=${encoded}`);
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    const { result } = renderHook(() => useLocalShortlist());

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.addressKey).toBe("addr-url");
    expect(replaceSpy).toHaveBeenCalled();
  });

  it("merges URL shortlist imports without overwriting saved local entries", () => {
    writeStorage([
      {
        addressKey: "addr-local",
        notes: "keep my notes",
        targetPrice: 500000,
        addedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    const imported = [
      {
        addressKey: "addr-local",
        notes: "incoming notes",
        targetPrice: 600000,
        addedAt: "2026-02-01T00:00:00Z",
      },
      { addressKey: "addr-url", notes: "", targetPrice: null, addedAt: "2026-03-01T00:00:00Z" },
    ];
    const encoded = Buffer.from(JSON.stringify(imported)).toString("base64");
    mockLocation(`?shortlist=${encoded}`);

    const { result } = renderHook(() => useLocalShortlist());

    expect(result.current.items.map((item) => item.addressKey)).toEqual(["addr-local", "addr-url"]);
    expect(result.current.items[0]?.notes).toBe("keep my notes");

    const persisted = JSON.parse(
      window.localStorage.getItem(SHORTLIST_STORAGE_KEY) ?? "[]",
    ) as Array<{
      addressKey: string;
      notes: string;
    }>;
    expect(persisted.map((item) => item.addressKey)).toEqual(["addr-local", "addr-url"]);
    expect(persisted[0]?.notes).toBe("keep my notes");
  });

  it("appends unique imported items and enforces capacity", () => {
    const existing = Array.from({ length: MAX_SHORTLIST_ITEMS - 1 }, (_, index) => ({
      addressKey: `saved-${index}`,
      notes: "",
      targetPrice: null,
      addedAt: "2026-01-01T00:00:00Z",
    }));
    writeStorage(existing);

    const imported = [
      { addressKey: "imported-1", notes: "", targetPrice: null, addedAt: "2026-02-01T00:00:00Z" },
      { addressKey: "imported-2", notes: "", targetPrice: null, addedAt: "2026-02-02T00:00:00Z" },
    ];
    const encoded = Buffer.from(JSON.stringify(imported)).toString("base64");
    mockLocation(`?shortlist=${encoded}`);

    const { result } = renderHook(() => useLocalShortlist());

    expect(result.current.items).toHaveLength(MAX_SHORTLIST_ITEMS);
    expect(result.current.items.some((item) => item.addressKey === "imported-1")).toBe(true);
    expect(result.current.items.some((item) => item.addressKey === "imported-2")).toBe(false);
  });

  it("ignores malformed URL shortlist data", () => {
    mockLocation("?shortlist=not-valid-base64!!!");
    const { result } = renderHook(() => useLocalShortlist());
    expect(result.current.items).toHaveLength(0);
  });

  it("preserves unrelated query parameters when clearing shortlist", () => {
    const items = [
      { addressKey: "addr-url", notes: "", targetPrice: null, addedAt: "2026-01-01T00:00:00Z" },
    ];
    const encoded = Buffer.from(JSON.stringify(items)).toString("base64");
    mockLocation(`?town=BEDOK&shortlist=${encoded}&view=map`);
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    renderHook(() => useLocalShortlist());

    expect(replaceSpy).toHaveBeenCalled();
    const nextUrl = String(replaceSpy.mock.calls[0]?.[2] ?? "");
    expect(nextUrl).toContain("town=BEDOK");
    expect(nextUrl).toContain("view=map");
    expect(nextUrl).not.toContain("shortlist=");
  });

  it("clears to pathname alone when shortlist is the only query parameter", () => {
    const items = [
      { addressKey: "addr-url", notes: "", targetPrice: null, addedAt: "2026-01-01T00:00:00Z" },
    ];
    const encoded = Buffer.from(JSON.stringify(items)).toString("base64");
    mockLocation(`?shortlist=${encoded}`);
    const replaceSpy = vi.spyOn(window.history, "replaceState");

    renderHook(() => useLocalShortlist());

    expect(replaceSpy).toHaveBeenCalledWith({}, "", "/");
  });

  // --- Local actions ---

  it("toggle adds a new item", () => {
    const { result } = renderHook(() => useLocalShortlist());

    act(() => {
      result.current.toggle("addr-new");
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.addressKey).toBe("addr-new");
  });

  it("toggle removes an existing item", () => {
    const { result } = renderHook(() => useLocalShortlist());

    act(() => {
      result.current.toggle("addr-a");
    });
    act(() => {
      result.current.toggle("addr-a");
    });

    expect(result.current.items).toHaveLength(0);
  });

  it("toggle does not exceed MAX_SHORTLIST_ITEMS", () => {
    const { result } = renderHook(() => useLocalShortlist());

    for (let i = 0; i < MAX_SHORTLIST_ITEMS + 5; i++) {
      act(() => {
        result.current.toggle(`addr-${i}`);
      });
    }

    expect(result.current.items).toHaveLength(MAX_SHORTLIST_ITEMS);
  });

  it("restore puts a removed item back at its original position without losing buyer data", () => {
    writeStorage([
      {
        addressKey: "addr-a",
        notes: "legacy notes",
        buyerNotes: "keep exact buyer notes",
        askingPrice: 612345,
        fairRangeMedian: 590000,
        decisionStatus: "viewing booked",
        targetPrice: 600000,
        addedAt: "2026-01-01T00:00:00Z",
      },
      {
        addressKey: "addr-b",
        notes: "second",
        targetPrice: null,
        addedAt: "2026-01-02T00:00:00Z",
      },
    ]);

    const { result } = renderHook(() => useLocalShortlist());
    const removedItem = result.current.items[0]!;

    act(() => {
      result.current.toggle("addr-a");
    });
    act(() => {
      result.current.restore(removedItem, 0);
    });

    expect(result.current.items.map((item) => item.addressKey)).toEqual(["addr-a", "addr-b"]);
    expect(result.current.items[0]).toEqual(removedItem);
  });

  it("restore rejects a duplicate address key", () => {
    writeStorage([
      {
        addressKey: "addr-a",
        notes: "",
        targetPrice: null,
        addedAt: "2026-01-01T00:00:00Z",
      },
    ]);
    const { result } = renderHook(() => useLocalShortlist());
    const existing = result.current.items[0]!;

    act(() => {
      result.current.restore({ ...existing, notes: "duplicate attempt" }, 0);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.notes).toBe("");
  });

  it("restore respects maximum capacity", () => {
    const full = Array.from({ length: MAX_SHORTLIST_ITEMS }, (_, index) => ({
      addressKey: `addr-${index}`,
      notes: "",
      targetPrice: null,
      addedAt: "2026-01-01T00:00:00Z",
    }));
    writeStorage(full);
    const { result } = renderHook(() => useLocalShortlist());

    act(() => {
      result.current.restore(
        {
          addressKey: "overflow",
          notes: "",
          targetPrice: null,
          addedAt: "2026-01-02T00:00:00Z",
        },
        0,
      );
    });

    expect(result.current.items).toHaveLength(MAX_SHORTLIST_ITEMS);
    expect(result.current.items.some((item) => item.addressKey === "overflow")).toBe(false);
  });

  it("update patches a specific item by addressKey", () => {
    const { result } = renderHook(() => useLocalShortlist());

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

  it("update normalizes empty legacy free-text fields", () => {
    const { result } = renderHook(() => useLocalShortlist());

    act(() => {
      result.current.toggle("addr-a");
    });
    act(() => {
      result.current.update("addr-a", {
        pros: "",
        cons: "",
        renovation: "",
        noise: "",
        transport: "",
        agentRemarks: "",
        notes: "",
      });
    });

    const item = result.current.items[0];
    expect(item?.pros).toBeUndefined();
    expect(item?.cons).toBeUndefined();
    expect(item?.renovation).toBeUndefined();
    expect(item?.noise).toBeUndefined();
    expect(item?.transport).toBeUndefined();
    expect(item?.agentRemarks).toBeUndefined();
    expect(item?.notes).toBe("");
  });

  it("has returns true for items in the list", () => {
    const { result } = renderHook(() => useLocalShortlist());

    act(() => {
      result.current.toggle("addr-a");
    });

    expect(result.current.has("addr-a")).toBe(true);
    expect(result.current.has("addr-missing")).toBe(false);
  });

  it("isFull is true when at capacity", () => {
    const { result } = renderHook(() => useLocalShortlist());

    for (let i = 0; i < MAX_SHORTLIST_ITEMS; i++) {
      act(() => {
        result.current.toggle(`addr-${i}`);
      });
    }

    expect(result.current.isFull).toBe(true);
  });

  it("isFull is false when below capacity", () => {
    const { result } = renderHook(() => useLocalShortlist());

    act(() => {
      result.current.toggle("addr-a");
    });

    expect(result.current.isFull).toBe(false);
  });

  it("new item has empty notes and null targetPrice by default", () => {
    const { result } = renderHook(() => useLocalShortlist());

    act(() => {
      result.current.toggle("addr-default");
    });

    const item = result.current.items[0];
    expect(item?.notes).toBe("");
    expect(item?.targetPrice).toBeNull();
  });

  // --- Persistence and sync adapter ---

  it("persists items to localStorage when list changes", () => {
    const { result } = renderHook(() => useLocalShortlist());

    act(() => {
      result.current.toggle("addr-a");
    });

    const raw = window.localStorage.getItem(SHORTLIST_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { addressKey: string }[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.addressKey).toBe("addr-a");
  });

  it("replaceItems replaces local state and updates itemsRef immediately", () => {
    const { result } = renderHook(() => useLocalShortlist());

    const next = [
      {
        addressKey: "from-cloud",
        notes: "synced",
        targetPrice: 700000,
        addedAt: "2026-04-01T00:00:00Z",
      },
    ];

    act(() => {
      result.current.replaceItems(next);
    });

    expect(result.current.items).toEqual(next);
    expect(result.current.itemsRef.current).toEqual(next);
  });

  it("replaceItems is persisted by the normal persistence effect", () => {
    const { result } = renderHook(() => useLocalShortlist());

    const next = [
      {
        addressKey: "persisted-cloud",
        notes: "",
        targetPrice: null,
        addedAt: "2026-04-01T00:00:00Z",
      },
    ];

    act(() => {
      result.current.replaceItems(next);
    });

    const raw = window.localStorage.getItem(SHORTLIST_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as { addressKey: string }[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.addressKey).toBe("persisted-cloud");
  });
});
