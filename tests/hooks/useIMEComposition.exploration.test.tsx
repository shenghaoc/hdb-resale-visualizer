/**
 * Bug Condition Exploration Test — IME Composition Input Handling
 *
 * These tests encode the EXPECTED behavior: onChange callbacks should NOT fire
 * during active IME composition. They are designed to FAIL on unfixed code,
 * proving the bug exists (callbacks fire on every intermediate keystroke).
 *
 * Bug Condition (C): An onChange event fires on an input element while an IME
 * composition session is active (compositionstart has fired but compositionend has not).
 *
 * Property (P): During active composition, no state update callback is invoked.
 * On compositionend, the final committed value is propagated exactly once.
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3
 */
import { describe, expect, it, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import React from "react";

// ---------------------------------------------------------------------------
// Test components that use the useIMEComposition hook to validate the fix.
// These mirror how FilterPanel, ShortlistDrawer notes, and ShortlistDrawer
// target price now work with composition-aware event handlers.
// ---------------------------------------------------------------------------
import { useIMEComposition } from "../../src/hooks/useIMEComposition";

function SearchInput({ onChange }: { onChange: (value: string) => void }) {
  const imeHandlers = useIMEComposition(onChange);
  return (
    <input
      data-testid="search-input"
      onCompositionStart={imeHandlers.onCompositionStart}
      onCompositionEnd={imeHandlers.onCompositionEnd}
      onChange={imeHandlers.onChange}
    />
  );
}

function NotesTextarea({ onUpdate }: { onUpdate: (value: string) => void }) {
  const imeHandlers = useIMEComposition(onUpdate);
  return (
    <textarea
      data-testid="notes-textarea"
      onCompositionStart={imeHandlers.onCompositionStart}
      onCompositionEnd={imeHandlers.onCompositionEnd}
      onChange={imeHandlers.onChange}
    />
  );
}

function PriceInput({ onUpdate }: { onUpdate: (value: string) => void }) {
  const imeHandlers = useIMEComposition(onUpdate);
  return (
    <input
      data-testid="price-input"
      type="number"
      onCompositionStart={imeHandlers.onCompositionStart}
      onCompositionEnd={imeHandlers.onCompositionEnd}
      onChange={imeHandlers.onChange}
    />
  );
}

describe("Bug Condition Exploration: IME Composition Fires State Updates", () => {
  /**
   * Test 1: Single intermediate keystroke during composition
   *
   * Simulates compositionstart → onChange("d") on a search input.
   * EXPECTED: callback is NOT called during composition.
   * BUG: callback IS called with "d" (intermediate Pinyin keystroke).
   */
  it("search input: callback should NOT fire during active IME composition", () => {
    const callback = vi.fn();
    const { getByTestId } = render(<SearchInput onChange={callback} />);
    const input = getByTestId("search-input");

    // Start IME composition
    fireEvent.compositionStart(input);

    // Simulate intermediate onChange with partial Pinyin "d"
    fireEvent.change(input, { target: { value: "d" } });

    // EXPECTED: callback should NOT have been called during composition
    expect(callback).not.toHaveBeenCalled();
  });

  /**
   * Test 2: Full Pinyin sequence — compositionstart → intermediate keystrokes → compositionend
   *
   * Simulates typing "大巴窑" (Toa Payoh) via Pinyin IME:
   *   compositionstart → onChange("d") → onChange("da") → onChange("dab") → compositionend("大巴窑")
   *
   * EXPECTED: callback called exactly once with "大巴窑" (the committed value).
   * BUG: callback called 3 times with "d", "da", "dab" (intermediate values).
   */
  it("search input: full Pinyin sequence should fire callback exactly once with committed value", () => {
    const callback = vi.fn();
    const { getByTestId } = render(<SearchInput onChange={callback} />);
    const input = getByTestId("search-input");

    // Start IME composition
    fireEvent.compositionStart(input);

    // Intermediate keystrokes (Pinyin romanization)
    fireEvent.change(input, { target: { value: "d" } });
    fireEvent.change(input, { target: { value: "da" } });
    fireEvent.change(input, { target: { value: "dab" } });

    // No callbacks should have fired yet
    expect(callback).not.toHaveBeenCalled();

    // User commits the composed text
    // Simulate browser setting the input value to committed text before compositionend
    Object.defineProperty(input, "value", { value: "大巴窑", writable: true });
    fireEvent.compositionEnd(input, { data: "大巴窑" });

    // EXPECTED: callback called exactly once with the committed value
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("大巴窑");
  });

  /**
   * Test 3: Notes textarea — composition should suppress onUpdate
   *
   * Simulates IME composition on a textarea (mirroring ShortlistDrawer notes).
   * EXPECTED: onUpdate is NOT called during composition.
   * BUG: onUpdate IS called on every intermediate keystroke.
   */
  it("notes textarea: onUpdate should NOT fire during active IME composition", () => {
    const onUpdate = vi.fn();
    const { getByTestId } = render(<NotesTextarea onUpdate={onUpdate} />);
    const textarea = getByTestId("notes-textarea");

    // Start IME composition
    fireEvent.compositionStart(textarea);

    // Intermediate keystrokes
    fireEvent.change(textarea, { target: { value: "h" } });
    fireEvent.change(textarea, { target: { value: "ha" } });

    // EXPECTED: onUpdate should NOT have been called during composition
    expect(onUpdate).not.toHaveBeenCalled();
  });

  /**
   * Test 4: Target price number input — composition should suppress onUpdate
   *
   * Simulates IME composition on a number input (mirroring ShortlistDrawer target price).
   * Some mobile IME keyboards can briefly enter composition mode even for numbers.
   * EXPECTED: onUpdate is NOT called during composition.
   * BUG: onUpdate IS called on every intermediate keystroke.
   */
  it("target price input: onUpdate should NOT fire during active IME composition", () => {
    const onUpdate = vi.fn();
    const { getByTestId } = render(<PriceInput onUpdate={onUpdate} />);
    const input = getByTestId("price-input");

    // Start IME composition (some mobile IMEs do this for number input)
    fireEvent.compositionStart(input);

    // Intermediate keystroke
    fireEvent.change(input, { target: { value: "5" } });

    // EXPECTED: onUpdate should NOT have been called during composition
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
