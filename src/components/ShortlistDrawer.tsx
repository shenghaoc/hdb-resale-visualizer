import { useId, useMemo, useState } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  Copy,
  Download,
  GraduationCap,
  Link2,
  MapPin,
  ShoppingCart,
  Trees,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { MAX_LEASE_DURATION, getCurrentYear } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { localizeTownName } from "@/lib/i18n/domain";
import { useTheme } from "@/hooks/useTheme";
import {
  formatCompactCurrency,
  formatCurrency,
  formatMeters,
  formatNumber,
  formatRemainingLease,
} from "@/lib/format";
import { rankShortlistRows, type CompareMode } from "@/lib/shortlist-ranking";
import { encodeShortlistForUrl } from "@/lib/shortlist";
import type {
  AddressDetailSummary,
  AddressTrendPoint,
  BlockSummary,
  ComparisonArtifact,
  ShortlistItem,
} from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ShortlistRow = {
  item: ShortlistItem;
  block: BlockSummary;
  detailSummary: AddressDetailSummary | null;
  monthlyTrend: AddressTrendPoint[];
  comparison: ComparisonArtifact | null;
};

type ShortlistDrawerProps = {
  isOpen: boolean;
  rows: ShortlistRow[];
  onToggleOpen: () => void;
  onRemove: (addressKey: string) => void;
  onUpdate: (addressKey: string, patch: Partial<ShortlistItem>) => void;
  onSelectAddress: (addressKey: string) => void;
};

type GapInfo = {
  amount: number;
  labelKey: "shortlist.gap.belowTarget" | "shortlist.gap.aboveTarget";
  compactLabelKey: "shortlist.gap.belowTargetCompact" | "shortlist.gap.aboveTargetCompact";
  tone: "positive" | "negative";
};

const compareModeLabels: Record<CompareMode, string> = {
  "target-gap": "shortlist.compare.targetFit",
  median: "shortlist.compare.priceLow",
  "median-asc": "shortlist.compare.priceLow",
  "median-desc": "shortlist.compare.priceHigh",
  lease: "shortlist.compare.lease",
  mrt: "shortlist.compare.mrt",
};

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

function getGapInfo(targetPrice: number | null, medianPrice: number): GapInfo | null {
  if (targetPrice === null) {
    return null;
  }

  const amount = Math.abs(targetPrice - medianPrice);

  if (targetPrice >= medianPrice) {
    return {
      amount,
      labelKey: "shortlist.gap.belowTarget",
      compactLabelKey: "shortlist.gap.belowTargetCompact",
      tone: "positive",
    };
  }

  return {
    amount,
    labelKey: "shortlist.gap.aboveTarget",
    compactLabelKey: "shortlist.gap.aboveTargetCompact",
    tone: "negative",
  };
}

function getLeaseYears(row: ShortlistRow) {
  return Math.max(0, MAX_LEASE_DURATION - (getCurrentYear() - row.block.leaseCommenceRange[1]));
}

function MiniSpark({
  color,
  points,
}: {
  color: string;
  points: AddressTrendPoint[];
}) {
  const values = points.slice(-12).map((point) => point.medianPrice);
  if (values.length < 2) {
    return <span className="h-[18px] w-16 rounded-sm bg-muted/60" aria-hidden="true" />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 64;
      const y = 18 - ((value - min) / range) * 16 - 1;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg aria-hidden="true" className="h-[18px] w-16 shrink-0" viewBox="0 0 64 18">
      <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function PercentileBar({
  invert = false,
  label,
  value,
}: {
  invert?: boolean;
  label: string;
  value: number;
}) {
  const rounded = Math.round(value);
  const isGood = invert ? rounded >= 75 : rounded <= 25;
  const isMid = invert ? rounded >= 25 : rounded <= 75;

  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[0.58rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            isGood ? "bg-success" : isMid ? "bg-primary" : "bg-destructive",
          )}
          style={{ width: `${Math.max(0, Math.min(100, rounded))}%` }}
        />
      </div>
      <span className="w-9 text-right text-[0.62rem] font-bold text-muted-foreground v2-tabular">
        {rounded}%
      </span>
    </div>
  );
}

