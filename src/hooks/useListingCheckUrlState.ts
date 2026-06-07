import { startTransition, useCallback, useMemo } from "react";

export type ListingCheckUrlState = {
  selectedAddressKey: string | null;
  askingPrice: number | null;
  floorAreaSqm: number | null;
  flatType: string | null;
  storeyRange: string | null;
  leaseCommenceYear: number | null;
};

const PARAM_PREFIX = "check";

const PARAMS = {
  address: `${PARAM_PREFIX}Address`,
  price: `${PARAM_PREFIX}Price`,
  sqm: `${PARAM_PREFIX}Sqm`,
  flatType: `${PARAM_PREFIX}FlatType`,
  storey: `${PARAM_PREFIX}Storey`,
  lease: `${PARAM_PREFIX}Lease`,
} as const;

function parseCheckState(search: string): ListingCheckUrlState {
  const params = new URLSearchParams(search);

  const address = params.get(PARAMS.address) || null;
  const priceRaw = params.get(PARAMS.price);
  const sqmRaw = params.get(PARAMS.sqm);
  const flatType = params.get(PARAMS.flatType) || null;
  const storey = params.get(PARAMS.storey) || null;
  const leaseRaw = params.get(PARAMS.lease);

  const askingPrice = parseNumeric(priceRaw);
  const floorAreaSqm = parseNumeric(sqmRaw);
  const leaseCommenceYear = parseNumeric(leaseRaw);

  return {
    selectedAddressKey: address,
    askingPrice,
    floorAreaSqm,
    flatType,
    storeyRange: storey,
    leaseCommenceYear,
  };
}

function parseNumeric(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function serializeCheckState(state: ListingCheckUrlState): string {
  const params = new URLSearchParams();

  if (state.selectedAddressKey) {
    params.set(PARAMS.address, state.selectedAddressKey);
  }
  if (state.askingPrice != null) {
    params.set(PARAMS.price, String(state.askingPrice));
  }
  if (state.floorAreaSqm != null) {
    params.set(PARAMS.sqm, String(state.floorAreaSqm));
  }
  if (state.flatType) {
    params.set(PARAMS.flatType, state.flatType);
  }
  if (state.storeyRange) {
    params.set(PARAMS.storey, state.storeyRange);
  }
  if (state.leaseCommenceYear != null) {
    params.set(PARAMS.lease, String(state.leaseCommenceYear));
  }

  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Builds the full shareable URL from the current check state.
 * Preserves non-check query params already in the URL.
 */
export function buildCheckShareUrl(state: ListingCheckUrlState): string {
  const existingParams = new URLSearchParams(window.location.search);

  // Remove any existing check params to avoid duplication
  for (const key of Object.values(PARAMS)) {
    existingParams.delete(key);
  }

  if (state.selectedAddressKey) {
    existingParams.set(PARAMS.address, state.selectedAddressKey);
  }
  if (state.askingPrice != null) {
    existingParams.set(PARAMS.price, String(state.askingPrice));
  }
  if (state.floorAreaSqm != null) {
    existingParams.set(PARAMS.sqm, String(state.floorAreaSqm));
  }
  if (state.flatType) {
    existingParams.set(PARAMS.flatType, state.flatType);
  }
  if (state.storeyRange) {
    existingParams.set(PARAMS.storey, state.storeyRange);
  }
  if (state.leaseCommenceYear != null) {
    existingParams.set(PARAMS.lease, String(state.leaseCommenceYear));
  }

  const qs = existingParams.toString();
  return `${window.location.origin}${window.location.pathname}${qs ? `?${qs}` : ""}`;
}

export function useListingCheckUrlState() {
  const initial = useMemo<ListingCheckUrlState>(() => {
    if (typeof window === "undefined") {
      return {
        selectedAddressKey: null,
        askingPrice: null,
        floorAreaSqm: null,
        flatType: null,
        storeyRange: null,
        leaseCommenceYear: null,
      };
    }
    return parseCheckState(window.location.search);
  }, []);

  const syncToUrl = useCallback((nextState: ListingCheckUrlState) => {
    startTransition(() => {
      const nextSearch = serializeCheckState(nextState);
      const existingParams = new URLSearchParams(window.location.search);

      // Remove check params from existing
      for (const key of Object.values(PARAMS)) {
        existingParams.delete(key);
      }

      // Build full search string
      const existingQS = existingParams.toString();
      const fullQS = existingQS
        ? `${existingQS}&${nextSearch.slice(1)}`
        : nextSearch;

      window.history.replaceState({}, "", `${window.location.pathname}${fullQS}`);
    });
  }, []);

  return {
    initialCheckState: initial,
    syncToUrl,
  };
}
