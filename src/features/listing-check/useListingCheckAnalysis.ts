import { useEffect, useMemo, useState } from "react";
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
  onFlatTypeChange: (flatType: string | null) => void;
  onStoreyRangeChange: (storeyRange: string | null) => void;
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
  evidenceCaveats: string[];
};

/**
 * Owns address-detail loading, comparable-transaction fetching, and pure
 * listing-check result derivation for the listing-check panel.
 *
 * Asking-price changes recompute the local result without refetching
 * comparables. Stale async responses are discarded via request generation tokens.
 */
export function useListingCheckAnalysis({
  selectedAddressKey,
  askingPrice,
  floorAreaSqm,
  flatType,
  storeyRange,
  leaseCommenceYear,
  referenceMonth,
  onFlatTypeChange,
  onStoreyRangeChange,
}: UseListingCheckAnalysisOptions): ListingCheckAnalysisState {
  const [detail, setDetail] = useState<AddressDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [comparableSet, setComparableSet] = useState<ListingComparableSet | null>(null);
  const [comparableSetLoading, setComparableSetLoading] = useState(false);
  const [comparableSetError, setComparableSetError] = useState(false);
  const [adjustmentMeta, setAdjustmentMeta] = useState<ListingAdjustmentMeta | null>(null);

  // Always request time-adjustment metadata so the UI can surface when the
  // adjustment succeeded, widened partially, or could not be applied.
  const adjustmentEnabled = true;

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
  }, [selectedAddressKey]);

  // ── Derived options ───────────────────────────────────────────────────────
  const flatTypeOptions = useMemo(() => deriveFlatTypeOptions(detail), [detail]);
  const storeyOptions = useMemo(() => deriveStoreyOptions(detail), [detail]);

  // ── Default option selection (idempotent, complete deps) ──────────────────
  useEffect(() => {
    if (flatTypeOptions.length === 0) return;
    if (flatType != null && flatTypeOptions.includes(flatType)) return;
    onFlatTypeChange(flatTypeOptions[0] ?? null);
  }, [flatTypeOptions, flatType, onFlatTypeChange]);

  useEffect(() => {
    if (storeyOptions.length === 0) return;
    if (storeyRange != null && storeyOptions.includes(storeyRange)) return;
    onStoreyRangeChange(storeyOptions[0] ?? null);
  }, [storeyOptions, storeyRange, onStoreyRangeChange]);

  // ── Comparable set fetch ──────────────────────────────────────────────────
  // NOTE: askingPrice is deliberately excluded — the comparable set does not
  // depend on the asking price. The verdict recomputes locally from the existing
  // set when the price changes.
  useEffect(() => {
    if (!detail || !selectedAddressKey || !flatType || !storeyRange) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale state when inputs become invalid
      setComparableSet(null);
      setComparableSetLoading(false);
      setComparableSetError(false);
      setAdjustmentMeta(null);
      return;
    }

    const body = buildComparableRequestBody({
      detail,
      flatType,
      storeyRange,
      floorAreaSqm,
      leaseCommenceYear,
      referenceMonth,
    });

    if (!body) {
      setComparableSet(null);
      setComparableSetError(true);
      setComparableSetLoading(false);
      setAdjustmentMeta(null);
      return;
    }

    let cancelled = false;
    setComparableSetLoading(true);
    setComparableSetError(false);
    // Clear stale results while loading so UI doesn't show mismatched verdict.
    setComparableSet(null);
    setAdjustmentMeta(null);

    const url = adjustmentEnabled
      ? "/api/comparable-transactions?adjust=time"
      : "/api/comparable-transactions";

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const json: unknown = await res.json();
        const data = json as ListingComparableResponse;
        if (!cancelled) {
          setComparableSet(data);
          setComparableSetLoading(false);
          setAdjustmentMeta(adjustmentEnabled ? buildListingAdjustmentMeta(data) : null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setComparableSet(null);
          setComparableSetError(true);
          setComparableSetLoading(false);
          setAdjustmentMeta(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    floorAreaSqm,
    leaseCommenceYear,
    selectedAddressKey,
    flatType,
    storeyRange,
    detail,
    referenceMonth,
    adjustmentEnabled,
  ]);

  // ── Pure derivation ───────────────────────────────────────────────────────
  const result = useMemo(
    () =>
      deriveListingCheckResult({
        comparableSet,
        detail,
        askingPrice,
        floorAreaSqm,
        leaseCommenceYear,
        adjustmentMeta,
      }),
    [comparableSet, detail, askingPrice, floorAreaSqm, leaseCommenceYear, adjustmentMeta],
  );

  const comparables = useMemo(
    () => buildDisplayComparables(comparableSet, adjustmentMeta),
    [comparableSet, adjustmentMeta],
  );

  const qualityTag = useMemo(
    () => deriveComparableQualityTag(result, comparableSet),
    [result, comparableSet],
  );

  const evidenceCaveats = useMemo(
    () => deriveEvidenceCaveats(result, comparableSet, adjustmentMeta),
    [result, comparableSet, adjustmentMeta],
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
    comparableSet,
    comparableSetLoading,
    comparableSetError,
    result,
    comparables,
    adjustmentMeta,
    qualityTag,
    evidenceCaveats,
  };
}
