import { useMemo, useState } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { Download, Link2, Target, TrainFront, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { formatCompactCurrency, formatCurrency, formatMeters, formatNumber } from "@/lib/format";
import { rankShortlistRows, type CompareMode } from "@/lib/shortlist-ranking";
import { encodeShortlistForUrl } from "@/lib/shortlist";
import type { AddressDetailSummary, AddressTrendPoint, BlockSummary, ComparisonArtifact, ShortlistItem } from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
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

const compareModeKeys: Record<CompareMode, { label: string; help: string }> = {
  "target-gap": {
    label: "shortlist.compare.targetFit",
    help: "shortlist.compare.targetFit.help",
  },
  median: {
    label: "shortlist.compare.price",
    help: "shortlist.compare.price.help",
  },
  lease: {
    label: "shortlist.compare.lease",
    help: "shortlist.compare.lease.help",
  },
  mrt: {
    label: "shortlist.compare.mrt",
    help: "shortlist.compare.mrt.help",
  },
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

function getRemainingLeaseRange(leaseCommenceRange: [number, number]) {
  const currentYear = new Date().getFullYear();
  const oldestRemaining = Math.max(0, 99 - (currentYear - leaseCommenceRange[0]));
  const newestRemaining = Math.max(0, 99 - (currentYear - leaseCommenceRange[1]));

  return [Math.min(oldestRemaining, newestRemaining), Math.max(oldestRemaining, newestRemaining)];
}

export function ShortlistDrawer({
  isOpen,
  rows,
  onToggleOpen,
  onRemove,
  onUpdate,
}: ShortlistDrawerProps) {
  const { locale, t } = useI18n();
  const [compareMode, setCompareMode] = useState<CompareMode>("target-gap");

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

  function handleShare() {
    const params = new URLSearchParams(window.location.search);
    params.set("shortlist", encodeShortlistForUrl(rows.map((row) => row.item)));
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    void navigator.clipboard.writeText(url);
    alert(t("shortlist.shareCopied"));
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
    const csvRows = rows.map((row) =>
      [
        `"${row.block.block} ${row.block.streetName}"`,
        row.block.medianPrice,
        row.item.targetPrice ?? "",
        row.comparison?.amenities.primarySchoolsWithin1km ?? "",
        row.comparison?.amenities.hawkerCentresWithin1km ?? "",
        row.comparison?.amenities.supermarketsWithin1km ?? "",
        row.comparison?.amenities.parksWithin1km ?? "",
        row.block.nearestMrt?.distanceMeters ?? "",
        `"${(row.item.notes || "").replace(/"/g, '""')}"`,
      ].join(","),
    );
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

    return {
      animationDuration: 400,
      backgroundColor: "transparent",
      grid: { left: 8, right: 12, top: 56, bottom: 30, containLabel: true },
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: number | null) =>
          value === null ? t("shortlist.na") : formatCompactCurrency(value),
      },
      legend: {
        type: "scroll",
        top: 8,
      },
      xAxis: {
        type: "category",
        data: months,
        axisLabel: {
          formatter: (value: string) => value.slice(2),
        },
      },
      yAxis: {
        type: "value",
        axisLabel: {
          formatter: (value: number) => formatCompactCurrency(value),
        },
      },
      series,
    };
  }, [comparisonRows, t]);

  return (
    <section data-testid="shortlist-drawer" className="flex min-h-0 flex-1 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col bg-background">
        <CardHeader className="gap-3 border-b border-border pb-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <CardTitle className="text-2xl">{t("shortlist.title")}</CardTitle>
            </div>
            <CardAction className="flex flex-col items-end gap-3">
              <Badge>{t("shortlist.savedCount", { count: rows.length })}</Badge>
              <Button onClick={onToggleOpen} size="sm" variant="ghost" type="button">
                {isOpen ? t("shortlist.collapse") : t("shortlist.expand")}
              </Button>
            </CardAction>
          </div>
          {rows.length > 0 ? (
            <div className="col-span-full flex flex-col gap-4">
              <Field className="flex-row items-center gap-3 space-y-0">
                <FieldLabel className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                  {t("shortlist.sortBy")}:
                </FieldLabel>
                <Select
                  value={compareMode}
                  onValueChange={(value) => setCompareMode(value as CompareMode)}
                >
                  <SelectTrigger className="h-8 w-auto min-w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="target-gap">{t(compareModeKeys["target-gap"].label)}</SelectItem>
                    <SelectItem value="median">{t(compareModeKeys.median.label)}</SelectItem>
                    <SelectItem value="lease">{t(compareModeKeys.lease.label)}</SelectItem>
                    <SelectItem value="mrt">{t(compareModeKeys.mrt.label)}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">
                  {t(compareModeKeys[compareMode].help)}
                </p>
                <p className="text-xs text-muted-foreground font-medium">
                  {t("shortlist.compare.currentSort", {
                    mode: t(compareModeKeys[compareMode].label),
                  })}
                </p>
              </div>
              <div className="overflow-x-auto pb-1">
                <ButtonGroup className="w-max flex-nowrap gap-2 [&>*]:rounded-none [&>*]:border">
                  <Button variant="outline" size="xs" onClick={handleExportJson} type="button">
                    <Download data-icon="inline-start" />
                    {t("shortlist.export.json")}
                  </Button>
                  <Button variant="outline" size="xs" onClick={handleExportCsv} type="button">
                    <Download data-icon="inline-start" />
                    {t("shortlist.export.csv")}
                  </Button>
                  <Button variant="outline" size="xs" onClick={handleShare} type="button">
                    <Link2 data-icon="inline-start" />
                    {t("shortlist.shareLink")}
                  </Button>
                </ButtonGroup>
              </div>
            </div>
          ) : null}
        </CardHeader>

        {isOpen ? (
          <CardContent className="flex min-h-0 flex-1 flex-col pt-0 overflow-hidden">
            {rows.length === 0 ? (
              <div className="empty-state pt-8">{t("shortlist.emptyState")}</div>
            ) : (
              <ScrollArea className="flex-1 min-h-0 pr-3" data-testid="shortlist-scroll-container">
                <div className="flex flex-col gap-4 py-4">
                  <Card className="bg-muted/40">
                    <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                          {t("shortlist.lowestMedian")}
                        </span>
                        <strong>
                          {highlights.cheapest
                            ? `${highlights.cheapest.block.block} ${highlights.cheapest.block.streetName}`
                            : t("shortlist.na")}
                        </strong>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                          {t("shortlist.newestLease")}
                        </span>
                        <strong>
                          {highlights.newestLease
                            ? t("shortlist.commence", {
                                year: highlights.newestLease.block.leaseCommenceRange[1],
                              })
                            : t("shortlist.na")}
                        </strong>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-xs text-muted-foreground">
                          {t("shortlist.closestMrt")}
                        </span>
                        <strong>
                          {highlights.nearestMrt?.block.nearestMrt
                            ? `${highlights.nearestMrt.block.nearestMrt.stationName} • ${formatMeters(highlights.nearestMrt.block.nearestMrt.distanceMeters, t, locale)}`
                            : t("shortlist.na")}
                        </strong>
                      </div>
                    </CardContent>
                  </Card>
                  {compareOption ? (
                    <Card className="bg-muted/40">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{t("shortlist.compareTrendsTitle")}</CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p id="compare-trends-hint" className="pb-3 text-xs text-muted-foreground">{t("shortlist.compareTrendsHint")}</p>
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

                  {rankedRows.map((row, index) => {
                    const gapInfo = getGapInfo(row.item.targetPrice, row.block.medianPrice);
                    const remainingLeaseRange = getRemainingLeaseRange(row.block.leaseCommenceRange);

                    return (
                      <Card key={row.item.addressKey} className="bg-muted/40">
                        <CardHeader className="gap-3 border-b border-border/60 pb-5">
                          <div className="flex flex-wrap items-start gap-3">
                            <div className="flex flex-1 flex-col gap-2">
                              <CardTitle className="text-xl">
                                {row.block.block} {row.block.streetName}
                              </CardTitle>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary">
                                  {t("shortlist.compare.rank", { rank: index + 1 })}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  {getRankingMetricLabel(row)}
                                </span>
                              </div>
                            </div>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => onRemove(row.item.addressKey)}
                              type="button"
                            >
                              <X data-icon="inline-start" />
                              {t("shortlist.remove")}
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="flex flex-col gap-5 pt-5">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-2">
                              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {t("shortlist.marketMedian")}
                              </span>
                              <strong className="font-heading text-2xl font-semibold">
                                {formatCompactCurrency(row.block.medianPrice, locale)}
                              </strong>
                              <span className="text-sm text-muted-foreground">
                                {formatCurrency(row.block.medianPrice, locale)}
                              </span>
                            </div>
                            <div className="flex flex-col gap-2">
                              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {t("shortlist.pricePerSqft")}
                              </span>
                              <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                                {row.detailSummary
                                  ? row.detailSummary.pricePerSqftMedian !== null
                                    ? formatCurrency(row.detailSummary.pricePerSqftMedian, locale)
                                    : t("shortlist.na")
                                  : t("shortlist.loadingMetrics")}
                              </strong>
                              <span className="text-sm text-muted-foreground">
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
                            <div className="flex flex-col gap-2">
                              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {t("shortlist.areaRange")}
                              </span>
                              <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                                {t("shortlist.areaRangeValue", {
                                  min: formatNumber(row.block.floorAreaRange[0], 1, locale),
                                  max: formatNumber(row.block.floorAreaRange[1], 1, locale),
                                })}
                              </strong>
                              <span className="text-sm text-muted-foreground">
                                {row.block.flatTypes.join(", ")}
                              </span>
                            </div>
                            <div className="flex flex-col gap-2">
                              <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                {t("shortlist.leaseContext")}
                              </span>
                              <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                                {t("shortlist.leaseLeftRange", {
                                  min: remainingLeaseRange[0],
                                  max: remainingLeaseRange[1],
                                })}
                              </strong>
                              <span className="text-sm text-muted-foreground">
                                {t("shortlist.leaseCommenceRange", {
                                  start: row.block.leaseCommenceRange[0],
                                  end: row.block.leaseCommenceRange[1],
                                })}
                              </span>
                            </div>
                          </div>

                          {row.comparison ? (
                            <div className="grid gap-4 sm:grid-cols-2">
                              <div className="flex flex-col gap-2">
                                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                  {t("shortlist.primarySchools")}
                                </span>
                                <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                                  {t("shortlist.schoolsWithin", {
                                    count1km: row.comparison.amenities.primarySchoolsWithin1km,
                                    count2km: row.comparison.amenities.primarySchoolsWithin2km,
                                  })}
                                </strong>
                                <span className="text-sm text-muted-foreground">
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
                              <div className="flex flex-col gap-2">
                                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                  {t("shortlist.amenities")}
                                </span>
                                <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                                  {t("shortlist.amenityCounts", {
                                    hawkers: row.comparison.amenities.hawkerCentresWithin1km,
                                    supermarkets: row.comparison.amenities.supermarketsWithin1km,
                                    parks: row.comparison.amenities.parksWithin1km,
                                  })}
                                </strong>
                                <span className="text-sm text-muted-foreground">
                                  {t("shortlist.within1km")}
                                </span>
                              </div>
                              <div className="flex flex-col gap-2">
                                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                  {t("shortlist.pricePercentile")}
                                </span>
                                <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                                  {t("shortlist.percentileValue", {
                                    value: Math.round(row.comparison.percentileRanks.pricePercentile),
                                  })}
                                </strong>
                                <span className="text-sm text-muted-foreground">
                                  {t("shortlist.percentileContext", {
                                    town: row.comparison.town,
                                    flatType: row.comparison.flatType,
                                  })}
                                </span>
                              </div>
                              <div className="flex flex-col gap-2">
                                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                  {t("shortlist.locationPercentiles")}
                                </span>
                                <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                                  {t("shortlist.locationPercentileValues", {
                                    mrt: Math.round(row.comparison.percentileRanks.mrtDistancePercentile),
                                    lease: Math.round(row.comparison.percentileRanks.leasePercentile),
                                  })}
                                </strong>
                                <span className="text-sm text-muted-foreground">
                                  {t("shortlist.mrtLeaseContext")}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed border-border/60 p-4">
                              <p className="text-sm text-muted-foreground text-center">
                                {t("shortlist.comparisonDataLoading")}
                              </p>
                            </div>
                          )}

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="flex flex-col gap-2">
                              <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                <TrainFront className="size-3.5" />
                                {t("results.nearestMrt")}
                              </span>
                              <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                                {row.block.nearestMrt
                                  ? `${row.block.nearestMrt.stationName} • ${formatMeters(row.block.nearestMrt.distanceMeters, t, locale)}`
                                  : t("results.noMatch")}
                              </strong>
                              {(row.block.nearbyMrts?.length ?? 0) > 1 ? (
                                <span className="text-sm text-muted-foreground">
                                  {t("results.alsoNear", {
                                    stations: (row.block.nearbyMrts ?? [])
                                      .slice(1)
                                      .map((station) => station.stationName)
                                      .join(", "),
                                  })}
                                </span>
                              ) : null}
                            </div>
                            <div className="flex flex-col gap-2">
                              <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                <Target className="size-3.5" />
                                {t("shortlist.gapVsTarget")}
                              </span>
                              {gapInfo ? (
                                <>
                                  <strong
                                    className={
                                      gapInfo.tone === "positive"
                                        ? "text-success"
                                        : "text-destructive"
                                    }
                                  >
                                    {formatCurrency(gapInfo.amount, locale)}
                                  </strong>
                                  <span className="text-sm text-muted-foreground">
                                    {t(gapInfo.labelKey)}
                                  </span>
                                </>
                              ) : (
                                <span className="text-sm text-muted-foreground">
                                  {t("shortlist.enterTargetToCompare")}
                                </span>
                              )}
                            </div>
                          </div>

                          <FieldGroup>
                            <Field>
                              <FieldContent>
                                <FieldLabel htmlFor={`target-${row.item.addressKey}`}>
                                  {t("shortlist.yourTargetPrice")}
                                </FieldLabel>
                                <InputGroup>
                                  <InputGroupAddon align="inline-start">
                                    <InputGroupText>{t("shortlist.currencyCode")}</InputGroupText>
                                  </InputGroupAddon>
                                  <InputGroupInput
                                    id={`target-${row.item.addressKey}`}
                                    inputMode="numeric"
                                    placeholder={t("shortlist.targetPricePlaceholder")}
                                    type="number"
                                    value={row.item.targetPrice ?? ""}
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
                            <Field>
                              <FieldContent>
                                <FieldLabel htmlFor={`notes-${row.item.addressKey}`}>
                                  {t("shortlist.notes")}
                                </FieldLabel>
                                <Textarea
                                  id={`notes-${row.item.addressKey}`}
                                  placeholder={t("shortlist.notesPlaceholder")}
                                  rows={3}
                                  value={row.item.notes}
                                  onChange={(event) =>
                                    onUpdate(row.item.addressKey, {
                                      notes: event.target.value,
                                    })
                                  }
                                />
                              </FieldContent>
                            </Field>
                          </FieldGroup>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        ) : null}
      </Card>
    </section>
  );
}
