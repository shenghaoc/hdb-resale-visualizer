import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import App from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SEARCH_PROFILE_STORAGE_KEY } from "@/shared/lib/constants";
import { I18nProvider } from "@/shared/lib/i18n";
import type { BlockSummary, FilterState, Manifest } from "@/types/data";

const dataMocks = vi.hoisted(() => ({
  fetchManifest: vi.fn<() => Promise<Manifest>>(),
  fetchBlockSummaries: vi.fn<() => Promise<BlockSummary[]>>(),
  fetchBlocksByTown: vi.fn<() => Promise<BlockSummary[]>>(),
  fetchBlocksBySearch:
    vi.fn<() => Promise<{ blocks: BlockSummary[]; truncated: boolean; limit: number }>>(),
  fetchAddressDetail: vi.fn(),
  fetchComparisonArtifact: vi.fn(),
  townToFilename: (town: string) =>
    town
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
}));

vi.mock("@/shared/lib/data", () => ({
  fetchManifest: dataMocks.fetchManifest,
  fetchBlockSummaries: dataMocks.fetchBlockSummaries,
  fetchBlocksByTown: dataMocks.fetchBlocksByTown,
  fetchBlocksBySearch: dataMocks.fetchBlocksBySearch,
  fetchAddressDetail: dataMocks.fetchAddressDetail,
  fetchComparisonArtifact: dataMocks.fetchComparisonArtifact,
  townToFilename: dataMocks.townToFilename,
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => true,
}));

vi.mock("@/features/shortlist/useShortlist", () => ({
  useShortlist: () => ({
    items: [],
    has: () => false,
    toggle: vi.fn(),
    update: vi.fn(),
  }),
}));

vi.mock("@/components/FilterPanel", () => ({
  FilterPanel: ({
    filters,
    onChange,
  }: {
    filters: FilterState;
    onChange: (patch: Partial<FilterState>) => void;
  }) => (
    <div data-testid="filter-panel" data-start-month={filters.startMonth ?? ""}>
      <button type="button" onClick={() => onChange({ town: "BEDOK" })}>
        Choose Bedok
      </button>
    </div>
  ),
}));

vi.mock("@/components/MapView", () => ({
  MapView: () => <div data-testid="map-view" data-theme="light" />,
}));

vi.mock("@/components/ResultsPane", () => ({
  ResultsPane: () => <div data-testid="results-pane" />,
}));

vi.mock("@/components/DetailDrawer", () => ({
  DetailDrawer: () => <div data-testid="detail-drawer" />,
}));

vi.mock("@/components/ShortlistDrawer", () => ({
  ShortlistDrawer: () => <div data-testid="shortlist-drawer" />,
}));

vi.mock("@/components/StatsBar", () => ({
  GlobalHeader: () => <div data-testid="global-header" />,
}));

vi.mock("@/features/listing-check/ListingCheckPanel", () => ({
  ListingCheckPanel: ({
    selectedAddressKey,
    askingPrice,
    onUseSampleCheck,
    onOpenCandidates,
    onOpenShortlist,
  }: {
    selectedAddressKey: string | null;
    askingPrice: number | null;
    onUseSampleCheck: () => void;
    onOpenCandidates: () => void;
    onOpenShortlist: () => void;
  }) => (
    <div
      data-testid="listing-check-panel"
      data-address-key={selectedAddressKey ?? ""}
      data-asking-price={askingPrice ?? ""}
    >
      <button type="button" onClick={onUseSampleCheck}>
        Try sample listing check
      </button>
      <button type="button" onClick={onOpenCandidates}>
        Find candidate blocks
      </button>
      <button type="button" onClick={onOpenShortlist}>
        Compare my shortlist
      </button>
    </div>
  ),
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

const completedSearchProfile = {
  version: 1,
  mainFlatType: "4 ROOM",
  alternativeFlatTypes: [],
  maxBudget: 700000,
  commuteAnchorLabel: "Bedok MRT",
  commuteAnchorMrt: "BEDOK MRT STATION",
  maxComfortableCommuteMinutes: 30,
  commuteStretchMinutes: 10,
  minimumRemainingLeaseYears: 65,
  budgetStretchPercent: 5,
  showStretchOptions: true,
  showAllBlocks: false,
};

describe("Buyer-first homepage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    dataMocks.fetchManifest.mockResolvedValue(manifest);
    dataMocks.fetchBlockSummaries.mockResolvedValue([]);
    dataMocks.fetchBlocksByTown.mockResolvedValue([]);
    dataMocks.fetchBlocksBySearch.mockResolvedValue({ blocks: [], truncated: false, limit: 200 });
    dataMocks.fetchAddressDetail.mockResolvedValue(null);
    dataMocks.fetchComparisonArtifact.mockResolvedValue(null);
    // Bypass search profile wizard by providing a completed profile
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) =>
        key === SEARCH_PROFILE_STORAGE_KEY ? JSON.stringify(completedSearchProfile) : null,
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderApp() {
    return render(
      <I18nProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </I18nProvider>,
    );
  }

  it("shows scope prompt with 'Check a listing price' CTA on first load", async () => {
    renderApp();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /check a listing price/i })).toBeVisible();
    });
  });

  it("'Check a listing price' CTA in scope prompt opens the check panel", async () => {
    const user = userEvent.setup();
    renderApp();

    const checkButton = await screen.findByRole("button", { name: /check a listing price/i });
    await user.click(checkButton);

    await waitFor(() => {
      expect(screen.getByTestId("listing-check-panel")).toBeVisible();
    });
  });

  it("sample check pre-fills address state from fallback sample", async () => {
    const user = userEvent.setup();
    renderApp();

    // Open check panel first
    const checkButton = await screen.findByRole("button", { name: /check a listing price/i });
    await user.click(checkButton);

    await waitFor(() => {
      expect(screen.getByTestId("listing-check-panel")).toBeVisible();
    });

    // Click sample check — handleUseSampleCheck sets checkAddressKey and askingPrice
    await user.click(screen.getByRole("button", { name: /try sample listing check/i }));

    await waitFor(() => {
      const panel = screen.getByTestId("listing-check-panel");
      expect(panel).toHaveAttribute("data-address-key", "406-ANG MO KIO AVE 10");
      expect(panel).toHaveAttribute("data-asking-price", "450000");
    });
  });

  it("'Find candidate blocks' routes to filters when no scope is set", async () => {
    const user = userEvent.setup();
    renderApp();

    // Open check panel
    const checkButton = await screen.findByRole("button", { name: /check a listing price/i });
    await user.click(checkButton);

    await waitFor(() => {
      expect(screen.getByTestId("listing-check-panel")).toBeVisible();
    });

    // Click find candidates
    await user.click(screen.getByRole("button", { name: /find candidate blocks/i }));

    // Should show filters (scope picker) since no scope is set
    await waitFor(() => {
      expect(screen.getByTestId("filter-panel")).toBeVisible();
    });
  });

  it("'Compare my shortlist' opens saved panel", async () => {
    const user = userEvent.setup();
    renderApp();

    // Open check panel
    const checkButton = await screen.findByRole("button", { name: /check a listing price/i });
    await user.click(checkButton);

    await waitFor(() => {
      expect(screen.getByTestId("listing-check-panel")).toBeVisible();
    });

    // Click compare shortlist
    await user.click(screen.getByRole("button", { name: /compare my shortlist/i }));

    // Should open saved panel
    await waitFor(() => {
      expect(screen.getByTestId("shortlist-drawer")).toBeVisible();
    });
  });
});
