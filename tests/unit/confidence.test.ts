import { describe, expect, it } from "vitest";
import { getDataConfidenceLabelKey, getDataConfidenceLevel } from "@/features/listing-check/confidence";

describe("getDataConfidenceLevel", () => {
  it("returns low for very few recent transactions", () => {
    expect(getDataConfidenceLevel(0)).toBe("low");
    expect(getDataConfidenceLevel(2)).toBe("low");
  });

  it("returns medium for some recent transactions", () => {
    expect(getDataConfidenceLevel(3)).toBe("medium");
    expect(getDataConfidenceLevel(5)).toBe("medium");
  });

  it("returns high for enough recent transactions", () => {
    expect(getDataConfidenceLevel(6)).toBe("high");
    expect(getDataConfidenceLevel(8)).toBe("high");
    expect(getDataConfidenceLevel(20)).toBe("high");
  });

  it("returns stable i18n label keys for each confidence band", () => {
    expect(getDataConfidenceLabelKey(0)).toBe("confidence.low.label");
    expect(getDataConfidenceLabelKey(3)).toBe("confidence.medium.label");
    expect(getDataConfidenceLabelKey(8)).toBe("confidence.high.label");
  });
});
