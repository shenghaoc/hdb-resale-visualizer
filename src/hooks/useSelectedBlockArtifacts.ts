import { useEffect, useState } from "react";
import { fetchAddressDetail, fetchComparisonArtifact } from "@/shared/lib/data";
import type { AddressDetail, ComparisonArtifact } from "@/types/data";

type LoadedDetail = { addressKey: string; data: AddressDetail | null };
type LoadedComparison = { addressKey: string; data: ComparisonArtifact | null };

/**
 * Loads detail and comparison artifacts for the currently selected address.
 *
 * The hook clears stale artifacts as soon as the selection changes, so reopening
 * the same address still shows a fresh loading state until the refetch settles.
 */
export function useSelectedBlockArtifacts(selectedAddressKey: string | null) {
  const [detail, setDetail] = useState<LoadedDetail | null>(null);
  const [comparison, setComparison] = useState<LoadedComparison | null>(null);
  // Initialize loading flags based on whether a selection exists on mount (deep link scenario).
  // This prevents a brief flash of non-loading state before the useEffect runs.
  const [isDetailLoading, setIsDetailLoading] = useState(() => Boolean(selectedAddressKey));
  const [isComparisonLoading, setIsComparisonLoading] = useState(() => Boolean(selectedAddressKey));

  const [prevKey, setPrevKey] = useState(selectedAddressKey);
  if (selectedAddressKey !== prevKey) {
    setPrevKey(selectedAddressKey);
    const isNowSelected = Boolean(selectedAddressKey);
    setIsDetailLoading(isNowSelected);
    setIsComparisonLoading(isNowSelected);
    setDetail(null);
    setComparison(null);
  }

  useEffect(() => {
    if (!selectedAddressKey) return;

    let isMounted = true;

    void fetchAddressDetail(selectedAddressKey)
      .then((nextDetail) => {
        if (!isMounted) return;
        setDetail({ addressKey: selectedAddressKey, data: nextDetail });
        setIsDetailLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setDetail({ addressKey: selectedAddressKey, data: null });
        setIsDetailLoading(false);
      });

    void fetchComparisonArtifact(selectedAddressKey)
      .then((nextComparison) => {
        if (!isMounted) return;
        setComparison({ addressKey: selectedAddressKey, data: nextComparison });
        setIsComparisonLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        setComparison({ addressKey: selectedAddressKey, data: null });
        setIsComparisonLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedAddressKey]);

  // Guard: only surface artifacts that match the current selection to prevent
  // stale data from a previous fetch leaking through during rapid selection changes.
  const matchedDetail =
    selectedAddressKey && detail?.addressKey === selectedAddressKey ? detail.data : null;
  const matchedComparison =
    selectedAddressKey && comparison?.addressKey === selectedAddressKey ? comparison.data : null;

  return {
    detail: matchedDetail,
    comparison: matchedComparison,
    isDetailLoading,
    isComparisonLoading,
  };
}
