import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { AppHeader } from "@/components/AppHeader";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Translator } from "@/shared/lib/i18n";
import type { Manifest, Suggestion } from "@/types/data";

const selectedSuggestion: Suggestion = {
  group: "block",
  label: "101 BEDOK NORTH AVENUE 4",
  addressKey: "bedok-101-bedok-north-avenue-4",
};

vi.mock("@/components/SearchCombobox", () => ({
  SearchCombobox: ({
    onSelectSuggestion,
    "data-testid": dataTestId,
  }: {
    onSelectSuggestion: (suggestion: Suggestion) => void;
    "data-testid"?: string;
  }) => (
    <button
      type="button"
      data-testid={dataTestId}
      onClick={() =>
        onSelectSuggestion({
          group: "block",
          label: "101 BEDOK NORTH AVENUE 4",
          addressKey: "bedok-101-bedok-north-avenue-4",
        })
      }
    >
      Select block suggestion
    </button>
  ),
}));

const manifest: Manifest = {
  schemaVersion: "2.0.0",
  generatedAt: "2026-07-25T00:00:00.000Z",
  dataWindow: {
    minMonth: "2025-01",
    maxMonth: "2026-06",
  },
  sources: {
    resaleCollectionId: "189",
    resaleDatasetIds: ["fixture"],
    propertyDatasetId: "fixture-property",
    mrtDatasetId: "fixture-mrt",
    lastUpdatedAt: "2026-07-25T00:00:00.000Z",
  },
  filterOptions: {
    towns: ["BEDOK"],
    flatTypes: ["4 ROOM"],
    flatModels: ["MODEL A"],
  },
  counts: {
    blocks: 1,
    transactions: 1,
    towns: 1,
    mrtStations: 1,
  },
};

const t: Translator = (key) => key;

describe("AppHeader mobile search", () => {
  it("closes the mobile search overlay after selecting a suggestion", async () => {
    const user = userEvent.setup();
    const onSelectSuggestion = vi.fn();

    render(
      <TooltipProvider>
        <AppHeader
          manifest={manifest}
          isDesktop={false}
          locale="en-SG"
          t={t}
          search=""
          onSearchChange={vi.fn()}
          onSelectSuggestion={onSelectSuggestion}
          isMobileHeaderOpen={false}
          onToggleMobileHeader={vi.fn()}
          onDismiss={vi.fn()}
          mobileTab={null}
        />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole("button", { name: "header.openSearch" }));
    const overlay = screen.getByTestId("header-search-overlay");

    await user.click(within(overlay).getByTestId("header-search-overlay-input"));

    expect(onSelectSuggestion).toHaveBeenCalledWith(selectedSuggestion);
    await waitFor(() => {
      expect(screen.queryByTestId("header-search-overlay")).not.toBeInTheDocument();
    });
  });
});
