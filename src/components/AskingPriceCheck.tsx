import { type CSSProperties, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Info,
  Scale,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompactCurrency, formatCurrency, formatMonth, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import {
  assessAskingPrice,
  findComparableTransactions,
  parseStoreyMidpoint,
  type AskingPriceAssessment,
} from "@/lib/transaction-analysis";
import type { AddressDetail } from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AskingPriceCheckProps = {
  detail: AddressDetail;
};

type VerdictTheme = {
  tone: "success" | "warning" | "destructive" | "muted";
  icon: typeof CheckCircle2;
  i18nKey: string;
};

const VERDICT_THEMES: Record<AskingPriceAssessment["verdict"], VerdictTheme> = {
  well_below: { tone: "success", icon: ArrowDown, i18nKey: "askingCheck.verdict.wellBelow" },
  below: { tone: "success", icon: ArrowDown, i18nKey: "askingCheck.verdict.below" },
  fair: { tone: "muted", icon: CheckCircle2, i18nKey: "askingCheck.verdict.fair" },
  above: { tone: "warning", icon: ArrowUp, i18nKey: "askingCheck.verdict.above" },
  well_above: { tone: "destructive", icon: AlertTriangle, i18nKey: "askingCheck.verdict.wellAbove" },
};

function toneStyles(tone: VerdictTheme["tone"]) {
  switch (tone) {
    case "success":
      return {
        bg: "bg-success/10",
        border: "border-success/30",
        text: "text-success",
      };
    case "warning":
      return {
        bg: "bg-amber-500/10",
        border: "border-amber-500/30",
        text: "text-amber-600 dark:text-amber-400",
      };
    case "destructive":
      return {
        bg: "bg-destructive/10",
        border: "border-destructive/30",
        text: "text-destructive",
      };
    default:
      return {
        bg: "bg-muted/30",
        border: "border-border/40",
        text: "text-foreground",
      };
  }
}

function formatSignedCurrency(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatCompactCurrency(Math.abs(value))}`;
}

function formatSignedPct(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

export function AskingPriceCheck({ detail }: AskingPriceCheckProps) {
  const { locale, t } = useI18n();

  const flatTypeOptions = useMemo(() => {
    return Array.from(new Set(detail.recentTransactions.map((tx) => tx.flatType)));
  }, [detail.recentTransactions]);

  const storeyOptions = useMemo(() => {
    return Array.from(new Set(detail.recentTransactions.map((tx) => tx.storeyRange))).sort();
  }, [detail.recentTransactions]);

  const [askingPriceInput, setAskingPriceInput] = useState("");
  const [storeyRange, setStoreyRange] = useState<string>(() => storeyOptions[0] ?? "");
  const [floorAreaInput, setFloorAreaInput] = useState<string>("");
  const [flatType, setFlatType] = useState<string>(() => flatTypeOptions[0] ?? "");
  const [comparablesExpanded, setComparablesExpanded] = useState(false);

  const askingPrice = useMemo(() => {
    const cleaned = askingPriceInput.replace(/[^\d.]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [askingPriceInput]);

  const floorAreaSqm = useMemo(() => {
    const cleaned = floorAreaInput.replace(/[^\d.]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [floorAreaInput]);

  const storeyMidpoint = useMemo(
    () => (storeyRange ? parseStoreyMidpoint(storeyRange) : null),
    [storeyRange],
  );

  const comparables = useMemo(() => {
    return findComparableTransactions(detail.recentTransactions, {
      flatType: flatType || null,
      storeyMidpoint,
      floorAreaSqm,
    });
  }, [detail.recentTransactions, flatType, storeyMidpoint, floorAreaSqm]);

  const assessment = useMemo(() => {
    if (askingPrice == null) return null;
    return assessAskingPrice({
      askingPrice,
      floorAreaSqm,
      comparables,
    });
  }, [askingPrice, floorAreaSqm, comparables]);

  const theme = assessment ? VERDICT_THEMES[assessment.verdict] : null;
  const styles = theme ? toneStyles(theme.tone) : toneStyles("muted");
  const VerdictIcon = theme?.icon ?? Sparkles;

  return (
    <section className="flex flex-col gap-5">
      <div className="rounded-lg bg-muted/10 p-4">
        <div className="mb-3 flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Scale data-icon className="size-4" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold tracking-tight">
              {t("askingCheck.title")}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("askingCheck.description")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
              {t("askingCheck.askingPrice")}
            </span>
            <Input
              type="number"
              inputMode="numeric"
              enterKeyHint="done"
              autoComplete="off"
              placeholder={t("askingCheck.askingPricePlaceholder")}
              value={askingPriceInput}
              onChange={(e) => setAskingPriceInput(e.target.value)}
              aria-label={t("askingCheck.askingPrice")}
              className="h-10 text-base font-bold tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
              {t("askingCheck.floorArea")}
            </span>
            <Input
              type="number"
              inputMode="numeric"
              enterKeyHint="done"
              autoComplete="off"
              placeholder={t("askingCheck.floorAreaPlaceholder")}
              value={floorAreaInput}
              onChange={(e) => setFloorAreaInput(e.target.value)}
              aria-label={t("askingCheck.floorArea")}
              className="h-10 text-base font-bold tabular-nums"
            />
          </label>
          {flatTypeOptions.length > 1 && (
            <label className="flex flex-col gap-1">
              <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                {t("askingCheck.flatType")}
              </span>
              <Select value={flatType} onValueChange={setFlatType}>
                <SelectTrigger aria-label={t("askingCheck.flatType")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {flatTypeOptions.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
          {storeyOptions.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                {t("askingCheck.storey")}
              </span>
              <Select value={storeyRange} onValueChange={setStoreyRange}>
                <SelectTrigger aria-label={t("askingCheck.storey")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {storeyOptions.map((range) => (
                    <SelectItem key={range} value={range}>
                      {range}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
        </div>
      </div>

      {assessment && theme ? (
        <Card className={cn("border-2 shadow-none", styles.border, styles.bg)}>
          <CardContent className="flex flex-col gap-4 p-4">
            <div className="flex items-center gap-3">
              <div className={cn("rounded-md p-2", styles.bg)}>
                <VerdictIcon data-icon className={cn("size-5", styles.text)} aria-hidden="true" />
              </div>
              <div className="flex-1">
                <div className={cn("text-sm font-extrabold uppercase tracking-wider", styles.text)}>
                  {t(theme.i18nKey)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("askingCheck.comparableCount", {
                    count: assessment.comparableCount,
                  })}
                  {assessment.summary.latestMonth
                    ? ` · ${t("askingCheck.latest", {
                        month: formatMonth(assessment.summary.latestMonth, locale),
                      })}`
                    : ""}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DeltaCell
                label={t("askingCheck.vsMedian")}
                amount={assessment.deltaVsMedian}
                pct={assessment.deltaVsMedianPct}
                reference={assessment.summary.medianPrice}
                referenceLabel={t("askingCheck.medianRef")}
                locale={locale}
              />
              <DeltaCell
                label={t("askingCheck.vsPeak")}
                amount={assessment.deltaVsMax}
                pct={assessment.deltaVsMaxPct}
                reference={assessment.summary.maxPrice}
                referenceLabel={t("askingCheck.peakRef")}
                locale={locale}
              />
            </div>

            <div className="grid grid-cols-1 gap-2 rounded-md bg-card/70 p-3 text-xs sm:grid-cols-2">
              <DataRow
                label={t("askingCheck.askingPerSqm")}
                value={
                  assessment.askingPricePerSqm != null
                    ? t("unit.sqmCurrency", {
                        value: formatNumber(assessment.askingPricePerSqm, 0, locale),
                      })
                    : t("askingCheck.requireSqm")
                }
              />
              <DataRow
                label={t("askingCheck.medianPerSqm")}
                value={t("unit.sqmCurrency", {
                  value: formatNumber(assessment.summary.medianPricePerSqm, 0, locale),
                })}
              />
              {assessment.pricePerSqmDeltaPct != null && (
                <DataRow
                  label={t("askingCheck.psmDelta")}
                  value={formatSignedPct(assessment.pricePerSqmDeltaPct)}
                  emphasis={
                    assessment.pricePerSqmDeltaPct > 5
                      ? "negative"
                      : assessment.pricePerSqmDeltaPct < -5
                        ? "positive"
                        : null
                  }
                />
              )}
              <DataRow
                label={t("askingCheck.percentile")}
                value={t("askingCheck.percentileValue", {
                  value: Math.round(assessment.percentileAmongComparables),
                })}
              />
              <DataRow
                label={t("askingCheck.range")}
                value={`${formatCompactCurrency(
                  assessment.summary.minPrice,
                )} – ${formatCompactCurrency(assessment.summary.maxPrice)}`}
              />
              <DataRow
                label={t("askingCheck.p75")}
                value={formatCompactCurrency(assessment.summary.p75Price)}
              />
            </div>

            <DistributionBar assessment={assessment} askingPrice={askingPrice!} />
          </CardContent>
        </Card>
      ) : askingPrice == null ? (
        <div className="flex items-start gap-3 rounded-md border border-dashed border-border/50 p-4 text-xs text-muted-foreground">
          <Info data-icon className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span>{t("askingCheck.enterPriceHint")}</span>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-md border border-dashed border-border/50 p-4 text-xs text-muted-foreground">
          <AlertTriangle data-icon className="size-4 shrink-0 text-amber-500" aria-hidden="true" />
          <span>{t("askingCheck.noComparables")}</span>
        </div>
      )}

      {comparables.length > 0 && (
        <section>
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-left text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-muted/40"
            aria-expanded={comparablesExpanded}
            onClick={() => setComparablesExpanded((expanded) => !expanded)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{t("askingCheck.comparablesTitle")}</span>
              <Badge variant="outline" className="h-5 shrink-0 font-mono text-[0.6rem]">
                {comparables.length}
              </Badge>
            </span>
            <ChevronDown
              data-icon
              className={cn("size-4 shrink-0 transition-transform", comparablesExpanded && "rotate-180")}
              aria-hidden="true"
            />
            <span className="sr-only">
              {comparablesExpanded
                ? t("askingCheck.toggleComparablesHide")
                : t("askingCheck.toggleComparablesShow")}
            </span>
          </button>
          {comparablesExpanded ? (
            <ul
              className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1 v2-scrollbar"
              style={{ "--cv-intrinsic-height": "56px" } as CSSProperties}
            >
              {comparables.slice(0, 8).map((tx) => (
                <li
                  key={tx.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/20 px-3 py-2 text-xs cv-auto"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-bold tabular-nums">
                      {formatCurrency(tx.resalePrice, locale)}
                    </span>
                    <span className="truncate text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                      {tx.storeyRange} · {Math.round(tx.floorAreaSqm)}
                      {t("unit.sqmShort")}
                    </span>
                  </div>
                  <Badge variant="secondary" className="h-5 shrink-0 font-mono text-[0.6rem]">
                    {formatMonth(tx.month, locale)}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}
    </section>
  );
}

function DeltaCell({
  label,
  amount,
  pct,
  reference,
  referenceLabel,
  locale,
}: {
  label: string;
  amount: number;
  pct: number;
  reference: number;
  referenceLabel: string;
  locale?: import("@/lib/i18n").Locale;
}) {
  const isPositive = amount > 0;
  const colorClass = isPositive
    ? "text-destructive"
    : amount < 0
      ? "text-success"
      : "text-foreground";
  return (
    <div className="rounded-md bg-muted/30 p-3">
      <div className="text-[0.6rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 font-heading text-lg font-extrabold tabular-nums", colorClass)}>
        {formatSignedCurrency(amount)}
      </div>
      <div className={cn("text-xs font-bold tabular-nums", colorClass)}>
        {formatSignedPct(pct)}
      </div>
      <div className="mt-1 truncate text-[0.6rem] text-muted-foreground">
        {referenceLabel}: {formatCompactCurrency(reference, locale)}
      </div>
    </div>
  );
}

function DataRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: "positive" | "negative" | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/30 py-1 last:border-b-0">
      <span className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono text-xs font-bold tabular-nums",
          emphasis === "negative" && "text-destructive",
          emphasis === "positive" && "text-success",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function DistributionBar({
  assessment,
  askingPrice,
}: {
  assessment: AskingPriceAssessment;
  askingPrice: number;
}) {
  const { summary } = assessment;
  const min = Math.min(summary.minPrice, askingPrice);
  const max = Math.max(summary.maxPrice, askingPrice);
  const span = Math.max(max - min, 1);
  const pct = (value: number) => ((value - min) / span) * 100;

  const askingPctRaw = pct(askingPrice);
  const askingPct = Math.max(0, Math.min(100, askingPctRaw));
  const p25Pct = pct(summary.p25Price);
  const p75Pct = pct(summary.p75Price);
  const medianPct = pct(summary.medianPrice);

  const askingPositionStyle = { left: `${askingPct}%` };
  const iqrStyle = {
    left: `${p25Pct}%`,
    width: `${Math.max(p75Pct - p25Pct, 1)}%`,
  };
  const medianStyle = { left: `${medianPct}%` };

  return (
    <div className="px-1 pt-2">
      <div className="relative h-7">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary/30"
          style={iqrStyle}
        />
        <div
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-primary"
          style={medianStyle}
          aria-hidden="true"
        />
        <div
          className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center"
          style={askingPositionStyle}
        >
          <div className="size-3 rotate-45 rounded-sm bg-foreground shadow" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[0.55rem] font-mono uppercase tracking-wider text-muted-foreground">
        <span>{formatCompactCurrency(min)}</span>
        <span>{formatCompactCurrency(max)}</span>
      </div>
    </div>
  );
}
