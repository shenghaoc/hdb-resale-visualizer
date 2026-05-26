import { useEffect, useMemo, useRef, useState } from "react";
import { fetchBlockSummaries, fetchBlocksBySearch, fetchBlocksByTown, townToFilename } from "@/lib/data";
import type { BlockSummary, Manifest } from "@/types/data";

type UseBlockLoadingArgs = {
  manifest: Manifest | null;
  townFilter: string;
  debouncedSearch: string;
  userLocationPresent: boolean;
  selectedAddressKey: string | null;
  sortedTowns: string[];
  savedVisible: boolean;
  shortlistCount: number;
  needsAllBlocksForRecommendations?: boolean;
  coarseSearchParams: {
    flatType: string;
    flatModel: string;
    budgetMin: number | null;
    budgetMax: number | null;
    areaMin: number | null;
    areaMax: number | null;
    remainingLeaseMin: number | null;
    startMonth: string | null;
    endMonth: string | null;
    mrtMax: number | null;
  };
};

export function useBlockLoading({
  manifest,
  townFilter,
  debouncedSearch,
  userLocationPresent,
  selectedAddressKey,
  sortedTowns,
  savedVisible,
  shortlistCount,
  needsAllBlocksForRecommendations = false,
  coarseSearchParams,
}: UseBlockLoadingArgs) {
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const blocksRef = useRef<BlockSummary[]>([]);
  const loadedTownsRef = useRef<Set<string>>(new Set());
  const blocksSourceRef = useRef<"none" | "search" | "town-partial" | "full">("none");

  const hasGeographic = useMemo(
    () => Boolean(debouncedSearch.trim() || userLocationPresent),
    [debouncedSearch, userLocationPresent],
  );

  const hasCoarseSearchFilters = useMemo(
    () =>
      Boolean(
        coarseSearchParams.flatType ||
          coarseSearchParams.flatModel ||
          coarseSearchParams.budgetMin !== null ||
          coarseSearchParams.budgetMax !== null ||
          coarseSearchParams.areaMin !== null ||
          coarseSearchParams.areaMax !== null ||
          coarseSearchParams.remainingLeaseMin !== null ||
          coarseSearchParams.startMonth !== null ||
          coarseSearchParams.endMonth !== null ||
          coarseSearchParams.mrtMax !== null,
      ),
    [coarseSearchParams],
  );

  useEffect(() => {
    if (!manifest) return;

    let isMounted = true;
    const totalBlocks = manifest.counts.blocks;
    const needsAllBlocks =
      hasGeographic ||
      (savedVisible && shortlistCount > 0) ||
      needsAllBlocksForRecommendations;
    const detectedTownForDeepLink =
      !townFilter && !hasGeographic && selectedAddressKey
        ? sortedTowns.find((town) => selectedAddressKey.startsWith(`${townToFilename(town)}-`)) ?? null
        : null;
    const effectiveTown = townFilter || detectedTownForDeepLink;

    async function loadBlocks() {
      try {
        const currentBlocks = blocksRef.current;
        const hasFullCorpus =
          blocksSourceRef.current === "full" && currentBlocks.length >= totalBlocks;

        if (needsAllBlocks) {
          if (hasFullCorpus) return;
          setLoadError(null);
          loadedTownsRef.current.clear();
          blocksSourceRef.current = "full";
          const nextBlocks = await fetchBlockSummaries();
          if (isMounted) {
            blocksRef.current = nextBlocks;
            setBlocks(nextBlocks);
            setSearchTruncated(false);
          }
          return;
        }

        if (hasCoarseSearchFilters) {
          if (hasFullCorpus) return;
          setLoadError(null);
          loadedTownsRef.current.clear();
          blocksSourceRef.current = "search";
          const result = await fetchBlocksBySearch({
            town: effectiveTown ?? "",
            ...coarseSearchParams,
          });
          if (isMounted) {
            setSearchTruncated(result.truncated);
            if (effectiveTown) {
              setBlocks((current) => {
                const withoutTown = current.filter((block) => block.town !== effectiveTown);
                const updated = [...withoutTown, ...result.blocks];
                blocksRef.current = updated;
                return updated;
              });
            } else {
              blocksRef.current = result.blocks;
              setBlocks(result.blocks);
            }
          }
          return;
        }

        if (!effectiveTown || hasFullCorpus) return;
        if (loadedTownsRef.current.has(effectiveTown)) return;

        setLoadError(null);
        const nextBlocks = await fetchBlocksByTown(effectiveTown);
        if (!isMounted || !Array.isArray(nextBlocks)) return;

        loadedTownsRef.current.add(effectiveTown);
        const wasSearchSource = blocksSourceRef.current === "search";
        blocksSourceRef.current = "town-partial";
        setBlocks((current) => {
          const baseBlocks = wasSearchSource ? [] : current;
          const withoutTown = baseBlocks.filter((block) => block.town !== effectiveTown);
          const updated = [...withoutTown, ...nextBlocks];
          blocksRef.current = updated;
          return updated;
        });
      } catch (error) {
        if (!isMounted) return;
        setLoadError(error instanceof Error ? error.message : "Failed to load blocks data");
      }
    }

    void loadBlocks();
    return () => {
      isMounted = false;
    };
  }, [
    manifest,
    townFilter,
    selectedAddressKey,
    sortedTowns,
    savedVisible,
    shortlistCount,
    hasGeographic,
    hasCoarseSearchFilters,
    needsAllBlocksForRecommendations,
    coarseSearchParams,
  ]);

  return { blocks, loadError, searchTruncated };
}
