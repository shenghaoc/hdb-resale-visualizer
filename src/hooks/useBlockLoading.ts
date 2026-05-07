import { useEffect, useMemo, useRef, useState } from "react";
import { fetchBlockSummaries, fetchBlocksByTown, townToFilename } from "@/lib/data";
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
}: UseBlockLoadingArgs) {
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const blocksRef = useRef<BlockSummary[]>([]);

  const hasGeographic = useMemo(
    () => Boolean(debouncedSearch.trim() || userLocationPresent),
    [debouncedSearch, userLocationPresent],
  );

  useEffect(() => {
    if (!manifest) return;

    let isMounted = true;
    const totalBlocks = manifest.counts.blocks;
    const needsAllBlocks = hasGeographic || (savedVisible && shortlistCount > 0);
    const detectedTownForDeepLink =
      !townFilter && !hasGeographic && selectedAddressKey
        ? sortedTowns.find((town) => selectedAddressKey.startsWith(`${townToFilename(town)}-`)) ?? null
        : null;
    const effectiveTown = townFilter || detectedTownForDeepLink;

    async function loadBlocks() {
      try {
        const currentBlocks = blocksRef.current;
        const hasAllBlocks = currentBlocks.length >= totalBlocks;

        if (needsAllBlocks) {
          if (hasAllBlocks) return;
          const nextBlocks = await fetchBlockSummaries();
          if (isMounted) {
            blocksRef.current = nextBlocks;
            setBlocks(nextBlocks);
          }
          return;
        }

        if (!effectiveTown || hasAllBlocks) return;
        if (currentBlocks.some((block) => block.town === effectiveTown)) return;

        const nextBlocks = await fetchBlocksByTown(effectiveTown);
        if (!isMounted || !Array.isArray(nextBlocks)) return;

        setBlocks((current) => {
          if (current.length >= totalBlocks || current.some((block) => block.town === effectiveTown)) {
            return current;
          }
          const updated = [...current, ...nextBlocks];
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
  ]);

  return { blocks, loadError };
}
