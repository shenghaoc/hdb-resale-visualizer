import { useMemo } from "react";
import type { BlockSummary } from "@/types/data";
import type { Locale, Translator } from "@/shared/lib/i18n";
import { getSearchProfileChipDescriptors, type SearchProfileChip } from "./searchProfileChips";
import { buildTownRecommendations, type TownRecommendation } from "./town-recommendations";
import { useSearchProfile } from "./useSearchProfile";

export type UseSearchProfileControllerOptions = {
  blocks: readonly BlockSummary[];
  totalBlocks: number;
  hasResultScope: boolean;
  effectiveTown: string | null;
  locale: Locale;
  t: Translator;
};

export type SearchProfileChipDescriptor = Omit<SearchProfileChip, "clearPatch"> & {
  onRemove: () => void;
};

export type SearchProfileControllerState = ReturnType<typeof useSearchProfile>;

export function useSearchProfileControllerState(): SearchProfileControllerState {
  return useSearchProfile();
}

export function useSearchProfileControllerView(
  searchProfile: SearchProfileControllerState,
  {
    blocks,
    totalBlocks,
    hasResultScope,
    effectiveTown,
    locale,
    t,
  }: UseSearchProfileControllerOptions,
) {
  const { profile, completed, patchProfile } = searchProfile;
  const hasAllBlocksLoaded = totalBlocks > 0 && blocks.length >= totalBlocks;

  const profileChips = useMemo<SearchProfileChipDescriptor[]>(
    () =>
      getSearchProfileChipDescriptors(profile, locale, t).map((chip) => ({
        key: chip.key,
        label: chip.label,
        onRemove: () => patchProfile(chip.clearPatch),
      })),
    [locale, patchProfile, profile, t],
  );

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
      profileChips,
      townProfileBlocks,
      hasAllBlocksLoaded,
      townRecommendations,
      townRecommendationsLoading,
    }),
    [
      hasAllBlocksLoaded,
      profileChips,
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
