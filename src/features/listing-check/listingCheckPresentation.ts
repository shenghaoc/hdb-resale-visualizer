import type { Caveat, CaveatCode } from "../../../shared/caveat-codes";
import type { ConfidenceAssessment } from "../../../shared/confidence-system";
import type { Translator } from "@/shared/lib/i18n";

const MATCH_REASON_KEYS: Readonly<Record<string, string>> = {
  "Same block": "evidence.matchReason.sameBlock",
  "Same street": "evidence.matchReason.sameStreet",
  "Same town": "evidence.matchReason.sameTown",
  "Same flat type": "evidence.matchReason.sameFlatType",
  "Similar storey": "evidence.matchReason.similarStorey",
  "Similar lease": "evidence.matchReason.similarLease",
  "Recent transaction": "evidence.matchReason.recentTransaction",
};

const FLOOR_AREA_REASON_PATTERN = /^Similar floor area \(±(\d+(?:\.\d+)?) sqm\)$/;

const RAW_CAVEAT_CODES: ReadonlyArray<readonly [RegExp, CaveatCode]> = [
  [/^No comparable transactions found for this listing\.$/i, "NO_COMPARABLES"],
  [/widened to the same street/i, "WIDENED_TO_STREET"],
  [/widened to the entire town/i, "WIDENED_TO_TOWN"],
  [
    /time adjustment could not be applied|could not be time-adjusted|insufficient trend data|no trend data available/i,
    "TIME_ADJUSTMENT_UNAVAILABLE",
  ],
];

function caveatTranslationKey(caveat: Caveat): string {
  if (
    (caveat.code === "VERY_LOW_SAMPLE" || caveat.code === "SMALL_TREND_SAMPLE") &&
    caveat.values?.count === 1
  ) {
    return `check.caveat.${caveat.code}.one`;
  }
  return `check.caveat.${caveat.code}`;
}

/**
 * Translate a structured caveat at the presentation boundary. The generator's
 * stable English message remains available to non-UI consumers and logs.
 */
export function formatListingCaveat(caveat: Caveat, t: Translator): string {
  return t(caveatTranslationKey(caveat), caveat.values);
}

/**
 * Localize an evidence-banner caveat. Structured caveats are preferred; the
 * raw-string branch only covers stable API fallbacks shown before a verdict can
 * be derived. Unknown server text is preserved instead of being hidden.
 */
export function formatEvidenceCaveat(caveat: Caveat | string, t: Translator): string {
  if (typeof caveat !== "string") {
    return formatListingCaveat(caveat, t);
  }

  const mapped = RAW_CAVEAT_CODES.find(([pattern]) => pattern.test(caveat));
  return mapped ? t(`check.caveat.${mapped[1]}`) : caveat;
}

/**
 * Keep the comparable engine's eight English reason identifiers stable for
 * scoring/counting, then translate only when the badge is rendered.
 */
export function formatListingMatchReason(reason: string, t: Translator): string {
  const key = MATCH_REASON_KEYS[reason];
  if (key) {
    return t(key);
  }

  const floorAreaMatch = FLOOR_AREA_REASON_PATTERN.exec(reason);
  if (floorAreaMatch) {
    return t("evidence.matchReason.similarFloorArea", {
      difference: floorAreaMatch[1]!,
    });
  }

  return reason;
}

/**
 * Rebuild the engine's English summary from its structured input so changing
 * locale cannot alter the evidence score or token-based match counts.
 */
export function formatListingConfidenceSummary(
  confidence: ConfidenceAssessment,
  t: Translator,
): string {
  const level = t(`check.confidence.${confidence.level}`);
  const { input } = confidence;

  if (input.comparableCount === 0) {
    return t("check.confidence.summary.noComparables", { level });
  }

  const parts = [
    t(
      input.comparableCount === 1
        ? "check.confidence.summary.comparable.one"
        : "check.confidence.summary.comparable",
      { count: input.comparableCount },
    ),
  ];

  if (input.sameBlockCount > 0) {
    parts.push(
      t("check.confidence.summary.sameBlock", {
        count: input.sameBlockCount,
      }),
    );
  }

  if (input.newestComparableAgeMonths != null) {
    if (input.newestComparableAgeMonths === 0) {
      parts.push(t("check.confidence.summary.thisMonth"));
    } else {
      parts.push(
        t(
          input.newestComparableAgeMonths === 1
            ? "check.confidence.summary.monthAgo.one"
            : "check.confidence.summary.monthAgo",
          { count: input.newestComparableAgeMonths },
        ),
      );
    }
  }

  return t("check.confidence.summary.details", {
    level,
    details: parts.join(t("check.confidence.summary.separator")),
  });
}
