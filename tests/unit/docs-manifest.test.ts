import { describe, expect, it } from "vite-plus/test";
import {
  DOCS_SECTIONS,
  buildDocsSearchEntries,
  getDocsSection,
} from "@/features/docs/docsManifest";
import {
  DOCS_INDEX_SLUG,
  DOCS_PATH_PREFIX,
  docsPath,
  isDocsPath,
  slugFromPath,
} from "@/features/docs/docsRouter";

describe("docs manifest", () => {
  it("has unique kebab-case slugs", () => {
    const slugs = DOCS_SECTIONS.map((section) => section.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it("covers the documented route structure", () => {
    const slugs = DOCS_SECTIONS.map((section) => section.slug);
    expect(slugs).toEqual([
      DOCS_INDEX_SLUG,
      "getting-started",
      "understanding-price-comparisons",
      "filters-and-map",
      "shortlisting",
      "faq",
      "troubleshooting",
    ]);
  });

  it("every section has a title and an h1 heading", () => {
    for (const section of DOCS_SECTIONS) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.content.trimStart().startsWith("# ")).toBe(true);
    }
  });

  it("the overview carries the advice disclaimer", () => {
    const overview = getDocsSection(DOCS_INDEX_SLUG);
    expect(overview.content).toContain("Disclaimer");
    expect(overview.content).toContain(
      "financial, legal, valuation, property, or purchasing advice",
    );
  });

  it("falls back to the overview for unknown slugs", () => {
    expect(getDocsSection("does-not-exist").slug).toBe(DOCS_INDEX_SLUG);
  });

  it("internal links in content point at known sections", () => {
    const slugs = new Set(DOCS_SECTIONS.map((section) => section.slug));
    for (const section of DOCS_SECTIONS) {
      for (const match of section.content.matchAll(/\]\((\/docs[^)#?\s]*)\)/g)) {
        expect(slugs.has(slugFromPath(match[1]))).toBe(true);
      }
    }
  });
});

describe("docs search index", () => {
  it("produces entries for every section without markdown noise", () => {
    const entries = buildDocsSearchEntries();
    const coveredSlugs = new Set(entries.map((entry) => entry.slug));
    for (const section of DOCS_SECTIONS) {
      expect(coveredSlugs.has(section.slug)).toBe(true);
    }
    for (const entry of entries) {
      expect(entry.body).not.toContain("#");
      expect(entry.body).not.toContain("](");
    }
  });

  it("splits pages on h2 headings", () => {
    const headings = buildDocsSearchEntries()
      .filter((entry) => entry.slug === "troubleshooting")
      .map((entry) => entry.heading);
    expect(headings).toContain("No results / empty map");
    expect(headings).toContain("Stale data or stale cache");
  });
});

describe("docs routing helpers", () => {
  it("recognises docs paths and only docs paths", () => {
    expect(isDocsPath("/docs")).toBe(true);
    expect(isDocsPath("/docs/faq")).toBe(true);
    expect(isDocsPath("/")).toBe(false);
    expect(isDocsPath("/docsy")).toBe(false);
  });

  it("round-trips slug -> path -> slug", () => {
    for (const section of DOCS_SECTIONS) {
      expect(slugFromPath(docsPath(section.slug))).toBe(section.slug);
    }
    expect(docsPath(DOCS_INDEX_SLUG)).toBe(DOCS_PATH_PREFIX);
  });

  it("normalises trailing slashes and unknown shapes", () => {
    expect(slugFromPath("/docs/")).toBe(DOCS_INDEX_SLUG);
    expect(slugFromPath("/docs/faq/")).toBe("faq");
    expect(slugFromPath("/elsewhere")).toBe(DOCS_INDEX_SLUG);
  });
});
