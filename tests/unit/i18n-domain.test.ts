import { describe, expect, it } from "vite-plus/test";
import { getBudgetDivisor, localizeFlatType, localizeTownName } from "@/shared/lib/i18n/domain";

describe("localizeTownName", () => {
  it("prefixes the canonical English town with the zh-SG translation", () => {
    expect(localizeTownName("ANG MO KIO", "zh-SG")).toBe("宏茂桥 · ANG MO KIO");
    expect(localizeTownName("KALLANG/WHAMPOA", "zh-SG")).toBe("加冷／黄埔 · KALLANG/WHAMPOA");
  });

  it("looks up towns case-insensitively but preserves the original spelling", () => {
    expect(localizeTownName(" ang mo kio ", "zh-SG")).toBe("宏茂桥 ·  ang mo kio ");
  });

  it("passes unknown towns through unchanged", () => {
    expect(localizeTownName("UNKNOWN TOWN", "zh-SG")).toBe("UNKNOWN TOWN");
  });

  it("leaves English labels unchanged", () => {
    expect(localizeTownName("ANG MO KIO", "en-SG")).toBe("ANG MO KIO");
  });
});

describe("localizeFlatType", () => {
  it("prefixes zh-SG flat-type labels", () => {
    expect(localizeFlatType("4 ROOM", "zh-SG")).toBe("四房式 · 4 ROOM");
    expect(localizeFlatType("EXECUTIVE", "zh-SG")).toBe("行政式 · EXECUTIVE");
  });

  it("passes unknown flat types through unchanged", () => {
    expect(localizeFlatType("UNKNOWN TYPE", "zh-SG")).toBe("UNKNOWN TYPE");
  });
});

describe("getBudgetDivisor", () => {
  it("uses 万 for zh-SG and thousands for en-SG", () => {
    expect(getBudgetDivisor("zh-SG")).toBe(10_000);
    expect(getBudgetDivisor("en-SG")).toBe(1_000);
  });
});
