import { useMemo, useState } from "react";
import {
  DEFAULT_SEARCH_PROFILE,
  hasCompletedSearchProfile,
  loadSearchProfile,
  patchSearchProfile,
  saveSearchProfile,
} from "@/lib/searchProfile";
import type { SearchProfile, SearchProfilePatch } from "@/types/searchProfile";

export function useSearchProfile() {
  const [profile, setProfile] = useState<SearchProfile>(() => loadSearchProfile());

  const completed = useMemo(() => hasCompletedSearchProfile(profile), [profile]);

  function patchProfile(patch: SearchProfilePatch) {
    setProfile((prev) => patchSearchProfile(prev, patch));
  }

  function replaceProfile(next: SearchProfile) {
    saveSearchProfile(next);
    setProfile(next);
  }

  function resetProfile() {
    replaceProfile(DEFAULT_SEARCH_PROFILE);
  }

  return { profile, completed, patchProfile, replaceProfile, resetProfile };
}
