import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2 } from "lucide-react";
import type { AskingPriceAssessment } from "@/entities/transaction/transaction-analysis";
import { formatCompactCurrency } from "@/shared/lib/format";
import type { Locale } from "@/shared/lib/i18n";

export type ListingVerdictTone = "success" | "warning" | "destructive" | "muted";

export type ListingVerdictTheme = {
  tone: ListingVerdictTone;
  icon: typeof CheckCircle2;
  i18nKey: string;
};

export const LISTING_VERDICT_THEMES: Record<AskingPriceAssessment["verdict"], ListingVerdictTheme> =
  {
    well_below: { tone: "success", icon: ArrowDown, i18nKey: "askingCheck.verdict.wellBelow" },
    below: { tone: "success", icon: ArrowDown, i18nKey: "askingCheck.verdict.below" },
    fair: { tone: "muted", icon: CheckCircle2, i18nKey: "askingCheck.verdict.fair" },
    above: { tone: "warning", icon: ArrowUp, i18nKey: "askingCheck.verdict.above" },
    well_above: {
      tone: "destructive",
      icon: AlertTriangle,
      i18nKey: "askingCheck.verdict.wellAbove",
    },
  };

export function getListingVerdictStyles(tone: ListingVerdictTone): {
  bg: string;
  border: string;
  text: string;
  badge: string;
} {
  switch (tone) {
    case "success":
      return {
        bg: "bg-success/10",
        border: "border-success/30",
        text: "text-success",
        badge: "bg-success/15 text-success border-success/30",
      };
    case "warning":
      return {
        bg: "bg-warning/10",
        border: "border-warning/30",
        text: "text-warning",
        badge: "bg-warning/15 text-warning border-warning/30",
      };
    case "destructive":
      return {
        bg: "bg-destructive/10",
        border: "border-destructive/30",
        text: "text-destructive",
        badge: "bg-destructive/15 text-destructive border-destructive/30",
      };
    default:
      return {
        bg: "bg-muted/30",
        border: "border-border/40",
        text: "text-foreground",
        badge: "bg-muted/40 text-foreground border-border/40",
      };
  }
}

export function formatSignedListingCurrency(value: number, locale?: Locale): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatCompactCurrency(Math.abs(value), locale)}`;
}

export function formatSignedListingPercent(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}