function AmenityTile({
  count,
  icon: Icon,
  label,
  note,
}: {
  count: number;
  icon: React.ElementType;
  label: string;
  note?: string | null;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 p-2.5">
      <div className="flex items-center gap-1.5">
        <Icon className="text-primary" data-icon />
        <strong className="text-xs font-extrabold tracking-tight">{count}</strong>
      </div>
      <div className="mt-1 text-[0.55rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      {note ? <div className="mt-1 line-clamp-1 text-[0.62rem] italic text-muted-foreground">{note}</div> : null}
    </div>
  );
}

export function ShortlistDrawer({
  isOpen,
  rows,
  onToggleOpen,
  onRemove,
  onUpdate,
  onSelectAddress,
}: ShortlistDrawerProps) {
  const { isDark } = useTheme();
  const { locale, t } = useI18n();
  const [compareMode, setCompareMode] = useState<CompareMode>("target-gap");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(rows[0]?.item.addressKey ?? null);
  const [prevRowsCount, setPrevRowsCount] = useState(rows.length);
  const sortLabelId = useId();

  const rankedRows = useMemo(() => rankShortlistRows(rows, compareMode), [rows, compareMode]);

  const effectiveExpandedKey =
    expandedKey === null
      ? null
      : rows.some((row) => row.item.addressKey === expandedKey)
        ? expandedKey
        : rows[0]?.item.addressKey ?? null;

  // Adjust expandedKey when rows change (e.g. handle first item added or expanded item removed)
  if (rows.length !== prevRowsCount) {
    setPrevRowsCount(rows.length);
    if (prevRowsCount === 0 && rows.length > 0 && expandedKey === null) {
      // If we just added the first item and nothing is expanded, expand it for the cockpit experience
      setExpandedKey(rows[0].item.addressKey);
    } else if (expandedKey !== null && !rows.some((row) => row.item.addressKey === expandedKey)) {
      // If the currently expanded item was removed, clear the stale key
      setExpandedKey(rows[0]?.item.addressKey ?? null);
    }
  }

  const showCopied = (key: string) => {
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  function getRankingMetricLabel(row: ShortlistRow) {
    if (compareMode === "target-gap") {
      if (row.item.targetPrice === null) {
        return t("shortlist.compare.metric.targetFit.noTarget");
      }
      return t("shortlist.compare.metric.targetFit.value", {
        value: formatCurrency(Math.abs(row.item.targetPrice - row.block.medianPrice), locale),
      });
    }

    if (compareMode === "median" || compareMode === "median-asc" || compareMode === "median-desc") {
      return t("shortlist.compare.metric.price.value", {
        value: formatCurrency(row.block.medianPrice, locale),
      });
    }

    if (compareMode === "lease") {
      return t("shortlist.compare.metric.lease.value", {
        value: row.block.leaseCommenceRange[1],
      });
    }

    if (row.block.nearestMrt) {
      return t("shortlist.compare.metric.mrt.value", {
        value: formatMeters(row.block.nearestMrt.distanceMeters, t, locale),
      });
    }

    return t("shortlist.compare.metric.mrt.missing");
  }

  async function handleShare() {
    const params = new URLSearchParams(window.location.search);
    params.set("shortlist", encodeShortlistForUrl(rows.map((row) => row.item)));
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: t("app.title"),
          url,
        });
        return;
      } catch {
        // Sharing can be cancelled by the user; fall back to copying below.
      }
    }

    void navigator.clipboard.writeText(url);
    showCopied("share");
  }

  function handleCopySummary() {
    const header = `| Address | Median Price | Target Price | Lease | MRT | Schools (1km) | Hawkers (1km) |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`;
    const body = rows
      .map((row) => {
        const address = `${row.block.block} ${row.block.streetName}`;
        const median = formatCurrency(row.block.medianPrice, locale);
        const target =
          row.item.targetPrice !== null ? formatCurrency(row.item.targetPrice, locale) : "-";
        const lease = formatRemainingLease(row.block.leaseCommenceRange, t);
        const mrt = row.block.nearestMrt
          ? formatMeters(row.block.nearestMrt.distanceMeters, t, locale)
          : "-";
        const schools = row.comparison?.amenities.primarySchoolsWithin1km ?? "-";
        const hawkers = row.comparison?.amenities.hawkerCentresWithin1km ?? "-";
        return `| ${address} | ${median} | ${target} | ${lease} | ${mrt} | ${schools} | ${hawkers} |`;
      })
      .join("\n");

    void navigator.clipboard.writeText(`${header}\n${body}`);
    showCopied("summary");
  }

  function handleExportCsv() {
    const headers = [
      t("shortlist.export.address"),
      t("shortlist.export.medianPrice"),
      t("shortlist.export.targetPrice"),
      t("shortlist.export.schools1km"),
      t("shortlist.export.hawkers1km"),
      t("shortlist.export.supermarkets1km"),
      t("shortlist.export.parks1km"),
      t("shortlist.export.mrtDistance"),
      t("shortlist.export.notes"),
    ];
    const escapedHeaders = headers.map((header) => `"${header.replace(/"/g, '""')}"`);
    const csvRows = rankedRows.map((row) => {
      // Security: Guard against CSV formula injection (CSV Injection/Formula Injection).
      // If a cell begins with a formula prefix (=, +, -, @, \t, \r), we prefix it with a single quote
      // to ensure it is treated as literal text by spreadsheet software (Excel, Sheets, etc.).
      // This protects against malicious notes that could execute arbitrary commands or leak data.
      const safeNotes = (row.item.notes || "").replace(/^[=+\-@\t\r]/, "'$&");

      return [
        `"${row.block.block} ${row.block.streetName}"`,
        row.block.medianPrice,
        row.item.targetPrice ?? "",
        row.comparison?.amenities.primarySchoolsWithin1km ?? "",
        row.comparison?.amenities.hawkerCentresWithin1km ?? "",
        row.comparison?.amenities.supermarketsWithin1km ?? "",
        row.comparison?.amenities.parksWithin1km ?? "",
        row.block.nearestMrt?.distanceMeters ?? "",
        `"${safeNotes.replace(/"/g, '""')}"`,
      ].join(",");
    });
    const blob = new Blob([escapedHeaders.join(",") + "\n" + csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hdb-shortlist.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportJson() {
    const blob = new Blob([JSON.stringify(rankedRows.map((row) => row.item), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hdb-shortlist.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  const highlights = useMemo(() => {
    const byMedian = [...rows].sort((left, right) => left.block.medianPrice - right.block.medianPrice);
    const byLease = [...rows].sort(
      (left, right) => right.block.leaseCommenceRange[1] - left.block.leaseCommenceRange[1],
    );
    const byMrt = [...rows].sort((left, right) => {
      const leftDistance = left.block.nearestMrt?.distanceMeters ?? Number.POSITIVE_INFINITY;
      const rightDistance = right.block.nearestMrt?.distanceMeters ?? Number.POSITIVE_INFINITY;
      return leftDistance - rightDistance;
    });

    return [
      {
        label: t("shortlist.bestValue"),
        row: byMedian[0] ?? null,
        sub: byMedian[0] ? formatCompactCurrency(byMedian[0].block.medianPrice, locale) : t("shortlist.na"),
      },
      {
        label: t("shortlist.newestLease"),
        row: byLease[0] ?? null,
        sub: byLease[0] ? t("unit.years", { value: getLeaseYears(byLease[0]) }) : t("shortlist.na"),
      },
      {
        label: t("shortlist.closestMrt"),
        row: byMrt[0] ?? null,
        sub: byMrt[0]?.block.nearestMrt
          ? formatMeters(byMrt[0].block.nearestMrt.distanceMeters, t, locale)
          : t("shortlist.na"),
      },
    ];
  }, [locale, rows, t]);

  const comparisonRows = useMemo(() => rows.filter((row) => row.monthlyTrend.length > 0), [rows]);
  const compareOption = useMemo(() => {
    if (comparisonRows.length < 2) {
      return null;
    }

    const months = [...new Set(comparisonRows.flatMap((row) => row.monthlyTrend.map((point) => point.month)))].sort(
      (left, right) => left.localeCompare(right),
    );
    const series = comparisonRows.map((row) => {
      const monthToPrice = new Map(row.monthlyTrend.map((point) => [point.month, point.medianPrice]));
      return {
        name: `${row.block.block} ${row.block.streetName}`,
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.25 },
        data: months.map((month) => monthToPrice.get(month) ?? null),
      };
    });

    const colors = {
      popover: isDark ? "#191f1d" : "#ffffff",
      popoverForeground: isDark ? "#e4e7e4" : "#171c1f",
      border: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
      splitLine: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)",
      mutedForeground: isDark ? "#9baaa4" : "#6b7572",
      palette: isDark
        ? ["#79a6ff", "#7ecb63", "#ffb86c", "#ff79c6"]
        : ["#2563eb", "#3a8a6f", "#d97706", "#c026d3"],
    };

    return {
      animationDuration: 400,
      backgroundColor: "transparent",
      color: colors.palette,
      grid: { left: 8, right: 12, top: 42, bottom: 24, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: colors.popover,
        borderColor: colors.border,
        borderWidth: 1,
        textStyle: { color: colors.popoverForeground },
        valueFormatter: (value: number | null) =>
          value === null || Number.isNaN(value) ? t("shortlist.na") : formatCompactCurrency(value),
      },
      legend: {
        type: "scroll",
        top: 0,
        textStyle: {
          color: colors.mutedForeground,
          fontSize: 10,
          fontWeight: 700,
        },
      },
      xAxis: {
        type: "category",
        data: months,
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: {
          color: colors.mutedForeground,
          formatter: (value: string) => value.slice(2),
          fontSize: 10,
        },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: colors.splitLine } },
        axisLabel: {
          color: colors.mutedForeground,
          formatter: (value: number) => formatCompactCurrency(value),
          fontSize: 10,
        },
      },
      series,
    };
  }, [comparisonRows, isDark, t]);

  return (
    <section data-testid="shortlist-drawer" className="flex min-h-0 flex-1 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col gap-0 border-none bg-transparent py-0 shadow-none">
        <CardHeader className="shrink-0 gap-3 border-b border-border/40 bg-background/90 px-3 py-3 backdrop-blur-xl sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="mr-auto min-w-0">
              <div className="v2-kicker">{t("shortlist.savedProperties")}</div>
              <CardTitle className="mt-1 flex min-w-0 items-center gap-2 text-lg font-extrabold normal-case leading-none tracking-tight">
                <span className="truncate">{t("shortlist.title")}</span>
                <Badge className="h-5 shrink-0 px-1.5 text-[0.62rem] font-extrabold">
                  {rows.length}
                </Badge>
              </CardTitle>
            </div>
            <Button
              onClick={onToggleOpen}
              size="icon-xs"
              variant="outline"
              type="button"
              className="rounded-lg border-border/50 bg-card/80"
              aria-expanded={isOpen}
              aria-controls="shortlist-content"
              aria-label={isOpen ? t("shortlist.collapse") : t("shortlist.expand")}
            >
              <ChevronDown
                data-icon
                className={cn("transition-transform", isOpen ? "rotate-180" : "rotate-0")}
              />
            </Button>
          </div>

          {rows.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Field className="min-w-0 flex-1 flex-row items-center gap-2 space-y-0">
                  <FieldLabel id={sortLabelId} className="sr-only">
                    {t("shortlist.sortBy")}
                  </FieldLabel>
                  <Select
                    value={compareMode}
                    onValueChange={(value) => setCompareMode(value as CompareMode)}
                  >
                    <SelectTrigger
                      aria-labelledby={sortLabelId}
                      className="h-8 min-w-0 rounded-lg border-border/50 bg-card/80 px-2 text-[0.65rem] font-extrabold uppercase tracking-[0.08em]"
                    >
                      <ArrowUpDown data-icon="inline-start" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="target-gap">{t(compareModeLabels["target-gap"])}</SelectItem>
                        <SelectItem value="median-asc">{t(compareModeLabels["median-asc"])}</SelectItem>
                        <SelectItem value="median-desc">{t(compareModeLabels["median-desc"])}</SelectItem>
                        <SelectItem value="lease">{t(compareModeLabels.lease)}</SelectItem>
                        <SelectItem value="mrt">{t(compareModeLabels.mrt)}</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                <Button
                  onClick={() => void handleShare()}
                  size="icon-xs"
                  variant="outline"
                  type="button"
                  className={cn("rounded-lg border-border/50 bg-card/80", copiedKey === "share" && "text-primary")}
                  aria-label={t("shortlist.shareLinkLabel")}
                >
                  {copiedKey === "share" ? <Check data-icon /> : <Link2 data-icon />}
                </Button>
              </div>

              <div className="min-w-0 overflow-x-auto v2-scrollbar">
                <ButtonGroup className="w-max flex-nowrap gap-1.5 [&>*]:rounded-lg [&>*]:border-border/50 [&>*]:bg-card/80">
                  <Button variant="outline" size="xs" onClick={handleExportJson} type="button">
                    <Download data-icon="inline-start" />
                    {t("shortlist.export.json")}
                  </Button>
                  <Button variant="outline" size="xs" onClick={handleExportCsv} type="button">
                    <Download data-icon="inline-start" />
                    {t("shortlist.export.csv")}
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={handleCopySummary}
                    type="button"
                    className={copiedKey === "summary" ? "text-primary" : undefined}
                  >
                    {copiedKey === "summary" ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Copy data-icon="inline-start" />
                    )}
                    {copiedKey === "summary" ? t("shortlist.summaryCopiedShort") : t("shortlist.copySummary")}
                  </Button>
                </ButtonGroup>
              </div>
            </div>
          ) : null}
        </CardHeader>

        {isOpen ? (
          <CardContent
            id="shortlist-content"
            className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4"
          >
            {rows.length === 0 ? (
              <div className="empty-state pt-12 text-center text-sm text-muted-foreground">
                {t("shortlist.emptyState")}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1 v2-scrollbar">
                <div className="flex flex-col gap-3 pb-8">
                  <div className="grid overflow-hidden rounded-xl border border-border/40 bg-border/50 sm:grid-cols-3">
                    {highlights.map((highlight) => (
                      <div key={highlight.label} className="min-w-0 bg-muted/35 p-3">
                        <div className="v2-kicker">{highlight.label}</div>
                        <strong className="mt-1 block truncate text-xs font-extrabold tracking-tight">
                          {highlight.row
                            ? `${highlight.row.block.block} ${highlight.row.block.streetName}`
                            : t("shortlist.na")}
                        </strong>
                        <span className="mt-0.5 block text-[0.66rem] font-extrabold text-primary">
                          {highlight.sub}
                        </span>
                      </div>
                    ))}
                  </div>

                  {compareOption ? (
                    <Card size="sm" className="v2-card gap-3 rounded-xl py-3 shadow-none">
                      <CardHeader className="px-3">
                        <CardTitle className="v2-section-title">
                          {t("shortlist.compareTrendsTitle")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-3">
                        <ReactEChartsCore
                          echarts={echarts}
                          notMerge
                          option={compareOption}
                          style={{ height: 220, width: "100%" }}
                          aria-label={t("shortlist.compareTrendsTitle")}
                          role="img"
                        />
                      </CardContent>
                    </Card>
                  ) : null}

                  <div className="flex flex-col gap-3" role="list">
                    {rankedRows.map((row, index) => {
                      const gapInfo = getGapInfo(row.item.targetPrice, row.block.medianPrice);
                      const isExpanded = effectiveExpandedKey === row.item.addressKey;
                      const accentColor =
                        index % 4 === 0
                          ? "var(--primary)"
                          : index % 4 === 1
                            ? "var(--success)"
                            : index % 4 === 2
                              ? "#d97706"
                              : "#c026d3";
                      const nearestSchool = row.comparison?.amenities.nearestPrimarySchools?.[0];

                      return (
                        <Card
                          key={row.item.addressKey}
                          role="listitem"
                          data-state={isExpanded ? "expanded" : "collapsed"}
                          className={cn(
                            "v2-card animate-fade-in-up gap-0 rounded-xl py-0 transition-all",
                            isExpanded && "shadow-[0_12px_32px_rgba(23,28,31,0.10)]",
                          )}
                          style={{ animationDelay: `${index * 45}ms` }}
                        >
                          <CardHeader className="gap-0 px-0">
                            <div className="flex items-start gap-2 p-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedKey((current) =>
                                    current === row.item.addressKey ? null : row.item.addressKey,
                                  )
                                }
                                className="flex min-w-0 flex-1 flex-col text-left"
                                aria-expanded={isExpanded}
                              >
                                <div className="flex min-w-0 items-start gap-2">
                                  <span
                                    className="flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-white"
                                    style={{ backgroundColor: accentColor }}
                                  >
                                    {index + 1}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <strong className="block truncate text-sm font-extrabold leading-tight tracking-tight">
                                      {row.block.block} {row.block.streetName}
                                    </strong>
                                    <span className="block truncate text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                                      {localizeTownName(row.block.town, locale)}
                                      {row.block.flatTypes[0] ? ` - ${row.block.flatTypes[0]}` : ""}
                                    </span>
                                    <span className="sr-only">{getRankingMetricLabel(row)}</span>
                                  </span>
                                  <span className="shrink-0 text-right">
                                    <strong className="block text-base font-extrabold leading-tight tracking-tight v2-tabular">
                                      {formatCompactCurrency(row.block.medianPrice, locale)}
                                    </strong>
                                    <span className="block text-[0.6rem] font-semibold text-muted-foreground">
                                      {row.detailSummary?.pricePerSqftMedian
                                        ? t("unit.psf", {
                                            value: formatNumber(row.detailSummary.pricePerSqftMedian, 0, locale),
                                          })
                                        : t("shortlist.na")}
                                    </span>
                                  </span>
                                </div>

                                <div className="mt-2 flex min-w-0 items-center gap-3 text-[0.65rem] font-semibold text-muted-foreground">
                                  <MiniSpark color={accentColor} points={row.monthlyTrend} />
                                  <span>{t("unit.years", { value: getLeaseYears(row) })}</span>
                                  {row.block.nearestMrt ? (
                                    <span>
                                      {formatMeters(row.block.nearestMrt.distanceMeters, t, locale)}
                                    </span>
                                  ) : null}
                                  <span>{t("stats.txns", { count: row.block.transactionCount.toLocaleString(locale) })}</span>
                                  <span
                                    className={cn(
                                      "ml-auto text-right text-[0.62rem] font-extrabold uppercase tracking-[0.08em]",
                                      gapInfo?.tone === "positive" ? "text-success" : "text-destructive",
                                      !gapInfo && "text-muted-foreground",
                                    )}
                                  >
                                    {gapInfo
                                      ? `${formatCompactCurrency(gapInfo.amount, locale)} ${t(gapInfo.compactLabelKey)}`
                                      : t("shortlist.noTargetSet")}
                                  </span>
                                </div>
                              </button>

                              <Button
                                size="icon-xs"
                                variant="ghost"
                                onClick={() => onRemove(row.item.addressKey)}
                                type="button"
                                className="rounded-lg text-muted-foreground hover:text-destructive"
                                aria-label={t("shortlist.remove")}
                                title={t("shortlist.remove")}
                              >
                                <X data-icon />
                              </Button>
                            </div>
                          </CardHeader>

                          {isExpanded ? (
                            <CardContent className="flex flex-col gap-4 border-t border-border/40 px-3 py-3">
                              {row.comparison ? (
                                <div>
                                  <div className="v2-section-title mb-2">{t("shortlist.marketPosition")}</div>
                                  <div className="flex flex-col gap-1.5">
                                    <PercentileBar
                                      label={t("detail.rank.price")}
                                      value={row.comparison.percentileRanks.pricePercentile}
                                    />
                                    <PercentileBar
                                      invert
                                      label={t("detail.rank.lease")}
                                      value={row.comparison.percentileRanks.leasePercentile}
                                    />
                                    <PercentileBar
                                      invert
                                      label={t("detail.rank.mrt")}
                                      value={row.comparison.percentileRanks.mrtDistancePercentile}
                                    />
                                    <PercentileBar
                                      invert
                                      label={t("detail.rank.liquidity")}
                                      value={row.comparison.percentileRanks.transactionCountPercentile}
                                    />
                                  </div>
                                  <div className="sr-only">
                                    <span>{t("shortlist.pricePercentile")}</span>
                                    <span>
                                      {t("shortlist.percentileValue", {
                                        value: Math.round(row.comparison.percentileRanks.pricePercentile),
                                      })}
                                    </span>
                                    <span>{t("shortlist.locationPercentiles")}</span>
                                    <span>
                                      {t("shortlist.locationPercentileValues", {
                                        mrt: Math.round(row.comparison.percentileRanks.mrtDistancePercentile),
                                        lease: Math.round(row.comparison.percentileRanks.leasePercentile),
                                      })}
                                    </span>
                                  </div>
                                </div>
                              ) : null}

                              {row.comparison ? (
                                <div>
                                  <div className="v2-section-title mb-2">
                                    {t("shortlist.nearbyAmenities1km")}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <AmenityTile
                                      icon={GraduationCap}
                                      label={t("shortlist.primarySchools")}
                                      count={row.comparison.amenities.primarySchoolsWithin1km}
                                      note={
                                        nearestSchool
                                          ? t("shortlist.nearestNamedDistance", {
                                              name: nearestSchool.name,
                                              distance: formatMeters(nearestSchool.distanceMeters, t, locale),
                                            })
                                          : null
                                      }
                                    />
                                    <AmenityTile
                                      icon={UtensilsCrossed}
                                      label={t("detail.amenity.hawkers")}
                                      count={row.comparison.amenities.hawkerCentresWithin1km}
                                    />
                                    <AmenityTile
                                      icon={ShoppingCart}
                                      label={t("detail.amenity.supermarkets")}
                                      count={row.comparison.amenities.supermarketsWithin1km}
                                    />
                                    <AmenityTile
                                      icon={Trees}
                                      label={t("detail.amenity.parks")}
                                      count={row.comparison.amenities.parksWithin1km}
                                    />
                                  </div>
                                  <div className="sr-only">
                                    <span>
                                      {t("shortlist.schoolsWithin", {
                                        count1km: row.comparison.amenities.primarySchoolsWithin1km,
                                        count2km: row.comparison.amenities.primarySchoolsWithin2km,
                                      })}
                                    </span>
                                    <span>{t("shortlist.amenities")}</span>
                                    <span>
                                      {t("shortlist.amenityCounts", {
                                        hawkers: row.comparison.amenities.hawkerCentresWithin1km,
                                        supermarkets: row.comparison.amenities.supermarketsWithin1km,
                                        parks: row.comparison.amenities.parksWithin1km,
                                      })}
                                    </span>
                                  </div>
                                </div>
                              ) : null}

                              <div>
                                <div className="v2-section-title mb-1.5">{t("shortlist.mrtConnectivity")}</div>
                                <div className="flex flex-col">
                                  {(row.block.nearbyMrts ?? (row.block.nearestMrt ? [row.block.nearestMrt] : []))
                                    .slice(0, 3)
                                    .map((mrt, idx, list) => (
                                      <div
                                        key={`${mrt.stationName}-${idx}`}
                                        className={cn(
                                          "flex items-center justify-between py-1.5",
                                          idx < list.length - 1 && "border-b border-border/30",
                                        )}
                                      >
                                        <span className="flex min-w-0 items-center gap-2">
                                          <span
                                            className="size-1.5 rounded-full bg-muted-foreground/40"
                                            style={idx === 0 ? { backgroundColor: accentColor } : undefined}
                                          />
                                          <span className="truncate text-xs font-bold">{mrt.stationName}</span>
                                        </span>
                                        <Badge
                                          variant={idx === 0 ? "default" : "secondary"}
                                          className="h-5 shrink-0 text-[0.58rem] font-extrabold v2-tabular"
                                        >
                                          {formatMeters(mrt.distanceMeters, t, locale)}
                                        </Badge>
                                      </div>
                                    ))}
                                </div>
                              </div>

                              <div className="grid gap-3 sm:grid-cols-2">
                                <Field>
                                  <FieldContent>
                                    <FieldLabel
                                      htmlFor={`target-${row.item.addressKey}`}
                                      className="v2-section-title"
                                    >
                                      {t("shortlist.yourTargetPrice")}
                                    </FieldLabel>
                                    <InputGroup className="rounded-lg border border-border/40 bg-muted/10">
                                      <InputGroupAddon align="inline-start" className="px-2.5">
                                        <InputGroupText className="text-[0.65rem] font-extrabold">
                                          {t("shortlist.currencyCode")}
                                        </InputGroupText>
                                      </InputGroupAddon>
                                      <InputGroupInput
                                        id={`target-${row.item.addressKey}`}
                                        inputMode="numeric"
                                        placeholder={t("shortlist.targetPricePlaceholder")}
                                        type="number"
                                        value={row.item.targetPrice ?? ""}
                                        className="text-sm font-bold"
                                        onChange={(event) =>
                                          onUpdate(row.item.addressKey, {
                                            targetPrice:
                                              event.target.value === "" ? null : Number(event.target.value),
                                          })
                                        }
                                      />
                                    </InputGroup>
                                  </FieldContent>
                                </Field>

                                <div className="flex flex-col gap-1.5">
                                  <span className="v2-section-title">{t("shortlist.gapVsTarget")}</span>
                                  {gapInfo ? (
                                    <>
                                      <strong
                                        className={cn(
                                          "text-sm font-extrabold tracking-tight",
                                          gapInfo.tone === "positive" ? "text-success" : "text-destructive",
                                        )}
                                      >
                                        {formatCurrency(gapInfo.amount, locale)}
                                      </strong>
                                      <span className="text-[0.65rem] font-medium text-muted-foreground">
                                        {t(gapInfo.labelKey)}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-[0.65rem] font-medium text-muted-foreground">
                                      {t("shortlist.enterTargetToCompare")}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <Field>
                                <FieldContent>
                                  <FieldLabel
                                    htmlFor={`notes-${row.item.addressKey}`}
                                    className="v2-section-title"
                                  >
                                    {t("shortlist.notes")}
                                  </FieldLabel>
                                  <Textarea
                                    id={`notes-${row.item.addressKey}`}
                                    value={row.item.notes}
                                    placeholder={t("shortlist.notesPlaceholder")}
                                    className="min-h-14 rounded-lg border border-border/40 bg-muted/10 px-3 py-2 text-sm"
                                    onChange={(event) =>
                                      onUpdate(row.item.addressKey, { notes: event.target.value })
                                    }
                                  />
                                </FieldContent>
                              </Field>

                              <div className="grid grid-cols-2 gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg border-border/50"
                                  onClick={() => onRemove(row.item.addressKey)}
                                >
                                  <X data-icon="inline-start" />
                                  {t("shortlist.remove")}
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="rounded-lg"
                                  onClick={() => onSelectAddress(row.item.addressKey)}
                                >
                                  <MapPin data-icon="inline-start" />
                                  {t("shortlist.viewOnMap")}
                                </Button>
                              </div>
                            </CardContent>
                          ) : null}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        ) : null}
      </Card>
    </section>
  );
}
