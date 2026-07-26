import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAddressDetail } from "@/shared/lib/data";
import type { AddressDetail } from "@/types/data";
import type { ListingComparableSet } from "../../../shared/comparable-engine";
import {
  buildComparableRequestBody,
  buildDisplayComparables,
  buildListingAdjustmentMeta,
  deriveComparableQualityTag,
  deriveEvidenceCaveats,
  deriveFlatTypeOptions,
  deriveListingCheckResult,
  deriveStoreyOptions,
  type DisplayComparable,
  type EvidenceCaveat,
  type ListingAdjustmentMeta,
  type ListingCheckAnalysisResult,
  type ListingComparableResponse,
} from "./listingCheckAnalysis";

export type UseListingCheckAnalysisOptions = {
  selectedAddressKey: string | null;
  askingPrice: number | null;
  floorAreaSqm: number | null;
  flatType: string | null;
  storeyRange: string | null;
  leaseCommenceYear: number | null;
  referenceMonth?: string;
};

export type ListingCheckAnalysisState = {
  detail: AddressDetail | null;
  detailLoading: boolean;
  detailError: boolean;
  selectedBlockLabel: string | null;
  flatTypeOptions: string[];
  storeyOptions: string[];
  comparableSet: ListingComparableSet | null;
  comparableSetLoading: boolean;
  comparableSetError: boolean;
  result: ListingCheckAnalysisResult | null;
  comparables: DisplayComparable[];
  adjustmentMeta: ListingAdjustmentMeta | null;
  qualityTag: ReturnType<typeof deriveComparableQualityTag>;
  evidenceCaveats: EvidenceCaveat[];
  canSubmit: boolean;
  retryDetail: () => void;
  submit: () => boolean;
};

/**
 * Owns address-detail loading, comparable-transaction fetching, and pure
 * listing-check result derivation for the listing-check panel.
 *
 * Comparable fetching is an explicit submit action. Asking-price changes
 * recompute the local result without refetching comparables; changes to facts
 * that determine the comparable set hide stale analysis until resubmission.
 */
