import { formatNumber } from "@/lib/format";
import { localizeFlatType, localizeTownName } from "@/lib/i18n/domain";
import type { Locale, Translator } from "@/lib/i18n/types";
import type { FilterState } from "@/types/data";

export type ActiveFilterChipDescriptor = {
  key: "search" | "town" | "flatType" | "budget" | "remainingLeaseMin" | "mrtMax";
  label: string;
  clearPatch: Partial<FilterState>;
};

function formatBudgetChipCurrency(value: number, locale: Locale): string {
  return `S$${formatNumber(Math.round(value / 1000), 0, locale)}K`;
}

export function getActiveFilterChipDescriptors(
  filters: FilterState,
  locale: Locale,
  t: Translator,
): ActiveFilterChipDescriptor[] {
  const chips: ActiveFilterChipDescriptor[] = [];

  if (filters.search.trim()) {
    chips.push({
      key: "search",
      label: filters.search.trim(),
      clearPatch: { search: "" },
    });
  }

  if (filters.town) {
    chips.push({
      key: "town",
      label: localizeTownName(filters.town, locale),
      clearPatch: { town: "" },
    });
  }

  if (filters.flatType) {
    chips.push({
      key: "flatType",
      label: localizeFlatType(filters.flatType, locale),
      clearPatch: { flatType: "" },
    });
  }

  if (filters.budgetMin !== null || filters.budgetMax !== null) {
    const lo = filters.budgetMin !== null ? formatBudgetChipCurrency(filters.budgetMin, locale) : "";
    const hi = filters.budgetMax !== null ? formatBudgetChipCurrency(filters.budgetMax, locale) : "";
    chips.push({
      key: "budget",
      label: lo && hi ? `${lo}–${hi}` : lo || hi,
      clearPatch: { budgetMin: null, budgetMax: null },
    });
  }

  if (filters.remainingLeaseMin !== null) {
    chips.push({
      key: "remainingLeaseMin",
      label: t("filters.chip.remainingLeaseMin", {
        value: formatNumber(filters.remainingLeaseMin, 0, locale),
      }),
      clearPatch: { remainingLeaseMin: null },
    });
  }

  if (filters.mrtMax !== null) {
    chips.push({
      key: "mrtMax",
      label: t("filters.chip.maxMrtDistance", {
        value: formatNumber(filters.mrtMax, 0, locale),
      }),
      clearPatch: { mrtMax: null },
    });
  }

  return chips;
}
