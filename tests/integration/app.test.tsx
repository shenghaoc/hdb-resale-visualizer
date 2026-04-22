import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { I18nProvider } from "@/lib/i18n";
import type { BlockSummary, Manifest } from "@/types/data";

const dataMocks = vi.hoisted(() => ({
  fetchManifest: vi.fn<() => Promise<Manifest>>(),
  fetchBlockSummaries: vi.fn<() => Promise<BlockSummary[]>>(),
  fetchAddressDetail: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  fetchManifest: dataMocks.fetchManifest,
  fetchBlockSummaries: dataMocks.fetchBlockSummaries,
  fetchAddressDetail: dataMocks.fetchAddressDetail,
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => true,
}));

vi.mock("@/hooks/useShortlist", () => ({
  useShortlist: () => ({
    items: [],
    has: () => false,
    toggle: vi.fn(),
    update: vi.fn(),
  }),
}));

vi.mock("@/components/FilterPanel", () => ({
  FilterPanel: () => <div data-testid="filter-panel" />,
}));

vi.mock("@/components/MapView", () => ({
  MapView: () => <div data-testid="map-view" />,
}));

vi.mock("@/components/ResultsPane", () => ({
  ResultsPane: ({ onSelect }: { onSelect: (addressKey: string) => void }) => (
    <div data-testid="results-pane">
      <button type="button" onClick={() => onSelect("bedok-101-bedok-nth-ave-4")}>
        Select block
      </button>
    </div>
  ),
}));

vi.mock("@/components/DetailDrawer", () => ({
  DetailDrawer: ({ isLoading, onClose }: { isLoading: boolean; onClose: () => void }) => (
    <div data-testid="detail-drawer">
      <span>{isLoading ? "Loading detail" : "Loaded detail"}</span>
      <button type="button" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

vi.mock("@/components/ShortlistDrawer", () => ({
  ShortlistDrawer: () => <div data-testid="shortlist-drawer" />,
}));

vi.mock("@/components/StatsBar", () => ({
  GlobalHeader: () => <div data-testid="global-header" />,
}));

const manifest: Manifest = {
  schemaVersion: "1.0.0",
  generatedAt: "2026-04-22T00:00:00.000Z",
  dataWindow: {
    minMonth: "2025-01",
    maxMonth: "2026-04",
  },
  sources: {
    resaleCollectionId: "189",
    resaleDatasetIds: ["fixture"],
    propertyDatasetId: "fixture-property",
    mrtDatasetId: "fixture-mrt",
    lastUpdatedAt: "2026-04-22T02:10:21+08:00",
  },
  counts: {
    blocks: 1,
    transactions: 1,
    towns: 1,
    mrtStations: 1,
  },
};

const blocks: BlockSummary[] = [
  {
    addressKey: "bedok-101-bedok-nth-ave-4",
    town: "BEDOK",
    block: "101",
    streetName: "BEDOK NTH AVE 4",
    displayName: "BEDOK NORTH GREEN",
    coordinates: { lat: 1.3339, lng: 103.9372 },
    medianPrice: 545000,
    priceIqr: [530000, 560000],
    pricePerSqmMedian: 5923.91,
    pricePerSqftMedian: 550.35,
    transactionCount: 1,
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
  },
];

function createDeferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe("App detail loading", () => {
  beforeEach(() => {
    dataMocks.fetchManifest.mockResolvedValue(manifest);
    dataMocks.fetchBlockSummaries.mockResolvedValue(blocks);
    dataMocks.fetchAddressDetail.mockReset();
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
      configurable: true,
    });
  });

  it("clears loading and shows results again when selection is removed mid-request", async () => {
    const detailRequest = createDeferredPromise<never>();
    dataMocks.fetchAddressDetail.mockReturnValue(detailRequest.promise);

    const user = userEvent.setup();

    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    await user.click(await screen.findByRole("tab", { name: "Results" }));
    await screen.findByTestId("results-pane");

    await user.click(screen.getByRole("button", { name: "Select block" }));

    await screen.findByTestId("detail-drawer");

    await user.click(screen.getByRole("button", { name: "Close" }));

    await waitFor(() => {
      expect(screen.queryByTestId("detail-drawer")).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("results-pane")).toBeInTheDocument();

    detailRequest.reject(new Error("Request aborted"));
  });
});
