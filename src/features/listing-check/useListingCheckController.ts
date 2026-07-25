import { useCallback, useEffect, useReducer, useRef } from "react";
import { shareViaNavigator } from "@/shared/lib/shareUrls";
import type { ShortlistItem } from "@/types/data";
import {
  buildCheckShareUrl,
  type ListingCheckUrlState,
  useListingCheckUrlState,
} from "./useListingCheckUrlState";

type ListingCheckControllerState = {
  form: ListingCheckUrlState;
};

type ListingCheckControllerAction =
  | { type: "selectAddress"; addressKey: string }
  | { type: "changeAskingPrice"; askingPrice: number | null }
  | { type: "changeFloorArea"; floorAreaSqm: number | null }
  | { type: "changeFlatType"; flatType: string | null }
  | { type: "changeStoreyRange"; storeyRange: string | null }
  | { type: "changeLeaseYear"; leaseCommenceYear: number | null };

type UseListingCheckControllerOptions = {
  shortlistItems: readonly ShortlistItem[];
  toggleShortlist: (addressKey: string) => void;
  updateShortlist: (addressKey: string, patch: Partial<ShortlistItem>) => void;
  openCheckPanel: () => void;
  shareTitle: string;
};

function createInitialState(form: ListingCheckUrlState): ListingCheckControllerState {
  return { form };
}

function updateFormField(
  state: ListingCheckControllerState,
  patch: Partial<ListingCheckUrlState>,
): ListingCheckControllerState {
  return {
    form: { ...state.form, ...patch },
  };
}

function listingCheckReducer(
  state: ListingCheckControllerState,
  action: ListingCheckControllerAction,
): ListingCheckControllerState {
  switch (action.type) {
    case "selectAddress":
      return state.form.selectedAddressKey === action.addressKey
        ? state
        : {
            form: {
              selectedAddressKey: action.addressKey,
              askingPrice: null,
              floorAreaSqm: null,
              flatType: null,
              storeyRange: null,
              leaseCommenceYear: null,
            },
          };
    case "changeAskingPrice":
      return state.form.askingPrice === action.askingPrice
        ? state
        : updateFormField(state, { askingPrice: action.askingPrice });
    case "changeFloorArea":
      return state.form.floorAreaSqm === action.floorAreaSqm
        ? state
        : updateFormField(state, { floorAreaSqm: action.floorAreaSqm });
    case "changeFlatType":
      return state.form.flatType === action.flatType
        ? state
        : updateFormField(state, { flatType: action.flatType });
    case "changeStoreyRange":
      return state.form.storeyRange === action.storeyRange
        ? state
        : updateFormField(state, { storeyRange: action.storeyRange });
    case "changeLeaseYear":
      return state.form.leaseCommenceYear === action.leaseCommenceYear
        ? state
        : updateFormField(state, { leaseCommenceYear: action.leaseCommenceYear });
  }
}

export function useListingCheckController({
  shortlistItems,
  toggleShortlist,
  updateShortlist,
  openCheckPanel,
  shareTitle,
}: UseListingCheckControllerOptions) {
  const { initialCheckState, syncToUrl } = useListingCheckUrlState();
  const [controllerState, dispatch] = useReducer(
    listingCheckReducer,
    initialCheckState,
    createInitialState,
  );
  const hasOpenedInitialCheckRef = useRef(false);

  useEffect(() => {
    if (hasOpenedInitialCheckRef.current || !initialCheckState.selectedAddressKey) {
      return;
    }
    hasOpenedInitialCheckRef.current = true;
    openCheckPanel();
  }, [initialCheckState.selectedAddressKey, openCheckPanel]);

  useEffect(() => {
    syncToUrl(controllerState.form);
  }, [controllerState.form, syncToUrl]);

  const onAddressSelect = useCallback((addressKey: string) => {
    dispatch({ type: "selectAddress", addressKey });
  }, []);

  const onAskingPriceChange = useCallback((askingPrice: number | null) => {
    dispatch({ type: "changeAskingPrice", askingPrice });
  }, []);

  const onFloorAreaChange = useCallback((floorAreaSqm: number | null) => {
    dispatch({ type: "changeFloorArea", floorAreaSqm });
  }, []);

  const onFlatTypeChange = useCallback((flatType: string | null) => {
    dispatch({ type: "changeFlatType", flatType });
  }, []);

  const onStoreyRangeChange = useCallback((storeyRange: string | null) => {
    dispatch({ type: "changeStoreyRange", storeyRange });
  }, []);

  const onLeaseYearChange = useCallback((leaseCommenceYear: number | null) => {
    dispatch({ type: "changeLeaseYear", leaseCommenceYear });
  }, []);

  const onSaveToShortlist = useCallback(() => {
    const { selectedAddressKey, askingPrice } = controllerState.form;
    if (!selectedAddressKey || askingPrice == null) {
      return;
    }

    const alreadySaved = shortlistItems.some((item) => item.addressKey === selectedAddressKey);
    if (!alreadySaved) {
      toggleShortlist(selectedAddressKey);
    }
    updateShortlist(selectedAddressKey, { askingPrice });
  }, [controllerState.form, shortlistItems, toggleShortlist, updateShortlist]);

  const savedToShortlist =
    controllerState.form.selectedAddressKey != null &&
    controllerState.form.askingPrice != null &&
    shortlistItems.some(
      (item) =>
        item.addressKey === controllerState.form.selectedAddressKey &&
        item.askingPrice === controllerState.form.askingPrice,
    );

  const onShare = useCallback(async () => {
    const url = buildCheckShareUrl(controllerState.form);
    try {
      return await shareViaNavigator(url, shareTitle);
    } catch {
      return null;
    }
  }, [controllerState.form, shareTitle]);

  return {
    state: controllerState.form,
    savedToShortlist,
    panelKey: controllerState.form.selectedAddressKey ?? "__none__",
    onAddressSelect,
    onAskingPriceChange,
    onFloorAreaChange,
    onFlatTypeChange,
    onStoreyRangeChange,
    onLeaseYearChange,
    onSaveToShortlist,
    onShare,
  };
}
