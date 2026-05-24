import { useMemo } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import {
  formatCompactCurrency,
  formatMinutesWalk,
  formatMonth,
  formatNumber,
} from "@/lib/format";
import { localizeTownName } from "@/lib/i18n/domain";
import type { Locale, Translator } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";
import {
  buildTownCompareSnapshot,
  computeMetricDelta,
  type CompareMetricKind,
  type DeltaTone,
  type MetricDelta,
  type TownCompareSnapshot,
} from "@/lib/town-compare";
import type { TrendMonthRange } from "@/lib/town-profile";
import type { BlockSummary, TownFlatTypeTrendPoint } from "@/types/data";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type TownCompareSectionProps = {
  locale: Locale;
  t: Translator;
  primaryTown: string;
  compareTown: string;
  monthRange: TrendMonthRange;
  primaryBlocks: ReadonlyArray<BlockSummary>;
  compareBlocks: ReadonlyArray<BlockSummary>;
  trends: ReadonlyArray<TownFlatTypeTrendPoint>;
  availableTowns: ReadonlyArray<string>;
  trendsLoading: boolean;
  trendsFailed: boolean;
  compareBlocksLoading: boolean;
  compareBlocksFailed: boolean;
  onChangeCompareTown: (next: string) => void;
};

type MetricRow = {
  kind: CompareMetricKind;
  labelKey: string;
  formatValue: (snap: TownCompareSnapshot) => string;
  readValue: (snap: TownCompareSnapshot) => number | null;
  formatDelta: (delta: MetricDelta) => string;
};

// Below this magnitude the YoY label rounds to "0.0%", so render a flat arrow
// rather than implying a directional trend from sub-rounding noise.
const YOY_FLAT_THRESHOLD_PCT = 0.05;

const TONE_BADGE_CLASS: Record<DeltaTone, string> = {
  better:
    "rounded-full bg-emerald-100 px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  worse:
    "rounded-full bg-red-100 px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.08em] text-red-700 dark:bg-red-900/30 dark:text-red-400",
  neutral:
    "rounded-full bg-amber-100 px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.08em] text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

function buildMetricRows(t: Translator, locale: Locale): MetricRow[] {
  return [
    {
      kind: "medianPrice",
      labelKey: "townCompare.metric.medianPrice",
      readValue: (s) => s.medianPrice,
      formatValue: (s) =>
        s.medianPrice === null ? "—" : formatCompactCurrency(s.medianPrice, locale),
      formatDelta: (d) => formatSignedCompactCurrency(d.delta, locale),
    },
    {
      kind: "medianPricePerSqm",
      labelKey: "townCompare.metric.medianPricePerSqm",
      readValue: (s) => s.medianPricePerSqm,
      formatValue: (s) =>
        s.medianPricePerSqm === null
          ? "—"
          : t("unit.sqmCurrency", { value: formatNumber(s.medianPricePerSqm, 0, locale) }),
      formatDelta: (d) =>
        t("unit.sqmCurrency", { value: signedNumber(d.delta, locale) }),
    },
    {
      kind: "windowVolume",
      labelKey: "townCompare.metric.windowVolume",
      readValue: (s) => s.windowVolume,
      formatValue: (s) => formatNumber(s.windowVolume, 0, locale),
      formatDelta: (d) => signedNumber(d.delta, locale),
    },
    {
      kind: "medianRemainingLeaseYears",
      labelKey: "townCompare.metric.medianLeaseYears",
      readValue: (s) => s.medianRemainingLeaseYears,
      formatValue: (s) =>
        s.medianRemainingLeaseYears === null
          ? "—"
          : t("unit.years", { value: Math.round(s.medianRemainingLeaseYears) }),
      formatDelta: (d) =>
        t("townCompare.delta.years", { value: signedNumber(Math.round(d.delta), locale) }),
    },
    {
      kind: "medianWalkSeconds",
      labelKey: "townCompare.metric.medianWalkSeconds",
      readValue: (s) => s.medianWalkSeconds,
      formatValue: (s) =>
        s.medianWalkSeconds === null ? "—" : formatMinutesWalk(s.medianWalkSeconds, t, locale),
      formatDelta: (d) => {
        const minutes = Math.round(d.delta / 60);
        return t("townCompare.delta.minWalk", {
          value: signedNumber(minutes, locale),
        });
      },
    },
    {
      kind: "blockCount",
      labelKey: "townCompare.metric.blockCount",
      readValue: (s) => s.blockCount,
      formatValue: (s) => formatNumber(s.blockCount, 0, locale),
      formatDelta: (d) => signedNumber(d.delta, locale),
    },
  ];
}

// Anchor links (href="#id") are unreliable inside the app's fixed layout and
// nested scroll containers, so scroll the target element into view directly.
function scrollToColumn(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function signedNumber(value: number, locale: Locale): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(value), 0, locale)}`;
}

function formatSignedCompactCurrency(value: number, locale: Locale): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatCompactCurrency(Math.abs(value), locale)}`;
}

