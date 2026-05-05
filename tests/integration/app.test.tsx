import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { I18nProvider } from "@/lib/i18n";
import type { BlockSummary, Manifest, ShortlistItem } from "@/types/data";

const dataMocks = vi.hoisted(() => ({
  fetchManifest: vi.fn<() => Promise<Manifest>>(),
  fetchBlockSummaries: vi.fn<() => Promise<BlockSummary[]>>(),
  fetchBlocksByTown: vi.fn<() => Promise<BlockSummary[]>>(),
  fetchAddressDetail: vi.fn(),
  fetchComparisonArtifact: vi.fn(),
  townToFilename: (town: string) =>
    town
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
}));

const shortlistMocks = vi.hoisted(() => {
  const state = {
    items: [] as ShortlistItem[],
    toggle: vi.fn(),
    update: vi.fn(),
  };

  function setItems(nextItems: ShortlistItem[]) {
    state.items = nextItems;
  }

  function reset() {
    state.items = [];
    state.toggle.mockReset();
    state.update.mockReset();
  }

  return { state, setItems, reset };
});

vi.mock("@/lib/data", () => ({
  fetchManifest: dataMocks.fetchManifest,
  fetchBlockSummaries: dataMocks.fetchBlockSummaries,
  fetchBlocksByTown: dataMocks.fetchBlocksByTown,
  fetchAddressDetail: dataMocks.fetchAddressDetail,
  fetchComparisonArtifact: dataMocks.fetchComparisonArtifact,
  townToFilename: dataMocks.townToFilename,
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => true,
}));

vi.mock("@/hooks/useShortlist", () => ({
  useShortlist: () => ({
    items: shortlistMocks.state.items,
    has: (addressKey: string) =>
      shortlistMocks.state.items.some((item: ShortlistItem) => item.addressKey === addressKey),
    toggle: shortlistMocks.state.toggle,
    update: shortlistMocks.state.update,
  }),
}));

vi.mock("@/components/FilterPanel", () => ({
  FilterPanel: () => <div data-testid="filter-panel" />,
}));

