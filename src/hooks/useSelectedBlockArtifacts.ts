import { useEffect, useRef, useState } from "react";
import { fetchAddressDetail, fetchComparisonArtifact } from "@/lib/data";
import type { AddressDetail, ComparisonArtifact } from "@/types/data";

type LoadedDetail = { addressKey: string; data: AddressDetail | null; selectionCycle: number };
type LoadedComparison = {
  addressKey: string;
  data: ComparisonArtifact | null;
  selectionCycle: number;
};

/**
 * Loads detail and comparison artifacts for the currently selected address.
 *
 * Loading state is owned here so every selection change, including reopening the
 * same address after closing the drawer, starts with a visible loading state.
 */
export function useSelectedBlockArtifacts(selectedAddressKey: string | null) {
  const [detail, setDetail] = useState<LoadedDetail | null>(null);
  const [comparison, setComparison] = useState<LoadedComparison | null>(null);
  const selectionCycleRef = useRef(0);
  const [currentSelectionCycle, setCurrentSelectionCycle] = useState(0);

  useEffect(() => {
    if (!selectedAddressKey) {
      return;
    }

    let isMounted = true;
    const selectionCycle = selectionCycleRef.current;

    void fetchAddressDetail(selectedAddressKey)
      .then((nextDetail) => {
        if (isMounted) {
          setDetail({ addressKey: selectedAddressKey, data: nextDetail, selectionCycle });
        }
      })
      .catch(() => {
        if (isMounted) {
          setDetail({ addressKey: selectedAddressKey, data: null, selectionCycle });
        }
      });

    return () => {
      isMounted = false;
      selectionCycleRef.current += 1;
      setCurrentSelectionCycle(selectionCycleRef.current);
    };
  }, [selectedAddressKey]);

  useEffect(() => {
    if (!selectedAddressKey) {
      return;
    }

    let isMounted = true;
    const selectionCycle = selectionCycleRef.current;

    void fetchComparisonArtifact(selectedAddressKey)
      .then((nextComparison) => {
        if (isMounted) {
          setComparison({ addressKey: selectedAddressKey, data: nextComparison, selectionCycle });
        }
      })
      .catch(() => {
        if (isMounted) {
          setComparison({ addressKey: selectedAddressKey, data: null, selectionCycle });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedAddressKey]);

  const selectedDetail =
    selectedAddressKey &&
    detail?.addressKey === selectedAddressKey &&
    detail.selectionCycle === currentSelectionCycle
      ? detail
      : null;
  const selectedComparison =
    selectedAddressKey &&
    comparison?.addressKey === selectedAddressKey &&
    comparison.selectionCycle === currentSelectionCycle
      ? comparison
      : null;
  const isDetailLoading = Boolean(selectedAddressKey) && selectedDetail === null;
  const isComparisonLoading = Boolean(selectedAddressKey) && selectedComparison === null;

  return {
    detail: selectedDetail,
    comparison: selectedComparison,
    isDetailLoading,
    isComparisonLoading,
  };
}
