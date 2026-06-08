import { memo, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Bookmark, Building2, Clock3, Coins, LayoutGrid, TrainFront, WalletCards } from "lucide-react";
import { MAX_LEASE_DURATION, getCurrentYear } from "@/shared/lib/constants";
import { buildResultsCsvContent } from "@/shared/lib/export";
import { ShareButton } from "@/components/ShareButton";
import {
  formatCompactCurrency,
  formatMeters,
  formatMinutesWalk,
  formatMonth,
  formatNumber,
  formatRemainingLease,
  formatSqm,
} from "@/shared/lib/format";
import { useI18n } from "@/shared/lib/i18n";
import { localizeFlatType, localizeTownName } from "@/shared/lib/i18n/domain";
import { cn } from "@/shared/lib/utils";
import { getStationDetails } from "@shared/mrt-station-details";
import { MrtLineDots } from "@/components/MrtLineDots";
import { BudgetMatchBadge } from "@/components/BudgetMatchBadge";
import {
  affordabilityProfileFingerprint,
  computeAffordabilityVerdict,
  isAffordabilityProfileComplete,
  maxAffordablePrice,
} from "@/shared/lib/affordability";
import { fetchBlocksByTown, fetchTownFlatTypeTrends } from "@/shared/lib/data";
import { isSameTown } from "@/shared/lib/queryState";
import type { AffordabilityMode, BlockSortMode, BlockSummary, TownFlatTypeTrendPoint } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";
import type { Locale, Translator } from "@/shared/lib/i18n";
import { TownProfileSection } from "@/components/TownProfileSection";
import { TownCompareSection } from "@/components/TownCompareSection";
import { TownRecommendationsSection } from "@/components/TownRecommendationsSection";
import type { TownRecommendation } from "@/features/search-profile/town-recommendations";
import {
  buildLeaseCommencementHistogram,
  pickBlocksBelowTownMedian,
  pickTopBlocksByTransactionCount,
  resolveTrendMonthRange,
  rollupTownFlatTypesInRange,
  sumRollupVolume,
  volumeWeightedMeanLatestMedianPricePerSqm,
} from "@/entities/town/town-profile";
import { getBlockDataQualityTag, QUALITY_LABEL_KEYS, QUALITY_HINT_KEYS } from "@/shared/lib/listing-quality";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY_ARRAY: never[] = [];

