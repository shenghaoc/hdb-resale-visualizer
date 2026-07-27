import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import App from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SEARCH_PROFILE_STORAGE_KEY } from "@/shared/lib/constants";
import { I18nProvider } from "@/shared/lib/i18n";
import type { BlockSummary, FilterState, Manifest, ShortlistItem } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";
import { findLazySurface } from "../helpers/lazySurfaces";

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

const shortlistMocks = vi.hoisted(() => ({
  items: [] as ShortlistItem[],
}));

const searchProfileWizardMocks = vi.hoisted(() => ({
  nextProfile: null as SearchProfile | null,
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
    items: shortlistMocks.items,
    isFull: shortlistMocks.items.length >= 20,
    has: (addressKey: string) =>
      shortlistMocks.items.some((item) => item.addressKey === addressKey),
    toggle: vi.fn(),
    restore: vi.fn(() => true),
    update: vi.fn(),
  }),
}));

vi.mock("@/components/FilterPanel", () => ({
  FilterPanel: ({
    filters,
    onChange,
    onOpenBuyerSetup,
  }: {
    filters: FilterState;
    onChange: (patch: Partial<FilterState>) => void;
    onOpenBuyerSetup: () => void;
  }) => (
    <div data-testid="filter-panel" data-start-month={filters.startMonth ?? ""}>
      <button type="button" onClick={() => onChange({ town: "BEDOK" })}>
        Choose Bedok
      </button>
      <button type="button" onClick={onOpenBuyerSetup}>
        Open buyer setup
      </button>
    </div>
  ),
}));

vi.mock("@/features/search-profile/SearchProfileWizard", () => ({
  SearchProfileWizard: ({ onComplete }: { onComplete: (profile: SearchProfile) => void }) => (
    <button
      type="button"
      onClick={() => {
        if (searchProfileWizardMocks.nextProfile) {
          onComplete(searchProfileWizardMocks.nextProfile);
        }
      }}
    >
      Complete buyer setup
    </button>
  ),
}));

vi.mock("@/features/map-explorer/MapView", () => ({
  MapView: () => <div data-testid="map-view" data-theme="light" />,
}));

vi.mock("@/components/ResultsPane", () => ({
  ResultsPane: () => <div data-testid="results-pane" />,
}));

vi.mock("@/features/block-detail/DetailDrawer", () => ({
  DetailDrawer: () => <div data-testid="detail-drawer" />,
}));

vi.mock("@/features/shortlist/ShortlistDrawer", () => ({
  ShortlistDrawer: () => <div data-testid="shortlist-drawer" />,
}));

vi.mock("@/components/StatsBar", () => ({
  GlobalHeader: () => <div data-testid="global-header" />,
}));

vi.mock("@/features/listing-check/ListingCheckPanel", () => ({
  ListingCheckPanel: ({
    selectedAddressKey,
    askingPrice,
    shortlistFull,
  }: {
    selectedAddressKey: string | null;
    askingPrice: number | null;
    shortlistFull: boolean;
  }) => (
    <div
      data-testid="listing-check-panel"
      data-address-key={selectedAddressKey ?? ""}
      data-asking-price={askingPrice ?? ""}
      data-shortlist-full={String(shortlistFull)}
    />
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
  version: 3,
  mainFlatType: "4 ROOM",
  maxBudget: 700000,
  minimumRemainingLeaseYears: 65,
  age: 35,
  coApplicantAge: null,
  cpfOABalance: 100000,
  monthlyIncome: 8000,
} satisfies SearchProfile;

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
    shortlistMocks.items = [];
    searchProfileWizardMocks.nextProfile = null;
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
    expect(screen.getByTestId("map-locale-control")).toBeVisible();
  });

  it("'Check a listing price' CTA in scope prompt opens the check panel", async () => {
    const user = userEvent.setup();
    renderApp();

    const checkButton = await screen.findByRole("button", { name: /check a listing price/i });
    await user.click(checkButton);

    expect(await findLazySurface("listing-check-panel")).toBeVisible();
  });

  it("allows updating an already-saved listing when the shortlist is at capacity", async () => {
    const selectedAddressKey = "bedok-101-bedok-nth-ave-4";
    window.history.replaceState(
      {},
      "",
      `/?checkAddress=${encodeURIComponent(selectedAddressKey)}&checkPrice=600000`,
    );
    shortlistMocks.items = Array.from({ length: 20 }, (_, index) => ({
      addressKey: index === 0 ? selectedAddressKey : `saved-${index}`,
      askingPrice: index === 0 ? 550000 : undefined,
      notes: "",
      targetPrice: null,
      addedAt: `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
    }));

    renderApp();

    const panel = await findLazySurface("listing-check-panel");
    expect(panel).toHaveAttribute("data-address-key", selectedAddressKey);
    expect(panel).toHaveAttribute("data-shortlist-full", "false");
  });

  it("clears an active affordability filter when Buyer setup removes required finance inputs", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/?affordable=comfortable");
    searchProfileWizardMocks.nextProfile = {
      ...completedSearchProfile,
      cpfOABalance: null,
    };

    renderApp();

    await user.click(await screen.findByRole("button", { name: /choose town/i }));
    await user.click(screen.getByRole("button", { name: "Open buyer setup" }));
    await user.click(screen.getByRole("button", { name: "Complete buyer setup" }));

    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).has("affordable")).toBe(false);
    });
  });

  it("clears a bookmarked affordability filter when this browser has no finance profile", async () => {
    window.history.replaceState({}, "", "/?affordable=comfortable");
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    renderApp();

    await findLazySurface("map-view");
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).has("affordable")).toBe(false);
    });
  });

  it("clears affordability mode when CPF is zero instead of marking every home over", async () => {
    window.history.replaceState({}, "", "/?affordable=comfortable");
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) =>
        key === SEARCH_PROFILE_STORAGE_KEY
          ? JSON.stringify({ ...completedSearchProfile, cpfOABalance: 0 })
          : null,
      ),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });

    renderApp();

    await findLazySurface("map-view");
    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).has("affordable")).toBe(false);
    });
  });

  it("retains an active affordability filter when Buyer setup keeps finance complete", async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, "", "/?affordable=stretch");
    searchProfileWizardMocks.nextProfile = completedSearchProfile;

    renderApp();

    await user.click(await screen.findByRole("button", { name: /choose town/i }));
    await user.click(screen.getByRole("button", { name: "Open buyer setup" }));
    await user.click(screen.getByRole("button", { name: "Complete buyer setup" }));

    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get("affordable")).toBe("stretch");
    });
  });

  it("keeps the app shell mounted and preserves the selected block while editing Buyer setup", async () => {
    const user = userEvent.setup();
    const selectedAddressKey = "bedok-101-bedok-nth-ave-4";
    window.history.replaceState({}, "", `/?selected=${encodeURIComponent(selectedAddressKey)}`);
    searchProfileWizardMocks.nextProfile = {
      ...completedSearchProfile,
      monthlyIncome: 9_000,
    };

    renderApp();

    expect(await findLazySurface("map-view")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Open buyer setup" }));

    expect(screen.getByRole("button", { name: "Complete buyer setup" })).toBeInTheDocument();
    expect(screen.getByTestId("map-view")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Complete buyer setup" }));

    await waitFor(() => {
      expect(new URLSearchParams(window.location.search).get("selected")).toBe(selectedAddressKey);
    });
  });
});
