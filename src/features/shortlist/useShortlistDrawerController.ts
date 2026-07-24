import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_LEASE_DURATION, PRIMARY_BLUE, getCurrentYear } from "@/shared/lib/constants";
import {
  formatCompactCurrency,
  formatCurrency,
  formatMinutesWalk,
  formatRemainingLease,
} from "@/shared/lib/format";
import { buildLeaseSignals } from "@/features/block-detail/leaseSignals";
import { buildShortlistComparisonRows } from "@/features/shortlist/shortlist-comparison";
import { encodeShortlistForUrl } from "@/features/shortlist/shortlist";
import { rankShortlistRows, type CompareMode } from "@/features/shortlist/shortlist-ranking";
import { useShortlistRemovalUndo } from "@/features/shortlist/useShortlistRemovalUndo";
import { buildShortlistCsvContent } from "@/shared/lib/export";
import { buildShortlistShareUrl } from "@/shared/lib/shareUrls";
import { useChecklist } from "@/hooks/useChecklist";
import type { Locale, Translator } from "@/shared/lib/i18n/types";
import type { FilterState, ShortlistItem } from "@/types/data";
import type { ShortlistRow } from "@/features/shortlist/shortlistRows";

export type ShortlistViewMode = "list" | "compare";

export type UseShortlistDrawerControllerOptions = {
  isOpen: boolean;
  rows: ShortlistRow[];
  filters: FilterState;
  remainingLeaseMin: number | null;
  isDark: boolean;
  locale: Locale;
  t: Translator;
  onRemove: (addressKey: string) => void;
  onRestore: (item: ShortlistItem, index: number) => void;
};

export type ShortlistCsvExport = {
  filename: string;
  getContent: () => string;
};

export type ShortlistHighlight = {
  label: string;
  row: ShortlistRow | null;
  sub: string;
};

export type ShortlistCompareChart = {
  data: Array<Record<string, string | number | undefined>>;
  seriesKeys: string[];
  palette: string[];
  colors: {
    popover: string;
    popoverForeground: string;
    border: string;
    splitLine: string;
    mutedForeground: string;
  };
  priceAxisWidth: number;
};

function hasSameRowMembership(previousKeys: readonly string[], currentKeys: readonly string[]) {
  if (previousKeys.length !== currentKeys.length) {
    return false;
  }

  return previousKeys.every((key) => currentKeys.includes(key));
}

function getLeaseYears(row: ShortlistRow) {
  return Math.max(0, MAX_LEASE_DURATION - (getCurrentYear() - row.block.leaseCommenceRange[1]));
}

