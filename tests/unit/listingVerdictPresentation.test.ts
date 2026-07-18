import { describe, expect, it } from "vite-plus/test";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2 } from "lucide-react";
import type { AskingPriceAssessment } from "@/entities/transaction/transaction-analysis";
import {
  formatSignedListingCurrency,
  formatSignedListingPercent,
  getListingVerdictStyles,
  LISTING_VERDICT_THEMES,
  type ListingVerdictTone,
} from "@/features/listing-check/listingVerdictPresentation";

const VERDICTS: AskingPriceAssessment["verdict"][] = [
  "well_below",
  "below",
  "fair",
  "above",
  "well_above",
];

describe("listingVerdictPresentation", () => {
  it("maps every asking-price verdict to the existing tone", () => {
    expect(LISTING_VERDICT_THEMES.well_below.tone).toBe("success");
    expect(LISTING_VERDICT_THEMES.below.tone).toBe("success");
    expect(LISTING_VERDICT_THEMES.fair.tone).toBe("muted");
    expect(LISTING_VERDICT_THEMES.above.tone).toBe("warning");
    expect(LISTING_VERDICT_THEMES.well_above.tone).toBe("destructive");
  });

  it("maps every verdict to the existing i18n key", () => {
    expect(LISTING_VERDICT_THEMES.well_below.i18nKey).toBe("askingCheck.verdict.wellBelow");
    expect(LISTING_VERDICT_THEMES.below.i18nKey).toBe("askingCheck.verdict.below");
    expect(LISTING_VERDICT_THEMES.fair.i18nKey).toBe("askingCheck.verdict.fair");
    expect(LISTING_VERDICT_THEMES.above.i18nKey).toBe("askingCheck.verdict.above");
    expect(LISTING_VERDICT_THEMES.well_above.i18nKey).toBe("askingCheck.verdict.wellAbove");
  });

  it("uses the downward icon for well-below and below", () => {
    expect(LISTING_VERDICT_THEMES.well_below.icon).toBe(ArrowDown);
    expect(LISTING_VERDICT_THEMES.below.icon).toBe(ArrowDown);
  });

  it("uses the upward icon for above", () => {
    expect(LISTING_VERDICT_THEMES.above.icon).toBe(ArrowUp);
  });

  it("uses the warning icon for well-above", () => {
    expect(LISTING_VERDICT_THEMES.well_above.icon).toBe(AlertTriangle);
  });

  it("uses the check icon for fair", () => {
    expect(LISTING_VERDICT_THEMES.fair.icon).toBe(CheckCircle2);
  });

  it("covers every verdict key exactly once", () => {
    expect(Object.keys(LISTING_VERDICT_THEMES).sort()).toEqual([...VERDICTS].sort());
  });

  it("formats positive signed currency with a plus sign", () => {
    const formatted = formatSignedListingCurrency(12_500);
    expect(formatted.startsWith("+")).toBe(true);
    expect(formatted).toContain("12.5");
  });

  it("formats negative signed currency with the Unicode minus sign", () => {
    const formatted = formatSignedListingCurrency(-12_500);
    expect(formatted.startsWith("−")).toBe(true);
    expect(formatted.includes("-")).toBe(false);
    expect(formatted).toContain("12.5");
  });

  it("formats zero currency without a sign", () => {
    const formatted = formatSignedListingCurrency(0);
    expect(formatted.startsWith("+")).toBe(false);
    expect(formatted.startsWith("−")).toBe(false);
    expect(formatted.startsWith("-")).toBe(false);
  });

  it("formats positive signed percentage with a plus sign", () => {
    expect(formatSignedListingPercent(3.25)).toBe("+3.3%");
  });

  it("formats negative percentage with the Unicode minus sign and one decimal place", () => {
    expect(formatSignedListingPercent(-2.14)).toBe("−2.1%");
  });

  it("retains one decimal place for percentage output", () => {
    expect(formatSignedListingPercent(0)).toBe("0.0%");
    expect(formatSignedListingPercent(10)).toBe("+10.0%");
  });

  it("returns the expected style classes for each tone", () => {
    const tones: ListingVerdictTone[] = ["success", "warning", "destructive", "muted"];
    const expected = {
      success: {
        bg: "bg-success/10",
        border: "border-success/30",
        text: "text-success",
        badge: "bg-success/15 text-success border-success/30",
      },
      warning: {
        bg: "bg-warning/10",
        border: "border-warning/30",
        text: "text-warning",
        badge: "bg-warning/15 text-warning border-warning/30",
      },
      destructive: {
        bg: "bg-destructive/10",
        border: "border-destructive/30",
        text: "text-destructive",
        badge: "bg-destructive/15 text-destructive border-destructive/30",
      },
      muted: {
        bg: "bg-muted/30",
        border: "border-border/40",
        text: "text-foreground",
        badge: "bg-muted/40 text-foreground border-border/40",
      },
    } as const;

    for (const tone of tones) {
      expect(getListingVerdictStyles(tone)).toEqual(expected[tone]);
    }
  });

  it("retains a usable badge class for muted tone", () => {
    const muted = getListingVerdictStyles("muted");
    expect(muted.badge).toContain("bg-muted");
    expect(muted.badge.length).toBeGreaterThan(0);
  });
});
