import { StrictMode, type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { useListingCheckController } from "@/features/listing-check/useListingCheckController";
import type { ListingCheckUrlState } from "@/features/listing-check/useListingCheckUrlState";
import type { ShortlistItem } from "@/types/data";

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

const SHARE_TITLE = "HDB Resale Visualizer";

const VALID_STATE: ListingCheckUrlState = {
  selectedAddressKey: "bedok-106-lengkong-tiga",
  askingPrice: 1_200_000,
  floorAreaSqm: 150,
  flatType: "EXECUTIVE",
  storeyRange: "01 TO 03",
  leaseCommenceYear: 1989,
};

type ControllerOptions = Parameters<typeof useListingCheckController>[0];
type ControllerResult = ReturnType<typeof useListingCheckController>;

function StrictModeWrapper({ children }: PropsWithChildren) {
  return <StrictMode>{children}</StrictMode>;
}

function makeShortlistItem(addressKey: string, askingPrice?: number): ShortlistItem {
  return {
    addressKey,
    askingPrice,
    notes: "keep existing notes",
    buyerNotes: "keep exact buyer notes",
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
    shortlistItems: [],
    toggleShortlist: vi.fn<ControllerOptions["toggleShortlist"]>(),
    updateShortlist: vi.fn<ControllerOptions["updateShortlist"]>(),
    openCheckPanel: vi.fn<ControllerOptions["openCheckPanel"]>(),
    shareTitle: SHARE_TITLE,
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
  const rerenderWith = (nextOptions: Partial<ControllerOptions>) => {
    Object.assign(options, nextOptions);
    rendered.rerender();
  };
  return { ...rendered, options, rerenderWith };
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
      label: "address",
      apply: (controller) => controller.onAddressSelect("bedok-108-lengkong-tiga"),
    },
  ];

  it.each(invalidatingChanges)(
    "invalidates the saved state when the $label changes",
    ({ apply }) => {
      setCheckUrl(VALID_STATE);
      const existingItem = makeShortlistItem(
        VALID_STATE.selectedAddressKey!,
        VALID_STATE.askingPrice!,
      );
      const { result } = renderController({ shortlistItems: [existingItem] });

      saveListing(result.current);
      expect(result.current.savedToShortlist).toBe(true);

      act(() => apply(result.current));
      expect(result.current.savedToShortlist).toBe(false);
    },
  );

  it("adds a new shortlist item and saves the seller's asking price only", () => {
    setCheckUrl(VALID_STATE);
    const toggleShortlist = vi.fn<ControllerOptions["toggleShortlist"]>();
    const updateShortlist = vi.fn<ControllerOptions["updateShortlist"]>();
    const { result, rerenderWith } = renderController({ toggleShortlist, updateShortlist });

    saveListing(result.current);

    expect(toggleShortlist).toHaveBeenCalledOnce();
    expect(toggleShortlist).toHaveBeenCalledWith(VALID_STATE.selectedAddressKey);
    expect(updateShortlist).toHaveBeenCalledOnce();
    expect(updateShortlist).toHaveBeenCalledWith(VALID_STATE.selectedAddressKey, {
      askingPrice: VALID_STATE.askingPrice,
    });
    expect(result.current.savedToShortlist).toBe(false);

    rerenderWith({
      shortlistItems: [
        makeShortlistItem(VALID_STATE.selectedAddressKey!, VALID_STATE.askingPrice!),
      ],
    });
    expect(result.current.savedToShortlist).toBe(true);

    rerenderWith({ shortlistItems: [] });
    expect(result.current.savedToShortlist).toBe(false);
  });

  it("updates an existing shortlist item without overwriting buyer notes or target price", () => {
    setCheckUrl(VALID_STATE);
    const existingItem = makeShortlistItem(
      VALID_STATE.selectedAddressKey!,
      VALID_STATE.askingPrice!,
    );
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
    expect(updateShortlist).toHaveBeenCalledWith(VALID_STATE.selectedAddressKey, {
      askingPrice: VALID_STATE.askingPrice,
    });
    expect(existingItem).toMatchObject({
      notes: "keep existing notes",
      buyerNotes: "keep exact buyer notes",
      targetPrice: 1_100_000,
    });
    expect(result.current.savedToShortlist).toBe(true);
  });

  it("clears stale listing facts when a different block is selected", () => {
    setCheckUrl(VALID_STATE);
    const { result } = renderController();

    act(() => result.current.onAddressSelect("bedok-108-lengkong-tiga"));

    expect(result.current.state).toEqual({
      selectedAddressKey: "bedok-108-lengkong-tiga",
      askingPrice: null,
      floorAreaSqm: null,
      flatType: null,
      storeyRange: null,
      leaseCommenceYear: null,
    });
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
    const { result } = renderController({ toggleShortlist, updateShortlist });

    saveListing(result.current);

    expect(toggleShortlist).not.toHaveBeenCalled();
    expect(updateShortlist).not.toHaveBeenCalled();
    expect(result.current.savedToShortlist).toBe(false);
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
