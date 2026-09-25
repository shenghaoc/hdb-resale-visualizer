import { describe, expect, it } from "vite-plus/test";
import { parseRemainingLease } from "../../scripts/lib/pipeline";

describe("parseRemainingLease", () => {
  const currentYear = new Date().getFullYear();

  it("keeps an official remaining-lease string after trimming", () => {
    expect(parseRemainingLease("  61 years 4 months  ", currentYear)).toBe("61 years 4 months");
  });

  it("derives a 99-year lease when the official field is missing or blank", () => {
    expect(parseRemainingLease(undefined, currentYear)).toBe("99 years");
    expect(parseRemainingLease("   ", currentYear - 10)).toBe("89 years");
    expect(parseRemainingLease("", currentYear - 98)).toBe("1 years");
  });

  it("floors a lapsed lease at 0 years", () => {
    expect(parseRemainingLease(undefined, currentYear - 120)).toBe("0 years");
  });

  it("does not cap a future lease-commence year at 99", () => {
    expect(parseRemainingLease(undefined, currentYear + 1)).toBe("100 years");
  });
});
