import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  hasCompletedSearchProfile,
  loadSearchProfile,
  loadSearchProfileWizardDismissed,
  saveSearchProfile,
  saveSearchProfileWizardDismissed,
} from "@/features/search-profile/searchProfile";
import type { SearchProfile, SearchProfilePatch } from "@/types/searchProfile";

export function useSearchProfile() {
  const [profile, setProfile] = useState<SearchProfile>(() => loadSearchProfile());
  const [wizardDismissed, setWizardDismissed] = useState(() =>
    loadSearchProfileWizardDismissed(),
  );

  const isMountedProfile = useRef(false);
  const isMountedDismissed = useRef(false);

  // Synchronize profile changes to persistence store cleanly on update, skipping initial mount
  useEffect(() => {
    if (!isMountedProfile.current) {
      isMountedProfile.current = true;
      return;
    }
    saveSearchProfile(profile);
  }, [profile]);

  // Synchronize wizardDismissed state to persistence store cleanly on update, skipping initial mount
  useEffect(() => {
    if (!isMountedDismissed.current) {
      isMountedDismissed.current = true;
      return;
    }
    saveSearchProfileWizardDismissed(wizardDismissed);
  }, [wizardDismissed]);

  const completed = useMemo(() => hasCompletedSearchProfile(profile), [profile]);
  const shouldShowWizard = !completed && !wizardDismissed;

  const patchProfile = useCallback((patch: SearchProfilePatch) => {
    setProfile((prev) => ({ ...prev, ...patch }));
  }, []);

  const replaceProfile = useCallback((next: SearchProfile) => {
    setProfile(next);
    setWizardDismissed(true);
  }, []);

  const dismissWizard = useCallback(() => {
    setWizardDismissed(true);
  }, []);

  return useMemo(
    () => ({
      profile,
      completed,
      shouldShowWizard,
      patchProfile,
      replaceProfile,
      dismissWizard,
    }),
    [
      profile,
      completed,
      shouldShowWizard,
      patchProfile,
      replaceProfile,
      dismissWizard,
    ],
  );
}
