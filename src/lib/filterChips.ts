import { formatNumber } from "@/lib/format";
import { localizeFlatType, localizeTownName } from "@/lib/i18n/domain";
import type { Locale, Translator } from "@/lib/i18n/types";
import type { FilterState } from "@/types/data";

export type ActiveFilterChipDescriptor = {
  key: "search" | "town" | "flatType" | "budget" | "remainingLeaseMin" | "mrtMax";
  label: string;
  clearPatch: Partial<FilterState>;
};

// Deliberately avoids Intl compact notation (which yields "S$400.0K" with maximumFractionDigits: 1).
// Manual round-to-thousands + integer format produces clean "S$400K" labels for both locales.
// S$ and K/万 are intentionally moved to translation dictionary.
function formatBudgetChipCurrency(value: number, locale: Locale, t: Translator): string {
  const divisor = Number(t("filters.chip.currencyDivisor", { defaultValue: "1000" }));
  const displayValue = value / divisor;
  // Use maximumFractionDigits: 1 to show decimals only if present (e.g. 45.5万)
  const formatted = formatNumber(displayValue, 1, locale);
  return t("filters.chip.budget", { value: formatted });
}

export function getActiveFilterChipDescriptors(
  filters: FilterState,
  locale: Locale,
  t: Translator,
): ActiveFilterChipDescriptor[] {
  const chips: ActiveFilterChipDescriptor[] = [];

  const trimmedSearch = filters.search.trim();
  if (trimmedSearch) {
    chips.push({
      key: "search",
      label: trimmedSearch,
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
    const lo = filters.budgetMin !== null ? formatBudgetChipCurrency(filters.budgetMin, locale, t) : "";
    const hi = filters.budgetMax !== null ? formatBudgetChipCurrency(filters.budgetMax, locale, t) : "";
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