export function useListingCheckAnalysis({
  selectedAddressKey,
  askingPrice,
  floorAreaSqm,
  flatType,
  storeyRange,
  leaseCommenceYear,
  referenceMonth,
}: UseListingCheckAnalysisOptions): ListingCheckAnalysisState {
  const [detail, setDetail] = useState<AddressDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [detailRequestGeneration, setDetailRequestGeneration] = useState(0);
  const [comparableSet, setComparableSet] = useState<ListingComparableSet | null>(null);
  const [comparableSetLoading, setComparableSetLoading] = useState(false);
  const [comparableSetError, setComparableSetError] = useState(false);
  const [adjustmentMeta, setAdjustmentMeta] = useState<ListingAdjustmentMeta | null>(null);
  const [submittedRequestKey, setSubmittedRequestKey] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);

  // ── Address detail ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedAddressKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clear stale detail when selection is removed
      setDetail(null);
      setDetailError(false);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    setDetailLoading(true);
    setDetailError(false);
    // Drop stale detail immediately so the UI does not show the previous
    // address while loading, and so comparable fetch does not reuse old summary.
    setDetail(null);

    fetchAddressDetail(selectedAddressKey)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setDetailLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(true);
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [detailRequestGeneration, selectedAddressKey]);

  const retryDetail = useCallback(() => {
    if (!selectedAddressKey) return;
    setDetailError(false);
    setDetailRequestGeneration((current) => current + 1);
  }, [selectedAddressKey]);

  // ── Derived options ───────────────────────────────────────────────────────
  const flatTypeOptions = useMemo(() => deriveFlatTypeOptions(detail), [detail]);
  const storeyOptions = useMemo(() => deriveStoreyOptions(detail), [detail]);

  const comparableRequestBody = useMemo(() => {
    if (
      !detail ||
      !selectedAddressKey ||
      detail.summary.addressKey !== selectedAddressKey ||
      !flatType ||
      !flatTypeOptions.includes(flatType) ||
      !storeyRange ||
      !storeyOptions.includes(storeyRange)
    ) {
      return null;
    }

    return buildComparableRequestBody({
      detail,
      flatType,
      storeyRange,
      floorAreaSqm,
      leaseCommenceYear,
      referenceMonth,
    });
  }, [
    detail,
    flatType,
    flatTypeOptions,
    floorAreaSqm,
    leaseCommenceYear,
    referenceMonth,
    selectedAddressKey,
    storeyOptions,
    storeyRange,
  ]);

  const comparableRequestKey = useMemo(
    () =>
      comparableRequestBody && selectedAddressKey
        ? `${selectedAddressKey}:${JSON.stringify(comparableRequestBody)}`
        : null,
    [comparableRequestBody, selectedAddressKey],
  );

  // ── Comparable set fetch ──────────────────────────────────────────────────
  // Asking price is deliberately excluded from the request body/key. Once a
  // comparable set is submitted and loaded, price-only edits can recompute the
  // verdict locally without another network request.
  const submit = useCallback(() => {
    if (askingPrice == null || !comparableRequestBody || !comparableRequestKey) {
      return false;
    }

    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setSubmittedRequestKey(comparableRequestKey);
    setComparableSetLoading(true);
    setComparableSetError(false);
    setComparableSet(null);
    setAdjustmentMeta(null);

    // Always request time-adjustment metadata so the UI can surface when the
    // adjustment succeeded, widened partially, or could not be applied.
    fetch("/api/comparable-transactions?adjust=time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(comparableRequestBody),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const json: unknown = await res.json();
        const data = json as ListingComparableResponse;
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setComparableSet(data);
        setComparableSetLoading(false);
        setAdjustmentMeta(buildListingAdjustmentMeta(data));
      })
      .catch(() => {
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        setComparableSet(null);
        setComparableSetError(true);
        setComparableSetLoading(false);
        setAdjustmentMeta(null);
      });

    return true;
  }, [askingPrice, comparableRequestBody, comparableRequestKey]);

  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      requestAbortRef.current?.abort();
    };
  }, []);

  const submittedFactsAreCurrent =
    askingPrice != null &&
    comparableRequestKey != null &&
    submittedRequestKey === comparableRequestKey;
  const activeComparableSet = submittedFactsAreCurrent ? comparableSet : null;
  const activeComparableSetLoading = submittedFactsAreCurrent && comparableSetLoading;
  const activeComparableSetError = submittedFactsAreCurrent && comparableSetError;
  const activeAdjustmentMeta = submittedFactsAreCurrent ? adjustmentMeta : null;

  // ── Pure derivation ───────────────────────────────────────────────────────
  const result = useMemo(
    () =>
      deriveListingCheckResult({
        comparableSet: activeComparableSet,
        detail,
        askingPrice,
        floorAreaSqm,
        leaseCommenceYear,
        adjustmentMeta: activeAdjustmentMeta,
      }),
    [
      activeAdjustmentMeta,
      activeComparableSet,
      askingPrice,
      detail,
      floorAreaSqm,
      leaseCommenceYear,
    ],
  );

  const comparables = useMemo(
    () => buildDisplayComparables(activeComparableSet, activeAdjustmentMeta),
    [activeComparableSet, activeAdjustmentMeta],
  );

  const qualityTag = useMemo(
    () => deriveComparableQualityTag(result, activeComparableSet),
    [result, activeComparableSet],
  );

  const evidenceCaveats = useMemo(
    () => deriveEvidenceCaveats(result, activeComparableSet, activeAdjustmentMeta),
    [result, activeComparableSet, activeAdjustmentMeta],
  );

  const selectedBlockLabel = useMemo(() => {
    if (!detail) return null;
    return `${detail.summary.block} ${detail.summary.streetName}`;
  }, [detail]);

  return {
    detail,
    detailLoading,
    detailError,
    selectedBlockLabel,
    flatTypeOptions,
    storeyOptions,
    comparableSet: activeComparableSet,
    comparableSetLoading: activeComparableSetLoading,
    comparableSetError: activeComparableSetError,
    result,
    comparables,
    adjustmentMeta: activeAdjustmentMeta,
    qualityTag,
    evidenceCaveats,
    canSubmit: askingPrice != null && comparableRequestBody != null,
    retryDetail,
    submit,
  };
}
