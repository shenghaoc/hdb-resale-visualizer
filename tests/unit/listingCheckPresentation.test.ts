import { describe, expect, it } from "vite-plus/test";
import {
  formatEvidenceCaveat,
  formatListingCaveat,
  formatListingConfidenceSummary,
  formatListingMatchReason,
} from "@/features/listing-check/listingCheckPresentation";
import { dictionaries } from "@/shared/lib/i18n/messages";
import type { Locale, Translator } from "@/shared/lib/i18n";
import type { Caveat, CaveatCode } from "../../shared/caveat-codes";
import { computeConfidence, type ConfidenceInput } from "../../shared/confidence-system";

function createTranslator(locale: Locale): Translator {
  return (key, vars) => {
    const template = dictionaries[locale][key] ?? dictionaries["en-SG"][key] ?? key;
    if (!vars) return template;
    return Object.entries(vars).reduce(
      (current, [name, value]) => current.replaceAll(`{${name}}`, String(value)),
      template,
    );
  };
}

const en = createTranslator("en-SG");
const zh = createTranslator("zh-SG");

const ALL_CAVEATS: ReadonlyArray<Caveat> = [
  { code: "NO_COMPARABLES", severity: "critical", message: "engine message" },
  {
    code: "VERY_LOW_SAMPLE",
    severity: "warning",
    message: "engine message",
    values: { count: 2 },
  },
  { code: "LOW_SAMPLE", severity: "warning", message: "engine message", values: { count: 4 } },
  { code: "STALE_DATA", severity: "warning", message: "engine message" },
  { code: "NO_SAME_BLOCK", severity: "info", message: "engine message" },
  { code: "NO_SAME_STREET", severity: "warning", message: "engine message" },
  { code: "WIDENED_TO_STREET", severity: "info", message: "engine message" },
  { code: "WIDENED_TO_TOWN", severity: "warning", message: "engine message" },
  { code: "FLAT_TYPE_MISMATCH", severity: "warning", message: "engine message" },
  { code: "FLOOR_AREA_MISMATCH", severity: "info", message: "engine message" },
  { code: "STOREY_MISMATCH", severity: "info", message: "engine message" },
  {
    code: "LEASE_MISMATCH",
    severity: "warning",
    message: "engine message",
    values: { leaseCommenceYear: 2015, medianLeaseYear: 1990 },
  },
  { code: "EXTREME_OUTLIER_LOW", severity: "info", message: "engine message" },
  { code: "EXTREME_OUTLIER_HIGH", severity: "info", message: "engine message" },
  { code: "TIME_ADJUSTMENT_APPLIED", severity: "info", message: "engine message" },
  { code: "TIME_ADJUSTMENT_UNAVAILABLE", severity: "warning", message: "engine message" },
  {
    code: "SMALL_TREND_SAMPLE",
    severity: "warning",
    message: "engine message",
    values: { count: 3 },
  },
];

const ALL_CODES: ReadonlyArray<CaveatCode> = [
  "LOW_SAMPLE",
  "VERY_LOW_SAMPLE",
  "NO_COMPARABLES",
  "STALE_DATA",
  "NO_SAME_BLOCK",
  "NO_SAME_STREET",
  "WIDENED_TO_STREET",
  "WIDENED_TO_TOWN",
  "FLAT_TYPE_MISMATCH",
  "FLOOR_AREA_MISMATCH",
  "STOREY_MISMATCH",
  "LEASE_MISMATCH",
  "EXTREME_OUTLIER_LOW",
  "EXTREME_OUTLIER_HIGH",
  "TIME_ADJUSTMENT_APPLIED",
  "TIME_ADJUSTMENT_UNAVAILABLE",
  "SMALL_TREND_SAMPLE",
];

function confidenceInput(overrides: Partial<ConfidenceInput> = {}): ConfidenceInput {
  return {
    comparableCount: 12,
    sameBlockCount: 4,
    sameStreetCount: 8,
    sameTownCount: 12,
    newestComparableAgeMonths: 2,
    flatTypeMatchCount: 12,
    floorAreaMatchCount: 12,
    storeyMatchCount: 12,
    timeAdjustmentApplied: false,
    trendSampleSize: null,
    ...overrides,
  };
}

