import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  buildCheckShareUrl,
  type ListingCheckUrlState,
  useListingCheckUrlState,
} from "@/features/listing-check/useListingCheckUrlState";

const EMPTY_STATE: ListingCheckUrlState = {
  selectedAddressKey: null,
  askingPrice: null,
  floorAreaSqm: null,
  flatType: null,
  storeyRange: null,
  leaseCommenceYear: null,
};

const COMPLETE_STATE: ListingCheckUrlState = {
  selectedAddressKey: "bedok-106-lengkong-tiga",
  askingPrice: 1_200_000,
  floorAreaSqm: 150.5,
  flatType: "EXECUTIVE",
  storeyRange: "01 TO 03",
  leaseCommenceYear: 1989,
};

const CHECK_PARAM_NAMES = [
  "checkAddress",
  "checkPrice",
  "checkSqm",
  "checkFlatType",
  "checkStorey",
  "checkLease",
] as const;

describe("useListingCheckUrlState", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/");
  });

  it("hydrates every field from valid query parameters", () => {
    const params = new URLSearchParams({
      checkAddress: COMPLETE_STATE.selectedAddressKey!,
      checkPrice: "1,200,000",
      checkSqm: "150.5 sqm",
      checkFlatType: COMPLETE_STATE.flatType!,
      checkStorey: COMPLETE_STATE.storeyRange!,
      checkLease: String(COMPLETE_STATE.leaseCommenceYear),
    });
    window.history.replaceState({}, "", `/?${params.toString()}`);

    const { result } = renderHook(() => useListingCheckUrlState());

    expect(result.current.initialCheckState).toEqual(COMPLETE_STATE);
  });

  it("hydrates invalid numeric values as null", () => {
    const params = new URLSearchParams({
      checkAddress: "bedok-106-lengkong-tiga",
      checkPrice: "0",
      checkSqm: "-12",
      checkFlatType: "EXECUTIVE",
      checkStorey: "01 TO 03",
      checkLease: "9999",
    });
    window.history.replaceState({}, "", `/?${params.toString()}`);

    const { result } = renderHook(() => useListingCheckUrlState());

    expect(result.current.initialCheckState).toEqual({
      selectedAddressKey: "bedok-106-lengkong-tiga",
      askingPrice: null,
      floorAreaSqm: null,
      flatType: "EXECUTIVE",
      storeyRange: "01 TO 03",
      leaseCommenceYear: null,
    });
  });

  it("removes stale check parameters when syncing cleared state", () => {
    const params = new URLSearchParams({
      town: "BEDOK",
      checkAddress: "old-address",
      checkPrice: "500000",
      checkSqm: "90",
      checkFlatType: "4 ROOM",
      checkStorey: "04 TO 06",
      checkLease: "1985",
    });
    window.history.replaceState({}, "", `/map?${params.toString()}`);
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    const pushSpy = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() => useListingCheckUrlState());

    act(() => result.current.syncToUrl(EMPTY_STATE));

    const synced = new URLSearchParams(window.location.search);
    expect(synced.get("town")).toBe("BEDOK");
    for (const name of CHECK_PARAM_NAMES) {
      expect(synced.has(name)).toBe(false);
    }
    expect(replaceSpy).toHaveBeenCalledWith({}, "", "/map?town=BEDOK");
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("syncs current check state while preserving unrelated query parameters", () => {
    const params = new URLSearchParams({
      town: "BEDOK",
      selected: "another-block",
      sort: "median-desc",
      checkAddress: "old-address",
      checkPrice: "1",
    });
    window.history.replaceState({}, "", `/map?${params.toString()}`);
    const { result } = renderHook(() => useListingCheckUrlState());

    act(() => result.current.syncToUrl(COMPLETE_STATE));

    const synced = new URLSearchParams(window.location.search);
    expect(synced.get("town")).toBe("BEDOK");
    expect(synced.get("selected")).toBe("another-block");
    expect(synced.get("sort")).toBe("median-desc");
    expect(synced.get("checkAddress")).toBe(COMPLETE_STATE.selectedAddressKey);
    expect(synced.get("checkPrice")).toBe("1200000");
    expect(synced.get("checkSqm")).toBe("150.5");
    expect(synced.get("checkFlatType")).toBe("EXECUTIVE");
    expect(synced.get("checkStorey")).toBe("01 TO 03");
    expect(synced.get("checkLease")).toBe("1989");
  });

  it("builds a share URL that replaces old check state and preserves unrelated parameters", () => {
    const params = new URLSearchParams({
      town: "BEDOK",
      affordable: "comfortable",
      checkAddress: "old-address",
      checkPrice: "1",
    });
    window.history.replaceState({}, "", `/map?${params.toString()}`);

    const shared = new URL(buildCheckShareUrl(COMPLETE_STATE));

    expect(shared.origin).toBe(window.location.origin);
    expect(shared.pathname).toBe("/map");
    expect(shared.searchParams.get("town")).toBe("BEDOK");
    expect(shared.searchParams.get("affordable")).toBe("comfortable");
    expect(shared.searchParams.get("checkAddress")).toBe(COMPLETE_STATE.selectedAddressKey);
    expect(shared.searchParams.get("checkPrice")).toBe("1200000");
    expect(shared.searchParams.get("checkSqm")).toBe("150.5");
    expect(shared.searchParams.get("checkFlatType")).toBe("EXECUTIVE");
    expect(shared.searchParams.get("checkStorey")).toBe("01 TO 03");
    expect(shared.searchParams.get("checkLease")).toBe("1989");
  });

  it("does not serialize omitted fields as empty parameters", () => {
    const addressOnly: ListingCheckUrlState = {
      ...EMPTY_STATE,
      selectedAddressKey: "bedok-106-lengkong-tiga",
    };
    window.history.replaceState({}, "", "/map?town=BEDOK&checkPrice=500000");
    const { result } = renderHook(() => useListingCheckUrlState());

    act(() => result.current.syncToUrl(addressOnly));

    const synced = new URLSearchParams(window.location.search);
    expect(synced.get("checkAddress")).toBe(addressOnly.selectedAddressKey);
    for (const name of CHECK_PARAM_NAMES.slice(1)) {
      expect(synced.has(name)).toBe(false);
    }

    const shared = new URL(buildCheckShareUrl(addressOnly));
    expect(shared.searchParams.get("checkAddress")).toBe(addressOnly.selectedAddressKey);
    for (const name of CHECK_PARAM_NAMES.slice(1)) {
      expect(shared.searchParams.has(name)).toBe(false);
    }
  });
});
