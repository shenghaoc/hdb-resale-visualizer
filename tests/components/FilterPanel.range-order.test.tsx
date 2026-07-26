import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vite-plus/test";
import { FilterPanel } from "@/components/FilterPanel";
import { I18nProvider } from "@/shared/lib/i18n";
import type { FilterOptions, FilterState } from "@/types/data";

const options: FilterOptions = {
  towns: ["BEDOK"],
  flatTypes: ["4 ROOM"],
  flatModels: ["MODEL A"],
};

function Harness() {
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    town: "",
    flatType: "",
    flatModel: "",
    budgetMin: 600_000,
    budgetMax: 500_000,
    areaMin: 100,
    areaMax: 80,
    remainingLeaseMin: null,
    startMonth: null,
    endMonth: null,
    mrtMax: null,
    selectedAddressKey: null,
    compareTown: "",
    affordable: "",
    sort: "",
  });

  return (
    <I18nProvider>
      <FilterPanel
        filters={filters}
        options={options}
        minMonth="2020-01"
        maxMonth="2026-01"
        onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
        onReset={() => {}}
      />
    </I18nProvider>
  );
}

describe("FilterPanel numeric range ordering", () => {
  it("preserves the edited fields until blur, then commits ascending endpoints", () => {
    render(<Harness />);

    const budgetMin = screen.getByRole("spinbutton", { name: "Minimum budget" });
    const budgetMax = screen.getByRole("spinbutton", { name: "Maximum budget" });
    const areaMin = screen.getByRole("spinbutton", { name: "Minimum floor area" });
    const areaMax = screen.getByRole("spinbutton", { name: "Maximum floor area" });

    expect(budgetMin).toHaveValue(600_000);
    expect(budgetMax).toHaveValue(500_000);
    expect(areaMin).toHaveValue(100);
    expect(areaMax).toHaveValue(80);

    fireEvent.blur(budgetMin);
    expect(budgetMin).toHaveValue(500_000);
    expect(budgetMax).toHaveValue(600_000);

    fireEvent.blur(areaMin);
    expect(areaMin).toHaveValue(80);
    expect(areaMax).toHaveValue(100);
  });
});
