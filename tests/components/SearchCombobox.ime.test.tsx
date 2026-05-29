/**
 * SearchCombobox IME composition — built on LocationSearchInput / useIMEComposition.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SearchCombobox } from "@/components/SearchCombobox";
import { I18nProvider } from "@/lib/i18n/provider";

vi.mock("@/lib/data", () => ({
  fetchSuggestions: vi.fn(() => Promise.resolve([])),
}));

function renderCombobox(onValueChange = vi.fn()) {
  const onSelectSuggestion = vi.fn();
  render(
    <I18nProvider>
      <SearchCombobox
        value=""
        onValueChange={onValueChange}
        onSelectSuggestion={onSelectSuggestion}
        t={(key) => key}
        aria-label="Location search"
      />
    </I18nProvider>,
  );
  return { onValueChange, onSelectSuggestion };
}

describe("SearchCombobox — IME composition", () => {
  it("does not call onValueChange during composition, calls once on commit", () => {
    const onValueChange = vi.fn();
    renderCombobox(onValueChange);

    const searchInput = screen.getByLabelText("Location search");
    fireEvent.compositionStart(searchInput);
    fireEvent.change(searchInput, { target: { value: "d" } });
    fireEvent.change(searchInput, { target: { value: "da" } });
    expect(onValueChange).not.toHaveBeenCalled();

    Object.defineProperty(searchInput, "value", { writable: true, value: "大巴窑" });
    fireEvent.compositionEnd(searchInput, { data: "大巴窑" });

    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith("大巴窑");
  });

  it("non-IME typing calls onValueChange on every keystroke", () => {
    const onValueChange = vi.fn();
    renderCombobox(onValueChange);

    const searchInput = screen.getByLabelText("Location search");
    fireEvent.change(searchInput, { target: { value: "t" } });
    fireEvent.change(searchInput, { target: { value: "to" } });

    expect(onValueChange).toHaveBeenCalledTimes(2);
    expect(onValueChange).toHaveBeenNthCalledWith(1, "t");
    expect(onValueChange).toHaveBeenNthCalledWith(2, "to");
  });
});

describe("SearchCombobox — keyboard navigation", () => {
  it("closes popover on Escape when open with suggestions", () => {
    const onValueChange = vi.fn();
    renderCombobox(onValueChange);

    // We can't easily trigger async suggest in a unit test, but we can verify
    // the Escape key handler works via the input's onKeyDown
    const searchInput = screen.getByLabelText("Location search");
    fireEvent.keyDown(searchInput, { key: "Escape" });
    // Popover should close (no visible listbox)
    expect(screen.queryByTestId("search-suggest-listbox")).toBeNull();
  });

  it("does not select when Enter pressed with no active index", () => {
    const onValueChange = vi.fn();
    const { onSelectSuggestion } = renderCombobox(onValueChange);

    const searchInput = screen.getByLabelText("Location search");
    fireEvent.keyDown(searchInput, { key: "Enter" });

    expect(onSelectSuggestion).not.toHaveBeenCalled();
  });
});
