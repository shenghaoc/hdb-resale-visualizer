import { useEffect, useMemo, useRef, useState } from "react";
import { fetchAddressDetail, fetchComparisonArtifact } from "@/lib/data";
import type { AddressDetail, ComparisonArtifact, ShortlistItem } from "@/types/data";

type ShortlistRowsArgs = {
  blocks: Array<{ addressKey: string; medianPrice: number }>;
  items: ShortlistItem[];
  savedVisible: boolean;
  selectedDetail: AddressDetail | null;
  selectedComparison: ComparisonArtifact | null;
  isShortlistOpen: boolean;
};

async function processWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let index = 0;
  const worker = async () => {
    while (index < items.length) {
      const next = items[index++];
      await fn(next);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker));
}

export function useShortlistArtifacts({
  blocks,
  items,
  savedVisible,
  selectedDetail,
  selectedComparison,
  isShortlistOpen,
}: ShortlistRowsArgs) {
  const [shortlistDetails, setShortlistDetails] = useState<Record<string, AddressDetail | null>>({});
  const [shortlistComparisons, setShortlistComparisons] = useState<Record<string, ComparisonArtifact | null>>({});
  const detailsRef = useRef(shortlistDetails);
  const comparisonsRef = useRef(shortlistComparisons);
  const detailsInFlightRef = useRef<Set<string>>(new Set());
  const comparisonsInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    detailsRef.current = shortlistDetails;
  }, [shortlistDetails]);

  useEffect(() => {
    comparisonsRef.current = shortlistComparisons;
  }, [shortlistComparisons]);

  useEffect(() => {
    if (!savedVisible || !isShortlistOpen || items.length === 0) return;
    const missing = items
      .map((item) => item.addressKey)
      .filter((key) => !(key in detailsRef.current) && !detailsInFlightRef.current.has(key));
    if (missing.length === 0) return;

    let mounted = true;
    for (const key of missing) detailsInFlightRef.current.add(key);
    void processWithConcurrency(missing, 5, async (addressKey) => {
      try {
        const detail = await fetchAddressDetail(addressKey);
        if (mounted) setShortlistDetails((cur) => ({ ...cur, [addressKey]: detail }));
      } catch {
        if (mounted) setShortlistDetails((cur) => ({ ...cur, [addressKey]: null }));
      } finally {
        detailsInFlightRef.current.delete(addressKey);
      }
    });

    return () => {
      mounted = false;
    };
  }, [savedVisible, isShortlistOpen, items]);

  useEffect(() => {
    if (!savedVisible || !isShortlistOpen || items.length === 0) return;
    const missing = items
      .map((item) => item.addressKey)
      .filter((key) => !(key in comparisonsRef.current) && !comparisonsInFlightRef.current.has(key));
    if (missing.length === 0) return;

    let mounted = true;
    for (const key of missing) comparisonsInFlightRef.current.add(key);
    void processWithConcurrency(missing, 5, async (addressKey) => {
      try {
        const comparison = await fetchComparisonArtifact(addressKey);
        if (mounted) setShortlistComparisons((cur) => ({ ...cur, [addressKey]: comparison }));
      } catch {
        if (mounted) setShortlistComparisons((cur) => ({ ...cur, [addressKey]: null }));
      } finally {
        comparisonsInFlightRef.current.delete(addressKey);
      }
    });

    return () => {
      mounted = false;
    };
  }, [savedVisible, isShortlistOpen, items]);

  const shortlistRows = useMemo(() => {
    if (!savedVisible) return [];
    return items
      .map((item) => {
        const block = blocks.find((candidate) => candidate.addressKey === item.addressKey);
        if (!block) return null;
        return {
          item,
          block,
          detailSummary:
            shortlistDetails[item.addressKey]?.summary ??
            (selectedDetail?.summary.addressKey === item.addressKey ? selectedDetail.summary : null),
          monthlyTrend:
            shortlistDetails[item.addressKey]?.monthlyTrend ??
            (selectedDetail?.summary.addressKey === item.addressKey ? selectedDetail.monthlyTrend : []),
          comparison:
            shortlistComparisons[item.addressKey] ??
            (selectedComparison?.addressKey === item.addressKey ? selectedComparison : null),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((left, right) => {
        const leftGap = left.item.targetPrice !== null ? Math.abs(left.item.targetPrice - left.block.medianPrice) : Number.POSITIVE_INFINITY;
        const rightGap = right.item.targetPrice !== null ? Math.abs(right.item.targetPrice - right.block.medianPrice) : Number.POSITIVE_INFINITY;
        if (leftGap !== rightGap) return leftGap - rightGap;
        return left.item.addedAt.localeCompare(right.item.addedAt);
      });
  }, [savedVisible, items, blocks, shortlistDetails, shortlistComparisons, selectedDetail, selectedComparison]);

  return { shortlistRows };
}
