import { describe, expect, it } from "vitest";
import { buildSeoMeta, canonicalUrlForRoute, sitemapXml } from "../../worker/seo";

describe("seo worker helpers", () => {
  it("normalizes canonical route urls", () => {
    const blockUrl = canonicalUrlForRoute("https://example.com", "BEDOK", "BK-1", "ANG MO KIO");
    expect(blockUrl).toContain("town=BEDOK");
    expect(blockUrl).toContain("selected=BK-1");
    expect(blockUrl).not.toContain("compareTown");

    const compareUrl = canonicalUrlForRoute("https://example.com", "BEDOK", null, "ANG MO KIO");
    expect(compareUrl).toContain("compareTown=ANG+MO+KIO");

    const sameTownCompare = canonicalUrlForRoute("https://example.com", "BEDOK", null, "bedok");
    expect(sameTownCompare).not.toContain("compareTown");

    expect(canonicalUrlForRoute("https://example.com", null, null, null)).toBe("https://example.com/");
  });

  it("serializes sitemap with required loc entries", () => {
    const xml = sitemapXml([
      { loc: "https://example.com/" },
      { loc: "https://example.com/?town=BEDOK", lastmod: "2026-05-25" },
    ]);

    expect(xml).toContain("<urlset");
    expect((xml.match(/<url>/g) ?? []).length).toBe(2);
    expect((xml.match(/<loc>/g) ?? []).length).toBe(2);
    expect(xml).toContain("<lastmod>2026-05-25</lastmod>");
  });

  it("escapes xml-reserved chars in sitemap entries", () => {
    const xml = sitemapXml([{ loc: "https://example.com/?town=A&B" }]);
    expect(xml).toContain("A&amp;B");
  });

  it("builds town and block seo metadata", () => {
    const town = buildSeoMeta({ town: "BEDOK", manifest: { availableDateRange: ["2017-01", "2026-04"] } });
    expect(town?.title).toBe("BEDOK HDB resale prices");

    const block = buildSeoMeta({
      block: {
        addressKey: "k",
        town: "BEDOK",
        displayName: "10D Bedok Sth Ave 2",
        medianPrice: 560000,
        transactionCount: 23,
        availableDateRange: ["2019-01", "2026-04"],
        floorAreaRange: [65, 120],
      },
    });
    expect(block?.title).toContain("10D Bedok Sth Ave 2");
    expect(block?.description).toContain("23 resale transactions");

    expect(buildSeoMeta({})).toBeNull();
  });
});
