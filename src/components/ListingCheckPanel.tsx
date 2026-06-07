import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Info,
  Scale,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompactCurrency, formatMonth, formatNumber } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import {
  assessAskingPrice,
  type AskingPriceAssessment,
} from "@/lib/transaction-analysis";
import { computeConfidence, type ConfidenceResult } from "@/lib/listing-confidence";
import { generateCaveats, type Caveat } from "@/lib/listing-caveats";
import { fetchAddressDetail } from "@/lib/data";
import type { AddressDetail, AddressDetailTransaction } from "@/types/data";
import type { ListingComparableSet, ComparableTransaction } from "../../shared/comparable-engine";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DistributionBar } from "@/components/DistributionBar";
import { ComparableTransactionsList } from "@/components/ComparableTransactionsList";
import { SearchCombobox } from "@/components/SearchCombobox";
import type { Suggestion } from "@/types/data";

// ── Props ───────────────────────────────────────────────────────────────────

type ListingCheckPanelProps = {
  selectedAddressKey: string | null;
  askingPrice: number | null;
  floorAreaSqm: number | null;
  flatType: string | null;
  storeyRange: string | null;
  leaseCommenceYear: number | null;
  onAddressSelect: (addressKey: string) => void;
  onAskingPriceChange: (price: number | null) => void;
  onFloorAreaChange: (sqm: number | null) => void;
  onFlatTypeChange: (flatType: string | null) => void;
  onStoreyRangeChange: (storeyRange: string | null) => void;
  onLeaseYearChange: (year: number | null) => void;
  onSaveToShortlist: () => void;
  onShare: () => void;
  savedToShortlist: boolean;
  referenceMonth?: string;
};

// ── Verdict themes ──────────────────────────────────────────────────────────

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

