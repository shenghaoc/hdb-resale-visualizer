/**
 * Integration test — FilterPanel IME composition handling.
 *
 * Renders FilterPanel with mock props, simulates a full IME composition
 * on the search input, and verifies that the onChange prop is NOT called
 * during composition but IS called once on commit.
 *
 * _Requirements: 2.1, 3.1, 3.4_
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FilterPanel } from "@/components/FilterPanel";
import { I18nProvider } from "@/lib/i18n/provider";
import type { FilterOptions, FilterState } from "@/types/data";

const defaultFilters: FilterState = {
  search: "",
  town: "",
  flatType: "",
  flatModel: "",
  budgetMin: null,
  budgetMax: null,
  areaMin: null,
  areaMax: null,
  remainingLeaseMin: null,
  startMonth: null,
  endMonth: null,
  mrtMax: null,
  selectedAddressKey: null,
};

const defaultOptions: FilterOptions = {
  towns: ["ANG MO KIO", "BEDOK"],
  flatTypes: ["3 ROOM", "4 ROOM"],
  flatModels: ["Model A"],
};

function renderFilterPanel(overrides: { onChange?: (patch: Partial<FilterState>) => void } = {}) {
  const onChange = overrides.onChange ?? vi.fn();
  const onReset = vi.fn();

  const result = render(
    <I18nProvider>
      <FilterPanel
        filters={defaultFilters}
        options={defaultOptions}
        minMonth="2023-01"
        maxMonth="2024-01"
        onChange={onChange}
        onReset={onReset}
      />
    </I18nProvider>,
  );

  return { ...result, onChange, onReset };
}

describe("FilterPanel — IME composition on search input", () => {
  it("does not call onChange during composition, calls once on commit", () => {
    const onChange = vi.fn();
    renderFilterPanel({ onChange });

    const searchInput = screen.getByLabelText("Location search");

    // Start IME composition
    fireEvent.compositionStart(searchInput);

    // Intermediate keystrokes (Pinyin for "大巴窑")
    fireEvent.change(searchInput, { target: { value: "d" } });
    fireEvent.change(searchInput, { target: { value: "da" } });
    fireEvent.change(searchInput, { target: { value: "dab" } });
    fireEvent.change(searchInput, { target: { value: "daby" } });

    // onChange should NOT have been called during composition
    expect(onChange).not.toHaveBeenCalled();

    // User commits the composed text
    // Set the input value to the committed text before compositionend
    Object.defineProperty(searchInput, "value", {
      writable: true,
      value: "大巴窑",
    });
    fireEvent.compositionEnd(searchInput, { data: "大巴窑" });

    // onChange should be called exactly once with the committed value
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ search: "大巴窑" });
  });

  it("non-IME typing still calls onChange on every keystroke", () => {
    const onChange = vi.fn();
    renderFilterPanel({ onChange });

    const searchInput = screen.getByLabelText("Location search");

    // Direct keyboard input (no composition)
    fireEvent.change(searchInput, { target: { value: "t" } });
    fireEvent.change(searchInput, { target: { value: "to" } });
    fireEvent.change(searchInput, { target: { value: "toa" } });

    expect(onChange).toHaveBeenCalledTimes(3);
    expect(onChange).toHaveBeenNthCalledWith(1, { search: "t" });
    expect(onChange).toHaveBeenNthCalledWith(2, { search: "to" });
    expect(onChange).toHaveBeenNthCalledWith(3, { search: "toa" });
  });
});
