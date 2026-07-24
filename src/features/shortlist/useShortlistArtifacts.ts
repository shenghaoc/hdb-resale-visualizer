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
import type { AddressDetail, BlockSummary, ComparisonArtifact, ShortlistItem } from "@/types/data";
import { buildShortlistRows, type ShortlistRow } from "@/features/shortlist/shortlistRows";

export type UseShortlistArtifactsOptions = {
  blocks: readonly BlockSummary[];
  items: readonly ShortlistItem[];
  savedVisible: boolean;
  selectedDetail: AddressDetail | null;
  selectedComparison: ComparisonArtifact | null;
  isShortlistOpen: boolean;
};

async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
) {
  let index = 0;
  const worker = async () => {
    while (index < items.length) {
      const next = items[index++];
      await fn(next);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker),
  );
}

function useMissingArtifactLoader<T>(
  enabled: boolean,
  items: readonly ShortlistItem[],
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
}: UseShortlistArtifactsOptions): { shortlistRows: ShortlistRow[] } {
  const [shortlistDetails, setShortlistDetails] = useState<Record<string, AddressDetail | null>>(
    {},
  );
  const [shortlistComparisons, setShortlistComparisons] = useState<
    Record<string, ComparisonArtifact | null>
  >({});
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

  const shortlistRows = useMemo(
    () =>
      buildShortlistRows({
        blocks,
        items,
        savedVisible,
        detailsByAddressKey: shortlistDetails,
        comparisonsByAddressKey: shortlistComparisons,
        selectedDetail,
        selectedComparison,
      }),
    [
      blocks,
      items,
      savedVisible,
      shortlistDetails,
      shortlistComparisons,
      selectedDetail,
      selectedComparison,
    ],
  );

  return { shortlistRows };
}