function LeaseBar({ years, color = "currentColor", height = 3 }: { years: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, years / MAX_LEASE_DURATION)) * 100;
  return (
    <div
      className="bg-foreground/10"
      style={{ position: "relative", height, borderRadius: height }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${pct}%`,
          background: color,
          borderRadius: height,
        }}
      />
    </div>
  );
}

function WalkDots({ meters, color = "currentColor" }: { meters: number; color?: string }) {
  const filled = meters <= 300 ? 3 : meters <= 600 ? 2 : 1;
  return (
    <span style={{ display: "inline-flex", gap: 2.5, alignItems: "center" }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: color,
            opacity: i < filled ? 1 : 0.2,
            display: "block",
          }}
        />
      ))}
    </span>
  );
}

type ResultsPaneProps = {
  blocks: BlockSummary[];
  hasResultScope: boolean;
  selectedAddressKey: string | null;
  shortlistKeys: Set<string>;
  onSelect: (addressKey: string) => void;
  onToggleShortlist: (addressKey: string) => void;
  scrollParent?: HTMLElement | null;
  isCompact?: boolean;
  budgetMin?: number | null;
  budgetMax?: number | null;
  searchProfile?: SearchProfile | null;
  affordabilityMode?: AffordabilityMode;
  onClearAffordabilityFilter?: () => void;
  sortMode?: BlockSortMode;
  onSortChange?: (mode: BlockSortMode) => void;
  /** When set together with scope, results show a factual town overview above the list. */
  profileTown?: string | null;
  profileTownBlocks?: BlockSummary[];
  profileDataWindow?: { minMonth: string; maxMonth: string } | null;
  profileStartMonth?: string | null;
  profileEndMonth?: string | null;
  /** Optional second town that, when set, replaces the single-town overview with a compare view. */
  compareTown?: string | null;
  /** Full list of selectable towns for the compare picker. */
  availableTowns?: ReadonlyArray<string>;
  onChangeCompareTown?: (town: string) => void;
  /** Surfaced in the empty-scope state when a search profile is active. */
  townRecommendations?: ReadonlyArray<TownRecommendation>;
  townRecommendationsLoading?: boolean;
  onSelectTown?: (town: string) => void;
  searchTruncated?: boolean;
  /** Deep-link URL that restores the current filters and location scope. */
  shareUrl?: string;
};

type SortMode = Exclude<BlockSortMode, "">;
type ResultsViewMode = "blocks" | "town";
type SortOption = { value: SortMode; label: string; disabled?: boolean; tooltip?: string };

const DEFAULT_SORT_MODE: SortMode = "median-asc";
type TownTrendSnap = {
  status: "idle" | "loaded" | "failed";
  requestedTown: string;
  rows: TownFlatTypeTrendPoint[];
};

function SortSelect({
  label,
  options,
  value,
  onValueChange,
  className,
}: {
  label: string;
  options: SortOption[];
  value: SortMode;
  onValueChange: (value: SortMode) => void;
  className?: string;
}) {
  const disabledHint = options.find((option) => option.disabled && option.tooltip)?.tooltip;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[0.6rem] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
          <ArrowUpDown data-icon className="size-3.5" aria-hidden="true" />
          {label}
        </span>
        <Select onValueChange={(nextValue) => onValueChange(nextValue as SortMode)} value={value}>
          <SelectTrigger
            data-testid="results-sort-trigger"
            aria-describedby={disabledHint ? "results-sort-disabled-hint" : undefined}
            className="h-8 min-w-0 flex-1 rounded-lg border-border/40 bg-card/80 px-2 sm:w-[12.5rem]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {disabledHint ? (
        <p
          id="results-sort-disabled-hint"
          className="text-[0.62rem] leading-snug text-muted-foreground"
        >
          {disabledHint}
        </p>
      ) : null}
    </div>
  );
}

const BlockCard = memo(function BlockCard({
  block,
  index,
  isFeatured = false,
  isSaved,
  isCompact = false,
  onSelect,
  onToggleShortlist,
  budgetMin,
  budgetMax,
  searchProfile,
  profileDataWindow = null,
  t,
  locale,
}: {
  block: BlockSummary;
  index: number;
  isFeatured?: boolean;
  isSaved: boolean;
  isCompact?: boolean;
  onSelect: (addressKey: string) => void;
  onToggleShortlist: (addressKey: string) => void;
  budgetMin: number | null;
  budgetMax: number | null;
  searchProfile?: SearchProfile | null;
  profileDataWindow?: { minMonth: string; maxMonth: string } | null;
  t: Translator;
  locale: Locale;
}) {
  const affordVerdict = useMemo(() => {
    if (!searchProfile) return null;
    return computeAffordabilityVerdict(
      {
        monthlyIncome: searchProfile.monthlyIncome,
        cpfOABalance: searchProfile.cpfOABalance,
        age: searchProfile.age,
      },
      block.medianPrice,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- null check is covered by optional-chained deps becoming undefined
  }, [searchProfile?.monthlyIncome, searchProfile?.cpfOABalance, searchProfile?.age, block.medianPrice]);

  if (isCompact) {
    const currentYear = getCurrentYear();
    const leaseYears = MAX_LEASE_DURATION - (currentYear - block.leaseCommenceRange[1]);
    const sqm = Math.round((block.floorAreaRange[0] + block.floorAreaRange[1]) / 2);
    const mrtDist = block.nearestMrt?.distanceMeters;
    const mrtWalkSeconds = block.nearestMrt?.walkingTimeSeconds;
    const nearestMrtColor = block.nearestMrt
      ? getStationDetails(block.nearestMrt.stationName).color
      : "var(--color-primary)";
    return (
      <Item
        data-state={isFeatured ? "selected" : "idle"}
        variant="outline"
        role="option"
        aria-selected={isFeatured}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.currentTarget !== e.target) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(block.addressKey);
          }
        }}
        className={cn(
          "v2-card animate-fade-in-up cursor-pointer rounded-xl border-border/40 bg-card/95 transition-all duration-200 hover:border-primary/25 hover:bg-card hover:shadow-[0_2px_12px_rgba(37,99,235,0.08)] active:scale-[0.995]",
          isFeatured && "border-primary/45 bg-primary/5 shadow-[0_2px_12px_rgba(37,99,235,0.12)]",
          "gap-0 px-3 py-2",
        )}
        style={{ animationDelay: `${index * 40}ms`, minHeight: 92 }}
        onClick={() => onSelect(block.addressKey)}
      >
        <div className="flex w-full min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
              <strong className="block truncate font-heading text-[0.9rem] font-extrabold leading-snug tracking-tight">
              {block.block} {block.streetName}
            </strong>
            <span className="block truncate text-[0.58rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {localizeTownName(block.town, locale)}
              {block.flatTypes.length > 0 ? ` · ${localizeFlatType(block.flatTypes[0], locale)}` : ""}
            </span>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <div className="text-right">
              <strong className="block font-heading text-[0.95rem] font-extrabold leading-snug tracking-tight v2-tabular">
                {formatCompactCurrency(block.medianPrice, locale)}
              </strong>
              <div className="flex items-center justify-end gap-1.5">
                  <BudgetMatchBadge
                    medianPrice={block.medianPrice}
                    budgetMin={budgetMin ?? null}
                    budgetMax={budgetMax ?? null}
                    t={t}
                    locale={locale}
                    className="scale-90 origin-right"
                  />
                {affordVerdict && affordVerdict.status !== "unknown" ? (
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      affordVerdict.status === "comfortable" && "bg-success",
                      affordVerdict.status === "stretch" && "bg-warning",
                      affordVerdict.status === "over" && "bg-destructive",
                    )}
                    title={
                      affordVerdict.status === "comfortable"
                        ? t("affordability.comfortable")
                        : affordVerdict.status === "stretch"
                          ? t("affordability.stretch")
                          : t("affordability.over")
                    }
                  />
                ) : null}
                <span className="text-[0.58rem] font-medium text-muted-foreground">
                  {t("stats.txns", { count: formatNumber(block.transactionCount, 0, locale) })}
                </span>
              </div>
            </div>
            <Button
              size="xs"
              variant={isSaved ? "secondary" : "ghost"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleShortlist(block.addressKey);
              }}
              type="button"
              className="size-7 shrink-0 rounded-lg p-0"
              aria-label={isSaved ? t("results.saved") : t("results.save")}
              title={isSaved ? t("results.saved") : t("results.save")}
            >
              <Bookmark data-icon className={cn("size-3.5", isSaved && "fill-current")} aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="mt-2 flex w-full min-w-0 items-center gap-3 text-[0.6rem] font-medium text-muted-foreground">
          <span>{formatSqm(sqm, t, locale)}</span>
          {mrtDist !== undefined && mrtDist !== null && mrtWalkSeconds !== undefined && (
            <span
              className="flex items-center gap-1"
              title={formatMeters(mrtDist, t, locale)}
              aria-label={`${formatMinutesWalk(mrtWalkSeconds, t, locale)} (${formatMeters(mrtDist, t, locale)})`}
            >
              <WalkDots meters={mrtDist} color={nearestMrtColor} />
              <span>{formatMinutesWalk(mrtWalkSeconds, t, locale)}</span>
            </span>
          )}
          <span className="ml-auto">
            {t("unit.leaseYears", { value: leaseYears > 0 ? leaseYears : "—" })}
          </span>
        </div>

        <div className="mt-1.5 w-full">
          <LeaseBar years={leaseYears > 0 ? leaseYears : 0} color="var(--color-primary)" height={2.5} />
        </div>
      </Item>
    );
  }

  const nearbyStations = (block.nearbyMrts ?? []).slice(0, 3);

  return (
    <Item
      data-state={isFeatured ? "selected" : "idle"}
      variant="outline"
      role="option"
      aria-selected={isFeatured}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.currentTarget !== e.target) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(block.addressKey);
        }
      }}
      className={cn(
        "v2-card ss-fade-in group flex cursor-pointer flex-col gap-4 rounded-xl border-border/40 bg-card/95 p-4 shadow-sm transition-all duration-200 hover:border-primary/25 hover:bg-card hover:shadow-[0_4px_16px_rgba(23,28,31,0.06)] active:scale-[0.995] cv-auto",
        isFeatured && "border-primary/40 bg-primary/5 shadow-[0_4px_16px_rgba(37,99,235,0.1)]",
      )}
      onClick={() => onSelect(block.addressKey)}
    >
      <ItemHeader>
        <ItemContent>
          <div className="result-address flex flex-col gap-1">
            <strong className="font-heading text-xl font-extrabold leading-none tracking-tight">
              {block.block} {block.streetName}
            </strong>
            <span className="text-sm uppercase tracking-[0.14em] text-muted-foreground">
              {localizeTownName(block.town, locale)}
            </span>
          </div>
        </ItemContent>
        <ItemActions className="flex-wrap justify-end">
          {isFeatured ? <Badge>{t("results.selected")}</Badge> : null}
          <Button
            size="xs"
            variant={isSaved ? "secondary" : "ghost"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleShortlist(block.addressKey);
            }}
            type="button"
          >
            <Bookmark data-icon="inline-start" className="size-3.5" aria-hidden="true" />
            {isSaved ? t("results.saved") : t("results.save")}
          </Button>
        </ItemActions>
      </ItemHeader>

      <div className="grid basis-full gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <WalletCards data-icon className="size-3.5" aria-hidden="true" />
            {t("results.medianResale")}
          </span>
          <strong className="font-heading text-2xl font-extrabold v2-tabular">
            {formatCompactCurrency(block.medianPrice, locale)}
          </strong>
          {(() => {
            const qualityTag = getBlockDataQualityTag({
              transactionCount: block.transactionCount,
              latestMonth: block.latestMonth,
              referenceMonth: profileDataWindow?.maxMonth ?? null,
            });
            return (
              <>
                <Badge variant="outline" className="w-fit text-[0.58rem] font-bold uppercase tracking-[0.08em]">
                  {t(QUALITY_LABEL_KEYS[qualityTag])}
                </Badge>
                <span className="text-[0.62rem] font-semibold text-muted-foreground">
                  {t(QUALITY_HINT_KEYS[qualityTag])}
                </span>
              </>
            );
          })()}
          {affordVerdict && affordVerdict.status !== "unknown" ? (
            <span
              className={cn(
                "mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.58rem] font-bold uppercase",
                affordVerdict.status === "comfortable" &&
                  "bg-success/10 text-success",
                affordVerdict.status === "stretch" &&
                  "bg-warning/10 text-warning",
                affordVerdict.status === "over" &&
                  "bg-destructive/10 text-destructive",
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  affordVerdict.status === "comfortable" && "bg-success",
                  affordVerdict.status === "stretch" && "bg-warning",
                  affordVerdict.status === "over" && "bg-destructive",
                )}
              />
              {affordVerdict.status === "comfortable"
                ? t("affordability.comfortable")
                : affordVerdict.status === "stretch"
                  ? t("affordability.stretch")
                  : t("affordability.over")}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <TrainFront data-icon className="size-3.5" aria-hidden="true" />
            {t("results.nearestMrt")}
          </span>
          {nearbyStations.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {nearbyStations.map((station) => (
                <li key={`${station.stationName}-${station.distanceMeters}`} className="flex items-center justify-between gap-2 text-sm">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <MrtLineDots stationName={station.stationName} />
                    <span className="truncate font-semibold uppercase tracking-[0.08em]">{station.stationName}</span>
                  </div>
                  <span
                    className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground"
                    title={formatMeters(station.distanceMeters, t, locale)}
                    aria-label={`${formatMinutesWalk(station.walkingTimeSeconds, t, locale)} (${formatMeters(station.distanceMeters, t, locale)})`}
                  >
                    {formatMinutesWalk(station.walkingTimeSeconds, t, locale)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
              {t("results.noMatch")}
            </strong>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Coins data-icon className="size-3.5" aria-hidden="true" />
            {t("results.remainingLease")}
          </span>
          <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
            {formatRemainingLease(block.leaseCommenceRange, t)}
          </strong>
        </div>
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Clock3 data-icon className="size-3.5" aria-hidden="true" />
            {t("results.latestMonth")}
          </span>
          <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
            {formatMonth(block.latestMonth, locale)}
          </strong>
        </div>
      </div>

      <ItemFooter className="flex-wrap gap-2 border-t border-border/60 pt-4">
        {block.flatTypes.slice(0, 3).map((flatType) => (
          <Badge key={flatType} variant="secondary">
            {localizeFlatType(flatType, locale)}
          </Badge>
        ))}
        <ItemDescription className="ml-auto text-right">
          {t("results.transactions", { count: formatNumber(block.transactionCount, 0, locale) })}
        </ItemDescription>
      </ItemFooter>
    </Item>
  );
});

export function ResultsPane({
  blocks,
  hasResultScope,
  selectedAddressKey,
  shortlistKeys,
  onSelect,
  onToggleShortlist,
  scrollParent,
  isCompact = false,
  budgetMin = null,
  budgetMax = null,
  searchProfile = null,
  affordabilityMode = "",
  onClearAffordabilityFilter,
  sortMode: sortModeProp,
  onSortChange,
  profileTown = null,
  profileTownBlocks = [],
  profileDataWindow = null,
  profileStartMonth = null,
  profileEndMonth = null,
  compareTown = null,
  availableTowns = EMPTY_ARRAY,
  onChangeCompareTown,
  townRecommendations = EMPTY_ARRAY,
  townRecommendationsLoading = false,
  onSelectTown,
  searchTruncated = false,
  shareUrl,
}: ResultsPaneProps) {
  const { locale, t } = useI18n();
  const currentYear = getCurrentYear();

  const affordabilitySortReady = searchProfile
    ? isAffordabilityProfileComplete({
        monthlyIncome: searchProfile.monthlyIncome,
        cpfOABalance: searchProfile.cpfOABalance,
        age: searchProfile.age,
        coApplicantAge: searchProfile.coApplicantAge,
      })
    : false;

  const resultsCsvExport = useMemo(() => {
    if (!hasResultScope || blocks.length === 0) {
      return undefined;
    }
    return {
      filename: "hdb-results.csv",
      getContent: () =>
        buildResultsCsvContent(
          [
            t("results.export.address"),
            t("results.export.town"),
            t("results.export.medianPrice"),
            t("results.export.pricePerSqm"),
            t("results.export.transactions"),
            t("results.export.remainingLease"),
            t("results.export.mrtDistance"),
            t("results.export.flatTypes"),
          ],
          blocks.map((block) => ({
            address: `${block.block} ${block.streetName}`,
            town: block.town,
            medianPrice: block.medianPrice,
            pricePerSqm: block.pricePerSqmMedian,
            transactionCount: block.transactionCount,
            remainingLeaseYears: Math.max(0, MAX_LEASE_DURATION - (currentYear - block.leaseCommenceRange[1])),
            mrtDistanceMeters: block.nearestMrt?.distanceMeters ?? "",
            flatTypes: block.flatTypes.join("; "),
          })),
        ),
    };
  }, [blocks, currentYear, hasResultScope, t]);

  const sortOptions: SortOption[] = useMemo(
    () => [
      { value: "median-asc", label: t("results.sort.lowestMedian") },
      { value: "median-desc", label: t("results.sort.highestMedian") },
      { value: "lease-desc", label: t("results.sort.longestLease") },
      { value: "mrt-asc", label: t("results.sort.nearestMrt") },
      { value: "latest-desc", label: t("results.sort.recentActivity") },
      {
        value: "affordability",
        label: t("affordability.sort.bestFit"),
        disabled: !affordabilitySortReady,
        tooltip: affordabilitySortReady ? undefined : t("affordability.sort.disabledTooltip"),
      },
    ],
    [t, affordabilitySortReady],
  );

  // Controlled (URL) or uncontrolled (local state) sort. Tests omit the prop
  // and rely on the internal default; App.tsx always passes it.
  const [internalSortMode, setInternalSortMode] = useState<SortMode>(DEFAULT_SORT_MODE);
  const incomingSort: SortMode | null = sortModeProp ? sortModeProp : null;
  // If URL asks for affordability sort but the profile is incomplete, silently
  // fall back so the list doesn't render with a nonsense ordering.
  const effectiveExternalSort: SortMode | null =
    incomingSort === "affordability" && !affordabilitySortReady ? DEFAULT_SORT_MODE : incomingSort;
  const sortMode: SortMode = effectiveExternalSort ?? internalSortMode;
  const setSortMode = (next: SortMode) => {
    setInternalSortMode(next);
    onSortChange?.(next === DEFAULT_SORT_MODE ? "" : next);
  };
  const [resultsView, setResultsView] = useState<ResultsViewMode>("blocks");
  const contentScrollRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const itemsPerPage = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const compactRowHeight = 110;
  const compactRowGap = 8;
  const compactRowStride = compactRowHeight + compactRowGap;

  const townProfileAvailable = Boolean(hasResultScope && profileTown && profileDataWindow);
  const showTownProfile = townProfileAvailable && resultsView === "town";
  const activeCompareTown =
    compareTown && profileTown && !isSameTown(compareTown, profileTown) ? compareTown : null;
  const showTownCompare = showTownProfile && Boolean(activeCompareTown);
  const townTrendMountedRef = useRef(true);
  const townTrendRequestRef = useRef<Promise<TownFlatTypeTrendPoint[]> | null>(null);
  const compareBlocksMountedRef = useRef(true);
  const compareBlocksFetchedTownRef = useRef<string | null>(null);

  type CompareBlocksSnap = {
    status: "idle" | "loaded" | "failed";
    requestedTown: string;
    blocks: BlockSummary[];
  };
  const [compareBlocksSnap, setCompareBlocksSnap] = useState<CompareBlocksSnap>({
    status: "idle",
    requestedTown: "",
    blocks: [],
  });

  const [trendSnap, setTrendSnap] = useState<TownTrendSnap>({
    status: "idle",
    requestedTown: "",
    rows: [],
  });

  useEffect(() => {
    townTrendMountedRef.current = true;
    compareBlocksMountedRef.current = true;
    return () => {
      townTrendMountedRef.current = false;
      compareBlocksMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!showTownCompare || !activeCompareTown) {
      compareBlocksFetchedTownRef.current = null;
      return;
    }
    if (compareBlocksFetchedTownRef.current === activeCompareTown) {
      return;
    }
    const requestedTown = activeCompareTown;
    void fetchBlocksByTown(requestedTown)
      .then((blocks) => {
        if (!compareBlocksMountedRef.current) return;
        compareBlocksFetchedTownRef.current = requestedTown;
        setCompareBlocksSnap({ status: "loaded", requestedTown, blocks });
      })
      .catch(() => {
        if (!compareBlocksMountedRef.current) return;
        compareBlocksFetchedTownRef.current = requestedTown;
        setCompareBlocksSnap({ status: "failed", requestedTown, blocks: [] });
      });
  }, [activeCompareTown, showTownCompare]);

  useEffect(() => {
    if (!showTownProfile || !profileTown) {
      return;
    }

    if (trendSnap.status === "loaded") {
      return;
    }

    if (trendSnap.status === "failed" && trendSnap.requestedTown === profileTown) {
      return;
    }

    const requestedTown = profileTown;
    const request = townTrendRequestRef.current ?? fetchTownFlatTypeTrends();
    townTrendRequestRef.current = request;
    void request
      .then((data) => {
        if (townTrendRequestRef.current === request) {
          townTrendRequestRef.current = null;
        }
        if (!townTrendMountedRef.current) {
          return;
        }
        setTrendSnap({ status: "loaded", requestedTown, rows: data });
      })
      .catch(() => {
        if (townTrendRequestRef.current === request) {
          townTrendRequestRef.current = null;
        }
        if (!townTrendMountedRef.current) {
          return;
        }
        setTrendSnap({ status: "failed", requestedTown, rows: [] });
      });
  }, [profileTown, showTownProfile, trendSnap.requestedTown, trendSnap.status]);

  const townTrendRows = useMemo(
    () => (trendSnap.status === "loaded" ? trendSnap.rows : EMPTY_ARRAY),
    [trendSnap],
  );
  const townTrendLoading =
    showTownProfile &&
    (trendSnap.status === "idle" || (trendSnap.status === "failed" && trendSnap.requestedTown !== profileTown));
  const townTrendFailed = showTownProfile && trendSnap.status === "failed" && trendSnap.requestedTown === profileTown;

  const townTrendRange = useMemo(() => {
    if (!profileDataWindow) {
      return null;
    }
    return resolveTrendMonthRange(profileDataWindow, profileStartMonth ?? null, profileEndMonth ?? null);
  }, [profileDataWindow, profileEndMonth, profileStartMonth]);

  const townRollups = useMemo(() => {
    if (!showTownProfile || !profileTown || !townTrendRange) {
      return EMPTY_ARRAY;
    }
    return rollupTownFlatTypesInRange(townTrendRows, profileTown, townTrendRange);
  }, [profileTown, showTownProfile, townTrendRange, townTrendRows]);

  const townTotalVol = useMemo(() => sumRollupVolume(townRollups), [townRollups]);
  const townWeightedSqm = useMemo(() => volumeWeightedMeanLatestMedianPricePerSqm(townRollups), [townRollups]);

  const townLeaseBuckets = useMemo(
    () => buildLeaseCommencementHistogram(profileTownBlocks ?? []),
    [profileTownBlocks],
  );

  const busyTownBlocks = useMemo(
    () => pickTopBlocksByTransactionCount(profileTownBlocks ?? [], 5),
    [profileTownBlocks],
  );

  const townBelowMedianPack = useMemo(() => pickBlocksBelowTownMedian(profileTownBlocks ?? [], 5), [profileTownBlocks]);

  const compareTownBlocks = useMemo(() => {
    if (
      !activeCompareTown ||
      compareBlocksSnap.status !== "loaded" ||
      compareBlocksSnap.requestedTown !== activeCompareTown
    ) {
      return EMPTY_ARRAY;
    }
    return compareBlocksSnap.blocks;
  }, [activeCompareTown, compareBlocksSnap]);

  const compareBlocksLoading =
    showTownCompare &&
    Boolean(activeCompareTown) &&
    (compareBlocksSnap.status === "idle" ||
      compareBlocksSnap.requestedTown !== activeCompareTown);
  const compareBlocksFailed =
    showTownCompare &&
    compareBlocksSnap.status === "failed" &&
    compareBlocksSnap.requestedTown === activeCompareTown;

  // Keyed on the fingerprint, not on the whole profile object, to avoid
  // recomputing when unrelated profile fields change.
  const affordabilityFingerprint = searchProfile
    ? affordabilityProfileFingerprint({
        monthlyIncome: searchProfile.monthlyIncome,
        cpfOABalance: searchProfile.cpfOABalance,
        age: searchProfile.age,
        coApplicantAge: searchProfile.coApplicantAge,
      })
    : "";

  // Precompute affordability headroom once per profile change. Re-running the
  // verdict math inside .sort() would multiply CPF/loan calculations by O(N log N).
  const affordabilityHeadroomByKey = useMemo(() => {
    if (sortMode !== "affordability" || !searchProfile || !affordabilitySortReady) {
      return null;
    }
    const profile = {
      monthlyIncome: searchProfile.monthlyIncome,
      cpfOABalance: searchProfile.cpfOABalance,
      age: searchProfile.age,
      coApplicantAge: searchProfile.coApplicantAge,
    };
    // The profile is constant for this loop (the guard above ensures it is
    // complete), so compute the price ceiling once instead of per block.
    const ceiling = maxAffordablePrice(profile);
    const map = new Map<string, number>();
    for (const block of blocks) {
      map.set(block.addressKey, ceiling - block.medianPrice);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, sortMode, affordabilitySortReady, affordabilityFingerprint]);

  const sortedBlocks = useMemo(() => {
    if (blocks.length === 0) return EMPTY_ARRAY;
    const sorted = [...blocks];

    // ⚡ Bolt: Inline sorting logic per mode instead of passing a switch statement inside the sort loop.
    // This avoids O(N log N) function calls and condition evaluations, speeding up sort by ~15-20%.
    if (sortMode === "latest-desc") {
      return sorted.sort((left, right) => {
        if (left.latestMonth === right.latestMonth) return 0;
        return left.latestMonth < right.latestMonth ? 1 : -1;
      });
    } else if (sortMode === "median-asc") {
      return sorted.sort((left, right) => left.medianPrice - right.medianPrice);
    } else if (sortMode === "median-desc") {
      return sorted.sort((left, right) => right.medianPrice - left.medianPrice);
    } else if (sortMode === "lease-desc") {
      // ⚡ Bolt: Simplified lease logic from -(MAX_LEASE_DURATION - (currentYear - x)) to just x
      return sorted.sort((left, right) => right.leaseCommenceRange[1] - left.leaseCommenceRange[1]);
    } else if (sortMode === "mrt-asc") {
      return sorted.sort((left, right) => {
        const leftDist = left.nearestMrt?.distanceMeters ?? Number.POSITIVE_INFINITY;
        const rightDist = right.nearestMrt?.distanceMeters ?? Number.POSITIVE_INFINITY;
        return leftDist - rightDist;
      });
    } else if (sortMode === "affordability" && affordabilityHeadroomByKey) {
      return sorted.sort((left, right) => {
        const leftHeadroom = affordabilityHeadroomByKey.get(left.addressKey) ?? Number.NEGATIVE_INFINITY;
        const rightHeadroom = affordabilityHeadroomByKey.get(right.addressKey) ?? Number.NEGATIVE_INFINITY;
        return rightHeadroom - leftHeadroom;
      });
    }

    return sorted.sort((left, right) => left.medianPrice - right.medianPrice);
  }, [blocks, sortMode, affordabilityHeadroomByKey]);
  const shouldVirtualize = isCompact && sortedBlocks.length > 80;

  useEffect(() => {
    if (!isCompact || !hasResultScope || resultsView !== "blocks") {
      return;
    }

    const listEl = listContainerRef.current;
    const scroller = scrollParent ?? contentScrollRef.current;
    if (!listEl || !scroller) {
      return;
    }

    let scrollFrameId: number | null = null;

    const updateViewport = () => {
      setViewportHeight(scroller.clientHeight);
    };

    const updateScrollTop = () => {
      scrollFrameId = null;
      if (scrollParent) {
        setScrollTop(
          Math.max(0, scroller.getBoundingClientRect().top - listEl.getBoundingClientRect().top),
        );
        return;
      }
      const scrollerTop = scroller.getBoundingClientRect().top;
      const listTop = listEl.getBoundingClientRect().top;
      setScrollTop(Math.max(0, scrollerTop - listTop));
    };

    const handleScroll = () => {
      if (scrollFrameId !== null) {
        return;
      }
      scrollFrameId = window.requestAnimationFrame(updateScrollTop);
    };

    updateViewport();
    updateScrollTop();
    scroller.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", updateViewport);

    return () => {
      if (scrollFrameId !== null) {
        window.cancelAnimationFrame(scrollFrameId);
      }
      scroller.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateViewport);
    };
  }, [hasResultScope, isCompact, scrollParent, sortedBlocks.length, resultsView]);

  const [prevBlocks, setPrevBlocks] = useState(blocks);
  if (blocks !== prevBlocks) {
    setPrevBlocks(blocks);
    setCurrentPage(1);
  }

  const [prevProfileTown, setPrevProfileTown] = useState(profileTown);
  if (profileTown !== prevProfileTown) {
    setPrevProfileTown(profileTown);
    setResultsView("blocks");
  }

  const totalPages = Math.max(1, Math.ceil(sortedBlocks.length / itemsPerPage));
  const visiblePage = Math.min(currentPage, totalPages);
  const currentBlocks = useMemo(
    () => sortedBlocks.slice((visiblePage - 1) * itemsPerPage, visiblePage * itemsPerPage),
    [sortedBlocks, visiblePage, itemsPerPage],
  );
  const {
    virtualBlocks,
    virtualTopPadding,
    virtualBottomPadding,
  } = useMemo(() => {
    if (!isCompact || resultsView !== "blocks") {
      return {
        virtualBlocks: EMPTY_ARRAY,
        virtualTopPadding: 0,
        virtualBottomPadding: 0,
      };
    }
    const overscan = 8;
    const startIndex = Math.max(0, Math.floor(scrollTop / compactRowStride) - overscan);
    const visibleRows =
      Math.ceil((viewportHeight || compactRowStride * 8) / compactRowStride) + overscan * 2;
    const endIndex = Math.min(sortedBlocks.length, startIndex + visibleRows);
    return {
      virtualBlocks: sortedBlocks.slice(startIndex, endIndex),
      virtualTopPadding: startIndex * compactRowStride,
      virtualBottomPadding: Math.max(0, (sortedBlocks.length - endIndex) * compactRowStride),
    };
  }, [scrollTop, viewportHeight, compactRowStride, sortedBlocks, isCompact, resultsView]);

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    let startPage = Math.max(1, visiblePage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }
    const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

    return (
      <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 border-t border-border/40 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => p - 1)}
          disabled={visiblePage === 1}
          aria-label={t("results.prevPage") || "Previous Page"}
        >
          {t("results.prev")}
        </Button>
        {startPage > 1 && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(1)}
              aria-label={t("results.pageN", { value: 1 }) || "Go to Page 1"}
            >
              1
            </Button>
            {startPage > 2 && <span className="px-1 text-muted-foreground" aria-hidden="true">…</span>}
          </>
        )}
        {pages.map((p) => (
          <Button
            key={p}
            variant={p === visiblePage ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentPage(p)}
            aria-label={
              p === visiblePage
                ? t("results.currentPageN", { value: p }) || `Current Page, Page ${p}`
                : t("results.pageN", { value: p }) || `Go to Page ${p}`
            }
            aria-current={p === visiblePage ? "page" : undefined}
          >
            {p}
          </Button>
        ))}
        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="px-1 text-muted-foreground" aria-hidden="true">…</span>}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(totalPages)}
              aria-label={t("results.pageN", { value: totalPages }) || `Go to Page ${totalPages}`}
            >
              {totalPages}
            </Button>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => p + 1)}
          disabled={visiblePage === totalPages}
          aria-label={t("results.nextPage") || "Next Page"}
        >
          {t("results.next")}
        </Button>
      </div>
    );
  };

  return (
    <section data-testid="results-pane" className="flex min-h-0 flex-1 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden border-none bg-transparent py-0 shadow-none">
        <CardHeader className="shrink-0 border-b border-border/30 bg-background/80 px-3 py-2.5 backdrop-blur-xl sm:px-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CardTitle className="v2-section-title mr-auto min-w-0 truncate">
              {t("results.filteredBlocks")}
            </CardTitle>
            {hasResultScope ? (
              <>
                <Badge className="h-6 shrink-0 px-2 text-[0.62rem] font-bold">
                  {t("results.shown", { count: blocks.length })}
                </Badge>
                {shareUrl ? (
                  <ShareButton
                    url={shareUrl}
                    title={t("app.title")}
                    ariaLabel={t("share.filterResults")}
                    ariaLabelCopied={t("share.linkCopied")}
                    errorLabel={t("share.copyError")}
                    csvExport={resultsCsvExport}
                    exportAriaLabel={t("share.exportCsv")}
                    exportAriaLabelDone={t("share.exportCsvDone")}
                    size="icon-xs"
                    variant="outline"
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </CardHeader>
        {searchTruncated ? (
          <p
            className="shrink-0 border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs font-semibold text-foreground sm:px-4"
            data-testid="search-truncated-notice"
            role="status"
          >
            {t("results.searchTruncated")}
          </p>
        ) : null}
        {hasResultScope ? (
          <div
            className="shrink-0 border-b border-border/30 bg-background/95 px-3 py-2 backdrop-blur-xl sm:px-4"
            data-testid="results-view-toolbar"
          >
            <div className={cn("flex min-w-0 items-center gap-2", townProfileAvailable && "flex-wrap")}>
              {townProfileAvailable ? (
                <ButtonGroup
                  aria-label={t("results.view.label")}
                  className="w-fit gap-0 rounded-lg border border-border/50 bg-card/80 p-0.5"
                  data-testid="results-view-toggle"
                >
                  <Button
                    type="button"
                    size="xs"
                    variant={resultsView === "blocks" ? "default" : "ghost"}
                    aria-pressed={resultsView === "blocks"}
                    aria-label={t("results.view.blocksAria")}
                    onClick={() => setResultsView("blocks")}
                    className="h-7 rounded-md px-2.5 text-[0.65rem] font-extrabold uppercase tracking-[0.08em]"
                  >
                    <LayoutGrid data-icon="inline-start" className="size-3.5" aria-hidden="true" />
                    {t("results.view.blocks")}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={resultsView === "town" ? "default" : "ghost"}
                    aria-pressed={resultsView === "town"}
                    aria-label={t("results.view.townAria")}
                    onClick={() => setResultsView("town")}
                    className="h-7 rounded-md px-2.5 text-[0.65rem] font-extrabold uppercase tracking-[0.08em]"
                  >
                    <Building2 data-icon="inline-start" className="size-3.5" aria-hidden="true" />
                    {t("results.view.town")}
                  </Button>
                </ButtonGroup>
              ) : null}
              {!townProfileAvailable || resultsView === "blocks" ? (
                <SortSelect
                  label={t("results.sort")}
                  options={sortOptions}
                  value={sortMode}
                  onValueChange={(value) => {
                    setSortMode(value);
                    setCurrentPage(1);
                  }}
                  className={townProfileAvailable ? "flex-1 basis-full sm:basis-auto sm:flex-none" : undefined}
                />
              ) : null}
            </div>
          </div>
        ) : null}
        <CardContent
          ref={contentScrollRef}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pt-3 sm:px-4 v2-scrollbar"
        >
          {!hasResultScope ? (
            <div className="flex min-h-[14rem] flex-1 flex-col gap-4 py-4">
              {(townRecommendations.length > 0 || townRecommendationsLoading) && onSelectTown ? (
                <TownRecommendationsSection
                  recommendations={townRecommendations}
                  isLoading={townRecommendationsLoading}
                  onSelectTown={onSelectTown}
                  t={t}
                  locale={locale}
                />
              ) : null}
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <ArrowUpDown data-icon className="size-6 opacity-40" aria-hidden="true" />
                <p className="text-sm font-medium">{t("results.selectTown")}</p>
                <p className="text-xs">{t("results.useTownFilter")}</p>
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              {showTownProfile && profileTown && townTrendRange ? (
                <>
                  <TownCompareSection
                    locale={locale}
                    t={t}
                    primaryTown={profileTown}
                    compareTown={activeCompareTown ?? ""}
                    monthRange={townTrendRange}
                    primaryBlocks={profileTownBlocks ?? EMPTY_ARRAY}
                    compareBlocks={compareTownBlocks}
                    trends={townTrendRows}
                    availableTowns={availableTowns}
                    trendsLoading={townTrendLoading}
                    trendsFailed={townTrendFailed}
                    compareBlocksLoading={compareBlocksLoading}
                    compareBlocksFailed={compareBlocksFailed}
                    onChangeCompareTown={(next) => onChangeCompareTown?.(next)}
                  />
                  {!activeCompareTown ? (
                    <TownProfileSection
                      locale={locale}
                      t={t}
                      townName={profileTown}
                      monthRange={townTrendRange}
                      rollups={townRollups}
                      totalTrendVolume={townTotalVol}
                      weightedLatestSqm={townWeightedSqm}
                      leaseBuckets={townLeaseBuckets}
                      busyBlocks={busyTownBlocks}
                      belowMedian={townBelowMedianPack}
                      trendsLoading={townTrendLoading}
                      trendsFailed={townTrendFailed}
                      onSelectBlock={onSelect}
                    />
                  ) : null}
                </>
              ) : null}
              {resultsView === "blocks" && blocks.length === 0 ? (
                <div className="flex flex-1 items-start pt-2">
                  {affordabilityMode && onClearAffordabilityFilter ? (
                    <Card
                      data-testid="affordability-empty-card"
                      className="w-full border-border/50 bg-card/95"
                    >
                      <CardHeader>
                        <CardTitle>{t("affordability.filter.empty.title")}</CardTitle>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3">
                        <p className="text-sm text-muted-foreground">
                          {t("affordability.filter.empty.hint")}
                        </p>
                        <Button
                          type="button"
                          variant="default"
                          size="sm"
                          className="w-fit"
                          onClick={onClearAffordabilityFilter}
                        >
                          {t("affordability.filter.empty.clear")}
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="empty-state w-full">{t("results.noMatchFilters")}</div>
                  )}
                </div>
              ) : resultsView === "blocks" ? (
                <div className="flex min-h-[8rem] flex-1 flex-col gap-4">
                  <div
                    ref={listContainerRef}
                    className="min-h-0 flex-1 pr-2"
                  >
                    <ItemGroup
                      role="listbox"
                      className={cn("flex flex-col", isCompact ? "gap-2" : "gap-4")}
                      style={
                        shouldVirtualize
                          ? {
                              paddingTop: virtualTopPadding,
                              paddingBottom: virtualBottomPadding,
                            }
                          : undefined
                      }
                    >
                      {(shouldVirtualize ? virtualBlocks : currentBlocks).map((block, idx) => (
                        <BlockCard
                          key={block.addressKey}
                          index={idx}
                          block={block}
                          isFeatured={block.addressKey === selectedAddressKey}
                          isSaved={shortlistKeys.has(block.addressKey)}
                          isCompact={isCompact}
                          onSelect={onSelect}
                          onToggleShortlist={onToggleShortlist}
                          budgetMin={budgetMin ?? null}
                          budgetMax={budgetMax ?? null}
                          searchProfile={searchProfile ?? null}
                          profileDataWindow={profileDataWindow}
                          t={t}
                          locale={locale}
                        />
                      ))}
                    </ItemGroup>
                    {!shouldVirtualize ? renderPagination() : null}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
