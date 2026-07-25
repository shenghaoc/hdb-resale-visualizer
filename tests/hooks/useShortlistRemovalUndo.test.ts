import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useShortlistRemovalUndo } from "@/features/shortlist/useShortlistRemovalUndo";
import type { ShortlistItem } from "@/types/data";

const firstItem: ShortlistItem = {
  addressKey: "first",
  notes: "legacy",
  buyerNotes: "keep every field",
  askingPrice: 612345,
  targetPrice: 600000,
  addedAt: "2026-07-18T00:00:00.000Z",
};

const secondItem: ShortlistItem = {
  addressKey: "second",
  notes: "second",
  targetPrice: null,
  addedAt: "2026-07-18T01:00:00.000Z",
};

describe("useShortlistRemovalUndo", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("restores the complete pending item and original index", () => {
    const onRemove = vi.fn();
    const onRestore = vi.fn(() => true);
    const { result } = renderHook(() => useShortlistRemovalUndo({ onRemove, onRestore }));

    act(() => {
      result.current.remove({ item: firstItem, index: 3, label: "First" });
    });
    expect(onRemove).toHaveBeenCalledWith("first");

    act(() => {
      result.current.undo();
    });

    expect(onRestore).toHaveBeenCalledWith(firstItem, 3);
    expect(result.current.pendingRemoval).toBeNull();
    expect(result.current.restoreError).toBe(false);
  });

  it("expires the Undo action after five seconds", () => {
    const { result } = renderHook(() =>
      useShortlistRemovalUndo({ onRemove: vi.fn(), onRestore: vi.fn(() => true) }),
    );

    act(() => {
      result.current.remove({ item: firstItem, index: 0, label: "First" });
      vi.advanceTimersByTime(4999);
    });
    expect(result.current.pendingRemoval?.item).toBe(firstItem);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.pendingRemoval).toBeNull();
  });

  it("replaces the pending action when removals repeat", () => {
    const onRestore = vi.fn(() => true);
    const { result } = renderHook(() => useShortlistRemovalUndo({ onRemove: vi.fn(), onRestore }));

    act(() => {
      result.current.remove({ item: firstItem, index: 0, label: "First" });
      result.current.remove({ item: secondItem, index: 1, label: "Second" });
    });
    act(() => {
      result.current.undo();
    });

    expect(onRestore).toHaveBeenCalledOnce();
    expect(onRestore).toHaveBeenCalledWith(secondItem, 1);
  });

  it("keeps the pending removal when capacity blocks restore and allows a retry", () => {
    let hasCapacity = false;
    const onRemove = vi.fn();
    const onRestore = vi.fn(() => hasCapacity);
    const { result } = renderHook(() => useShortlistRemovalUndo({ onRemove, onRestore }));

    act(() => {
      result.current.remove({ item: firstItem, index: 3, label: "First" });
    });
    act(() => {
      result.current.undo();
    });

    expect(result.current.pendingRemoval?.item).toBe(firstItem);
    expect(result.current.restoreError).toBe(true);

    act(() => {
      result.current.remove({ item: secondItem, index: 1, label: "Second" });
    });

    expect(onRemove).toHaveBeenLastCalledWith("second");
    expect(result.current.pendingRemoval?.item).toBe(firstItem);
    expect(result.current.restoreError).toBe(false);

    hasCapacity = true;
    act(() => {
      result.current.undo();
    });

    expect(onRestore).toHaveBeenCalledTimes(2);
    expect(result.current.pendingRemoval).toBeNull();
    expect(result.current.restoreError).toBe(false);
  });
});
