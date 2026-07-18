import { StrictMode, type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useListingCheckController } from "@/features/listing-check/useListingCheckController";
import type { ListingCheckUrlState } from "@/features/listing-check/useListingCheckUrlState";
import type { BlockSummary, ShortlistItem } from "@/types/data";

const shareMocks = vi.hoisted(() => ({
  shareViaNavigator: vi.fn<(url: string, title: string) => Promise<"shared" | "copied">>(),
}));

vi.mock("@/shared/lib/shareUrls", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/lib/shareUrls")>();
  return {
    ...original,
    shareViaNavigator: shareMocks.shareViaNavigator,
  };
});

const FIXED_NOW = "2026-07-16T01:02:03Z";
const SHARE_TITLE = "HDB Resale Visualizer";

const VALID_STATE: ListingCheckUrlState = {
  selectedAddressKey: "bedok-106-lengkong-tiga",
  askingPrice: 1_200_000,
  floorAreaSqm: 150,
  flatType: "EXECUTIVE",
  storeyRange: "01 TO 03",
  leaseCommenceYear: 1989,
};

const BASE_BLOCK: BlockSummary = {
  addressKey: "base-block",
  town: "BEDOK",
  block: "106",
  streetName: "LENGKONG TIGA",
  coordinates: { lat: 1.32, lng: 103.92 },
  medianPrice: 500_000,
  pricePerSqmMedian: 6_000,
  transactionCount: 8,
  floorAreaRange: [90, 100],
  leaseCommenceRange: [1980, 1984],
  latestMonth: "2026-04",
  availableDateRange: ["2025-01", "2026-04"],
  flatTypes: ["4 ROOM"],
  flatModels: ["MODEL A"],
  nearestMrt: null,
};

type ControllerOptions = Parameters<typeof useListingCheckController>[0];
type ControllerResult = ReturnType<typeof useListingCheckController>;

function StrictModeWrapper({ children }: PropsWithChildren) {
  return <StrictMode>{children}</StrictMode>;
}

function makeBlock(overrides: Partial<BlockSummary>): BlockSummary {
  return { ...BASE_BLOCK, ...overrides };
}

function makeShortlistItem(addressKey: string): ShortlistItem {
  return {
    addressKey,
    notes: "keep existing notes",
    targetPrice: 1_100_000,
    addedAt: "2026-07-01T00:00:00Z",
  };
}

function setCheckUrl(state: ListingCheckUrlState, unrelatedParams = new URLSearchParams()): void {
  const params = new URLSearchParams(unrelatedParams);
  if (state.selectedAddressKey) params.set("checkAddress", state.selectedAddressKey);
  if (state.askingPrice != null) params.set("checkPrice", String(state.askingPrice));
  if (state.floorAreaSqm != null) params.set("checkSqm", String(state.floorAreaSqm));
  if (state.flatType) params.set("checkFlatType", state.flatType);
  if (state.storeyRange) params.set("checkStorey", state.storeyRange);
  if (state.leaseCommenceYear != null) params.set("checkLease", String(state.leaseCommenceYear));
  const query = params.toString();
  window.history.replaceState({}, "", `/${query ? `?${query}` : ""}`);
}

function makeOptions(overrides: Partial<ControllerOptions> = {}): ControllerOptions {
  return {
    blocks: [],
    shortlistItems: [],
    toggleShortlist: vi.fn<ControllerOptions["toggleShortlist"]>(),
    updateShortlist: vi.fn<ControllerOptions["updateShortlist"]>(),
    openCheckPanel: vi.fn<ControllerOptions["openCheckPanel"]>(),
    shareTitle: SHARE_TITLE,
    nowISOString: () => FIXED_NOW,
    ...overrides,
  };
}

function renderController(
  overrides: Partial<ControllerOptions> = {},
  { strict = false }: { strict?: boolean } = {},
) {
  const options = makeOptions(overrides);
  const rendered = renderHook(() => useListingCheckController(options), {
    wrapper: strict ? StrictModeWrapper : undefined,
  });
  return { ...rendered, options };
}

