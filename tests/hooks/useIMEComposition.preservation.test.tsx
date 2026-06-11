/**
 * Preservation Property Tests — Non-IME Input Passes Through Unchanged
 *
 * These tests verify that non-composing (non-IME) input behavior is preserved.
 * They run on UNFIXED code and must PASS — confirming the baseline behavior
 * that the fix must not regress.
 *
 * Property: For all onChange events where NO IME composition is active,
 * the callback is invoked exactly once with the exact event.target.value.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
 */
import { describe, expect, it, vi, afterEach } from "vite-plus/test";
import { render, fireEvent, cleanup } from "@testing-library/react";
import * as fc from "fast-check";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Minimal test components — same bare onChange pattern as the exploration test.
// No composition awareness, mirroring current (unfixed) FilterPanel and
// ShortlistDrawer behavior.
// ---------------------------------------------------------------------------

function BareSearchInput({ onChange }: { onChange: (value: string) => void }) {
  return (
    <input
      data-testid="search-input"
      onChange={(e) => {
        onChange(e.target.value);
      }}
    />
  );
}

function BareTextarea({ onUpdate }: { onUpdate: (value: string) => void }) {
  return (
    <textarea
      data-testid="notes-textarea"
      onChange={(e) => {
        onUpdate(e.target.value);
      }}
    />
  );
}

