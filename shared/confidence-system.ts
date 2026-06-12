export type ConfidenceLevel = "high" | "medium" | "low";

export type ConfidenceInput = {
  comparableCount: number;
  sameBlockCount: number;
  sameStreetCount: number;
  sameTownCount: number;
  newestComparableAgeMonths: number | null;
  flatTypeMatchCount: number;
  floorAreaMatchCount: number;
  storeyMatchCount: number;
  timeAdjustmentApplied: boolean;
  trendSampleSize: number | null;
};

export type ConfidenceSignals = {
  sample: number;
  recency: number;
  scope: number;
  match: number;
};

export type ConfidenceAssessment = {
  level: ConfidenceLevel;
  score: number;
  signals: ConfidenceSignals;
  summary: string;
  input: ConfidenceInput;
};

const SAMPLE_WEIGHT = 0.35;
const RECENCY_WEIGHT = 0.25;
const SCOPE_WEIGHT = 0.25;
const MATCH_WEIGHT = 0.15;

const SAMPLE_SATURATION = 12;
const RECENCY_DECAY_MONTHS = 24;

const HIGH_THRESHOLD = 0.7;
const MEDIUM_THRESHOLD = 0.4;

const OVERRIDE_MIN_COUNT = 3;
const OVERRIDE_MAX_AGE_MONTHS = 18;

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function computeSampleSignal(count: number): number {
  return clamp01(count / SAMPLE_SATURATION);
}

export function computeRecencySignal(ageMonths: number | null): number {
  if (ageMonths == null) return 1.0;
  return clamp01(1 - ageMonths / RECENCY_DECAY_MONTHS);
}

/** Counts are cumulative: block ⊆ street ⊆ town (a same-block tx also counts as same-street and same-town). */
export function computeScopeSignal(
  sameBlockCount: number,
  sameStreetCount: number,
  sameTownCount: number,
  totalCount: number,
): number {
  const denom = Math.max(totalCount, 1);
  return (
    (sameBlockCount / denom) * 0.5 + (sameStreetCount / denom) * 0.3 + (sameTownCount / denom) * 0.2
  );
}

export function computeMatchSignal(
  flatTypeMatchCount: number,
  floorAreaMatchCount: number,
  storeyMatchCount: number,
  totalCount: number,
): number {
  const denom = 3 * Math.max(totalCount, 1);
  return (flatTypeMatchCount + floorAreaMatchCount + storeyMatchCount) / denom;
}

function computeEvidenceScore(signals: ConfidenceSignals): number {
  return (
    SAMPLE_WEIGHT * signals.sample +
    RECENCY_WEIGHT * signals.recency +
    SCOPE_WEIGHT * signals.scope +
    MATCH_WEIGHT * signals.match
  );
}

function scoreToTier(score: number): ConfidenceLevel {
  if (score >= HIGH_THRESHOLD) return "high";
  if (score >= MEDIUM_THRESHOLD) return "medium";
  return "low";
}

function applyOverrides(tier: ConfidenceLevel, input: ConfidenceInput): ConfidenceLevel {
  const tierRank: Record<ConfidenceLevel, number> = { low: 0, medium: 1, high: 2 };

  let cap: ConfidenceLevel = "high";

  if (input.comparableCount < OVERRIDE_MIN_COUNT) {
    cap = "low";
  }

  if (
    input.newestComparableAgeMonths != null &&
    input.newestComparableAgeMonths > OVERRIDE_MAX_AGE_MONTHS
  ) {
    if (tierRank[cap] > tierRank["medium"]) cap = "medium";
  }

  if (input.sameBlockCount === 0 && input.sameStreetCount === 0) {
    if (tierRank[cap] > tierRank["medium"]) cap = "medium";
  }

  return tierRank[tier] <= tierRank[cap] ? tier : cap;
}

function buildSummary(level: ConfidenceLevel, input: ConfidenceInput): string {
  const label = level.charAt(0).toUpperCase() + level.slice(1);

  if (input.comparableCount === 0) {
    return `${label} confidence — no comparable transactions found`;
  }

  const parts: string[] = [];

  const txWord = input.comparableCount === 1 ? "comparable" : "comparables";
  parts.push(`${input.comparableCount} ${txWord}`);

  if (input.sameBlockCount > 0) {
    parts.push(`${input.sameBlockCount} same-block`);
  }

  if (input.newestComparableAgeMonths != null) {
    if (input.newestComparableAgeMonths === 0) {
      parts.push("newest this month");
    } else {
      const monthWord = input.newestComparableAgeMonths === 1 ? "month" : "months";
      parts.push(`newest ${input.newestComparableAgeMonths} ${monthWord} ago`);
    }
  }

  return `${label} confidence — ${parts.join(", ")}`;
}

export function computeConfidence(input: ConfidenceInput): ConfidenceAssessment {
  const signals: ConfidenceSignals = {
    sample: computeSampleSignal(input.comparableCount),
    recency: computeRecencySignal(input.newestComparableAgeMonths),
    scope: computeScopeSignal(
      input.sameBlockCount,
      input.sameStreetCount,
      input.sameTownCount,
      input.comparableCount,
    ),
    match: computeMatchSignal(
      input.flatTypeMatchCount,
      input.floorAreaMatchCount,
      input.storeyMatchCount,
      input.comparableCount,
    ),
  };

  const score = computeEvidenceScore(signals);
  const baseTier = scoreToTier(score);
  const level = applyOverrides(baseTier, input);
  const summary = buildSummary(level, input);

  return { level, score, signals, summary, input };
}
