import { describe, expect, it } from "vitest";
import {
  getComparableSetQualityTag,
  getBlockDataQualityTag,
} from "@/shared/lib/listing-quality";
import type { ConfidenceAssessment } from "../../shared/confidence-system";

function makeConfidence(
  overrides: Partial<ConfidenceAssessment> = {},
): ConfidenceAssessment {
  return {
    level: "high",
    score: 0.85,
    signals: { sample: 0.9, recency: 0.9, scope: 0.8, match: 0.7 },
    summary: "High confidence — 10 comparables, 5 same-block",
    input: {
      comparableCount: 10,
      sameBlockCount: 5,
      sameStreetCount: 8,
      sameTownCount: 10,
      newestComparableAgeMonths: 2,
      flatTypeMatchCount: 8,
      floorAreaMatchCount: 7,
      storeyMatchCount: 6,
      timeAdjustmentApplied: false,
      trendSampleSize: null,
    },
    ...overrides,
  };
}

describe("getComparableSetQualityTag", () => {
  it("returns 'strong' when confidence is high with no caveats", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence(),
      widenedSearch: false,
      newestComparableAgeMonths: 2,
    });

    expect(tag).toBe("strong");
  });

  it("returns 'stale' when newest comparable exceeds 12 months", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence(),
      widenedSearch: false,
      newestComparableAgeMonths: 13,
    });

    expect(tag).toBe("stale");
  });

  it("returns 'stale' when STALE_DATA caveat is present (even with low age)", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence(),
      widenedSearch: false,
      newestComparableAgeMonths: 5,
      caveatCodes: ["STALE_DATA"],
    });

    expect(tag).toBe("stale");
  });

  it("returns 'widened' when widenedSearch is true", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence(),
      widenedSearch: true,
      newestComparableAgeMonths: 2,
    });

    expect(tag).toBe("widened");
  });

  it("returns 'widened' when WIDENED_TO_STREET caveat is present", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence(),
      widenedSearch: false,
      newestComparableAgeMonths: 2,
      caveatCodes: ["WIDENED_TO_STREET"],
    });

    expect(tag).toBe("widened");
  });

  it("returns 'widened' when WIDENED_TO_TOWN caveat is present", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence(),
      widenedSearch: false,
      newestComparableAgeMonths: 2,
      caveatCodes: ["WIDENED_TO_TOWN"],
    });

    expect(tag).toBe("widened");
  });

  it("returns 'weak' when confidence level is low", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence({ level: "low" }),
      widenedSearch: false,
      newestComparableAgeMonths: 2,
    });

    expect(tag).toBe("weak");
  });

  it("returns 'strong' when confidence is medium with adequate evidence", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence({ level: "medium" }),
      widenedSearch: false,
      newestComparableAgeMonths: 2,
    });

    // Medium confidence (without a low-sample signal) is strong, not weak.
    expect(tag).toBe("strong");
  });

  it("returns 'weak' when LOW_SAMPLE caveat is present", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence(),
      widenedSearch: false,
      newestComparableAgeMonths: 2,
      caveatCodes: ["LOW_SAMPLE"],
    });

    expect(tag).toBe("weak");
  });

  it("returns 'weak' when VERY_LOW_SAMPLE caveat is present", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence(),
      widenedSearch: false,
      newestComparableAgeMonths: 2,
      caveatCodes: ["VERY_LOW_SAMPLE"],
    });

    expect(tag).toBe("weak");
  });

  it("returns 'weak' when NO_COMPARABLES caveat is present", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence({
        input: {
          ...makeConfidence().input,
          comparableCount: 0,
        },
      }),
      widenedSearch: false,
      newestComparableAgeMonths: null,
      caveatCodes: ["NO_COMPARABLES"],
    });

    expect(tag).toBe("weak");
  });

  it("returns 'weak' when comparable count is below LOW_SAMPLE_THRESHOLD", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence({
        input: {
          ...makeConfidence().input,
          comparableCount: 3,
        },
      }),
      widenedSearch: false,
      newestComparableAgeMonths: 2,
    });

    expect(tag).toBe("weak");
  });

  // --- Priority ordering ---

  it("stale overrides widened", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence(),
      widenedSearch: true,
      newestComparableAgeMonths: 15,
      caveatCodes: ["WIDENED_TO_TOWN"],
    });

    expect(tag).toBe("stale");
  });

  it("widened overrides weak", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence({ level: "low" }),
      widenedSearch: true,
      newestComparableAgeMonths: 2,
      caveatCodes: ["LOW_SAMPLE"],
    });

    expect(tag).toBe("widened");
  });

  it("stale overrides weak", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence({ level: "low" }),
      widenedSearch: false,
      newestComparableAgeMonths: 20,
      caveatCodes: ["LOW_SAMPLE"],
    });

    expect(tag).toBe("stale");
  });

  it("handles null newestComparableAgeMonths without crashing", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence(),
      widenedSearch: false,
      newestComparableAgeMonths: null,
    });

    expect(tag).toBe("strong");
  });

  it("handles empty caveatCodes array", () => {
    const tag = getComparableSetQualityTag({
      confidence: makeConfidence(),
      widenedSearch: false,
      newestComparableAgeMonths: 3,
      caveatCodes: [],
    });

    expect(tag).toBe("strong");
  });
});

describe("getBlockDataQualityTag", () => {
  it("returns 'strong' for recent block with sufficient transactions", () => {
    const tag = getBlockDataQualityTag({
      transactionCount: 10,
      latestMonth: "2026-05",
      referenceMonth: "2026-06",
    });

    expect(tag).toBe("strong");
  });

  it("returns 'stale' when latestMonth is over 12 months old", () => {
    const tag = getBlockDataQualityTag({
      transactionCount: 10,
      latestMonth: "2024-01",
      referenceMonth: "2026-06",
    });

    expect(tag).toBe("stale");
  });

  it("returns 'weak' when transaction count is below threshold", () => {
    const tag = getBlockDataQualityTag({
      transactionCount: 3,
      latestMonth: "2026-05",
      referenceMonth: "2026-06",
    });

    expect(tag).toBe("weak");
  });

  it("returns 'strong' when no referenceMonth is provided", () => {
    const tag = getBlockDataQualityTag({
      transactionCount: 10,
      latestMonth: "2020-01",
    });

    expect(tag).toBe("strong");
  });

  it("returns 'strong' when referenceMonth is null", () => {
    const tag = getBlockDataQualityTag({
      transactionCount: 10,
      latestMonth: "2020-01",
      referenceMonth: null,
    });

    expect(tag).toBe("strong");
  });

  it("stale overrides weak", () => {
    const tag = getBlockDataQualityTag({
      transactionCount: 2,
      latestMonth: "2024-01",
      referenceMonth: "2026-06",
    });

    expect(tag).toBe("stale");
  });

  it("returns 'weak' at exactly LOW_SAMPLE_THRESHOLD - 1", () => {
    const tag = getBlockDataQualityTag({
      transactionCount: 4,
      latestMonth: "2026-05",
      referenceMonth: "2026-06",
    });

    expect(tag).toBe("weak");
  });

  it("returns 'strong' at exactly LOW_SAMPLE_THRESHOLD", () => {
    const tag = getBlockDataQualityTag({
      transactionCount: 5,
      latestMonth: "2026-05",
      referenceMonth: "2026-06",
    });

    expect(tag).toBe("strong");
  });
});
