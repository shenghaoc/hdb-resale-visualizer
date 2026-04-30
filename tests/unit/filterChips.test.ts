import { describe, expect, it } from "vitest";
import { getActiveFilterChipDescriptors } from "@/lib/filterChips";
import { dictionaries } from "@/lib/i18n/messages";
import type { Locale, Translator } from "@/lib/i18n/types";
import type { FilterState } from "@/types/data";

function createTranslator(locale: Locale): Translator {
  return (key, vars) => {
    const template = dictionaries[locale][key] ?? dictionaries["en-SG"][key] ?? key;
    if (!vars) {
      return template;
    }

    return Object.entries(vars).reduce(
      (current, [name, value]) => current.replaceAll(`{${name}}`, String(value)),
      template,
    );
  };
}

describe("getActiveFilterChipDescriptors", () => {
  it("preserves zero-value budget bounds instead of dropping them", () => {
    const filters: FilterState = {
      search: "",
      town: "",
      flatType: "",
      flatModel: "",
      budgetMin: 0,
      budgetMax: 400000,
      areaMin: null,
      areaMax: null,
      remainingLeaseMin: null,
      startMonth: null,
      endMonth: null,
      mrtMax: null,
      selectedAddressKey: null,
    };

    const chips = getActiveFilterChipDescriptors(filters, "en-SG", createTranslator("en-SG"));

    expect(chips).toEqual([
      {
        key: "budget",
        label: "S$0K–S$400K",
        clearPatch: { budgetMin: null, budgetMax: null },
      },
    ]);
  });

  it("localizes chip labels for zh-SG", () => {
    const filters: FilterState = {
      search: "",
      town: "BEDOK",
      flatType: "4 ROOM",
      flatModel: "",
      budgetMin: null,
      budgetMax: null,
      areaMin: null,
      areaMax: null,
      remainingLeaseMin: 60,
      startMonth: null,
      endMonth: null,
      mrtMax: 500,
      selectedAddressKey: null,
    };

    const chips = getActiveFilterChipDescriptors(filters, "zh-SG", createTranslator("zh-SG"));

    expect(chips.map(({ label }) => label)).toEqual([
      "勿洛 · BEDOK",
      "四房式 · 4 ROOM",
      "至少 60 年",
      "距地铁 ≤500 米",
    ]);
  });
});
