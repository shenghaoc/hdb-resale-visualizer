import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterPanel } from "@/components/FilterPanel";
import { I18nProvider } from "@/lib/i18n";
import type { FilterOptions, FilterState } from "@/types/data";

const defaultFilters: FilterState = {
  search: "",
  town: "",
  flatType: "",
  flatModel: "",
  budgetMin: null,
  budgetMax: null,
  remainingLeaseMin: null,
  mrtMax: null,
  areaMin: null,
  areaMax: null,
  startMonth: null,
  endMonth: null,
  selectedAddressKey: null,
};

const defaultOptions: FilterOptions = {
  towns: ["Bedok"],
  flatTypes: ["4 ROOM"],
  flatModels: ["Model A"],
};

function renderFilterPanel(
  overrides: {
    desktopToggle?: { isOpen: boolean; onToggle: () => void };
  } = {},
) {
  return render(
    <I18nProvider>
      <FilterPanel
        filters={defaultFilters}
        options={defaultOptions}
        minMonth="2020-01"
        maxMonth="2024-12"
        onChange={vi.fn()}
        onReset={vi.fn()}
        desktopToggle={overrides.desktopToggle}
      />
    </I18nProvider>,
  );
}

describe("FilterPanel desktop panel toggle", () => {
  it("renders a labeled hide control when desktopToggle is provided", () => {
    renderFilterPanel({
      desktopToggle: { isOpen: true, onToggle: vi.fn() },
    });

    expect(screen.getByRole("button", { name: "Hide filters" })).toBeInTheDocument();
    expect(screen.getByTestId("filters-panel-toggle")).toHaveClass("sm:inline-flex");
  });

  it("shows Show filters when the panel is collapsed", () => {
    renderFilterPanel({
      desktopToggle: { isOpen: false, onToggle: vi.fn() },
    });

    expect(screen.getByRole("button", { name: "Show filters" })).toBeInTheDocument();
  });

  it("does not render the desktop toggle without desktopToggle", () => {
    renderFilterPanel();

    expect(screen.queryByTestId("filters-panel-toggle")).not.toBeInTheDocument();
  });

  it("invokes onToggle when the hide control is clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();

    renderFilterPanel({
      desktopToggle: { isOpen: true, onToggle },
    });

    await user.click(screen.getByRole("button", { name: "Hide filters" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
