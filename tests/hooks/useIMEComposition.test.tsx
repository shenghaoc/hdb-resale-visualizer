/**
 * Unit tests for useIMEComposition hook in isolation.
 *
 * Tests composition lifecycle edge cases:
 * - Multiple sequential composition sessions
 * - Compositionend with empty string (cancelled composition)
 * - Rapid composition start/end (single character commit)
 * - Stable handler references across re-renders (useCallback)
 *
 * _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3_
 */
import { describe, expect, it, vi } from "vite-plus/test";
import { renderHook, act } from "@testing-library/react";
import { useIMEComposition } from "@/hooks/useIMEComposition";

/** Helper to create a minimal ChangeEvent-like object */
function makeChangeEvent(value: string) {
  return {
    target: { value },
    currentTarget: { value },
  } as unknown as React.ChangeEvent<HTMLInputElement>;
}

/** Helper to create a minimal CompositionEvent-like object */
function makeCompositionEvent(value: string) {
  return {
    target: { value },
    currentTarget: { value },
    data: value,
  } as unknown as React.CompositionEvent<HTMLInputElement>;
}

describe("useIMEComposition — sequential composition sessions", () => {
  it("multiple composition sessions in sequence each flush correctly", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useIMEComposition(callback));

    // --- Session 1: compose "你好" ---
    act(() => result.current.onCompositionStart());

    // Intermediate onChange events during composition — suppressed
    act(() => result.current.onChange(makeChangeEvent("n")));
    act(() => result.current.onChange(makeChangeEvent("ni")));
    expect(callback).not.toHaveBeenCalled();

    // Commit session 1
    act(() => result.current.onCompositionEnd(makeCompositionEvent("你好")));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("你好");

    callback.mockClear();

    // --- Session 2: compose "世界" ---
    act(() => result.current.onCompositionStart());

    act(() => result.current.onChange(makeChangeEvent("s")));
    act(() => result.current.onChange(makeChangeEvent("sh")));
    act(() => result.current.onChange(makeChangeEvent("shi")));
    expect(callback).not.toHaveBeenCalled();

    // Commit session 2
    act(() => result.current.onCompositionEnd(makeCompositionEvent("你好世界")));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("你好世界");

    callback.mockClear();

    // --- Session 3: compose "東京" ---
    act(() => result.current.onCompositionStart());

    act(() => result.current.onChange(makeChangeEvent("t")));
    expect(callback).not.toHaveBeenCalled();

    act(() => result.current.onCompositionEnd(makeCompositionEvent("東京")));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("東京");
  });

  it("non-composing onChange between sessions passes through", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useIMEComposition(callback));

    // Session 1
    act(() => result.current.onCompositionStart());
    act(() => result.current.onChange(makeChangeEvent("d")));
    act(() => result.current.onCompositionEnd(makeCompositionEvent("大")));
    expect(callback).toHaveBeenCalledTimes(1);
    callback.mockClear();

    // Non-composing input between sessions
    act(() => result.current.onChange(makeChangeEvent("大abc")));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("大abc");
    callback.mockClear();

    // Session 2
    act(() => result.current.onCompositionStart());
    act(() => result.current.onChange(makeChangeEvent("b")));
    act(() => result.current.onCompositionEnd(makeCompositionEvent("大abc巴")));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("大abc巴");
  });
});

describe("useIMEComposition — compositionend with empty string", () => {
  it("invokes callback with empty string when user cancels composition", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useIMEComposition(callback));

    act(() => result.current.onCompositionStart());

    // User types some intermediate characters
    act(() => result.current.onChange(makeChangeEvent("d")));
    act(() => result.current.onChange(makeChangeEvent("da")));
    expect(callback).not.toHaveBeenCalled();

    // User presses Escape or otherwise cancels — compositionend with empty value
    act(() => result.current.onCompositionEnd(makeCompositionEvent("")));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("");
  });
});

describe("useIMEComposition — rapid composition start/end", () => {
  it("single character commit works correctly", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useIMEComposition(callback));

    // Rapid: compositionstart → compositionend with single character (no intermediate onChange)
    act(() => result.current.onCompositionStart());
    act(() => result.current.onCompositionEnd(makeCompositionEvent("你")));

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("你");
  });

  it("single character commit with one intermediate onChange", () => {
    const callback = vi.fn();
    const { result } = renderHook(() => useIMEComposition(callback));

    act(() => result.current.onCompositionStart());
    act(() => result.current.onChange(makeChangeEvent("n")));
    expect(callback).not.toHaveBeenCalled();

    act(() => result.current.onCompositionEnd(makeCompositionEvent("你")));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("你");
  });
});

describe("useIMEComposition — stable handler references (useCallback)", () => {
  it("returns the same handler references across re-renders when callback is stable", () => {
    const callback = vi.fn();
    const { result, rerender } = renderHook(() => useIMEComposition(callback));

    const firstOnCompositionStart = result.current.onCompositionStart;
    const firstOnCompositionEnd = result.current.onCompositionEnd;
    const firstOnChange = result.current.onChange;

    // Re-render with the same callback reference
    rerender();

    expect(result.current.onCompositionStart).toBe(firstOnCompositionStart);
    expect(result.current.onCompositionEnd).toBe(firstOnCompositionEnd);
    expect(result.current.onChange).toBe(firstOnChange);
  });

  it("keeps all handler references stable even when callback reference changes", () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();

    const { result, rerender } = renderHook(({ cb }) => useIMEComposition(cb), {
      initialProps: { cb: callback1 },
    });

    const firstOnCompositionStart = result.current.onCompositionStart;
    const firstOnCompositionEnd = result.current.onCompositionEnd;
    const firstOnChange = result.current.onChange;

    // Re-render with a different callback — handlers must remain stable
    // because the hook uses the "latest ref" pattern (callbackRef)
    rerender({ cb: callback2 });

    expect(result.current.onCompositionStart).toBe(firstOnCompositionStart);
    expect(result.current.onCompositionEnd).toBe(firstOnCompositionEnd);
    expect(result.current.onChange).toBe(firstOnChange);

    // Verify the handlers now invoke the new callback
    act(() => result.current.onChange(makeChangeEvent("test")));
    expect(callback2).toHaveBeenCalledWith("test");
    expect(callback1).not.toHaveBeenCalled();
  });
});