vi.mock("@/components/MapView", () => ({
  MapView: ({
    onMapInteract,
    onSelect,
  }: {
    onMapInteract?: (interactionType?: "background" | "feature") => void;
    onSelect: (addressKey: string) => void;
  }) => (
    <div data-testid="map-view">
      <button type="button" onClick={() => onMapInteract?.("background")}>
        Background map interaction
      </button>
      <button
        type="button"
        onClick={() => {
          onSelect("bedok-101-bedok-nth-ave-4");
          onMapInteract?.("feature");
        }}
      >
        Feature map click
      </button>
    </div>
  ),
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
  schemaVersion: "2.0.0",
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

const blocks: BlockSummary[] = [
  {
    addressKey: "bedok-101-bedok-nth-ave-4",
    town: "BEDOK",
    block: "101",
    streetName: "BEDOK NTH AVE 4",
    displayName: "BEDOK NORTH GREEN",
    coordinates: { lat: 1.3339, lng: 103.9372 },
    medianPrice: 545000,
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

function createShortlistItem(addressKey: string): ShortlistItem {
  return {
    addressKey,
    notes: "",
    targetPrice: null,
    addedAt: "2026-05-05T00:00:00.000Z",
  };
}

describe("App detail loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shortlistMocks.reset();
    window.history.replaceState({}, "", "/");
    dataMocks.fetchManifest.mockResolvedValue(manifest);
    dataMocks.fetchBlockSummaries.mockResolvedValue(blocks);
    dataMocks.fetchAddressDetail.mockResolvedValue({
      summary: blocks[0],
      monthlyTrend: [],
      transactions: [],
    });
    dataMocks.fetchBlocksByTown.mockResolvedValue(blocks);
    dataMocks.fetchComparisonArtifact.mockResolvedValue(null);
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

    await user.click(await screen.findByRole("button", { name: "Results" }));
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

  it("keeps the results panel open when a map feature click selects a block", async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    await screen.findByTestId("map-view");

    await user.click(screen.getByRole("button", { name: "Feature map click" }));

    await screen.findByTestId("detail-drawer");
    expect(screen.getByTestId("results-pane")).toBeInTheDocument();
  });

  it("closes the results panel for background map exploration", async () => {
    const user = userEvent.setup();

    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Results" }));
    await screen.findByTestId("results-pane");

    await user.click(screen.getByRole("button", { name: "Background map interaction" }));
    await waitFor(() => {
      expect(document.getElementById("desktop-panel")).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("does not restart shortlist detail preloads while requests are still in flight", async () => {
    const firstAddressKey = "jurong-west-601-jurong-west-st-62";
    const secondAddressKey = "tampines-123-tampines-st-11";
    const pendingDetail = createDeferredPromise<unknown>();

    shortlistMocks.setItems([
      createShortlistItem(firstAddressKey),
      createShortlistItem(secondAddressKey),
    ]);

    dataMocks.fetchAddressDetail.mockImplementation((addressKey: string) => {
      if (addressKey === firstAddressKey) {
        return Promise.resolve({
          summary: blocks[0],
          monthlyTrend: [],
          transactions: [],
        });
      }

      if (addressKey === secondAddressKey) {
        return pendingDetail.promise;
      }

      return Promise.resolve({
        summary: blocks[0],
        monthlyTrend: [],
        transactions: [],
      });
    });

    const user = userEvent.setup();

    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /saved/i }));

    await waitFor(() => {
      expect(dataMocks.fetchAddressDetail).toHaveBeenCalledWith(firstAddressKey);
      expect(dataMocks.fetchAddressDetail).toHaveBeenCalledWith(secondAddressKey);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const detailCalls = dataMocks.fetchAddressDetail.mock.calls.map((call) => String(call[0]));
    expect(detailCalls.filter((addressKey) => addressKey === firstAddressKey)).toHaveLength(1);
    expect(detailCalls.filter((addressKey) => addressKey === secondAddressKey)).toHaveLength(1);

    pendingDetail.resolve({
      summary: blocks[0],
      monthlyTrend: [],
      transactions: [],
    });

    await waitFor(() => {
      const resolvedDetailCalls = dataMocks.fetchAddressDetail.mock.calls.map((call) =>
        String(call[0]),
      );
      expect(resolvedDetailCalls.filter((addressKey) => addressKey === firstAddressKey)).toHaveLength(1);
      expect(resolvedDetailCalls.filter((addressKey) => addressKey === secondAddressKey)).toHaveLength(1);
    });
  });

  it("does not restart shortlist comparison preloads while requests are still in flight", async () => {
    const firstAddressKey = "jurong-west-601-jurong-west-st-62";
    const secondAddressKey = "tampines-123-tampines-st-11";
    const pendingComparison = createDeferredPromise<unknown>();

    shortlistMocks.setItems([
      createShortlistItem(firstAddressKey),
      createShortlistItem(secondAddressKey),
    ]);

    dataMocks.fetchComparisonArtifact.mockImplementation((addressKey: string) => {
      if (addressKey === firstAddressKey) {
        return Promise.resolve(null);
      }

      if (addressKey === secondAddressKey) {
        return pendingComparison.promise;
      }

      return Promise.resolve(null);
    });

    const user = userEvent.setup();

    render(
      <I18nProvider>
        <App />
      </I18nProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /saved/i }));

    await waitFor(() => {
      expect(dataMocks.fetchComparisonArtifact).toHaveBeenCalledWith(firstAddressKey);
      expect(dataMocks.fetchComparisonArtifact).toHaveBeenCalledWith(secondAddressKey);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const comparisonCalls = dataMocks.fetchComparisonArtifact.mock.calls.map((call) =>
      String(call[0]),
    );
    expect(comparisonCalls.filter((addressKey) => addressKey === firstAddressKey)).toHaveLength(1);
    expect(comparisonCalls.filter((addressKey) => addressKey === secondAddressKey)).toHaveLength(1);

    pendingComparison.resolve(null);

    await waitFor(() => {
      const resolvedComparisonCalls = dataMocks.fetchComparisonArtifact.mock.calls.map((call) =>
        String(call[0]),
      );
      expect(resolvedComparisonCalls.filter((addressKey) => addressKey === firstAddressKey)).toHaveLength(1);
      expect(resolvedComparisonCalls.filter((addressKey) => addressKey === secondAddressKey)).toHaveLength(1);
    });
  });
});
