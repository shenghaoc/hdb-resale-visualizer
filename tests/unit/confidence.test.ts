import { describe, expect, it } from "vitest";
import { getDataConfidenceLevel } from "@/lib/confidence";

describe("getDataConfidenceLevel", () => {
  it("returns low for very few recent transactions", () => {
    expect(getDataConfidenceLevel(0)).toBe("low");
    expect(getDataConfidenceLevel(3)).toBe("low");
  });

  it("returns medium for some recent transactions", () => {
    expect(getDataConfidenceLevel(4)).toBe("medium");
    expect(getDataConfidenceLevel(7)).toBe("medium");
  });

  it("returns high for enough recent transactions", () => {
    expect(getDataConfidenceLevel(8)).toBe("high");
    expect(getDataConfidenceLevel(20)).toBe("high");
  });
});
