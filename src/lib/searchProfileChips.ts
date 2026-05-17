import type { SearchProfile } from "@/types/searchProfile";
import { formatNumber } from "@/lib/format";
import type { Locale, Translator } from "@/lib/i18n";
import { localizeFlatType } from "@/lib/i18n/domain";

export type SearchProfileChip = {
  key: string;
  label: string;
  clearPatch: Partial<SearchProfile>;
};

export function getSearchProfileChipDescriptors(
  profile: SearchProfile,
  locale: Locale,
  t: Translator,
): SearchProfileChip[] {
  const chips: SearchProfileChip[] = [];

  if (profile.mainFlatType) {
    chips.push({
      key: "profile-flat-type",
      label: t("searchProfile.chip.flatType", {
        value: localizeFlatType(profile.mainFlatType, locale),
      }),
      clearPatch: { mainFlatType: "" },
    });
  }
  if (profile.maxBudget !== null) {
    chips.push({
      key: "profile-budget",
      label: t("searchProfile.chip.budget", {
        value: formatNumber(profile.maxBudget, 0, locale),
      }),
      clearPatch: { maxBudget: null },
    });
  }
  if (profile.commuteAnchorLabel) {
    chips.push({
      key: "profile-commute",
      label: t("searchProfile.chip.commute", {
        label: profile.commuteAnchorLabel,
        minutes:
          profile.maxComfortableCommuteMinutes === null
            ? t("shortlist.na")
            : formatNumber(profile.maxComfortableCommuteMinutes, 0, locale),
      }),
      clearPatch: { commuteAnchorLabel: "", maxComfortableCommuteMinutes: null },
    });
  }
  if (profile.minimumRemainingLeaseYears !== null) {
    chips.push({
      key: "profile-lease",
      label: t("searchProfile.chip.lease", {
        value: formatNumber(profile.minimumRemainingLeaseYears, 0, locale),
      }),
      clearPatch: { minimumRemainingLeaseYears: null },
    });
  }

  chips.push({
    key: "profile-show-stretch",
    label: t("searchProfile.chip.stretch", {
      value: profile.showStretchOptions ? t("searchProfile.on") : t("searchProfile.off"),
    }),
    clearPatch: { showStretchOptions: !profile.showStretchOptions },
  });
  chips.push({
    key: "profile-show-all",
    label: t("searchProfile.chip.showAll", {
      value: profile.showAllBlocks ? t("searchProfile.on") : t("searchProfile.off"),
    }),
    clearPatch: { showAllBlocks: !profile.showAllBlocks },
  });

  return chips;
}
