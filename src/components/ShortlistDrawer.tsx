import { useId, useMemo, useState } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { Check, Copy, Download, Link2, Target, TrainFront, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { formatCompactCurrency, formatCurrency, formatMeters, formatNumber, formatRemainingLease } from "@/lib/format";
import { rankShortlistRows, type CompareMode } from "@/lib/shortlist-ranking";
import { encodeShortlistForUrl } from "@/lib/shortlist";
import type { AddressDetailSummary, AddressTrendPoint, BlockSummary, ComparisonArtifact, ShortlistItem } from "@/types/data";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

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
};

type GapInfo = {
  amount: number;
  labelKey: "shortlist.gap.belowTarget" | "shortlist.gap.aboveTarget";
  tone: "positive" | "negative";
};

const compareModeLabels: Record<CompareMode, string> = {
  "target-gap": "shortlist.compare.targetFit",
  median: "shortlist.compare.price",
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
      tone: "positive",
    };
  }

  return {
    amount,
    labelKey: "shortlist.gap.aboveTarget",
    tone: "negative",
  };
}

export function ShortlistDrawer({
  isOpen,
  rows,
  onToggleOpen,
  onRemove,
  onUpdate,
}: ShortlistDrawerProps) {
  const { isDark } = useTheme();
  const { locale, t } = useI18n();
  const [compareMode, setCompareMode] = useState<CompareMode>("target-gap");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const sortLabelId = useId();

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

    if (compareMode === "median") {
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
          url: url,
        });
        return;
      } catch {
        // Silently fail if share was cancelled or failed
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
        const target = row.item.targetPrice ? formatCurrency(row.item.targetPrice, locale) : "-";
        const lease = formatRemainingLease(row.block.leaseCommenceRange, t);
        const mrt = row.block.nearestMrt
          ? formatMeters(row.block.nearestMrt.distanceMeters, t, locale)
          : "-";
        const schools = row.comparison?.amenities.primarySchoolsWithin1km ?? "-";
        const hawkers = row.comparison?.amenities.hawkerCentresWithin1km ?? "-";
        return `| ${address} | ${median} | ${target} | ${lease} | ${mrt} | ${schools} | ${hawkers} |`;
      })
      .join("\n");

    const summary = `${header}\n${body}`;
    void navigator.clipboard.writeText(summary);
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
    const csvRows = rows.map((row) => {
      // 🛡️ Sentinel Security Fix: Prevent CSV Formula Injection
      // User notes might contain malicious spreadsheet formulas. Since shortlists
      // can be imported via URLs, an attacker could craft a link that injects
      // a formula into the victim's export. We prepend a single quote to notes
      // starting with formula triggers to force them to be treated as plain text.
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
    const csvContent = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hdb-shortlist.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleExportJson() {
    const data = rows.map((r) => r.item);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hdb-shortlist.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  const rankedRows = useMemo(() => rankShortlistRows(rows, compareMode), [compareMode, rows]);

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

    return {
      cheapest: byMedian[0] ?? null,
      newestLease: byLease[0] ?? null,
      nearestMrt: byMrt[0] ?? null,
    };
  }, [rows]);

  const comparisonRows = useMemo(
    () => rows.filter((row) => row.monthlyTrend.length > 0),
    [rows],
  );
  const compareOption = useMemo(() => {
    if (comparisonRows.length < 2) {
      return null;
    }

    const monthSet = new Set<string>();
    for (const row of comparisonRows) {
      for (const point of row.monthlyTrend) {
        monthSet.add(point.month);
      }
    }
    const months = [...monthSet].sort((left, right) => left.localeCompare(right));
    const series = comparisonRows.map((row) => {
      const monthToPrice = new Map(row.monthlyTrend.map((point) => [point.month, point.medianPrice]));
      return {
        name: `${row.block.block} ${row.block.streetName}`,
        type: "line",
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2.5 },
        data: months.map((month) => monthToPrice.get(month) ?? null),
      };
    });

    const colors = {
      popover: isDark ? "#22262e" : "#ffffff",
      popoverForeground: isDark ? "#e0e0e0" : "#171c1f",
      border: isDark ? "rgba(255, 255, 255, 0.08)" : "#c3c6d7",
      splitLine: isDark ? "rgba(255, 255, 255, 0.04)" : "rgba(195, 198, 215, 0.5)",
      mutedForeground: isDark ? "#94a3b8" : "#434655",
      legendText: isDark ? "#e0e0e0" : "#171c1f",
      palette: isDark 
        ? ["#79a6ff", "#7ecb63", "#ffb86c", "#ff79c6", "#bd93f9", "#8be9fd"] 
        : ["#2563eb", "#62a34b", "#d97706", "#db2777", "#7c3aed", "#0891b2"],
    };

    return {
      animationDuration: 400,
      backgroundColor: "transparent",
      color: colors.palette,
      grid: { left: 8, right: 12, top: 56, bottom: 30, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: colors.popover,
        borderColor: colors.border,
        borderWidth: 1,
        textStyle: {
          color: colors.popoverForeground,
        },
        valueFormatter: (value: number | null) =>
          value === null ? t("shortlist.na") : formatCompactCurrency(value),
      },
      legend: {
        type: "scroll",
        top: 8,
        textStyle: {
          color: colors.legendText,
        },
      },
      xAxis: {
        type: "category",
        data: months,
        axisLine: {
          lineStyle: {
            color: colors.border,
          },
        },
        axisLabel: {
          color: colors.mutedForeground,
          formatter: (value: string) => value.slice(2),
        },
      },
      yAxis: {
        type: "value",
        splitLine: {
          lineStyle: {
            color: colors.splitLine,
          },
        },
        axisLabel: {
          color: colors.mutedForeground,
          formatter: (value: number) => formatCompactCurrency(value),
        },
      },
      series,
    };
  }, [comparisonRows, t, isDark]);

  return (
    <section data-testid="shortlist-drawer" className="flex min-h-0 flex-1 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col gap-0 bg-background py-0 shadow-none border-none">
        <CardHeader className="gap-2 border-b border-border/30 bg-muted/20 px-3 py-2.5 sm:px-4 shrink-0">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle className="mr-auto min-w-0 truncate text-[0.7rem] font-bold uppercase leading-none tracking-[0.16em] text-muted-foreground">
              {t("shortlist.title")}
            </CardTitle>
            <Badge className="h-6 shrink-0 px-2 text-[0.65rem] font-bold uppercase tracking-wider">
              {t("shortlist.savedCount", { count: rows.length })}
            </Badge>
            <Button
              onClick={onToggleOpen}
              size="xs"
              variant="ghost"
              type="button"
              className="h-7 shrink-0 px-2 text-[0.65rem] font-bold uppercase tracking-wider"
              aria-expanded={isOpen}
              aria-controls="shortlist-content"
            >
              {isOpen ? t("shortlist.collapse") : t("shortlist.expand")}
            </Button>
          </div>
          {rows.length > 0 ? (
            <div className="col-span-full flex flex-col gap-4">
              <Field className="min-w-0 flex-1 flex-row items-center gap-2 space-y-0 sm:flex-none">
                <FieldLabel
                  id={sortLabelId}
                  className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {t("shortlist.sortBy")}:
                </FieldLabel>
                <Select
                  value={compareMode}
                  onValueChange={(value) => setCompareMode(value as CompareMode)}
                >
                  <SelectTrigger
                    className="h-8 min-w-0 flex-1 sm:w-[10.5rem] border-border/30 bg-background/60 shadow-sm"
                    aria-labelledby={sortLabelId}
                  >
                    <SelectValue />
                  </SelectTrigger>

                  <SelectContent>
                    <SelectItem value="target-gap" className="text-xs">{t(compareModeLabels["target-gap"])}</SelectItem>
                    <SelectItem value="median" className="text-xs">{t(compareModeLabels.median)}</SelectItem>
                    <SelectItem value="lease" className="text-xs">{t(compareModeLabels.lease)}</SelectItem>
                    <SelectItem value="mrt" className="text-xs">{t(compareModeLabels.mrt)}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="min-w-0 overflow-x-auto">
                <ButtonGroup className="w-max flex-nowrap gap-1.5 [&>*]:rounded-none [&>*]:border-border/30">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportJson}
                    type="button"
                    className="h-8 border-border/30 bg-background/60 px-3 text-[0.65rem] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm"
                    aria-label={t("shortlist.export.jsonLabel") || "Export as JSON"}
                  >
                    <Download data-icon="inline-start" />
                    {t("shortlist.export.json")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportCsv}
                    type="button"
                    className="h-8 border-border/30 bg-background/60 px-3 text-[0.65rem] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm"
                    aria-label={t("shortlist.export.csvLabel") || "Export as CSV"}
                  >
                    <Download data-icon="inline-start" />
                    {t("shortlist.export.csv")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleShare()}
                    type="button"
                    className={cn(
                      "h-8 border-border/30 bg-background/60 px-3 text-[0.65rem] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm transition-colors",
                      copiedKey === "share" ? "text-primary" : ""
                    )}
                    aria-label={t("shortlist.shareLinkLabel") || "Copy share link"}
                  >
                    {copiedKey === "share" ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Link2 data-icon="inline-start" />
                    )}
                    {copiedKey === "share" ? t("shortlist.shareCopied") : t("shortlist.shareLink")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopySummary}
                    type="button"
                    className={cn(
                      "h-8 border-border/30 bg-background/60 px-3 text-[0.65rem] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm transition-colors",
                      copiedKey === "summary" ? "text-primary" : ""
                    )}
                    aria-label={t("shortlist.copySummaryLabel") || "Copy Markdown summary"}
                  >
                    {copiedKey === "summary" ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Copy data-icon="inline-start" />
                    )}
                    {copiedKey === "summary" ? t("shortlist.summaryCopied") : t("shortlist.copySummary")}
                  </Button>
                </ButtonGroup>
              </div>
            </div>
          ) : null}
        </CardHeader>

        {isOpen ? (
          <CardContent id="shortlist-content" className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pt-3 pb-12 sm:px-4">
            {rows.length === 0 ? (
              <div className="empty-state pt-12 text-center text-sm text-muted-foreground italic">
                {t("shortlist.emptyState")}
              </div>
            ) : (
              <ScrollArea className="flex-1 min-h-0 pr-3" data-testid="shortlist-scroll-container">
                <div className="flex flex-col gap-4 py-4">
                  <Card className="border-border/30 bg-muted/10 shadow-none">
                    <CardContent className="grid gap-4 pt-4 sm:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">
                          {t("shortlist.lowestMedian")}
                        </span>
                        <strong className="text-sm font-bold tracking-tight">
                          {highlights.cheapest
                            ? `${highlights.cheapest.block.block} ${highlights.cheapest.block.streetName}`
                            : t("shortlist.na")}
                        </strong>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">
                          {t("shortlist.newestLease")}
                        </span>
                        <strong className="text-sm font-bold tracking-tight">
                          {highlights.newestLease
                            ? t("shortlist.commence", {
                                year: highlights.newestLease.block.leaseCommenceRange[1],
                              })
                            : t("shortlist.na")}
                        </strong>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">
                          {t("shortlist.closestMrt")}
                        </span>
                        <strong className="text-sm font-bold tracking-tight">
                          {highlights.nearestMrt?.block.nearestMrt
                            ? `${highlights.nearestMrt.block.nearestMrt.stationName} • ${formatMeters(highlights.nearestMrt.block.nearestMrt.distanceMeters, t, locale)}`
                            : t("shortlist.na")}
                        </strong>
                      </div>
                    </CardContent>
                  </Card>
                  {compareOption ? (
                    <Card className="border-border/30 bg-muted/10 shadow-none">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                          {t("shortlist.compareTrendsTitle")}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p id="compare-trends-hint" className="pb-3 text-[0.65rem] font-medium text-muted-foreground/60 italic">
                          {t("shortlist.compareTrendsHint")}
                        </p>
                        <ReactEChartsCore
                          echarts={echarts}
                          notMerge
                          option={compareOption}
                          style={{ height: 260, width: "100%" }}
                          aria-label={t("shortlist.compareTrendsTitle")}
                          aria-describedby="compare-trends-hint"
                          role="img"
                        />
                      </CardContent>
                    </Card>
                  ) : null}

                  <div className="flex flex-col gap-4" role="list">
                    {rankedRows.map((row, index) => {
                      const gapInfo = getGapInfo(row.item.targetPrice, row.block.medianPrice);

                      return (
                        <Card
                          key={row.item.addressKey}
                          role="listitem"
                          className="animate-fade-in-up border-border/55 bg-popover/90 shadow-[0_8px_24px_rgba(0,0,0,0.14)] backdrop-blur-sm transition-all hover:bg-popover"
                          style={{ animationDelay: `${index * 60}ms` }}
                        >
                          <CardHeader className="gap-3 border-b border-border/20 pb-4">
                            <div className="flex flex-wrap items-start gap-3">
                              <div className="flex flex-1 flex-col gap-1.5">
                                <CardTitle className="text-lg font-bold tracking-tight">
                                  {row.block.block} {row.block.streetName}
                                </CardTitle>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant="secondary" className="h-5 text-[0.6rem] font-bold">
                                    {t("shortlist.compare.rank", { rank: index + 1 })}
                                  </Badge>
                                  <span className="text-[0.65rem] font-bold uppercase tracking-wider text-muted-foreground">
                                    {getRankingMetricLabel(row)}
                                  </span>
                                  {row.comparison && (
                                    <>
                                      <Badge
                                        variant={
                                          row.comparison.percentileRanks.pricePercentile <= 25
                                            ? "default"
                                            : "outline"
                                        }
                                        className="h-5 border-border/60 text-[0.6rem] font-bold uppercase"
                                      >
                                        {t("detail.rank.price")}:{" "}
                                        {t("detail.topPercentile", {
                                          value: Math.round(
                                            row.comparison.percentileRanks.pricePercentile,
                                          ),
                                        })}
                                      </Badge>
                                      <Badge
                                        variant={
                                          row.comparison.percentileRanks.mrtDistancePercentile >= 75
                                            ? "default"
                                            : "outline"
                                        }
                                        className="h-5 border-border/60 text-[0.6rem] font-bold uppercase"
                                      >
                                        {t("detail.rank.mrt")}:{" "}
                                        {t("detail.topPercentile", {
                                          value: Math.round(
                                            100 - row.comparison.percentileRanks.mrtDistancePercentile,
                                          ),
                                        })}
                                      </Badge>
                                    </>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => onRemove(row.item.addressKey)}
                                type="button"
                                className="h-8 px-2 text-muted-foreground hover:text-destructive"
                                aria-label={t("shortlist.remove")}
                              >
                                <X data-icon className="size-4" />
                              </Button>
                            </div>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-6 pt-5">
                            <div className="grid gap-4 sm:grid-cols-3">
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                                  {t("shortlist.marketMedian")}
                                </span>
                                <strong className="font-heading text-xl font-bold tracking-tight">
                                  {formatCompactCurrency(row.block.medianPrice, locale)}
                                </strong>
                                <span className="text-[0.65rem] font-medium text-muted-foreground/60">
                                  {formatCurrency(row.block.medianPrice, locale)}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                                  {t("shortlist.pricePerSqft")}
                                </span>
                                <strong className="text-sm font-bold tracking-tight">
                                  {row.detailSummary
                                    ? row.detailSummary.pricePerSqftMedian !== null
                                      ? formatCurrency(row.detailSummary.pricePerSqftMedian, locale)
                                      : t("shortlist.na")
                                    : t("shortlist.loadingMetrics")}
                                </strong>
                                <span className="text-[0.65rem] font-medium text-muted-foreground/60">
                                  {row.detailSummary
                                    ? t("shortlist.pricePerSqm", {
                                        value: formatNumber(
                                          row.detailSummary.pricePerSqmMedian,
                                          0,
                                          locale,
                                        ),
                                      })
                                    : t("shortlist.loadingMetrics")}
                                </span>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <span className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                                  {t("shortlist.areaRange")}
                                </span>
                                <strong className="text-sm font-bold tracking-tight">
                                  {t("shortlist.areaRangeValue", {
                                    min: formatNumber(row.block.floorAreaRange[0], 1, locale),
                                    max: formatNumber(row.block.floorAreaRange[1], 1, locale),
                                  })}
                                </strong>
                                <span className="text-[0.65rem] font-medium text-muted-foreground/60">
                                  {row.block.flatTypes.join(", ")}
                                </span>
                              </div>
                            </div>

                            {row.comparison && (
                              <div className="grid gap-5 sm:grid-cols-2">
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                                    {t("shortlist.primarySchools")}
                                  </span>
                                  <strong className="text-sm font-bold tracking-tight">
                                    {t("shortlist.schoolsWithin", {
                                      count1km: row.comparison.amenities.primarySchoolsWithin1km,
                                      count2km: row.comparison.amenities.primarySchoolsWithin2km,
                                    })}
                                  </strong>
                                  <span className="text-[0.65rem] font-medium text-muted-foreground/60 italic">
                                    {row.comparison.amenities.nearestPrimarySchools?.[0]
                                      ? t("shortlist.nearestNamedDistance", {
                                          name: row.comparison.amenities.nearestPrimarySchools[0].name,
                                          distance: formatMeters(
                                            row.comparison.amenities.nearestPrimarySchools[0].distanceMeters,
                                            t,
                                            locale,
                                          ),
                                        })
                                      : row.comparison.amenities.nearestPrimarySchoolMeters !== null
                                      ? t("shortlist.nearestDistance", {
                                          distance: formatMeters(row.comparison.amenities.nearestPrimarySchoolMeters, t, locale),
                                        })
                                      : t("shortlist.noNearbySchools")}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                                    {t("shortlist.amenities")}
                                  </span>
                                  <strong className="text-sm font-bold tracking-tight">
                                    {t("shortlist.amenityCounts", {
                                      hawkers: row.comparison.amenities.hawkerCentresWithin1km,
                                      supermarkets: row.comparison.amenities.supermarketsWithin1km,
                                      parks: row.comparison.amenities.parksWithin1km,
                                    })}
                                  </strong>
                                  <span className="text-[0.65rem] font-medium text-muted-foreground/60 italic">
                                    {t("shortlist.within1km")}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                                    {t("shortlist.pricePercentile")}
                                  </span>
                                  <strong className="text-sm font-bold tracking-tight">
                                    {t("shortlist.percentileValue", {
                                      value: Math.round(row.comparison.percentileRanks.pricePercentile),
                                    })}
                                  </strong>
                                  <span className="text-[0.65rem] font-medium text-muted-foreground/60 italic">
                                    {t("shortlist.percentileContext", {
                                      town: row.comparison.town,
                                      flatType: row.comparison.flatType,
                                    })}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                                    {t("shortlist.locationPercentiles")}
                                  </span>
                                  <strong className="text-sm font-bold tracking-tight">
                                    {t("shortlist.locationPercentileValues", {
                                      mrt: Math.round(row.comparison.percentileRanks.mrtDistancePercentile),
                                      lease: Math.round(row.comparison.percentileRanks.leasePercentile),
                                    })}
                                  </strong>
                                  <span className="text-[0.65rem] font-medium text-muted-foreground/60 italic">
                                    {t("shortlist.mrtLeaseContext")}
                                  </span>
                                </div>
                              </div>
                            )}

                            <div className="grid gap-5 sm:grid-cols-2">
                              <div className="flex flex-col gap-1.5">
                                <span className="inline-flex items-center gap-2 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                                  <TrainFront className="size-3.5" />
                                  {t("results.nearestMrt")}
                                </span>
                                <strong className="text-sm font-bold tracking-tight">
                                  {row.block.nearestMrt
                                    ? `${row.block.nearestMrt.stationName} • ${formatMeters(row.block.nearestMrt.distanceMeters, t, locale)}`
                                    : t("results.noMatch")}
                                </strong>
                                {(row.block.nearbyMrts?.length ?? 0) > 1 ? (
                                  <span className="text-[0.65rem] font-medium text-muted-foreground/60 italic">
                                    {t("results.alsoNear", {
                                      stations: (row.block.nearbyMrts ?? [])
                                        .slice(1)
                                        .map((station) => station.stationName)
                                        .join(", "),
                                  })}
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <span className="inline-flex items-center gap-2 text-[0.6rem] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                                  <Target className="size-3.5" />
                                  {t("shortlist.gapVsTarget")}
                                </span>
                                {gapInfo ? (
                                  <>
                                    <strong
                                      className={cn(
                                        "text-sm font-bold tracking-tight",
                                        gapInfo.tone === "positive"
                                          ? "text-success"
                                          : "text-destructive"
                                      )}
                                    >
                                      {formatCurrency(gapInfo.amount, locale)}
                                    </strong>
                                    <span className="text-[0.65rem] font-medium text-muted-foreground/60 italic">
                                      {t(gapInfo.labelKey)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-[0.65rem] font-medium text-muted-foreground/60 italic">
                                    {t("shortlist.enterTargetToCompare")}
                                  </span>
                                )}
                              </div>
                            </div>

                            <Field>
                              <FieldContent>
                                <FieldLabel htmlFor={`target-${row.item.addressKey}`} className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground/80">
                                  {t("shortlist.yourTargetPrice")}
                                </FieldLabel>
                                <InputGroup>
                                  <InputGroupAddon align="inline-start" className="border-border/30 bg-muted/10 px-2.5">
                                    <InputGroupText className="text-[0.65rem] font-bold">{t("shortlist.currencyCode")}</InputGroupText>
                                  </InputGroupAddon>
                                  <InputGroupInput
                                    id={`target-${row.item.addressKey}`}
                                    inputMode="numeric"
                                    placeholder={t("shortlist.targetPricePlaceholder")}
                                    type="number"
                                    value={row.item.targetPrice ?? ""}
                                    className="border-border/30 bg-transparent text-sm font-bold"
                                    onChange={(event) =>
                                      onUpdate(row.item.addressKey, {
                                        targetPrice:
                                          event.target.value === ""
                                            ? null
                                            : Number(event.target.value),
                                      })
                                    }
                                  />
                                </InputGroup>
                              </FieldContent>
                            </Field>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              </ScrollArea>
            )}
          </CardContent>
        ) : null}
      </Card>
    </section>
  );
}
