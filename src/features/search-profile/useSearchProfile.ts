import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  hasCompletedSearchProfile,
  loadSearchProfile,
  saveSearchProfile,
} from "@/features/search-profile/searchProfile";
import type { SearchProfile } from "@/types/searchProfile";

export function useSearchProfile() {
  const [profile, setProfile] = useState<SearchProfile>(() => loadSearchProfile());
  const [wizardOpen, setWizardOpen] = useState(false);

  const isMountedProfile = useRef(false);

  // Synchronize profile changes to persistence store cleanly on update, skipping initial mount
  useEffect(() => {
    if (!isMountedProfile.current) {
      isMountedProfile.current = true;
      return;
    }
    saveSearchProfile(profile);
  }, [profile]);

  const completed = useMemo(() => hasCompletedSearchProfile(profile), [profile]);
  const shouldShowWizard = wizardOpen;

  const replaceProfile = useCallback((next: SearchProfile) => {
    setProfile(next);
    setWizardOpen(false);
  }, []);

  const dismissWizard = useCallback(() => {
    setWizardOpen(false);
  }, []);

  const openWizard = useCallback(() => {
    setWizardOpen(true);
  }, []);

  return useMemo(
    () => ({
      profile,
      completed,
      shouldShowWizard,
      replaceProfile,
      dismissWizard,
      openWizard,
    }),
    [profile, completed, shouldShowWizard, replaceProfile, dismissWizard, openWizard],
  );
}
