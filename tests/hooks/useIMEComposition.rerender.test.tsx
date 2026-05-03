import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useIMEComposition } from "../../src/hooks/useIMEComposition";

function ControlledSearchInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const searchIME = useIMEComposition(onChange);
  return (
    <input
      data-testid="search-input"
      value={searchIME.localValue ?? value}
      onCompositionStart={searchIME.onCompositionStart}
      onCompositionEnd={searchIME.onCompositionEnd}
      onChange={searchIME.onChange}
    />
  );
}

describe("IME Composition — Re-render Bug Fix Verification", () => {
  it("preserves input value during composition even if parent re-renders with old value", () => {
    const callback = vi.fn();
    const { getByTestId, rerender } = render(<ControlledSearchInput value="" onChange={callback} />);
    const input = getByTestId("search-input") as HTMLInputElement;

    // 1. Start composition
    fireEvent.compositionStart(input);

    // 2. Type 'n'.
    fireEvent.change(input, { target: { value: "n" } });
    
    // The hook correctly suppresses the callback.
    expect(callback).not.toHaveBeenCalled();
    // The DOM value is now 'n'.
    expect(input.value).toBe("n");

    // 3. Parent re-renders (e.g. due to background task in App.tsx)
    // We rerender with the SAME value prop ("").
    rerender(<ControlledSearchInput value="" onChange={callback} />);

    // FIX VERIFICATION:
    // Because useIMEComposition now returns localValue='n',
    // ControlledSearchInput renders with value='n'.
    // React does NOT reset the DOM value to "".
    expect(input.value).toBe("n"); 

    // 4. Continue typing 'i'. 
    fireEvent.change(input, { target: { value: "ni" } });
    expect(input.value).toBe("ni");

    // 5. End composition
    fireEvent.compositionEnd(input, { data: "你好" });
    
    // The final value should be "ni" (or whatever was in the input at the time of end)
    // Note: In real browser, compositionEnd might happen with "你好"
    Object.defineProperty(input, "value", { value: "你好", writable: true });
    fireEvent.compositionEnd(input, { data: "你好" });

    expect(callback).toHaveBeenCalledWith("你好");
    
    // After composition ends, localValue is null, so it reverts to using the prop.
    rerender(<ControlledSearchInput value="你好" onChange={callback} />);
    expect(input.value).toBe("你好");
  });
});
