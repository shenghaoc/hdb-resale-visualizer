import type { SearchProfile } from "@/types/searchProfile";

export type SearchProfileChip = {
  key: string;
  label: string;
  clearPatch: Partial<SearchProfile>;
};

export function getSearchProfileChipDescriptors(profile: SearchProfile): SearchProfileChip[] {
  const chips: SearchProfileChip[] = [];

  if (profile.mainFlatType) chips.push({ key: "profile-flat-type", label: `Type: ${profile.mainFlatType}`, clearPatch: { mainFlatType: "" } });
  if (profile.maxBudget !== null) chips.push({ key: "profile-budget", label: `Budget: S$${Math.round(profile.maxBudget).toLocaleString()}`, clearPatch: { maxBudget: null } });
  if (profile.commuteAnchorLabel) chips.push({ key: "profile-commute", label: `Commute: ${profile.commuteAnchorLabel} (${profile.maxComfortableCommuteMinutes ?? "—"}m)`, clearPatch: { commuteAnchorLabel: "", maxComfortableCommuteMinutes: null } });
  if (profile.minimumRemainingLeaseYears !== null) chips.push({ key: "profile-lease", label: `Lease: ≥ ${profile.minimumRemainingLeaseYears}y`, clearPatch: { minimumRemainingLeaseYears: null } });

  chips.push({ key: "profile-show-stretch", label: `Stretch: ${profile.showStretchOptions ? "On" : "Off"}`, clearPatch: { showStretchOptions: !profile.showStretchOptions } });
  chips.push({ key: "profile-show-all", label: `Show all: ${profile.showAllBlocks ? "On" : "Off"}`, clearPatch: { showAllBlocks: !profile.showAllBlocks } });

  return chips;
}