function formatSignedCurrency(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${formatCompactCurrency(Math.abs(value))}`;
}

function formatSignedPct(value: number) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

function confidenceBadgeVariant(level: ConfidenceResult["level"]): "default" | "secondary" | "destructive" | "outline" {
  switch (level) {
    case "high":
      return "default";
    case "medium":
      return "secondary";
    case "low":
      return "destructive";
  }
}

// ── Component ───────────────────────────────────────────────────────────────

export function ListingCheckPanel({
  selectedAddressKey,
  askingPrice,
  floorAreaSqm,
  flatType,
  storeyRange,
  leaseCommenceYear,
  onAddressSelect,
  onAskingPriceChange,
  onFloorAreaChange,
  onFlatTypeChange,
  onStoreyRangeChange,
  onLeaseYearChange,
  onSaveToShortlist,
  onShare,
  savedToShortlist,
  referenceMonth,
}: ListingCheckPanelProps) {
  const { locale, t } = useI18n();

  // ── Search combobox state ──────────────────────────────────────────────────
  const [searchValue, setSearchValue] = useState("");
  const [detail, setDetail] = useState<AddressDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(false);
  const [comparablesExpanded, setComparablesExpanded] = useState(false);
  const [comparableSet, setComparableSet] = useState<ListingComparableSet | null>(null);
  const [comparableSetLoading, setComparableSetLoading] = useState(false);
  const [comparableSetError, setComparableSetError] = useState(false);

  // ── Local input state (numbers typed as strings) ───────────────────────────
  const [askingPriceInput, setAskingPriceInput] = useState(() =>
    askingPrice != null ? String(askingPrice) : "",
  );
  const [floorAreaInput, setFloorAreaInput] = useState(() =>
    floorAreaSqm != null ? String(floorAreaSqm) : "",
  );
  const [leaseYearInput, setLeaseYearInput] = useState(() =>
    leaseCommenceYear != null ? String(leaseCommenceYear) : "",
  );

  // Sync props to local input state when they change externally (e.g. deep linking / URL load)
  const [prevAskingPrice, setPrevAskingPrice] = useState(askingPrice);
  if (askingPrice !== prevAskingPrice) {
    setPrevAskingPrice(askingPrice);
    setAskingPriceInput(askingPrice != null ? String(askingPrice) : "");
  }

  const [prevFloorAreaSqm, setPrevFloorAreaSqm] = useState(floorAreaSqm);
  if (floorAreaSqm !== prevFloorAreaSqm) {
    setPrevFloorAreaSqm(floorAreaSqm);
    setFloorAreaInput(floorAreaSqm != null ? String(floorAreaSqm) : "");
  }

  const [prevLeaseCommenceYear, setPrevLeaseCommenceYear] = useState(leaseCommenceYear);
  if (leaseCommenceYear !== prevLeaseCommenceYear) {
    setPrevLeaseCommenceYear(leaseCommenceYear);
    setLeaseYearInput(leaseCommenceYear != null ? String(leaseCommenceYear) : "");
  }

  const verdictRef = useRef<HTMLDivElement>(null);

  const handleCheckClick = useCallback(() => {
    setTimeout(() => {
      verdictRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  // ── Reset detail state during render when addressKey clears ──────────────
  // Following React's "You Might Not Need an Effect" pattern: adjust state on
  // prop change during render rather than in a cascading effect.
  if (!selectedAddressKey && (detail !== null || detailError || detailLoading || searchValue !== "")) {
    setDetail(null);
    setDetailError(false);
    setDetailLoading(false);
    setSearchValue("");
  }

  // Clear stale detail when the selected address changes
  const [prevSelectedAddressKey, setPrevSelectedAddressKey] = useState(selectedAddressKey);
  if (selectedAddressKey !== prevSelectedAddressKey) {
    setPrevSelectedAddressKey(selectedAddressKey);
    if (selectedAddressKey) {
      setDetail(null);
      setDetailError(false);
    }
  }

  // ── Fetch address detail when selection changes ───────────────────────────
  useEffect(() => {
    if (!selectedAddressKey) {
      return;
    }

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pending indicator for the async fetch this effect performs
    setDetailLoading(true);
    setDetailError(false);

    fetchAddressDetail(selectedAddressKey)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        if (data) {
          setSearchValue(`${data.summary.block} ${data.summary.streetName}`);
        }
        setDetailLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setDetail(null);
        setDetailError(true);
        setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAddressKey]);

  // ── Derived options from detail ───────────────────────────────────────────
  const flatTypeOptions = useMemo(() => {
    if (!detail) return [];
    return Array.from(new Set(detail.recentTransactions.map((tx) => tx.flatType)));
  }, [detail]);

  const storeyOptions = useMemo(() => {
    if (!detail) return [];
    return Array.from(new Set(detail.recentTransactions.map((tx) => tx.storeyRange))).sort();
  }, [detail]);

  // ── Initialize selections from detail options ─────────────────────────────
  useEffect(() => {
    if (flatTypeOptions.length > 0 && !flatTypeOptions.includes(flatType ?? "")) {
      onFlatTypeChange(flatTypeOptions[0] ?? null);
    }
    // Only auto-select on first load, not on every flatType external change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatTypeOptions]);

  useEffect(() => {
    if (storeyOptions.length > 0 && !storeyOptions.includes(storeyRange ?? "")) {
      onStoreyRangeChange(storeyOptions[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeyOptions]);

  // ── Parse numeric inputs from parent props ────────────────────────────────
  const resolvedAskingPrice = useMemo(() => {
    if (askingPrice != null) return askingPrice;
    const cleaned = askingPriceInput.replace(/[^\d.]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [askingPrice, askingPriceInput]);

  const resolvedFloorAreaSqm = useMemo(() => {
    if (floorAreaSqm != null) return floorAreaSqm;
    const cleaned = floorAreaInput.replace(/[^\d.]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [floorAreaSqm, floorAreaInput]);

  const resolvedLeaseYear = useMemo(() => {
    if (leaseCommenceYear != null) return leaseCommenceYear;
    const n = Number(leaseYearInput);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [leaseCommenceYear, leaseYearInput]);

  // ── Perform listing check via v2 comparable engine API ────────────────────
  // Replaces the v1 client-side findComparableTransactions with a cross-block
  // transaction search backed by the new /api/comparable-transactions endpoint.
  useEffect(() => {
    if (
      resolvedAskingPrice == null ||
      !detail ||
      !selectedAddressKey ||
      !flatType ||
      !storeyRange
    ) {
      setComparableSet(null);
      return;
    }

    let cancelled = false;
    setComparableSetLoading(true);
    setComparableSetError(false);

    const body = JSON.stringify({
      town: detail.summary.town,
      block: detail.summary.block,
      streetName: detail.summary.streetName,
      flatType,
      storeyRange,
      floorAreaSqm: resolvedFloorAreaSqm ?? detail.summary.floorAreaRange[1] ?? 0,
      leaseCommenceYear: resolvedLeaseYear ?? null,
      referenceMonth: referenceMonth ?? detail.summary.latestMonth,
    });

    fetch("/api/comparable-transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data: ListingComparableSet = await res.json();
        if (!cancelled) {
          setComparableSet(data);
          setComparableSetLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setComparableSet(null);
          setComparableSetError(true);
          setComparableSetLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    resolvedAskingPrice,
    resolvedFloorAreaSqm,
    resolvedLeaseYear,
    selectedAddressKey,
    flatType,
    storeyRange,
    detail,
    referenceMonth,
  ]);

  // ── Compute result from comparable set ────────────────────────────────────
  // ComparableTransaction satisfies the runtime interface of AddressDetailTransaction
  // for all fields read by assessAskingPrice, computeConfidence, and generateCaveats.
  type LocalResult = {
    assessment: AskingPriceAssessment;
    confidence: ConfidenceResult;
    caveats: Caveat[];
  };

  const result: LocalResult | null = useMemo(() => {
    if (
      !comparableSet ||
      comparableSet.comparables.length === 0 ||
      resolvedAskingPrice == null
    ) {
      return null;
    }

    const txs = comparableSet.comparables as unknown as AddressDetailTransaction[];

    const assessment = assessAskingPrice({
      askingPrice: resolvedAskingPrice,
      floorAreaSqm: resolvedFloorAreaSqm,
      comparables: txs,
    });

    if (!assessment) return null;

    const confidence = computeConfidence(txs, referenceMonth);

    const comparableLeaseYears: number[] = [];
    for (const tx of comparableSet.comparables) {
      if (tx.leaseCommenceDate != null) {
        comparableLeaseYears.push(tx.leaseCommenceDate);
      }
    }

    const localCaveats = generateCaveats({
      assessment,
      confidence,
      leaseCommenceYear: resolvedLeaseYear ?? undefined,
      comparableLeaseYears,
      referenceMonth,
    });

    // Merge API caveats (widening, low sample) with generated caveats
    const mergedCaveats: Caveat[] = [
      ...comparableSet.caveats.map((msg) => ({ severity: "warning" as const, message: msg })),
      ...localCaveats,
    ];

    return {
      assessment,
      confidence,
      caveats: mergedCaveats,
    };
  }, [comparableSet, resolvedAskingPrice, resolvedFloorAreaSqm, resolvedLeaseYear, referenceMonth]);

  const comparables: ComparableTransaction[] = comparableSet?.comparables ?? [];

  // ── Derive verdict theme ──────────────────────────────────────────────────
  const theme = result ? VERDICT_THEMES[result.assessment.verdict] : null;
  const styles = theme ? toneStyles(theme.tone) : toneStyles("muted");
  const VerdictIcon = theme?.icon ?? Sparkles;

  // ── SearchCombobox handlers ───────────────────────────────────────────────
  const handleSelectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      if (suggestion.group === "block") {
        onAddressSelect(suggestion.addressKey);
        setSearchValue(suggestion.label);
      }
    },
    [onAddressSelect],
  );

  // ── Input change handlers (delegate to parent when prop-driven) ───────────
  const handleAskingPriceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setAskingPriceInput(raw);
      const cleaned = raw.replace(/[^\d.]/g, "");
      const n = Number(cleaned);
      onAskingPriceChange(Number.isFinite(n) && n > 0 ? n : null);
    },
    [onAskingPriceChange],
  );

  const handleFloorAreaChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setFloorAreaInput(raw);
      const cleaned = raw.replace(/[^\d.]/g, "");
      const n = Number(cleaned);
      onFloorAreaChange(Number.isFinite(n) && n > 0 ? n : null);
    },
    [onFloorAreaChange],
  );

  const handleLeaseYearChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      setLeaseYearInput(raw);
      const n = Number(raw);
      onLeaseYearChange(Number.isFinite(n) && n > 0 ? n : null);
    },
    [onLeaseYearChange],
  );

  // ── Check button enabled ──────────────────────────────────────────────────
  const canCheck = selectedAddressKey != null && resolvedAskingPrice != null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section className="flex flex-col gap-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="rounded-lg bg-muted/10 p-4">
        <div className="mb-3 flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2 text-primary">
            <Scale data-icon className="size-4" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold tracking-tight">
              {t("check.title")}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("check.description")}
            </p>
          </div>
        </div>

        {/* ── Block search ─────────────────────────────────────────────── */}
        <div className="mb-4">
          <SearchCombobox
            value={searchValue}
            onValueChange={setSearchValue}
            onSelectSuggestion={handleSelectSuggestion}
            t={t}
            placeholder={t("check.blockPlaceholder")}
          />
        </div>

        {/* ── Block info ───────────────────────────────────────────────── */}
        {selectedAddressKey && detail && (
          <div className="mb-4 rounded-md bg-muted/20 px-3 py-2 text-xs">
            <span className="font-semibold text-foreground">
              {detail.summary.town}
            </span>
            <span className="mx-1.5 text-muted-foreground">·</span>
            <span className="text-muted-foreground">{detail.summary.block} {detail.summary.streetName}</span>
          </div>
        )}

        {/* ── Loading / error states ────────────────────────────────────── */}
        {selectedAddressKey && detailLoading && (
          <div className="mb-4 flex items-center gap-2 rounded-md bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <div className="size-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden="true" />
            <span>{t("filters.suggestLoading")}</span>
          </div>
        )}
        {selectedAddressKey && detailError && (
          <div className="mb-4 flex items-start gap-3 rounded-md border border-dashed border-border/50 p-4 text-xs text-muted-foreground">
            <AlertTriangle data-icon className="size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>{t("check.noDetail")}</span>
          </div>
        )}
        {selectedAddressKey && !detailLoading && !detailError && detail && detail.recentTransactions.length === 0 && (
          <div className="mb-4 flex items-start gap-3 rounded-md border border-dashed border-border/50 p-4 text-xs text-muted-foreground">
            <Info data-icon className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
            <span>{t("check.noDetail")}</span>
          </div>
        )}

        {/* ── Listing form ─────────────────────────────────────────────── */}
        {detail && detail.recentTransactions.length > 0 && (
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
                onChange={handleAskingPriceChange}
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
                onChange={handleFloorAreaChange}
                aria-label={t("askingCheck.floorArea")}
                className="h-10 text-base font-bold tabular-nums"
              />
            </label>
            {flatTypeOptions.length > 1 && (
              <label className="flex flex-col gap-1">
                <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                  {t("askingCheck.flatType")}
                </span>
                <Select
                  value={flatType ?? flatTypeOptions[0]}
                  onValueChange={(v) => onFlatTypeChange(v || null)}
                >
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
                <Select
                  value={storeyRange ?? storeyOptions[0]}
                  onValueChange={(v) => onStoreyRangeChange(v || null)}
                >
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
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                {t("check.leaseYear")}
              </span>
              <Input
                type="number"
                inputMode="numeric"
                enterKeyHint="done"
                autoComplete="off"
                placeholder={t("check.leaseYearPlaceholder")}
                value={leaseYearInput}
                onChange={handleLeaseYearChange}
                aria-label={t("check.leaseYear")}
                className="h-10 text-base font-bold tabular-nums"
              />
            </label>
          </div>
        )}

        {/* ── Check button ─────────────────────────────────────────────── */}
        {detail && detail.recentTransactions.length > 0 && (
          <div className="mt-4">
            <Button
              type="button"
              className="w-full"
              disabled={!canCheck || comparableSetLoading}
              onClick={handleCheckClick}
            >
              {comparableSetLoading ? t("check.loading") : t("check.checkButton")}
            </Button>
          </div>
        )}
      </div>

      {/* ── API loading state ──────────────────────────────────────────── */}
      {comparableSetLoading && (
        <div className="flex items-center gap-2 rounded-md bg-muted/20 p-3 text-xs text-muted-foreground">
          <div className="size-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden="true" />
          <span>{t("check.analyzingComparables")}</span>
        </div>
      )}

      {/* ── API error state ────────────────────────────────────────────── */}
      {comparableSetError && !comparableSetLoading && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <AlertTriangle data-icon className="size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-destructive">{t("check.apiError")}</span>
            <span className="text-muted-foreground">{t("check.apiErrorDetail")}</span>
          </div>
        </div>
      )}

      {/* ── No block selected hint ─────────────────────────────────────── */}
      {!selectedAddressKey && (
        <div className="flex items-start gap-3 rounded-md border border-dashed border-border/50 p-4 text-xs text-muted-foreground">
          <Info data-icon className="size-4 shrink-0 text-muted-foreground/70" aria-hidden="true" />
          <span>{t("check.selectBlockHint")}</span>
        </div>
      )}

      {/* ── Verdict card ───────────────────────────────────────────────── */}
      {result && theme && resolvedAskingPrice != null && (
        <Card ref={verdictRef} className={cn("border-2 shadow-none", styles.border, styles.bg)}>
          <CardContent className="flex flex-col gap-4 p-4">
            {/* Verdict badge + confidence */}
            <div className="flex items-center gap-3">
              <div className={cn("rounded-md p-2", styles.bg)}>
                <VerdictIcon data-icon className={cn("size-5", styles.text)} aria-hidden="true" />
              </div>
              <div className="flex-1">
                <div className={cn("text-sm font-extrabold uppercase tracking-wider", styles.text)}>
                  {t(theme.i18nKey)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t("check.compareCount", {
                    count: result.assessment.comparableCount,
                  })}
                  {result.assessment.summary.latestMonth
                    ? ` · ${t("askingCheck.latest", {
                        month: formatMonth(result.assessment.summary.latestMonth, locale),
                      })}`
                    : ""}
                </div>
              </div>
              <Badge variant={confidenceBadgeVariant(result.confidence.level)} className="h-5 font-mono text-[0.6rem]">
                {t("check.confidence.label", {
                  level: t(`check.confidence.${result.confidence.level}`),
                })}
              </Badge>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-1 gap-2 rounded-md bg-card/70 p-3 text-xs sm:grid-cols-2">
              <DataRow
                label={t("check.fairRange")}
                value={`${formatCompactCurrency(result.assessment.summary.p25Price)} – ${formatCompactCurrency(result.assessment.summary.p75Price)}`}
              />
              <DataRow
                label={t("check.askingPerSqm")}
                value={
                  result.assessment.askingPricePerSqm != null
                    ? t("unit.sqmCurrency", {
                        value: formatNumber(result.assessment.askingPricePerSqm, 0, locale),
                      })
                    : t("askingCheck.requireSqm")
                }
              />
              <DataRow
                label={t("check.medianPerSqm")}
                value={t("unit.sqmCurrency", {
                  value: formatNumber(result.assessment.summary.medianPricePerSqm, 0, locale),
                })}
              />
              <DataRow
                label={t("check.p25")}
                value={formatCompactCurrency(result.assessment.summary.p25Price)}
              />
              <DataRow
                label={t("check.p75")}
                value={formatCompactCurrency(result.assessment.summary.p75Price)}
              />
              {result.assessment.pricePerSqmDeltaPct != null && (
                <DataRow
                  label={t("check.psmDelta")}
                  value={formatSignedPct(result.assessment.pricePerSqmDeltaPct)}
                  emphasis={
                    result.assessment.pricePerSqmDeltaPct > 5
                      ? "negative"
                      : result.assessment.pricePerSqmDeltaPct < -5
                        ? "positive"
                        : null
                  }
                />
              )}
              <DataRow
                label={t("check.vsMedian")}
                value={formatSignedCurrency(result.assessment.deltaVsMedian)}
              />
              <DataRow
                label={t("check.percentile")}
                value={t("askingCheck.percentileValue", {
                  value: Math.round(result.assessment.percentileAmongComparables),
                })}
              />
            </div>

            {/* Distribution bar */}
            <DistributionBar assessment={result.assessment} askingPrice={resolvedAskingPrice} />

            {/* Caveats */}
            {result.caveats.length > 0 && (
              <div className="rounded-md bg-muted/20 p-3">
                <h4 className="mb-2 text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                  {t("check.caveatsTitle")}
                </h4>
                <ul className="flex flex-col gap-1.5">
                  {result.caveats.map((caveat: Caveat, index: number) => (
                    <li
                      key={index}
                      className={cn(
                        "flex items-start gap-2 rounded px-2 py-1 text-xs",
                        caveat.severity === "warning" && "bg-warning/5 text-warning",
                        caveat.severity === "info" && "bg-muted/30 text-muted-foreground",
                      )}
                    >
                      {caveat.severity === "warning" ? (
                        <AlertTriangle data-icon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                      ) : (
                        <Info data-icon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                      )}
                      <span>{caveat.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Comparable transactions list */}
            {comparables.length > 0 && (
              <ComparableTransactionsList
                transactions={comparables.map((tx) => ({
                  id: tx.transactionId,
                  month: tx.month,
                  flatType: tx.flatType,
                  storeyRange: tx.storeyRange,
                  floorAreaSqm: tx.floorAreaSqm,
                  flatModel: "",
                  leaseCommenceDate: tx.leaseCommenceDate ?? 0,
                  remainingLease: "",
                  resalePrice: tx.resalePrice,
                  pricePerSqm: tx.pricePerSqm,
                  pricePerSqft: null,
                }))}
                expanded={comparablesExpanded}
                onToggle={() => setComparablesExpanded((prev) => !prev)}
              />
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={savedToShortlist ? "secondary" : "outline"}
                size="sm"
                className="flex-1"
                onClick={onSaveToShortlist}
                disabled={savedToShortlist}
              >
                {savedToShortlist ? t("check.saved") : t("check.saveToShortlist")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={onShare}
              >
                {t("check.share")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

// ── DataRow helper ──────────────────────────────────────────────────────────

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
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-muted-foreground">{label}</span>
      <span
        className={cn(
          "shrink-0 font-mono font-bold tabular-nums",
          emphasis === "positive" && "text-success",
          emphasis === "negative" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}
