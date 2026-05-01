import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResultsPane } from "@/components/ResultsPane";
import { I18nProvider } from "@/lib/i18n";
import type { BlockSummary } from "@/types/data";

vi.mock("@/lib/storage", () => ({
  safeStorage: {
    getItem: (key: string) => (key === "hdb-resale-locale" ? "zh-SG" : null),
    setItem: () => {},
    removeItem: () => {},
  },
}));

const block: BlockSummary = {
  addressKey: "bedok-101-bedok-nth-ave-4",
  town: "BEDOK",
  block: "101",
  streetName: "BEDOK NTH AVE 4",
  displayName: "BEDOK NORTH GREEN",
  coordinates: { lat: 1.3339, lng: 103.9372 },
  medianPrice: 545000,
  transactionCount: 3,
  floorAreaRange: [92, 92],
  leaseCommenceRange: [1983, 1983],
  latestMonth: "2026-02",
  availableDateRange: ["2026-02", "2026-02"],
  flatTypes: ["4 ROOM"],
  flatModels: ["MODEL A"],
  nearestMrt: {
    stationName: "BEDOK NORTH MRT STATION",
    distanceMeters: 400,
  },
};

describe("ResultsPane", () => {
  it("localizes compact-card town and flat type labels", () => {
    render(
      <I18nProvider>
        <ResultsPane
          blocks={[block]}
          hasResultScope={true}
          selectedAddressKey={null}
          shortlistKeys={new Set<string>()}
          onSelect={() => {}}
          onToggleShortlist={() => {}}
          isCompact={true}
        />
      </I18nProvider>,
    );

    expect(screen.getByText("勿洛 · BEDOK · 四房式 · 4 ROOM")).toBeInTheDocument();
  });
});
