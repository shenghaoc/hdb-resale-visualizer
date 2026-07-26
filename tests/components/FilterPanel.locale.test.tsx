import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";
import { FilterPanel } from "@/components/FilterPanel";
import { I18nProvider } from "@/shared/lib/i18n";
import type { FilterOptions, FilterState } from "@/types/data";

vi.mock("@/shared/lib/storage", () => ({
  safeStorage: {
    getItem: (key: string) => (key === "hdb-resale-locale" ? "zh-SG" : null),
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}));

const filters: FilterState = {
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
  towns: ["BEDOK"],
  flatTypes: ["4 ROOM"],
  flatModels: [],
};

describe("FilterPanel locale presentation", () => {
  it("localizes the transaction-window separator", () => {
    render(
      <I18nProvider>
        <FilterPanel
          filters={filters}
          options={options}
          minMonth="2024-01"
          maxMonth="2024-12"
          onChange={vi.fn()}
          onReset={vi.fn()}
        />
      </I18nProvider>,
    );

    expect(screen.getByText(/2024.*至.*2024/)).toBeVisible();
    expect(screen.queryByText(/\bto\b/i)).toBeNull();
  });
});
