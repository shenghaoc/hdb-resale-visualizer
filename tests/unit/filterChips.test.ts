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
      compareTown: "",
      affordable: "",
      sort: "",
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
      compareTown: "",
      affordable: "",
      sort: "",
    };

    const chips = getActiveFilterChipDescriptors(filters, "zh-SG", createTranslator("zh-SG"));

    expect(chips.map(({ label }) => label)).toEqual([
      "勿洛 · BEDOK",
      "四房式 · 4 ROOM",
      "至少 60 年",
      "距地铁 ≤500 米",
    ]);
  });

  it("emits a flatModel chip when flatModel is set", () => {
    const filters: FilterState = {
      search: "",
      town: "",
      flatType: "",
      flatModel: "Model A",
      budgetMin: null,
      budgetMax: null,
      areaMin: null,
      areaMax: null,
      remainingLeaseMin: null,
      startMonth: null,
      endMonth: null,
      mrtMax: null,
      selectedAddressKey: null,
      compareTown: "",
      affordable: "",
      sort: "",
    };

    const chips = getActiveFilterChipDescriptors(filters, "en-SG", createTranslator("en-SG"));

    expect(chips).toEqual([
      {
        key: "flatModel",
        label: "Model A",
        clearPatch: { flatModel: "" },
      },
    ]);
  });

  it("emits a range chip for areaMin and areaMax", () => {
    const filters: FilterState = {
      search: "",
      town: "",
      flatType: "",
      flatModel: "",
      budgetMin: null,
      budgetMax: null,
      areaMin: 80,
      areaMax: 110,
      remainingLeaseMin: null,
      startMonth: null,
      endMonth: null,
      mrtMax: null,
      selectedAddressKey: null,
      compareTown: "",
      affordable: "",
      sort: "",
    };

    const chips = getActiveFilterChipDescriptors(filters, "en-SG", createTranslator("en-SG"));

    expect(chips).toEqual([
      {
        key: "area",
        label: "80 sqm–110 sqm",
        clearPatch: { areaMin: null, areaMax: null },
      },
    ]);
  });

  it("emits area chip with only areaMin set", () => {
    const filters: FilterState = {
      search: "",
      town: "",
      flatType: "",
      flatModel: "",
      budgetMin: null,
      budgetMax: null,
      areaMin: 80,
      areaMax: null,
      remainingLeaseMin: null,
      startMonth: null,
      endMonth: null,
      mrtMax: null,
      selectedAddressKey: null,
      compareTown: "",
      affordable: "",
      sort: "",
    };

    const chips = getActiveFilterChipDescriptors(filters, "en-SG", createTranslator("en-SG"));

    expect(chips).toEqual([
      {
        key: "area",
        label: "80 sqm",
        clearPatch: { areaMin: null, areaMax: null },
      },
    ]);
  });

  it("emits a range chip for startMonth and endMonth", () => {
    const filters: FilterState = {
      search: "",
      town: "",
      flatType: "",
      flatModel: "",
      budgetMin: null,
      budgetMax: null,
      areaMin: null,
      areaMax: null,
      remainingLeaseMin: null,
      startMonth: "2020-01",
      endMonth: "2024-06",
      mrtMax: null,
      selectedAddressKey: null,
      compareTown: "",
      affordable: "",
      sort: "",
    };

    const chips = getActiveFilterChipDescriptors(filters, "en-SG", createTranslator("en-SG"));

    expect(chips).toHaveLength(1);
    expect(chips[0].key).toBe("transactionWindow");
    expect(chips[0].clearPatch).toEqual({ startMonth: null, endMonth: null });
    // formatMonth produces locale-specific output; just verify the range separator is present
    expect(chips[0].label).toContain("–");
  });

  it("emits transactionWindow chip with only startMonth set", () => {
    const filters: FilterState = {
      search: "",
      town: "",
      flatType: "",
      flatModel: "",
      budgetMin: null,
      budgetMax: null,
      areaMin: null,
      areaMax: null,
      remainingLeaseMin: null,
      startMonth: "2022-03",
      endMonth: null,
      mrtMax: null,
      selectedAddressKey: null,
      compareTown: "",
      affordable: "",
      sort: "",
    };

    const chips = getActiveFilterChipDescriptors(filters, "en-SG", createTranslator("en-SG"));

    expect(chips).toHaveLength(1);
    expect(chips[0].key).toBe("transactionWindow");
    expect(chips[0].clearPatch).toEqual({ startMonth: null, endMonth: null });
    // Should show the formatted month without a range separator
    expect(chips[0].label).not.toContain("–");
  });

  it("emits area chip with only areaMax set", () => {
    const filters: FilterState = {
      search: "",
      town: "",
      flatType: "",
      flatModel: "",
      budgetMin: null,
      budgetMax: null,
      areaMin: null,
      areaMax: 110,
      remainingLeaseMin: null,
      startMonth: null,
      endMonth: null,
      mrtMax: null,
      selectedAddressKey: null,
      compareTown: "",
      affordable: "",
      sort: "",
    };

    const chips = getActiveFilterChipDescriptors(filters, "en-SG", createTranslator("en-SG"));

    expect(chips).toEqual([
      {
        key: "area",
        label: "110 sqm",
        clearPatch: { areaMin: null, areaMax: null },
      },
    ]);
  });

  it("emits transactionWindow chip with only endMonth set", () => {
    const filters: FilterState = {
      search: "",
      town: "",
      flatType: "",
      flatModel: "",
      budgetMin: null,
      budgetMax: null,
      areaMin: null,
      areaMax: null,
      remainingLeaseMin: null,
      startMonth: null,
      endMonth: "2024-06",
      mrtMax: null,
      selectedAddressKey: null,
      compareTown: "",
      affordable: "",
      sort: "",
    };

    const chips = getActiveFilterChipDescriptors(filters, "en-SG", createTranslator("en-SG"));

    expect(chips).toHaveLength(1);
    expect(chips[0].key).toBe("transactionWindow");
    expect(chips[0].clearPatch).toEqual({ startMonth: null, endMonth: null });
    // Should show the formatted month without a range separator
    expect(chips[0].label).not.toContain("–");
  });

  it("clears flatModel via clearPatch", () => {
    const filters: FilterState = {
      search: "",
      town: "",
      flatType: "",
      flatModel: "Improved",
      budgetMin: null,
      budgetMax: null,
      areaMin: null,
      areaMax: null,
      remainingLeaseMin: null,
      startMonth: null,
      endMonth: null,
      mrtMax: null,
      selectedAddressKey: null,
      compareTown: "",
      affordable: "",
      sort: "",
    };

    const chips = getActiveFilterChipDescriptors(filters, "en-SG", createTranslator("en-SG"));
    const modelChip = chips.find((c) => c.key === "flatModel");

    expect(modelChip).toBeDefined();
    expect(modelChip!.clearPatch).toEqual({ flatModel: "" });
  });
});
