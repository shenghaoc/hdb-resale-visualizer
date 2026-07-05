import { describe, expect, it } from "vite-plus/test";
import { resolveMultilingualSearchAliases } from "@shared/product/search-aliases";

describe("shared/product/search-aliases", () => {
  describe("resolveMultilingualSearchAliases", () => {
    it("returns input unchanged when no CJK characters", () => {
      expect(resolveMultilingualSearchAliases("bedok")).toBe("bedok");
      expect(resolveMultilingualSearchAliases("near ang mo kio mrt")).toBe("near ang mo kio mrt");
    });

    it("resolves Chinese town names to English", () => {
      expect(resolveMultilingualSearchAliases("宏茂桥")).toBe(" ang mo kio ");
      expect(resolveMultilingualSearchAliases("勿洛")).toBe(" bedok ");
      expect(resolveMultilingualSearchAliases("榜鹅")).toBe(" punggol ");
    });

    it("resolves Chinese MRT keywords", () => {
      expect(resolveMultilingualSearchAliases("地铁")).toBe(" mrt ");
      expect(resolveMultilingualSearchAliases("捷运")).toBe(" mrt ");
    });

    it("resolves Chinese search cues", () => {
      expect(resolveMultilingualSearchAliases("附近")).toBe(" near ");
      expect(resolveMultilingualSearchAliases("周边")).toBe(" near ");
    });

    it("resolves concatenated CJK queries", () => {
      expect(resolveMultilingualSearchAliases("宏茂桥地铁")).toBe(" ang mo kio  mrt ");
      expect(resolveMultilingualSearchAliases("勿洛附近")).toBe(" bedok  near ");
    });

    it("handles mixed CJK and ASCII input", () => {
      expect(resolveMultilingualSearchAliases("宏茂桥 mrt")).toBe(" ang mo kio  mrt");
    });

    it("resolves multiple CJK tokens in one string", () => {
      expect(resolveMultilingualSearchAliases("蔡厝港地铁")).toBe(" choa chu kang  mrt ");
    });

    it("handles empty string", () => {
      expect(resolveMultilingualSearchAliases("")).toBe("");
    });

    it("handles all town aliases", () => {
      const towns = [
        ["宏茂桥", "ang mo kio"],
        ["碧山", "bishan"],
        ["武吉巴督", "bukit batok"],
        ["武吉班让", "bukit panjang"],
        ["武吉知马", "bukit timah"],
        ["蔡厝港", "choa chu kang"],
        ["金文泰", "clementi"],
        ["后港", "hougang"],
        ["裕廊东", "jurong east"],
        ["白沙", "pasir ris"],
        ["女皇镇", "queenstown"],
        ["三巴旺", "sembawang"],
        ["盛港", "sengkang"],
        ["淡滨尼", "tampines"],
        ["大巴窑", "toa payoh"],
        ["兀兰", "woodlands"],
        ["义顺", "yishun"],
      ];
      for (const [input, expected] of towns) {
        expect(resolveMultilingualSearchAliases(input)).toContain(expected);
      }
    });
  });
});