function YoyArrow({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[0.6rem] font-semibold text-muted-foreground">
        <Minus className="size-3" aria-hidden="true" />
        {label}
      </span>
    );
  }
  const isUp = pct >= YOY_FLAT_THRESHOLD_PCT;
  const isDown = pct <= -YOY_FLAT_THRESHOLD_PCT;
  const Icon = isUp ? ArrowUpRight : isDown ? ArrowDownRight : ArrowRight;
  const color = isUp
    ? "text-red-600 dark:text-red-400"
    : isDown
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-muted-foreground";
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[0.6rem] font-semibold v2-tabular", color)}>
      <Icon className="size-3" aria-hidden="true" />
      {sign}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

export function TownCompareSection({
  locale,
  t,
  primaryTown,
  compareTown,
  monthRange,
  primaryBlocks,
  compareBlocks,
  trends,
  availableTowns,
  trendsLoading,
  trendsFailed,
  compareBlocksLoading,
  compareBlocksFailed,
  onChangeCompareTown,
}: TownCompareSectionProps) {
  const primarySnap = useMemo(
    () =>
      buildTownCompareSnapshot({
        town: primaryTown,
        blocks: primaryBlocks,
        trends,
        range: monthRange,
      }),
    [monthRange, primaryBlocks, primaryTown, trends],
  );

  const compareSnap = useMemo<TownCompareSnapshot | null>(() => {
    if (!compareTown) return null;
    return buildTownCompareSnapshot({
      town: compareTown,
      blocks: compareBlocks,
      trends,
      range: monthRange,
    });
  }, [compareBlocks, compareTown, monthRange, trends]);

  const metrics = useMemo(() => buildMetricRows(t, locale), [t, locale]);

  const compareOptions = useMemo(
    () => availableTowns.filter((town) => town !== primaryTown),
    [availableTowns, primaryTown],
  );

  const selectValue = compareTown && compareOptions.includes(compareTown) ? compareTown : "__none";

  return (
    <section
      aria-label={t("townCompare.sectionLabel", {
        town: localizeTownName(primaryTown, locale),
      })}
      data-testid="town-compare-section"
      className="mb-4 rounded-xl border border-border/35 bg-muted/35 p-3 sm:p-3.5"
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-heading text-sm font-extrabold tracking-tight sm:text-[0.95rem]">
            {t("townCompare.title")}
          </h2>
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {formatMonth(monthRange.start, locale)} – {formatMonth(monthRange.end, locale)}
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <label
            htmlFor="town-compare-with"
            className="shrink-0 text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground"
          >
            {t("townCompare.compareWith")}
          </label>
          <Select
            value={selectValue}
            onValueChange={(next) => onChangeCompareTown(next === "__none" ? "" : next)}
          >
            <SelectTrigger
              id="town-compare-with"
              data-testid="town-compare-with"
              className="h-8 min-w-[10rem] rounded-lg border-border/40 bg-card/80 px-2"
            >
              <SelectValue placeholder={t("townCompare.choosePrompt")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="__none">{t("townCompare.noneOption")}</SelectItem>
                {compareOptions.map((town) => (
                  <SelectItem key={town} value={town}>
                    {localizeTownName(town, locale)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </header>

      {!compareSnap ? (
        <div
          data-testid="town-compare-empty"
          className="rounded-lg border border-dashed border-border/40 bg-background/60 px-3 py-4 text-center text-[0.72rem] text-muted-foreground"
        >
          {t("townCompare.emptyHint")}
        </div>
      ) : (
        <>
          {trendsLoading || compareBlocksLoading ? (
            <p className="mb-2 text-[0.7rem] text-muted-foreground">{t("townCompare.loading")}</p>
          ) : null}
          {trendsFailed || compareBlocksFailed ? (
            <p className="mb-2 text-[0.7rem] text-destructive">{t("townCompare.loadFailed")}</p>
          ) : null}

          {/* Sticky pill for mobile section jumps. */}
          <nav
            aria-label={t("townCompare.sectionsNavLabel")}
            className="sticky top-0 z-10 mb-3 flex w-full gap-1 rounded-full border border-border/40 bg-background/95 p-1 backdrop-blur md:hidden"
          >
            <button
              type="button"
              onClick={() => scrollToColumn("town-compare-primary")}
              className="flex-1 truncate rounded-full px-3 py-1 text-center text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-foreground hover:bg-muted"
            >
              {localizeTownName(primaryTown, locale)}
            </button>
            <button
              type="button"
              onClick={() => scrollToColumn("town-compare-secondary")}
              className="flex-1 truncate rounded-full px-3 py-1 text-center text-[0.62rem] font-extrabold uppercase tracking-[0.12em] text-foreground hover:bg-muted"
            >
              {localizeTownName(compareTown, locale)}
            </button>
          </nav>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <CompareColumn
              id="town-compare-primary"
              data-testid="town-compare-column-primary"
              townName={primaryTown}
              locale={locale}
              t={t}
              snap={primarySnap}
              metrics={metrics}
              showDeltas={false}
              primarySnap={primarySnap}
            />
            <CompareColumn
              id="town-compare-secondary"
              data-testid="town-compare-column-compare"
              townName={compareTown}
              locale={locale}
              t={t}
              snap={compareSnap}
              metrics={metrics}
              showDeltas={true}
              primarySnap={primarySnap}
            />
          </div>
        </>
      )}
    </section>
  );
}

function CompareColumn({
  id,
  townName,
  locale,
  t,
  snap,
  metrics,
  primarySnap,
  showDeltas,
  "data-testid": dataTestId,
}: {
  id: string;
  townName: string;
  locale: Locale;
  t: Translator;
  snap: TownCompareSnapshot;
  metrics: MetricRow[];
  primarySnap: TownCompareSnapshot;
  showDeltas: boolean;
  "data-testid"?: string;
}) {
  return (
    <div id={id} data-testid={dataTestId} className="min-w-0 rounded-lg border border-border/30 bg-background/60">
      <div className="sticky top-12 z-[5] flex items-center justify-between gap-2 rounded-t-lg border-b border-border/35 bg-background/95 px-2.5 py-2 backdrop-blur md:top-0">
        <span className="truncate font-heading text-[0.78rem] font-extrabold uppercase tracking-[0.08em]">
          {localizeTownName(townName, locale)}
        </span>
        <YoyArrow pct={snap.yoyMedianPricePct} label={t("townCompare.yoyUnavailable")} />
      </div>
      <ul className="grid gap-1.5 px-2.5 py-2.5">
        {metrics.map((metric) => {
          const value = metric.readValue(snap);
          const valueLabel = metric.formatValue(snap);
          const delta = showDeltas
            ? computeMetricDelta(metric.kind, metric.readValue(primarySnap), value)
            : null;
          return (
            <li
              key={metric.kind}
              className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 border-b border-border/20 pb-1.5 last:border-b-0 last:pb-0"
            >
              <span className="text-[0.6rem] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                {t(metric.labelKey)}
              </span>
              <div className="ml-auto flex items-baseline gap-1.5">
                <span className="v2-tabular text-[0.78rem] font-extrabold">{valueLabel}</span>
                {delta ? (
                  <Badge
                    asChild
                    className={cn("border-0", TONE_BADGE_CLASS[delta.tone])}
                    aria-label={t("townCompare.deltaAria", {
                      metric: t(metric.labelKey),
                      value: metric.formatDelta(delta),
                    })}
                  >
                    <span data-testid="town-compare-delta">{metric.formatDelta(delta)}</span>
                  </Badge>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