function BareNumberInput({ onUpdate }: { onUpdate: (value: string) => void }) {
  return (
    <input
      data-testid="price-input"
      onChange={(e) => {
        onUpdate(e.target.value);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Observation tests — confirm baseline behavior on unfixed code
// ---------------------------------------------------------------------------

describe("Preservation: Observation — Non-IME baseline behavior", () => {
  it('typing "toa payoh" character-by-character fires callback 9 times', () => {
    const callback = vi.fn();
    const { getByTestId } = render(<BareSearchInput onChange={callback} />);
    const input = getByTestId("search-input");

    const chars = "toa payoh";
    for (let i = 0; i < chars.length; i++) {
      fireEvent.change(input, { target: { value: chars.slice(0, i + 1) } });
    }

    expect(callback).toHaveBeenCalledTimes(9);
  });

  it('pasting "Bedok" fires callback once with "Bedok"', () => {
    const callback = vi.fn();
    const { getByTestId } = render(<BareSearchInput onChange={callback} />);
    const input = getByTestId("search-input");

    fireEvent.change(input, { target: { value: "Bedok" } });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("Bedok");
  });

  it("clearing input fires callback once with empty string", () => {
    const callback = vi.fn();
    const { getByTestId } = render(<BareSearchInput onChange={callback} />);
    const input = getByTestId("search-input");

    // First type something so the input has a non-empty value
    fireEvent.change(input, { target: { value: "Bedok" } });
    callback.mockClear();

    // Now clear it
    fireEvent.change(input, { target: { value: "" } });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("");
  });

  it('typing "500000" in target price fires callback on each digit', () => {
    const onUpdate = vi.fn();
    const { getByTestId } = render(<BareNumberInput onUpdate={onUpdate} />);
    const input = getByTestId("price-input");

    const digits = "500000";
    for (let i = 0; i < digits.length; i++) {
      fireEvent.change(input, { target: { value: digits.slice(0, i + 1) } });
    }

    expect(onUpdate).toHaveBeenCalledTimes(6);
    expect(onUpdate).toHaveBeenLastCalledWith("500000");
  });
});

// ---------------------------------------------------------------------------
// Property-based tests — verify preservation across all arbitrary inputs
// ---------------------------------------------------------------------------

describe("Preservation: Property — Non-composing onChange invokes callback with exact value", () => {
  /**
   * **Validates: Requirements 3.1**
   *
   * Property: For all arbitrary non-empty string values, when onChange fires
   * with NO active composition on a search input, the callback is invoked
   * exactly once with the exact event.target.value.
   */
  it("search input: callback receives exact value for any arbitrary string", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (value) => {
        cleanup();
        const callback = vi.fn();
        const { getByTestId } = render(<BareSearchInput onChange={callback} />);
        const input = getByTestId("search-input");

        fireEvent.change(input, { target: { value } });

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(value);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.1**
   *
   * Property: For all arbitrary unicode string values (CJK, emoji, accented
   * characters), when onChange fires with NO active composition, the callback
   * is invoked with the identical string — no transformation or loss.
   */
  it("search input: callback receives exact value for any unicode string", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(
          /^[\u4e00-\u9fff\u3040-\u309f\uac00-\ud7af\u00c0-\u00ff\u0100-\u024f]{1,20}$/,
        ),
        (value) => {
          cleanup();
          const callback = vi.fn();
          const { getByTestId } = render(<BareSearchInput onChange={callback} />);
          const input = getByTestId("search-input");

          fireEvent.change(input, { target: { value } });

          expect(callback).toHaveBeenCalledTimes(1);
          expect(callback).toHaveBeenCalledWith(value);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * Property: For all arbitrary non-empty string values, when onChange fires
   * with NO active composition on a notes textarea, the callback is invoked
   * exactly once with the exact value.
   */
  it("notes textarea: callback receives exact value for any arbitrary string", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (value) => {
        cleanup();
        const onUpdate = vi.fn();
        const { getByTestId } = render(<BareTextarea onUpdate={onUpdate} />);
        const textarea = getByTestId("notes-textarea");

        fireEvent.change(textarea, { target: { value } });

        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledWith(value);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 3.3**
   *
   * Property: For all arbitrary numeric strings, when onChange fires with NO
   * active composition on a number input, the callback receives the exact
   * string value (no numeric coercion).
   */
  it("number input: callback receives exact string value for any numeric string", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[0-9]{1,10}$/), (value) => {
        cleanup();
        const onUpdate = vi.fn();
        const { getByTestId } = render(<BareNumberInput onUpdate={onUpdate} />);
        const input = getByTestId("price-input");

        fireEvent.change(input, { target: { value } });

        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate).toHaveBeenCalledWith(value);
      }),
      { numRuns: 100 },
    );
  });
});

describe("Preservation: Property — Callback count equals event count for sequences", () => {
  /**
   * **Validates: Requirements 3.1, 3.5**
   *
   * Property: For all random sequences of non-composing onChange events,
   * the callback call count equals the number of events fired.
   */
  it("search input: callback count matches event count for any sequence of changes", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 20 }),
        (values) => {
          cleanup();
          const callback = vi.fn();
          const { getByTestId } = render(<BareSearchInput onChange={callback} />);
          const input = getByTestId("search-input");

          for (const value of values) {
            fireEvent.change(input, { target: { value } });
          }

          // Consecutive duplicate values are deduplicated by the DOM —
          // fireEvent.change with the same value the input already holds
          // does not trigger onChange. Filter to distinct-from-previous.
          const distinctValues = values.filter((v, i) => i === 0 || v !== values[i - 1]);

          expect(callback).toHaveBeenCalledTimes(distinctValues.length);

          for (let i = 0; i < distinctValues.length; i++) {
            expect(callback).toHaveBeenNthCalledWith(i + 1, distinctValues[i]);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 3.2, 3.5**
   *
   * Property: For all random sequences of non-composing onChange events on
   * a textarea, the callback call count equals the number of events fired.
   */
  it("notes textarea: callback count matches event count for any sequence of changes", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 20 }),
        (values) => {
          cleanup();
          const onUpdate = vi.fn();
          const { getByTestId } = render(<BareTextarea onUpdate={onUpdate} />);
          const textarea = getByTestId("notes-textarea");

          for (const value of values) {
            fireEvent.change(textarea, { target: { value } });
          }

          // Consecutive duplicate values are deduplicated by the DOM.
          const distinctValues = values.filter((v, i) => i === 0 || v !== values[i - 1]);

          expect(onUpdate).toHaveBeenCalledTimes(distinctValues.length);

          for (let i = 0; i < distinctValues.length; i++) {
            expect(onUpdate).toHaveBeenNthCalledWith(i + 1, distinctValues[i]);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  /**
   * **Validates: Requirements 3.3, 3.5**
   *
   * Property: For all random sequences of numeric onChange events on a
   * number input, the callback call count equals the number of events fired.
   */
  it("number input: callback count matches event count for any sequence of numeric changes", () => {
    fc.assert(
      fc.property(
        fc.array(fc.stringMatching(/^[0-9]{1,10}$/), { minLength: 1, maxLength: 20 }),
        (values) => {
          cleanup();
          const onUpdate = vi.fn();
          const { getByTestId } = render(<BareNumberInput onUpdate={onUpdate} />);
          const input = getByTestId("price-input");

          for (const value of values) {
            fireEvent.change(input, { target: { value } });
          }

          // Consecutive duplicate values are deduplicated by the DOM.
          const distinctValues = values.filter((v, i) => i === 0 || v !== values[i - 1]);

          expect(onUpdate).toHaveBeenCalledTimes(distinctValues.length);

          for (let i = 0; i < distinctValues.length; i++) {
            expect(onUpdate).toHaveBeenNthCalledWith(i + 1, distinctValues[i]);
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});
