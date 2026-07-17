import { useCallback, useEffect, useReducer, useRef } from "react";
import { shareViaNavigator } from "@/shared/lib/shareUrls";
import type { BlockSummary, ShortlistItem } from "@/types/data";
import {
  buildCheckShareUrl,
  type ListingCheckUrlState,
  useListingCheckUrlState,
} from "./useListingCheckUrlState";

type ListingCheckControllerState = {
  form: ListingCheckUrlState;
  savedToShortlist: boolean;
};

type ListingCheckControllerAction =
  | { type: "selectAddress"; addressKey: string }
  | { type: "changeAskingPrice"; askingPrice: number | null }
  | { type: "changeFloorArea"; floorAreaSqm: number | null }
  | { type: "changeFlatType"; flatType: string | null }
  | { type: "changeStoreyRange"; storeyRange: string | null }
  | { type: "changeLeaseYear"; leaseCommenceYear: number | null }
  | { type: "applySample"; form: ListingCheckUrlState }
  | { type: "markSaved" };

type SampleListingBlock = Pick<
  BlockSummary,
  | "addressKey"
  | "medianPrice"
  | "transactionCount"
  | "floorAreaRange"
  | "leaseCommenceRange"
  | "flatTypes"
>;

type UseListingCheckControllerOptions = {
  blocks: readonly BlockSummary[];
  shortlistItems: readonly ShortlistItem[];
  toggleShortlist: (addressKey: string) => void;
  updateShortlist: (addressKey: string, patch: Partial<ShortlistItem>) => void;
  openCheckPanel: () => void;
  shareTitle: string;
  nowISOString?: () => string;
};

const FALLBACK_SAMPLE: SampleListingBlock = {
  addressKey: "406-ANG MO KIO AVE 10",
  medianPrice: 450000,
  transactionCount: 1,
  floorAreaRange: [68, 68],
  leaseCommenceRange: [1980, 1980],
  flatTypes: ["4 ROOM"],
};

function defaultNowISOString(): string {
  return Temporal.Now.instant().toString();
}

function createInitialState(form: ListingCheckUrlState): ListingCheckControllerState {
  return { form, savedToShortlist: false };
}

function updateFormField(
  state: ListingCheckControllerState,
  patch: Partial<ListingCheckUrlState>,
): ListingCheckControllerState {
  return {
    form: { ...state.form, ...patch },
    savedToShortlist: false,
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
        : updateFormField(state, { selectedAddressKey: action.addressKey });
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
    case "applySample":
      return { form: action.form, savedToShortlist: false };
    case "markSaved":
      return state.savedToShortlist ? state : { ...state, savedToShortlist: true };
  }
}

function chooseSampleBlock(blocks: readonly BlockSummary[]): SampleListingBlock {
  let best: BlockSummary | null = null;

  for (const block of blocks) {
    if (
      block.medianPrice > 0 &&
      block.transactionCount > 0 &&
      (!best || block.addressKey < best.addressKey)
    ) {
      best = block;
    }
  }

  return best ?? FALLBACK_SAMPLE;
}

function sampleFormState(block: SampleListingBlock): ListingCheckUrlState {
  const [minArea, maxArea] = block.floorAreaRange ?? [];
  const [minLease, maxLease] = block.leaseCommenceRange ?? [];
  const flatType =
    block.flatTypes?.reduce<string | null>(
      (lowest, candidate) => (lowest == null || candidate < lowest ? candidate : lowest),
      null,
    ) ?? null;
  const floorAreaSqm =
    minArea != null && maxArea != null ? Math.round((minArea + maxArea) / 2) : null;
  const leaseCommenceYear =
    minLease != null && maxLease != null && minLease > 0 && maxLease > 0
      ? Math.round((minLease + maxLease) / 2)
      : null;

  return {
    selectedAddressKey: block.addressKey,
    askingPrice: Math.round(block.medianPrice),
    floorAreaSqm,
    flatType,
    storeyRange: null,
    leaseCommenceYear,
  };
}

export function useListingCheckController({
  blocks,
  shortlistItems,
  toggleShortlist,
  updateShortlist,
  openCheckPanel,
  shareTitle,
  nowISOString = defaultNowISOString,
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

  const onUseSampleCheck = useCallback(() => {
    dispatch({ type: "applySample", form: sampleFormState(chooseSampleBlock(blocks)) });
    openCheckPanel();
  }, [blocks, openCheckPanel]);

  const onSaveToShortlist = useCallback(() => {
    const {
      selectedAddressKey,
      askingPrice,
      floorAreaSqm,
      flatType,
      storeyRange,
      leaseCommenceYear,
    } = controllerState.form;
    if (!selectedAddressKey || askingPrice == null) {
      return;
    }

    const notes = JSON.stringify({
      type: "listingCheck",
      askingPrice,
      floorAreaSqm,
      flatType,
      storeyRange,
      leaseCommenceYear,
      timestamp: nowISOString(),
    });
    const alreadySaved = shortlistItems.some((item) => item.addressKey === selectedAddressKey);
    if (!alreadySaved) {
      toggleShortlist(selectedAddressKey);
    }
    updateShortlist(selectedAddressKey, { notes, targetPrice: askingPrice });
    dispatch({ type: "markSaved" });
  }, [controllerState.form, nowISOString, shortlistItems, toggleShortlist, updateShortlist]);

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
    savedToShortlist: controllerState.savedToShortlist,
    panelKey: controllerState.form.selectedAddressKey ?? "__none__",
    onAddressSelect,
    onAskingPriceChange,
    onFloorAreaChange,
    onFlatTypeChange,
    onStoreyRangeChange,
    onLeaseYearChange,
    onUseSampleCheck,
    onSaveToShortlist,
    onShare,
  };
}
