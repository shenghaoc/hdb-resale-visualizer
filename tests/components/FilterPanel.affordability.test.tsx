import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FilterPanel } from "@/components/FilterPanel";
import { I18nProvider } from "@/shared/lib/i18n";
import type { FilterOptions, FilterState } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

const baseFilters: FilterState = {
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
  compareTown: "",
  affordable: "",
  sort: "",
};

const options: FilterOptions = {
  towns: ["Bedok"],
  flatTypes: ["4 ROOM"],
  flatModels: ["Model A"],
};

const completeProfile: SearchProfile = {
  version: 1,
  mainFlatType: "4 ROOM",
  alternativeFlatTypes: [],
  maxBudget: 700000,
  commuteAnchorLabel: "",
  commuteAnchorMrt: null,
  maxComfortableCommuteMinutes: 30,
  commuteStretchMinutes: 10,
  minimumRemainingLeaseYears: 65,
  budgetStretchPercent: 5,
  showStretchOptions: true,
  showAllBlocks: false,
  age: 35,
  coApplicantAge: 33,
  cpfOABalance: 120000,
  monthlyIncome: 9000,
};

const incompleteProfile: SearchProfile = {
  ...completeProfile,
  monthlyIncome: null,
};

function renderPanel(
  filters: FilterState = baseFilters,
  profile: SearchProfile | null = null,
  onChange = vi.fn(),
) {
  return render(
    <I18nProvider>
      <FilterPanel
        filters={filters}
        options={options}
        minMonth="2020-01"
        maxMonth="2024-12"
        onChange={onChange}
        onReset={vi.fn()}
        searchProfile={profile}
      />
    </I18nProvider>,
  );
}

describe("FilterPanel affordability toggle", () => {
  it("renders the affordability ButtonGroup", () => {
    renderPanel(baseFilters, completeProfile);
    expect(screen.getByTestId("affordability-filter-toggle")).toBeInTheDocument();
  });

  // The three labels (longest: "Affordable: comfortable + stretch") overflow a
  // horizontal segmented control and get clipped inside the filter panel, making
  // two options render identically. The group must stack vertically so every
  // option stays fully readable at any panel width.
  it("stacks options vertically to avoid label clipping", () => {
    renderPanel(baseFilters, completeProfile);
    const toggle = screen.getByTestId("affordability-filter-toggle");
    expect(toggle).toHaveAttribute("data-orientation", "vertical");
  });

  it("all-blocks button is active by default (affordable = '')", () => {
    renderPanel(baseFilters, completeProfile);
    const allBtn = screen.getByRole("button", {
      name: /All blocks/i,
    });
    expect(allBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("comfortable button is active when affordable = 'comfortable'", () => {
    renderPanel({ ...baseFilters, affordable: "comfortable" }, completeProfile);
    const comfortableBtn = screen.getByRole("button", {
      name: /comfortable(?!\s*\+)/i,
    });
    expect(comfortableBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("stretch button is active when affordable = 'stretch'", () => {
    renderPanel({ ...baseFilters, affordable: "stretch" }, completeProfile);
    const stretchBtn = screen.getByRole("button", {
      name: /stretch/i,
    });
    expect(stretchBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking comfortable calls onChange with { affordable: 'comfortable' }", async () => {
    const onChange = vi.fn();
    renderPanel(baseFilters, completeProfile, onChange);

    const comfortableBtn = screen.getByRole("button", {
      name: /comfortable(?!\s*\+)/i,
    });
    await userEvent.click(comfortableBtn);

    expect(onChange).toHaveBeenCalledWith({ affordable: "comfortable" });
  });

  it("clicking stretch calls onChange with { affordable: 'stretch' }", async () => {
    const onChange = vi.fn();
    renderPanel(baseFilters, completeProfile, onChange);

    const stretchBtn = screen.getByRole("button", {
      name: /stretch/i,
    });
    await userEvent.click(stretchBtn);

    expect(onChange).toHaveBeenCalledWith({ affordable: "stretch" });
  });

  it("clicking all-blocks when already on all-blocks calls onChange with { affordable: '' }", async () => {
    const onChange = vi.fn();
    renderPanel(baseFilters, completeProfile, onChange);

    const allBtn = screen.getByRole("button", {
      name: /All blocks/i,
    });
    await userEvent.click(allBtn);

    expect(onChange).toHaveBeenCalledWith({ affordable: "" });
  });

  it("buttons are disabled when no searchProfile is provided", () => {
    renderPanel(baseFilters, null);
    const toggle = screen.getByTestId("affordability-filter-toggle");
    const buttons = toggle.querySelectorAll("button");
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("buttons are disabled when profile is incomplete (missing monthlyIncome)", () => {
    renderPanel(baseFilters, incompleteProfile);
    const toggle = screen.getByTestId("affordability-filter-toggle");
    const buttons = toggle.querySelectorAll("button");
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("buttons are enabled when profile is complete", () => {
    renderPanel(baseFilters, completeProfile);
    const toggle = screen.getByTestId("affordability-filter-toggle");
    const buttons = toggle.querySelectorAll("button");
    buttons.forEach((btn) => expect(btn).not.toBeDisabled());
  });

  it("disabled toggle has data-affordability-disabled='true'", () => {
    renderPanel(baseFilters, null);
    const toggle = screen.getByTestId("affordability-filter-toggle");
    expect(toggle).toHaveAttribute("data-affordability-disabled", "true");
  });

  it("enabled toggle has data-affordability-disabled='false'", () => {
    renderPanel(baseFilters, completeProfile);
    const toggle = screen.getByTestId("affordability-filter-toggle");
    expect(toggle).toHaveAttribute("data-affordability-disabled", "false");
  });

  it("reflects current mode via data-affordability-mode attribute", () => {
    const { rerender } = renderPanel({ ...baseFilters, affordable: "comfortable" }, completeProfile);
    const toggle = screen.getByTestId("affordability-filter-toggle");
    expect(toggle).toHaveAttribute("data-affordability-mode", "comfortable");

    rerender(
      <I18nProvider>
        <FilterPanel
          filters={{ ...baseFilters, affordable: "stretch" }}
          options={options}
          minMonth="2020-01"
          maxMonth="2024-12"
          onChange={vi.fn()}
          onReset={vi.fn()}
          searchProfile={completeProfile}
        />
      </I18nProvider>,
    );
    expect(toggle).toHaveAttribute("data-affordability-mode", "stretch");
  });
});
