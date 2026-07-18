import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bookmark, Info, List, Search, Scale, Sparkles } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { formatCompactCurrency, formatMonth, formatNumber } from "@/shared/lib/format";
import { useI18n } from "@/shared/lib/i18n";
import type { ConfidenceAssessment } from "../../../shared/confidence-system";
import type { Caveat } from "../../../shared/caveat-codes";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DistributionBar } from "./DistributionBar";
import { ComparableEvidenceTable } from "./ComparableEvidenceTable";
import { SearchCombobox } from "@/components/SearchCombobox";
import type { Suggestion } from "@/types/data";
import { QUALITY_LABEL_KEYS, QUALITY_HINT_KEYS } from "@/shared/lib/listing-quality";
import { parseLeaseCommenceYearInput, parsePositiveDecimalInput } from "./listingCheckInputs";
import { useListingCheckAnalysis } from "./useListingCheckAnalysis";
import { useListingFactInput } from "./useListingFactInput";
import {
  formatSignedListingCurrency,
  formatSignedListingPercent,
  getListingVerdictStyles,
  LISTING_VERDICT_THEMES,
} from "./listingVerdictPresentation";

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
  onUseSampleCheck: () => void;
  onOpenCandidates: () => void;
  onOpenShortlist: () => void;
  onSaveToShortlist: () => void;
  onShare: () => void;
  savedToShortlist: boolean;
  referenceMonth?: string;
};

