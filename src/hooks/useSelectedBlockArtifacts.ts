import { useEffect, useState } from "react";
import { fetchAddressDetail, fetchComparisonArtifact } from "@/lib/data";
import type { AddressDetail, ComparisonArtifact } from "@/types/data";

type LoadedDetail = { addressKey: string; data: AddressDetail | null };
type LoadedComparison = { addressKey: string; data: ComparisonArtifact | null };

/**
 * Loads detail and comparison artifacts for the currently selected address.
 *
 * Loading flags are derived from whether the stored artifact still matches the
 * current `selectedAddressKey`, so callers only need to drive the key — no
 * imperative `beginLoad` / `clear` dance is required to keep the UI in sync.
 */
export function useSelectedBlockArtifacts(selectedAddressKey: string | null) {
  const [detail, setDetail] = useState<LoadedDetail | null>(null);
  const [comparison, setComparison] = useState<LoadedComparison | null>(null);

  useEffect(() => {
    if (!selectedAddressKey) {
      return;
    }

    let isMounted = true;

    fetchAddressDetail(selectedAddressKey)
      .then((data) => {
        if (isMounted) setDetail({ addressKey: selectedAddressKey, data });
      })
      .catch(() => {
        if (isMounted) setDetail({ addressKey: selectedAddressKey, data: null });
      });

    return () => {
      isMounted = false;
    };
  }, [selectedAddressKey]);

  useEffect(() => {
    if (!selectedAddressKey) {
      return;
    }

    let isMounted = true;

    fetchComparisonArtifact(selectedAddressKey)
      .then((data) => {
        if (isMounted) setComparison({ addressKey: selectedAddressKey, data });
      })
      .catch(() => {
        if (isMounted) setComparison({ addressKey: selectedAddressKey, data: null });
      });

    return () => {
      isMounted = false;
    };
  }, [selectedAddressKey]);

  // Derive loading state: if a selection is active but the cached artifact is
  // for a stale address key, we are still waiting for the new fetch to resolve.
  const isDetailLoading =
    Boolean(selectedAddressKey) && detail?.addressKey !== selectedAddressKey;
  const isComparisonLoading =
    Boolean(selectedAddressKey) && comparison?.addressKey !== selectedAddressKey;

  return { detail, comparison, isDetailLoading, isComparisonLoading };
}
