import { describe, expect, it } from "vitest";
import {
  buildBlockShareUrl,
  buildCompareShareUrl,
  buildFilterShareUrl,
  buildShortlistShareUrl,
  buildBlockOgImageUrl,
  buildCompareOgImageUrl,
} from "../shareUrls";
import { DEFAULT_FILTERS } from "../constants";
import type { FilterState } from "@/types/data";

const BASE_URL = "https://example.com";

function makeFilters(overrides: Partial<FilterState> = {}): FilterState {
  return { ...DEFAULT_FILTERS, ...overrides };
}

describe("buildBlockShareUrl", () => {
  it("generates URL with town and selected params only", () => {
    const filters = makeFilters({
      town: "BEDOK",
      selectedAddressKey: "bedok-100",
      budgetMin: 400000,
      flatType: "4 ROOM",
    });
    const url = buildBlockShareUrl(filters, BASE_URL);
    expect(url).toContain("town=BEDOK");
    expect(url).toContain("selected=bedok-100");
    // Should strip budget and flatType
    expect(url).not.toContain("budgetMin");
    expect(url).not.toContain("flatType");
  });

  it("returns just the base URL when no town or selected", () => {
    const filters = makeFilters();
    const url = buildBlockShareUrl(filters, BASE_URL);
    // No non-default params → no query string
    expect(url).toBe(BASE_URL);
  });

  it("includes town even when no selected block", () => {
    const filters = makeFilters({ town: "BEDOK" });
    const url = buildBlockShareUrl(filters, BASE_URL);
    expect(url).toContain("town=BEDOK");
    expect(url).not.toContain("selected");
  });
});

describe("buildCompareShareUrl", () => {
  it("generates URL with town and compareTown", () => {
    const filters = makeFilters({
      town: "BEDOK",
      compareTown: "TAMPINES",
      budgetMin: 500000,
    });
    const url = buildCompareShareUrl(filters, BASE_URL);
    expect(url).toContain("town=BEDOK");
    expect(url).toContain("compareTown=TAMPINES");
    // Should strip budget and other filters
    expect(url).not.toContain("budgetMin");
  });

  it("omits compareTown when same as town", () => {
    const filters = makeFilters({
      town: "BEDOK",
      compareTown: "BEDOK",
    });
    const url = buildCompareShareUrl(filters, BASE_URL);
    // serializeFilters strips same-town compareTown
    expect(url).not.toContain("compareTown");
  });

  it("returns base URL when no town set", () => {
    const filters = makeFilters({ compareTown: "TAMPINES" });
    const url = buildCompareShareUrl(filters, BASE_URL);
    // compareTown without town anchor is stripped
    expect(url).toBe(BASE_URL);
  });
});

describe("buildFilterShareUrl", () => {
  it("preserves all active filters in the URL", () => {
    const filters = makeFilters({
      town: "BEDOK",
      budgetMin: 300000,
      budgetMax: 600000,
      flatType: "4 ROOM",
      affordable: "comfortable",
      sort: "median-asc",
    });
    const url = buildFilterShareUrl(filters, BASE_URL);
    expect(url).toContain("town=BEDOK");
    expect(url).toContain("budgetMin=300000");
    expect(url).toContain("budgetMax=600000");
    expect(url).toContain("flatType=4+ROOM");
    expect(url).toContain("affordable=comfortable");
    expect(url).toContain("sort=median-asc");
  });

  it("returns base URL when no active filters", () => {
    const filters = makeFilters();
    const url = buildFilterShareUrl(filters, BASE_URL);
    expect(url).toBe(BASE_URL);
  });

  it("strips default values", () => {
    const filters = makeFilters({ town: "" });
    const url = buildFilterShareUrl(filters, BASE_URL);
    // Empty town equals default → stripped
    expect(url).toBe(BASE_URL);
  });
});

describe("buildShortlistShareUrl", () => {
  it("appends encoded shortlist with filter scope", () => {
    const filters = makeFilters({ town: "BEDOK", budgetMin: 300000 });
    const url = buildShortlistShareUrl("abc123", filters, "https://example.com", "/");
    expect(url).toContain("town=BEDOK");
    expect(url).toContain("budgetMin=300000");
    expect(url).toContain("shortlist=abc123");
  });

  it("works when only shortlist param is set", () => {
    const url = buildShortlistShareUrl("abc123", makeFilters(), "https://example.com", "/");
    expect(url).toBe("https://example.com/?shortlist=abc123");
  });

  it("preserves pathname in URL", () => {
    const url = buildShortlistShareUrl("abc123", makeFilters(), "https://example.com", "/app/");
    expect(url).toBe("https://example.com/app/?shortlist=abc123");
  });

  it("includes search scope for geographic filters", () => {
    const filters = makeFilters({ search: "near MRT Bedok", town: "BEDOK" });
    const url = buildShortlistShareUrl("abc123", filters, "https://example.com", "/");
    expect(url).toContain("search=");
    expect(url).toContain("town=BEDOK");
    expect(url).toContain("shortlist=abc123");
  });
});

describe('OG image URL builders', () => {
  it("builds block OG route", () => {
    expect(buildBlockOgImageUrl("bedok-123", BASE_URL)).toBe("https://example.com/og/block/bedok-123.png");
  });

  it("builds compare OG route from canonical town names", () => {
    expect(buildCompareOgImageUrl("ANG MO KIO", "BEDOK", BASE_URL)).toBe(
      "https://example.com/og/compare/ang-mo-kio/bedok.png",
    );
    expect(buildCompareOgImageUrl("KALLANG/WHAMPOA", "BEDOK", BASE_URL)).toBe(
      "https://example.com/og/compare/kallang-whampoa/bedok.png",
    );
  });
});
