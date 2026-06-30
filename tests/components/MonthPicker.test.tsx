import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "@/shared/lib/i18n";

vi.mock("@/shared/lib/format", () => ({
  formatMonth: (month: string) => month,
}));

import { MonthPicker } from "@/components/ui/month-picker";

type RenderPickerOptions = {
  initialValue?: string | null;
  minMonth?: string;
  maxMonth?: string;
  onChange?: (value: string | null) => void;
};

function renderPicker({
  initialValue = null,
  minMonth = "2024-01",
  maxMonth = "2024-12",
  onChange = vi.fn(),
}: RenderPickerOptions = {}) {
  function StatefulPicker() {
    const [value, setValue] = useState<string | null>(initialValue);

    return (
      <MonthPicker
        value={value}
        onChange={(nextValue) => {
          onChange(nextValue);
          setValue(nextValue);
        }}
        minMonth={minMonth}
        maxMonth={maxMonth}
        placeholder="Open month picker"
      />
    );
  }

  render(
    <I18nProvider>
      <StatefulPicker />
    </I18nProvider>,
  );

  return { onChange };
}

describe("MonthPicker", () => {
  it("uses roving focus and selects the next month with arrow keys", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({ onChange });

    await user.click(screen.getByRole("button", { name: "Open month picker" }));

    const january = screen.getByRole("radio", { name: "Jan" });
    const february = screen.getByRole("radio", { name: "Feb" });
    expect(january).toHaveAttribute("tabindex", "0");
    expect(february).toHaveAttribute("tabindex", "-1");

    january.focus();
    await user.keyboard("{ArrowRight}");

    const selectedFebruary = screen.getByRole("radio", { name: "Feb" });
    expect(onChange).toHaveBeenLastCalledWith("2024-02");
    expect(selectedFebruary).toHaveFocus();
    expect(selectedFebruary).toHaveAttribute("aria-checked", "true");
    expect(selectedFebruary).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radiogroup")).toBeInTheDocument();
  });

  it("wraps arrow-key navigation across enabled months only", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderPicker({ minMonth: "2024-02", maxMonth: "2024-04", onChange });

    await user.click(screen.getByRole("button", { name: "Open month picker" }));

    const january = screen.getByRole("radio", { name: "Jan" });
    const february = screen.getByRole("radio", { name: "Feb" });
    expect(january).toBeDisabled();
    expect(february).toHaveAttribute("tabindex", "0");

    february.focus();
    await user.keyboard("{ArrowLeft}");

    const april = screen.getByRole("radio", { name: "Apr" });
    expect(onChange).toHaveBeenLastCalledWith("2024-04");
    expect(april).toHaveFocus();
    expect(april).toHaveAttribute("aria-checked", "true");
    expect(january).toHaveAttribute("tabindex", "-1");
  });
});
