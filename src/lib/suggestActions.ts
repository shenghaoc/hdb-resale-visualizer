import type { FilterState, Suggestion } from "@/types/data";

export function stationNameToNearMrtSearch(stationName: string): string {
  const base = stationName.replace(/\s+mrt\s+station$/i, "").trim().toLowerCase();
  return `near ${base} mrt`;
}

export function filterPatchForSuggestion(suggestion: Suggestion): Partial<FilterState> {
  switch (suggestion.group) {
    case "town":
      return { town: suggestion.town, search: "", selectedAddressKey: null };
    case "block":
      return { selectedAddressKey: suggestion.addressKey, search: "" };
    case "street":
      return { search: suggestion.search, town: "", selectedAddressKey: null };
    case "mrt":
      return {
        search: stationNameToNearMrtSearch(suggestion.stationName),
        town: "",
        selectedAddressKey: null,
      };
    case "postal":
      return { search: suggestion.search, town: "", selectedAddressKey: null };
  }
}
