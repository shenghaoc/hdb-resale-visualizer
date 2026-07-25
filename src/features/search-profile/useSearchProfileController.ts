import { useMemo } from "react";
import type { BlockSummary } from "@/types/data";
import { buildTownRecommendations, type TownRecommendation } from "./town-recommendations";
import { useSearchProfile } from "./useSearchProfile";

export type UseSearchProfileControllerOptions = {
  blocks: readonly BlockSummary[];
  totalBlocks: number;
  hasResultScope: boolean;
  effectiveTown: string | null;
};

export type SearchProfileControllerState = ReturnType<typeof useSearchProfile>;

export function useSearchProfileControllerState(): SearchProfileControllerState {
  return useSearchProfile();
}

export function useSearchProfileControllerView(
  searchProfile: SearchProfileControllerState,
  { blocks, totalBlocks, hasResultScope, effectiveTown }: UseSearchProfileControllerOptions,
) {
  const { profile, completed } = searchProfile;
  const hasAllBlocksLoaded = totalBlocks > 0 && blocks.length >= totalBlocks;

  const townProfileBlocks = useMemo(
    () => (effectiveTown ? blocks.filter((block) => block.town === effectiveTown) : []),
    [blocks, effectiveTown],
  );

  const townRecommendations = useMemo<TownRecommendation[]>(() => {
    if (!completed) return [];
    if (hasResultScope) return [];
    if (!hasAllBlocksLoaded) return [];
    return buildTownRecommendations(profile, blocks);
  }, [blocks, completed, hasAllBlocksLoaded, hasResultScope, profile]);

  const townRecommendationsLoading =
    totalBlocks > 0 && completed && !hasResultScope && !hasAllBlocksLoaded;

  return useMemo(
    () => ({
      ...searchProfile,
      townProfileBlocks,
      hasAllBlocksLoaded,
      townRecommendations,
      townRecommendationsLoading,
    }),
    [
      hasAllBlocksLoaded,
      searchProfile,
      townProfileBlocks,
      townRecommendations,
      townRecommendationsLoading,
    ],
  );
}

export function useSearchProfileController(options: UseSearchProfileControllerOptions) {
  const searchProfile = useSearchProfileControllerState();
  return useSearchProfileControllerView(searchProfile, options);
}