function confidenceBadgeVariant(
  level: ConfidenceAssessment["level"],
): "default" | "secondary" | "destructive" | "outline" {
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
  onUseSampleCheck,
  onOpenCandidates,
  onOpenShortlist,
  onSaveToShortlist,
  onShare,
  savedToShortlist,
  referenceMonth,
}: ListingCheckPanelProps) {
  const { locale, t } = useI18n();

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const askingPriceInputRef = useRef<HTMLInputElement | null>(null);
  const verdictRef = useRef<HTMLDivElement>(null);

  // ── Search combobox state ──────────────────────────────────────────────────
  const [searchValue, setSearchValue] = useState("");

  // ── Draft listing-fact inputs ──────────────────────────────────────────────
  const askingPriceField = useListingFactInput({
    value: askingPrice,
    parse: parsePositiveDecimalInput,
    onCommit: onAskingPriceChange,
  });
  const floorAreaField = useListingFactInput({
    value: floorAreaSqm,
    parse: parsePositiveDecimalInput,
    onCommit: onFloorAreaChange,
  });
  const leaseYearField = useListingFactInput({
    value: leaseCommenceYear,
    parse: parseLeaseCommenceYearInput,
    onCommit: onLeaseYearChange,
  });

  // ── Analysis (detail + comparables + result) ───────────────────────────────
  const analysis = useListingCheckAnalysis({
    selectedAddressKey,
    askingPrice,
    floorAreaSqm,
    flatType,
    storeyRange,
    leaseCommenceYear,
    referenceMonth,
    onFlatTypeChange,
    onStoreyRangeChange,
  });

  const {
    detail,
    detailLoading,
    detailError,
    selectedBlockLabel,
    flatTypeOptions,
    storeyOptions,
    comparableSet,
    comparableSetLoading,
    comparableSetError,
    result,
    comparables,
    adjustmentMeta,
    qualityTag,
    evidenceCaveats,
  } = analysis;

  // Keep search label in sync with loaded detail / cleared selection without
  // render-phase state updates.
  useEffect(() => {
    if (!selectedAddressKey) {
      setSearchValue("");
      return;
    }
    if (selectedBlockLabel) {
      setSearchValue(selectedBlockLabel);
    }
  }, [selectedAddressKey, selectedBlockLabel]);

  const handleCheckClick = useCallback(() => {
    setTimeout(() => {
      verdictRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }, []);

  // ── Derive verdict theme ──────────────────────────────────────────────────
  const theme = result ? LISTING_VERDICT_THEMES[result.assessment.verdict] : null;
  const styles = theme ? getListingVerdictStyles(theme.tone) : getListingVerdictStyles("muted");
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

  // ── Check button enabled ──────────────────────────────────────────────────
  const canCheck = selectedAddressKey != null && askingPrice != null;

  const handlePrimaryAction = useCallback(() => {
    if (!selectedAddressKey) {
      searchInputRef.current?.focus();
      return;
    }

    if (!comparableSetLoading && canCheck) {
      handleCheckClick();
      return;
    }

    askingPriceInputRef.current?.focus();
  }, [canCheck, comparableSetLoading, selectedAddressKey, handleCheckClick]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section className="flex flex-col gap-5">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="rounded-none bg-muted/10 p-4">
        <div className="mb-3 flex items-start gap-3">
          <div className="rounded-none bg-primary/10 p-2 text-primary">
            <Scale data-icon className="size-4" aria-hidden="true" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold tracking-tight">{t("check.primaryAction")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("check.valueStatement")}</p>
            <p className="mt-1 text-[length:var(--text-xs)] font-medium text-success">
              {t("check.trustStatement")}
            </p>
          </div>
        </div>

        <div className="grid gap-2">
          <Button
            type="button"
            size="lg"
            className="h-12 w-full justify-start"
            onClick={handlePrimaryAction}
          >
            <Search data-icon className="size-4" aria-hidden="true" />
            <span>{t("check.primaryAction")}</span>
          </Button>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-start"
              onClick={onOpenCandidates}
            >
              <List data-icon className="size-4" aria-hidden="true" />
              <span>{t("check.findCandidates")}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-start"
              onClick={onOpenShortlist}
            >
              <Bookmark data-icon className="size-4" aria-hidden="true" />
              <span>{t("check.compareShortlist")}</span>
            </Button>
          </div>
        </div>

        {/* ── Block search ─────────────────────────────────────────────── */}
        <div className="mb-4">
          <SearchCombobox
            value={searchValue}
            onValueChange={setSearchValue}
            onSelectSuggestion={handleSelectSuggestion}
            ref={searchInputRef}
            t={t}
            placeholder={t("check.blockPlaceholder")}
          />
        </div>

        {/* ── Block info ───────────────────────────────────────────────── */}
        {selectedAddressKey && detail && (
          <div className="mb-4 rounded-none bg-muted/20 px-3 py-2 text-xs">
            <span className="font-semibold text-foreground">{detail.summary.town}</span>
            <span className="mx-1.5 text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {detail.summary.block} {detail.summary.streetName}
            </span>
          </div>
        )}

        {/* ── Loading / error states ────────────────────────────────────── */}
        {selectedAddressKey && detailLoading && (
          <div className="mb-4 flex items-center gap-2 rounded-none bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <div
              className="size-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
              aria-hidden="true"
            />
            <span>{t("filters.suggestLoading")}</span>
          </div>
        )}
        {selectedAddressKey && detailError && (
          <div className="mb-4 flex items-start gap-3 rounded-none border border-dashed border-border/50 p-4 text-xs text-muted-foreground">
            <AlertTriangle data-icon className="size-4 shrink-0 text-warning" aria-hidden="true" />
            <span>{t("check.noDetail")}</span>
          </div>
        )}
        {selectedAddressKey &&
          !detailLoading &&
          !detailError &&
          detail &&
          detail.recentTransactions.length === 0 && (
            <div className="mb-4 flex items-start gap-3 rounded-none border border-dashed border-border/50 p-4 text-xs text-muted-foreground">
              <Info
                data-icon
                className="size-4 shrink-0 text-muted-foreground/70"
                aria-hidden="true"
              />
              <span>{t("check.noDetail")}</span>
            </div>
          )}

        {/* ── Listing form ─────────────────────────────────────────────── */}
        {detail && detail.recentTransactions.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="v2-field-label">{t("askingCheck.askingPrice")}</span>
              <Input
                ref={askingPriceInputRef}
                type="number"
                inputMode="numeric"
                enterKeyHint="done"
                autoComplete="off"
                placeholder={t("askingCheck.askingPricePlaceholder")}
                value={askingPriceField.value}
                onChange={askingPriceField.onChange}
                onFocus={askingPriceField.onFocus}
                onBlur={askingPriceField.onBlur}
                aria-label={t("askingCheck.askingPrice")}
                className="h-10 text-base font-bold tabular-nums"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="v2-field-label">{t("askingCheck.floorArea")}</span>
              <Input
                type="number"
                inputMode="numeric"
                enterKeyHint="done"
                autoComplete="off"
                placeholder={t("askingCheck.floorAreaPlaceholder")}
                value={floorAreaField.value}
                onChange={floorAreaField.onChange}
                onFocus={floorAreaField.onFocus}
                onBlur={floorAreaField.onBlur}
                aria-label={t("askingCheck.floorArea")}
                className="h-10 text-base font-bold tabular-nums"
              />
            </label>
            {flatTypeOptions.length > 1 && (
              <label className="flex flex-col gap-1">
                <span className="v2-field-label">{t("askingCheck.flatType")}</span>
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
                <span className="v2-field-label">{t("askingCheck.storey")}</span>
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
              <span className="v2-field-label">{t("check.leaseYear")}</span>
              <Input
                type="number"
                inputMode="numeric"
                enterKeyHint="done"
                autoComplete="off"
                placeholder={t("check.leaseYearPlaceholder")}
                value={leaseYearField.value}
                onChange={leaseYearField.onChange}
                onFocus={leaseYearField.onFocus}
                onBlur={leaseYearField.onBlur}
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
        <div className="flex items-center gap-2 rounded-none bg-muted/20 p-3 text-xs text-muted-foreground">
          <div
            className="size-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
            aria-hidden="true"
          />
          <span>{t("check.analyzingComparables")}</span>
        </div>
      )}

      {/* ── API error state ────────────────────────────────────────────── */}
      {comparableSetError && !comparableSetLoading && (
        <div className="flex items-start gap-3 rounded-none border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <AlertTriangle
            data-icon
            className="size-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-destructive">{t("check.apiError")}</span>
            <span className="text-muted-foreground">{t("check.apiErrorDetail")}</span>
          </div>
        </div>
      )}

      {/* ── No block selected hint ─────────────────────────────────────── */}
      {!selectedAddressKey && (
        <div className="flex flex-col gap-3 rounded-none border border-dashed border-border/50 p-4 text-xs text-muted-foreground">
          <div className="flex items-start gap-3">
            <Info
              data-icon
              className="size-4 shrink-0 text-muted-foreground/70"
              aria-hidden="true"
            />
            <span>{t("check.selectBlockHint")}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onUseSampleCheck}
          >
            {t("check.sampleListingCheck")}
          </Button>
        </div>
      )}

      {/* ── Verdict card ───────────────────────────────────────────────── */}
      {result && theme && askingPrice != null && (
        <Card
          ref={verdictRef}
          className={cn("border-2 shadow-none", styles.border, styles.bg)}
          data-testid="listing-check-verdict"
        >
          <CardContent className="flex flex-col gap-4 p-4">
            {/* Verdict badge + confidence */}
            <div className="flex items-center gap-3">
              <div className={cn("rounded-none p-2", styles.bg)}>
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
              <div className="flex min-w-0 flex-col gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant={confidenceBadgeVariant(result.confidence.level)}
                      className="h-5 w-fit font-mono text-[length:var(--text-xs)]"
                      data-testid="listing-check-confidence-badge"
                    >
                      {t("check.confidence.label", {
                        level: t(`check.confidence.${result.confidence.level}`),
                      })}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-60 text-xs">
                    {result.confidence.summary}
                  </TooltipContent>
                </Tooltip>
                <p
                  className="text-[length:var(--text-xs)] leading-snug text-muted-foreground sm:hidden"
                  data-testid="listing-check-confidence-summary"
                >
                  {result.confidence.summary}
                </p>
                {qualityTag ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="h-5 text-[length:var(--text-xs)] font-bold uppercase tracking-wider"
                      >
                        {t(QUALITY_LABEL_KEYS[qualityTag])}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-60 text-xs">
                      {t(QUALITY_HINT_KEYS[qualityTag])}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-1 gap-2 rounded-none bg-card p-3 text-xs sm:grid-cols-2">
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
                  value={formatSignedListingPercent(result.assessment.pricePerSqmDeltaPct)}
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
                value={formatSignedListingCurrency(result.assessment.deltaVsMedian)}
              />
              <DataRow
                label={t("check.percentile")}
                value={t("askingCheck.percentileValue", {
                  value: Math.round(result.assessment.percentileAmongComparables),
                })}
              />
            </div>

            {/* Distribution bar */}
            <DistributionBar assessment={result.assessment} askingPrice={askingPrice} />

            {/* Caveats */}
            {result.caveats.length > 0 && (
              <div className="rounded-none bg-muted/20 p-3">
                <h4 className="mb-2 v2-field-label">{t("check.caveatsTitle")}</h4>
                <ul className="flex flex-col gap-1.5">
                  {result.caveats.map((caveat: Caveat) => (
                    <li
                      key={caveat.code}
                      className={cn(
                        "flex items-start gap-2 rounded px-2 py-1 text-xs",
                        caveat.severity === "critical" && "bg-destructive/10 text-destructive",
                        caveat.severity === "warning" && "bg-warning/5 text-warning",
                        caveat.severity === "info" && "bg-muted/30 text-muted-foreground",
                      )}
                    >
                      {caveat.severity === "critical" || caveat.severity === "warning" ? (
                        <AlertTriangle
                          data-icon
                          className="mt-0.5 size-3 shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <Info data-icon className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                      )}
                      <span>{caveat.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
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

      {/* ── Evidence table ─────────────────────────────────────────────── */}
      {comparableSet && !comparableSetLoading && !comparableSetError && (
        <div data-testid="listing-check-evidence">
          <ComparableEvidenceTable
            comparables={comparables}
            referenceMonth={referenceMonth ?? detail?.summary?.latestMonth ?? ""}
            widenedSearch={comparableSet.widenedSearch}
            caveats={evidenceCaveats}
            adjustmentApplied={adjustmentMeta?.adjustmentApplied ?? false}
          />
        </div>
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
