import { useEffect, useMemo, useState } from "react";
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
        const hasAllBlocks = blocks.length >= totalBlocks;

        if (needsAllBlocks) {
          if (hasAllBlocks) return;
          const nextBlocks = await fetchBlockSummaries();
          if (isMounted) setBlocks(nextBlocks);
          return;
        }

        if (!effectiveTown || hasAllBlocks) return;
        if (blocks.some((block) => block.town === effectiveTown)) return;

        const nextBlocks = await fetchBlocksByTown(effectiveTown);
        if (!isMounted || !Array.isArray(nextBlocks)) return;

        setBlocks((current) => {
          if (current.length >= totalBlocks || current.some((block) => block.town === effectiveTown)) {
            return current;
          }
          return [...current, ...nextBlocks];
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
    debouncedSearch,
    userLocationPresent,
    selectedAddressKey,
    sortedTowns,
    savedVisible,
    shortlistCount,
    hasGeographic,
    blocks,
  ]);

  return { blocks, loadError };
}