describe("listingCheckPresentation", () => {
  it("localizes all 17 structured caveat codes without changing their identifiers", () => {
    expect(ALL_CAVEATS.map((caveat) => caveat.code).sort()).toEqual([...ALL_CODES].sort());

    for (const caveat of ALL_CAVEATS) {
      const english = formatListingCaveat(caveat, en);
      const chinese = formatListingCaveat(caveat, zh);
      expect(english).not.toContain("check.caveat.");
      expect(chinese).not.toContain("check.caveat.");
      expect(chinese).not.toBe(english);
      expect(caveat.message).toBe("engine message");
    }
  });

  it("interpolates structured caveat values in both locales", () => {
    const caveat = ALL_CAVEATS.find((item) => item.code === "LEASE_MISMATCH")!;
    expect(formatListingCaveat(caveat, en)).toContain("2015");
    expect(formatListingCaveat(caveat, en)).toContain("1990");
    expect(formatListingCaveat(caveat, zh)).toContain("2015");
    expect(formatListingCaveat(caveat, zh)).toContain("1990");
  });

  it("localizes all eight stable match-reason identifiers at render time", () => {
    const reasons = [
      "Same block",
      "Same street",
      "Same town",
      "Same flat type",
      "Similar floor area (±2 sqm)",
      "Similar storey",
      "Similar lease",
      "Recent transaction",
    ];

    expect(reasons.map((reason) => formatListingMatchReason(reason, en))).toEqual(reasons);
    for (const reason of reasons) {
      expect(formatListingMatchReason(reason, zh)).not.toBe(reason);
    }
    expect(formatListingMatchReason("Similar floor area (±2 sqm)", zh)).toContain("±2");
  });

  it("preserves unknown match reasons and API caveats as truthful fallbacks", () => {
    expect(formatListingMatchReason("Future stable reason", zh)).toBe("Future stable reason");
    expect(formatEvidenceCaveat("Future API caveat", zh)).toBe("Future API caveat");
    expect(formatEvidenceCaveat("No comparable transactions found for this listing.", zh)).toBe(
      "未找到可比交易，无法得出结论。",
    );
  });

  it("builds localized confidence summaries from structured input, not English text", () => {
    const confidence = computeConfidence(confidenceInput());
    const originalSummary = confidence.summary;

    expect(formatListingConfidenceSummary(confidence, en)).toBe(
      "High confidence — 12 comparables, 4 same-block, newest 2 months ago",
    );
    expect(formatListingConfidenceSummary(confidence, zh)).toBe(
      "高可信度 — 12 笔可比交易，4 笔来自同一栋组屋，最新交易在 2 个月前",
    );
    expect(confidence.summary).toBe(originalSummary);
    expect(confidence.input.flatTypeMatchCount).toBe(12);
  });

  it("handles zero, singular, and current-month confidence summary branches", () => {
    const none = computeConfidence(
      confidenceInput({
        comparableCount: 0,
        sameBlockCount: 0,
        sameStreetCount: 0,
        sameTownCount: 0,
        newestComparableAgeMonths: null,
        flatTypeMatchCount: 0,
        floorAreaMatchCount: 0,
        storeyMatchCount: 0,
      }),
    );
    const one = computeConfidence(
      confidenceInput({
        comparableCount: 1,
        sameBlockCount: 1,
        sameStreetCount: 1,
        sameTownCount: 1,
        newestComparableAgeMonths: 0,
        flatTypeMatchCount: 1,
        floorAreaMatchCount: 1,
        storeyMatchCount: 1,
      }),
    );

    expect(formatListingConfidenceSummary(none, en)).toBe(
      "Low confidence — no comparable transactions found",
    );
    expect(formatListingConfidenceSummary(one, en)).toBe(
      "Low confidence — 1 comparable, 1 same-block, newest this month",
    );
  });
});
