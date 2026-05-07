import { useEffect, useState } from "react";
import { fetchAddressDetail, fetchComparisonArtifact } from "@/lib/data";
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

  /* eslint-disable react-hooks/set-state-in-effect -- Selection changes must clear stale artifacts before rendering settled detail UI. */
  useEffect(() => {
    if (!selectedAddressKey) {
      setDetail(null);
      setComparison(null);
      setIsDetailLoading(false);
      setIsComparisonLoading(false);
      return;
    }

    let isMounted = true;
    setDetail(null);
    setComparison(null);
    setIsDetailLoading(true);
    setIsComparisonLoading(true);

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
  /* eslint-enable react-hooks/set-state-in-effect */

  const selectedDetail =
    selectedAddressKey && detail?.addressKey === selectedAddressKey ? detail.data : null;
  const selectedComparison =
    selectedAddressKey && comparison?.addressKey === selectedAddressKey ? comparison.data : null;

  return {
    detail: selectedDetail,
    comparison: selectedComparison,
    isDetailLoading,
    isComparisonLoading,
  };
}