export function useShortlistDrawerController({
  isOpen,
  rows,
  filters,
  remainingLeaseMin,
  isDark,
  locale,
  t,
  onRemove,
  onRestore,
}: UseShortlistDrawerControllerOptions) {
  const [compareMode, setCompareMode] = useState<CompareMode>("target-gap");
  const [viewMode, setViewMode] = useState<ShortlistViewMode>("list");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(
    () => rows[0]?.item.addressKey ?? null,
  );
  const previousRowKeysRef = useRef<string[] | null>(null);
  const previousIsOpenRef = useRef(isOpen);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCopiedTimer = useCallback(() => {
    if (copiedTimerRef.current !== null) {
      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clearCopiedTimer;
  }, [clearCopiedTimer]);

  useEffect(() => {
    if (previousIsOpenRef.current && !isOpen) {
      setShareError(null);
    }
    previousIsOpenRef.current = isOpen;
  }, [isOpen]);

  const rowKeys = useMemo(() => rows.map((row) => row.item.addressKey), [rows]);

  useEffect(() => {
    const previousKeys = previousRowKeysRef.current;
    if (previousKeys !== null && !hasSameRowMembership(previousKeys, rowKeys)) {
      setShareError(null);

      if (previousKeys.length === 0 && rowKeys.length > 0 && expandedKey === null) {
        setExpandedKey(rowKeys[0]);
      } else if (expandedKey !== null && !rowKeys.includes(expandedKey)) {
        setExpandedKey(rowKeys[0] ?? null);
      }
    }

    previousRowKeysRef.current = rowKeys;
  }, [expandedKey, rowKeys]);

  const { state: checklistState, toggle: toggleChecklist } = useChecklist();
  const {
    pendingRemoval,
    remove,
    undo: undoRemoval,
  } = useShortlistRemovalUndo({
    onRemove,
    onRestore,
  });

  const handleRemove = useCallback(
    (addressKey: string) => {
      const index = rows.findIndex((row) => row.item.addressKey === addressKey);
      const row = rows[index];
      if (row === undefined) {
        onRemove(addressKey);
        return;
      }

      const label = `${row.block.block} ${row.block.streetName}`;
      remove({ item: row.item, index, label });
    },
    [onRemove, remove, rows],
  );

  const currentYear = getCurrentYear();
  const rankedRows = useMemo(() => rankShortlistRows(rows, compareMode), [rows, compareMode]);
  const leaseSignalsByAddressKey = useMemo(
    () =>
      new Map(
        rows.map((row) => [
          row.item.addressKey,
          buildLeaseSignals(row.block.leaseCommenceRange, currentYear, remainingLeaseMin),
        ]),
      ),
    [currentYear, remainingLeaseMin, rows],
  );
  const comparisonRows = useMemo(() => buildShortlistComparisonRows(rankedRows), [rankedRows]);

  const effectiveExpandedKey =
    expandedKey === null
      ? null
      : rows.some((row) => row.item.addressKey === expandedKey)
        ? expandedKey
        : (rows[0]?.item.addressKey ?? null);

  const showCopied = useCallback(
    (key: string) => {
      clearCopiedTimer();
      setCopiedKey(key);
      copiedTimerRef.current = setTimeout(() => {
        setCopiedKey(null);
        copiedTimerRef.current = null;
      }, 2000);
    },
    [clearCopiedTimer],
  );

  const getRankingMetricLabel = useCallback(
    (row: ShortlistRow) => {
      if (compareMode === "target-gap") {
        if (row.item.targetPrice === null) {
          return t("shortlist.compare.metric.targetFit.noTarget");
        }
        return t("shortlist.compare.metric.targetFit.value", {
          value: formatCurrency(Math.abs(row.item.targetPrice - row.block.medianPrice), locale),
        });
      }

      if (compareMode === "median-asc" || compareMode === "median-desc") {
        return t("shortlist.compare.metric.price.value", {
          value: formatCurrency(row.block.medianPrice, locale),
        });
      }

      if (compareMode === "lease") {
        return t("shortlist.compare.metric.lease.value", {
          value: getLeaseYears(row),
        });
      }

      if (row.block.nearestMrt) {
        return t("shortlist.compare.metric.mrt.value", {
          value: formatMinutesWalk(row.block.nearestMrt.walkingTimeSeconds, t, locale),
        });
      }

      return t("shortlist.compare.metric.mrt.missing");
    },
    [compareMode, locale, t],
  );

  const shareUrl = useMemo(() => {
    const encoded = encodeShortlistForUrl(rows.map((row) => row.item));
    if (!encoded) {
      return "";
    }
    return buildShortlistShareUrl(
      encoded,
      filters,
      window.location.origin,
      window.location.pathname,
    );
  }, [filters, rows]);

  const shareBlocked = shareUrl === "";

  const csvExport = useMemo<ShortlistCsvExport>(
    () => ({
      filename: "hdb-shortlist.csv",
      getContent: () =>
        buildShortlistCsvContent(
          [
            t("shortlist.export.address"),
            t("shortlist.export.medianPrice"),
            t("shortlist.export.askingPrice"),
            t("shortlist.export.fairRangeLow"),
            t("shortlist.export.fairRangeMedian"),
            t("shortlist.export.fairRangeHigh"),
            t("shortlist.export.suggestedOfferCeiling"),
            t("shortlist.export.buyerOpeningOffer"),
            t("shortlist.export.valuationReceived"),
            t("shortlist.export.estimatedCov"),
            t("shortlist.export.viewingDate"),
            t("shortlist.export.decisionStatus"),
            t("shortlist.export.buyerNotes"),
            t("shortlist.export.pros"),
            t("shortlist.export.cons"),
            t("shortlist.export.renovation"),
            t("shortlist.export.noiseNotes"),
            t("shortlist.export.transportNotes"),
            t("shortlist.export.agentRemarks"),
            t("shortlist.export.targetPrice"),
            t("shortlist.export.schools1km"),
            t("shortlist.export.hawkers1km"),
            t("shortlist.export.supermarkets1km"),
            t("shortlist.export.parks1km"),
            t("shortlist.export.mrtDistance"),
            t("shortlist.export.notes"),
          ],
          rankedRows.map((row) => ({
            address: `${row.block.block} ${row.block.streetName}`,
            medianPrice: row.block.medianPrice,
            askingPrice: row.item.askingPrice ?? null,
            fairRangeLow: row.item.fairRangeLow ?? null,
            fairRangeMedian: row.item.fairRangeMedian ?? null,
            fairRangeHigh: row.item.fairRangeHigh ?? null,
            suggestedOfferCeiling: row.item.suggestedOfferCeiling ?? null,
            buyerOpeningOffer: row.item.buyerOpeningOffer ?? null,
            valuationReceived: row.item.valuationReceived ?? null,
            estimatedCov: row.item.estimatedCov ?? null,
            viewingDate: row.item.viewingDate ?? "",
            decisionStatus: row.item.decisionStatus ?? "",
            buyerNotes: row.item.buyerNotes ?? "",
            pros: row.item.pros ?? "",
            cons: row.item.cons ?? "",
            renovation: row.item.renovation ?? "",
            noiseNotes: row.item.noiseNotes ?? row.item.noise ?? "",
            transportNotes: row.item.transportNotes ?? row.item.transport ?? "",
            agentRemarks: row.item.agentRemarks ?? "",
            targetPrice: row.item.targetPrice,
            schools1km: row.comparison?.amenities.primarySchoolsWithin1km ?? "",
            hawkers1km: row.comparison?.amenities.hawkerCentresWithin1km ?? "",
            supermarkets1km: row.comparison?.amenities.supermarketsWithin1km ?? "",
            parks1km: row.comparison?.amenities.parksWithin1km ?? "",
            mrtDistanceMeters: row.block.nearestMrt?.distanceMeters ?? "",
            notes: row.item.notes || "",
          })),
        ),
    }),
    [rankedRows, t],
  );

  const copySummary = useCallback(() => {
    const header = `| Address | Median Price | Target Price | Lease | MRT | Schools (1km) | Hawkers (1km) |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`;
    const body = rows
      .map((row) => {
        const address = `${row.block.block} ${row.block.streetName}`;
        const median = formatCurrency(row.block.medianPrice, locale);
        const target =
          row.item.targetPrice !== null ? formatCurrency(row.item.targetPrice, locale) : "-";
        const lease = formatRemainingLease(row.block.leaseCommenceRange, t);
        const mrt = row.block.nearestMrt
          ? formatMinutesWalk(row.block.nearestMrt.walkingTimeSeconds, t, locale)
          : "-";
        const schools = row.comparison?.amenities.primarySchoolsWithin1km ?? "-";
        const hawkers = row.comparison?.amenities.hawkerCentresWithin1km ?? "-";
        return `| ${address} | ${median} | ${target} | ${lease} | ${mrt} | ${schools} | ${hawkers} |`;
      })
      .join("\n");

    navigator.clipboard?.writeText(`${header}\n${body}`)?.then(
      () => showCopied("summary"),
      () => {},
    );
  }, [locale, rows, showCopied, t]);

  const exportJson = useCallback(() => {
    const blob = new Blob(
      [
        JSON.stringify(
          rankedRows.map((row) => row.item),
          null,
          2,
        ),
      ],
      {
        type: "application/json",
      },
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hdb-shortlist.json";
    link.click();
    URL.revokeObjectURL(url);
  }, [rankedRows]);

  const highlights = useMemo<ShortlistHighlight[]>(() => {
    let bestValueRow: ShortlistRow | null = null;
    let longestLeaseRow: ShortlistRow | null = null;
    let closestMrtRow: ShortlistRow | null = null;

    let minPrice = Number.POSITIVE_INFINITY;
    let maxLease = Number.NEGATIVE_INFINITY;
    let minMrtDistance = Number.POSITIVE_INFINITY;

    for (const row of rows) {
      const price = row.block.medianPrice;
      if (!bestValueRow || price < minPrice) {
        bestValueRow = row;
        minPrice = price;
      }

      const lease = row.block.leaseCommenceRange[1];
      if (!longestLeaseRow || lease > maxLease) {
        longestLeaseRow = row;
        maxLease = lease;
      }

      const distance = row.block.nearestMrt?.distanceMeters ?? Number.POSITIVE_INFINITY;
      if (!closestMrtRow || distance < minMrtDistance) {
        closestMrtRow = row;
        minMrtDistance = distance;
      }
    }

    return [
      {
        label: t("shortlist.bestValue"),
        row: bestValueRow,
        sub: bestValueRow
          ? formatCompactCurrency(bestValueRow.block.medianPrice, locale)
          : t("shortlist.na"),
      },
      {
        label: t("shortlist.highlights.longestLease"),
        row: longestLeaseRow,
        sub: longestLeaseRow
          ? t("unit.years", { value: getLeaseYears(longestLeaseRow) })
          : t("shortlist.na"),
      },
      {
        label: t("shortlist.closestMrt"),
        row: closestMrtRow,
        sub: closestMrtRow?.block.nearestMrt
          ? formatMinutesWalk(closestMrtRow.block.nearestMrt.walkingTimeSeconds, t, locale)
          : t("shortlist.na"),
      },
    ];
  }, [locale, rows, t]);

  const trendChartRows = useMemo(() => rows.filter((row) => row.monthlyTrend.length > 0), [rows]);
  const compareChart = useMemo<ShortlistCompareChart | null>(() => {
    if (trendChartRows.length < 2) {
      return null;
    }

    const monthSet = new Set<string>();
    const seriesKeys: string[] = [];
    const priceMaps: Map<string, number>[] = [];

    for (const row of trendChartRows) {
      seriesKeys.push(`${row.block.block} ${row.block.streetName}`);
      const priceMap = new Map<string, number>();
      for (const point of row.monthlyTrend) {
        monthSet.add(point.month);
        if (point.medianPrice != null && !Number.isNaN(point.medianPrice)) {
          priceMap.set(point.month, point.medianPrice);
        }
      }
      priceMaps.push(priceMap);
    }

    const months = [...monthSet].sort();

    let maxPrice = 0;
    const data = months.map((month) => {
      const row: Record<string, string | number | undefined> = { month };
      for (let i = 0; i < seriesKeys.length; i++) {
        const price = priceMaps[i].get(month);
        if (price != null) {
          row[seriesKeys[i]] = price;
          if (price > maxPrice) maxPrice = price;
        } else {
          row[seriesKeys[i]] = undefined;
        }
      }
      return row;
    });
    const priceAxisWidth =
      maxPrice > 0 ? Math.max(48, formatCompactCurrency(maxPrice).length * 8 + 4) : 48;

    const palette = isDark
      ? ["#79a6ff", "#7ecb63", "#ffb86c", "#ff79c6"]
      : [PRIMARY_BLUE, "#3a8a6f", "#d97706", "#c026d3"];

    const colors = {
      popover: isDark ? "#191f1d" : "#ffffff",
      popoverForeground: isDark ? "#e4e7e4" : "#171c1f",
      border: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
      splitLine: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)",
      mutedForeground: isDark ? "#9baaa4" : "#6b7572",
    };

    return { data, seriesKeys, palette, colors, priceAxisWidth };
  }, [isDark, trendChartRows]);

  return {
    compareMode,
    setCompareMode,
    viewMode,
    setViewMode,
    copiedKey,
    shareError,
    setShareError,
    effectiveExpandedKey,
    setExpandedKey,
    pendingRemoval,
    undoRemoval,
    handleRemove,
    rankedRows,
    comparisonRows,
    leaseSignalsByAddressKey,
    shareUrl,
    shareBlocked,
    csvExport,
    copySummary,
    exportJson,
    highlights,
    compareChart,
    checklistState,
    toggleChecklist,
    getRankingMetricLabel,
  };
}

export type { CompareMode } from "@/features/shortlist/shortlist-ranking";