function saveListing(controller: ControllerResult): void {
  act(() => {
    controller.onSaveToShortlist();
  });
}

describe("useListingCheckController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/");
    shareMocks.shareViaNavigator.mockResolvedValue("copied");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("hydrates every field from the URL and opens the deep-linked panel exactly once", async () => {
    setCheckUrl(VALID_STATE, new URLSearchParams({ town: "BEDOK" }));
    const openCheckPanel = vi.fn();

    const { result, rerender } = renderController({ openCheckPanel }, { strict: true });

    expect(result.current.state).toEqual(VALID_STATE);
    expect(result.current.savedToShortlist).toBe(false);
    expect(result.current.panelKey).toBe(VALID_STATE.selectedAddressKey);
    await waitFor(() => expect(openCheckPanel).toHaveBeenCalledTimes(1));

    rerender();
    expect(openCheckPanel).toHaveBeenCalledTimes(1);
  });

  it("does not open the panel without an initial address or when an address is selected later", () => {
    const openCheckPanel = vi.fn();
    const { result, rerender } = renderController({ openCheckPanel });

    expect(openCheckPanel).not.toHaveBeenCalled();
    rerender();
    act(() => result.current.onAddressSelect("bedok-101-bedok-nth-ave-4"));

    expect(openCheckPanel).not.toHaveBeenCalled();
  });

  const invalidatingChanges: Array<{
    label: string;
    apply: (controller: ControllerResult) => void;
  }> = [
    {
      label: "asking price",
      apply: (controller) => controller.onAskingPriceChange(1_250_000),
    },
    {
      label: "floor area",
      apply: (controller) => controller.onFloorAreaChange(151),
    },
    {
      label: "flat type",
      apply: (controller) => controller.onFlatTypeChange("5 ROOM"),
    },
    {
      label: "storey range",
      apply: (controller) => controller.onStoreyRangeChange("04 TO 06"),
    },
    {
      label: "lease year",
      apply: (controller) => controller.onLeaseYearChange(1990),
    },
    {
      label: "address",
      apply: (controller) => controller.onAddressSelect("bedok-108-lengkong-tiga"),
    },
  ];

  it.each(invalidatingChanges)(
    "invalidates the saved state when the $label changes",
    ({ apply }) => {
      setCheckUrl(VALID_STATE);
      const existingItem = makeShortlistItem(VALID_STATE.selectedAddressKey!);
      const { result } = renderController({ shortlistItems: [existingItem] });

      saveListing(result.current);
      expect(result.current.savedToShortlist).toBe(true);

      act(() => apply(result.current));
      expect(result.current.savedToShortlist).toBe(false);
    },
  );

  it("adds and updates a new shortlist item with the exact listing-check notes", () => {
    setCheckUrl(VALID_STATE);
    const toggleShortlist = vi.fn<ControllerOptions["toggleShortlist"]>();
    const updateShortlist = vi.fn<ControllerOptions["updateShortlist"]>();
    const { result } = renderController({ toggleShortlist, updateShortlist });

    saveListing(result.current);

    expect(toggleShortlist).toHaveBeenCalledOnce();
    expect(toggleShortlist).toHaveBeenCalledWith(VALID_STATE.selectedAddressKey);
    expect(updateShortlist).toHaveBeenCalledOnce();
    const [addressKey, patch] = updateShortlist.mock.calls[0]!;
    expect(addressKey).toBe(VALID_STATE.selectedAddressKey);
    expect(patch.targetPrice).toBe(VALID_STATE.askingPrice);
    const notes: unknown = JSON.parse(String(patch.notes));
    expect(notes).toEqual({
      type: "listingCheck",
      askingPrice: VALID_STATE.askingPrice,
      floorAreaSqm: VALID_STATE.floorAreaSqm,
      flatType: VALID_STATE.flatType,
      storeyRange: VALID_STATE.storeyRange,
      leaseCommenceYear: VALID_STATE.leaseCommenceYear,
      timestamp: FIXED_NOW,
    });
    expect(result.current.savedToShortlist).toBe(true);
  });

  it("retains null listing facts as explicit keys in saved notes", () => {
    const minimalState: ListingCheckUrlState = {
      selectedAddressKey: VALID_STATE.selectedAddressKey,
      askingPrice: VALID_STATE.askingPrice,
      floorAreaSqm: null,
      flatType: null,
      storeyRange: null,
      leaseCommenceYear: null,
    };
    setCheckUrl(minimalState);
    const updateShortlist = vi.fn<ControllerOptions["updateShortlist"]>();
    const { result } = renderController({ updateShortlist });

    saveListing(result.current);

    const notes: unknown = JSON.parse(String(updateShortlist.mock.calls[0]![1].notes));
    expect(notes).toEqual({
      type: "listingCheck",
      askingPrice: VALID_STATE.askingPrice,
      floorAreaSqm: null,
      flatType: null,
      storeyRange: null,
      leaseCommenceYear: null,
      timestamp: FIXED_NOW,
    });
  });

  it("updates an existing shortlist item without toggling it off", () => {
    setCheckUrl(VALID_STATE);
    const existingItem = makeShortlistItem(VALID_STATE.selectedAddressKey!);
    const toggleShortlist = vi.fn<ControllerOptions["toggleShortlist"]>();
    const updateShortlist = vi.fn<ControllerOptions["updateShortlist"]>();
    const { result } = renderController({
      shortlistItems: [existingItem],
      toggleShortlist,
      updateShortlist,
    });

    saveListing(result.current);

    expect(toggleShortlist).not.toHaveBeenCalled();
    expect(updateShortlist).toHaveBeenCalledOnce();
    expect(updateShortlist).toHaveBeenCalledWith(
      VALID_STATE.selectedAddressKey,
      expect.objectContaining({ targetPrice: VALID_STATE.askingPrice }),
    );
    expect(result.current.savedToShortlist).toBe(true);
  });

  it.each([
    {
      label: "address",
      state: { ...VALID_STATE, selectedAddressKey: null },
    },
    {
      label: "asking price",
      state: { ...VALID_STATE, askingPrice: null },
    },
  ])("does nothing when the $label is missing", ({ state }) => {
    setCheckUrl(state);
    const toggleShortlist = vi.fn<ControllerOptions["toggleShortlist"]>();
    const updateShortlist = vi.fn<ControllerOptions["updateShortlist"]>();
    const nowISOString = vi.fn(() => FIXED_NOW);
    const { result } = renderController({ toggleShortlist, updateShortlist, nowISOString });

    saveListing(result.current);

    expect(toggleShortlist).not.toHaveBeenCalled();
    expect(updateShortlist).not.toHaveBeenCalled();
    expect(nowISOString).not.toHaveBeenCalled();
    expect(result.current.savedToShortlist).toBe(false);
  });

  const ineligibleByPrice = makeBlock({
    addressKey: "000-ineligible-price",
    medianPrice: 0,
  });
  const ineligibleByCount = makeBlock({
    addressKey: "001-ineligible-count",
    transactionCount: 0,
  });
  const laterEligible = makeBlock({
    addressKey: "eligible-z",
    medianPrice: 700_000,
  });
  const expectedEligible = makeBlock({
    addressKey: "eligible-a",
    medianPrice: 500_000.6,
    floorAreaRange: [67, 68],
    leaseCommenceRange: [1980, 1985],
    flatTypes: ["5 ROOM", "3 ROOM", "4 ROOM"],
  });
  const sampleBlocks = [laterEligible, ineligibleByCount, expectedEligible, ineligibleByPrice];

  it.each([
    { label: "forward order", blocks: sampleBlocks },
    { label: "reverse order", blocks: [...sampleBlocks].reverse() },
  ])("selects the same deterministic eligible sample in $label", ({ blocks }) => {
    const openCheckPanel = vi.fn();
    const { result } = renderController({ blocks, openCheckPanel });

    act(() => result.current.onUseSampleCheck());

    expect(result.current.state).toEqual({
      selectedAddressKey: "eligible-a",
      askingPrice: 500_001,
      floorAreaSqm: 68,
      flatType: "3 ROOM",
      storeyRange: null,
      leaseCommenceYear: 1983,
    });
    expect(result.current.savedToShortlist).toBe(false);
    expect(result.current.panelKey).toBe("eligible-a");
    expect(openCheckPanel).toHaveBeenCalledOnce();
  });

  it("keeps incomplete sample facts null instead of crashing", () => {
    const incompleteBlock = {
      ...makeBlock({ addressKey: "eligible-incomplete" }),
      floorAreaRange: null,
      leaseCommenceRange: undefined,
      flatTypes: undefined,
    } as unknown as BlockSummary;
    const openCheckPanel = vi.fn();
    const { result } = renderController({ blocks: [incompleteBlock], openCheckPanel });

    act(() => result.current.onUseSampleCheck());

    expect(result.current.state).toEqual({
      selectedAddressKey: "eligible-incomplete",
      askingPrice: 500_000,
      floorAreaSqm: null,
      flatType: null,
      storeyRange: null,
      leaseCommenceYear: null,
    });
    expect(openCheckPanel).toHaveBeenCalledOnce();
  });

  it.each([
    { label: "no blocks", blocks: [] },
    { label: "no eligible blocks", blocks: [ineligibleByPrice, ineligibleByCount] },
  ])("uses the exact fallback sample when there are $label", ({ blocks }) => {
    const openCheckPanel = vi.fn();
    const { result } = renderController({ blocks, openCheckPanel });

    act(() => result.current.onUseSampleCheck());

    expect(result.current.state).toEqual({
      selectedAddressKey: "406-ANG MO KIO AVE 10",
      askingPrice: 450_000,
      floorAreaSqm: 68,
      flatType: "4 ROOM",
      storeyRange: null,
      leaseCommenceYear: 1980,
    });
    expect(openCheckPanel).toHaveBeenCalledOnce();
  });

  it("resets a previously saved listing when applying the sample", () => {
    const openCheckPanel = vi.fn();
    const { result } = renderController({ blocks: sampleBlocks, openCheckPanel });

    act(() => {
      result.current.onAddressSelect("original-address");
      result.current.onAskingPriceChange(600_000);
    });
    saveListing(result.current);
    expect(result.current.savedToShortlist).toBe(true);

    act(() => result.current.onUseSampleCheck());

    expect(result.current.savedToShortlist).toBe(false);
    expect(openCheckPanel).toHaveBeenCalledOnce();
  });

  it("shares the current controller state with unrelated URL parameters and the caller title", async () => {
    setCheckUrl(VALID_STATE, new URLSearchParams({ town: "BEDOK", sort: "median-desc" }));
    const { result } = renderController();

    act(() => result.current.onAskingPriceChange(1_250_000));
    let outcome: "shared" | "copied" | null | undefined;
    await act(async () => {
      outcome = await result.current.onShare();
    });

    expect(outcome).toBe("copied");
    expect(shareMocks.shareViaNavigator).toHaveBeenCalledOnce();
    const [sharedUrl, title] = shareMocks.shareViaNavigator.mock.calls[0]!;
    const url = new URL(sharedUrl);
    expect(title).toBe(SHARE_TITLE);
    expect(url.searchParams.get("town")).toBe("BEDOK");
    expect(url.searchParams.get("sort")).toBe("median-desc");
    expect(url.searchParams.get("checkAddress")).toBe(VALID_STATE.selectedAddressKey);
    expect(url.searchParams.get("checkPrice")).toBe("1250000");
    expect(url.searchParams.get("checkSqm")).toBe("150");
    expect(url.searchParams.get("checkFlatType")).toBe("EXECUTIVE");
    expect(url.searchParams.get("checkStorey")).toBe("01 TO 03");
    expect(url.searchParams.get("checkLease")).toBe("1989");
  });

  it("returns null when sharing fails", async () => {
    setCheckUrl(VALID_STATE);
    shareMocks.shareViaNavigator.mockRejectedValueOnce(new Error("clipboard unavailable"));
    const { result } = renderController();
    let outcome: "shared" | "copied" | null | undefined;

    await act(async () => {
      outcome = await result.current.onShare();
    });

    expect(outcome).toBeNull();
  });
});
