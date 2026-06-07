import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { fetchAddressDetail, fetchComparisonArtifact } from "@/shared/lib/data";
import type {
  AddressDetail,
  BlockSummary,
  ComparisonArtifact,
  ShortlistItem,
} from "@/types/data";

type ShortlistRowsArgs = {
  blocks: BlockSummary[];
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

function useMissingArtifactLoader<T>(
  enabled: boolean,
  items: ShortlistItem[],
  artifactsRef: MutableRefObject<Record<string, T | null>>,
  inFlightRef: MutableRefObject<Set<string>>,
  fetchArtifact: (key: string) => Promise<T | null>,
  setArtifacts: Dispatch<SetStateAction<Record<string, T | null>>>,
) {
  useEffect(() => {
    if (!enabled || items.length === 0) return;
    const missing = items
      .map((item) => item.addressKey)
      .filter((key) => !(key in artifactsRef.current) && !inFlightRef.current.has(key));
    if (missing.length === 0) return;

    let mounted = true;
    for (const key of missing) inFlightRef.current.add(key);
    void processWithConcurrency(missing, 5, async (addressKey) => {
      try {
        const artifact = await fetchArtifact(addressKey);
        if (mounted) setArtifacts((cur) => ({ ...cur, [addressKey]: artifact }));
      } catch {
        if (mounted) setArtifacts((cur) => ({ ...cur, [addressKey]: null }));
      } finally {
        inFlightRef.current.delete(addressKey);
      }
    });

    return () => {
      mounted = false;
    };
  }, [enabled, items, artifactsRef, inFlightRef, fetchArtifact, setArtifacts]);
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

  const enabled = savedVisible && isShortlistOpen;

  useMissingArtifactLoader(
    enabled,
    items,
    detailsRef,
    detailsInFlightRef,
    fetchAddressDetail,
    setShortlistDetails,
  );

  useMissingArtifactLoader(
    enabled,
    items,
    comparisonsRef,
    comparisonsInFlightRef,
    fetchComparisonArtifact,
    setShortlistComparisons,
  );

  const blocksByKey = useMemo(() => {
    const map = new Map<string, BlockSummary>();
    for (const block of blocks) {
      map.set(block.addressKey, block);
    }
    return map;
  }, [blocks]);

  const shortlistRows = useMemo(() => {
    if (!savedVisible) return [];
    return items
      .map((item) => {
        const block = blocksByKey.get(item.addressKey);
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
  }, [savedVisible, items, blocksByKey, shortlistDetails, shortlistComparisons, selectedDetail, selectedComparison]);

  return { shortlistRows };
}
