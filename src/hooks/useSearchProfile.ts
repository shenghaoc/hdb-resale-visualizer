import { useCallback, useMemo, useState } from "react";
import {
  hasCompletedSearchProfile,
  loadSearchProfile,
  loadSearchProfileWizardDismissed,
  patchSearchProfile,
  saveSearchProfile,
  saveSearchProfileWizardDismissed,
} from "@/lib/searchProfile";
import type { SearchProfile, SearchProfilePatch } from "@/types/searchProfile";

export function useSearchProfile() {
  const [profile, setProfile] = useState<SearchProfile>(() => loadSearchProfile());
  const [wizardDismissed, setWizardDismissed] = useState(() =>
    loadSearchProfileWizardDismissed(),
  );

  const completed = useMemo(() => hasCompletedSearchProfile(profile), [profile]);
  const shouldShowWizard = !completed && !wizardDismissed;

  const patchProfile = useCallback((patch: SearchProfilePatch) => {
    setProfile((prev) => patchSearchProfile(prev, patch));
  }, []);

  const replaceProfile = useCallback((next: SearchProfile) => {
    saveSearchProfile(next);
    saveSearchProfileWizardDismissed(true);
    setProfile(next);
    setWizardDismissed(true);
  }, []);

  const dismissWizard = useCallback(() => {
    saveSearchProfileWizardDismissed(true);
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
