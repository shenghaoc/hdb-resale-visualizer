import {
  type CSSProperties,
  lazy,
  startTransition,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { flushSync } from "react-dom";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bookmark,
  Check,
  Clock3,
  Coins,
  Copy,
  GraduationCap,
  ChevronLeft,
  History,
  Info,
  LayoutGrid,
  MapPin,
  Minus,
  Scale,
  ShoppingCart,
  Table,
  TrainFront,
  Trees,
  TrendingUp,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  formatCurrency,
  formatMeters,
  formatMinutesWalk,
  formatMonth,
  formatNumber,
  formatRemainingLease,
} from "@/shared/lib/format";
import { useI18n } from "@/shared/lib/i18n";
import type { Locale, Translator } from "@/shared/lib/i18n";
import { localizeFlatType, localizeTownName } from "@/shared/lib/i18n/domain";
import type { AddressDetail, BlockSummary, ComparisonArtifact, FilterState } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";
import { rankSimilarBlocks } from "@/entities/block/similar-blocks";
import { computeComparableRange } from "@/entities/transaction/comparable-range";
import { computeAffordabilityVerdict } from "@/shared/lib/affordability";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
} from "@/components/ui/item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  computeBlockTrajectory,
  detectRecentTransactionOutliers,
  RECENT_TRANSACTION_OUTLIER_IQR_MULTIPLIER,
  RECENT_TRANSACTION_OUTLIER_MEDIAN_PCT_THRESHOLD,
  RECENT_TRANSACTION_OUTLIER_MIN_SAMPLE_SIZE,
  type RecentTransactionOutlier,
  sliceTrendByRange,
  type TrendRangeKey,
} from "@/entities/transaction/transaction-analysis";
import { buildLeaseSignals } from "@/features/block-detail/leaseSignals";
import {
  assessLeaseFinancing,
  computeRemainingLeaseYears,
} from "@/features/block-detail/lease-financing";
import { DEFAULT_FILTERS, getCurrentYear } from "@/shared/lib/constants";
import { buildBlockShareUrl } from "@/shared/lib/shareUrls";
import {
  getBlockDataQualityTag,
  QUALITY_LABEL_KEYS,
  QUALITY_HINT_KEYS,
} from "@/shared/lib/listing-quality";
import { LeaseWarningPanel } from "@/components/LeaseWarningPanel";
import { LeaseFinancingPanel } from "@/components/LeaseFinancingPanel";
import { MrtLineDots } from "@/components/MrtLineDots";
import { BudgetMatchBadge } from "@/components/BudgetMatchBadge";
import { classifyPrimarySchoolDistance } from "@/features/map-explorer/school-proximity";
import { buildBlockExplanation } from "@/entities/block/block-explanation";
import { deriveFlatTypePriceLadder } from "@/features/block-detail/flat-type-ladder";
import { FlatTypePriceLadder } from "@/components/FlatTypePriceLadder";
import { ShareButton } from "@/components/ShareButton";

const TrendChart = lazy(() => import("./TrendChart").then((m) => ({ default: m.TrendChart })));
const AskingPriceCheck = lazy(() =>
  import("./AskingPriceCheck").then((m) => ({ default: m.AskingPriceCheck })),
);

type DetailDrawerProps = {
  selectedBlock: BlockSummary | null;
  detail: AddressDetail | null;
  comparison: ComparisonArtifact | null;
  allBlocks: ReadonlyArray<BlockSummary>;
  isLoading: boolean;
  isComparisonLoading: boolean;
  isSaved: boolean;
  remainingLeaseMin: number | null;
  referenceMonth?: string;
  filters?: FilterState;
  searchProfile?: SearchProfile | null;
  onClose: () => void;
  onToggleShortlist: () => void;
  onSelectBlock: (addressKey: string) => void;
};

const RANGE_KEYS: TrendRangeKey[] = ["2y", "5y", "10y", "max"];
const FROM_PEAK_DISPLAY_THRESHOLD_PCT = -3;

function TrajectoryBadge({
  trajectory,
  t,
  locale,
}: {
  trajectory: ReturnType<typeof computeBlockTrajectory>;
  t: Translator;
  locale: Locale;
}) {
  if (!trajectory) return null;

  const { direction, yoyDeltaPct, peakMonth, peakToCurrentPct } = trajectory;

  let badgeContent: React.ReactNode;
  let className = "h-5 gap-1 text-[var(--text-xs)] font-extrabold px-1.5";

  if (yoyDeltaPct != null) {
    const abs = Math.abs(yoyDeltaPct).toFixed(1);
    if (direction === "up") {
      badgeContent = (
        <>
          <ArrowUp data-icon className="size-2.5" aria-hidden="true" />
          {t("trajectory.up", { value: abs })}
        </>
      );
      className += " bg-success/15 text-success border-success/30 border";
    } else if (direction === "down") {
      badgeContent = (
        <>
          <ArrowDown data-icon className="size-2.5" aria-hidden="true" />
          {t("trajectory.down", { value: abs })}
        </>
      );
      className += " bg-destructive/10 text-destructive border-destructive/25 border";
    } else {
      badgeContent = (
        <>
          <Minus data-icon className="size-2.5" aria-hidden="true" />
          {t("trajectory.flat")}
        </>
      );
      className += " bg-muted/40 text-muted-foreground border-border/40 border";
    }
  }

  const isPastPeak = peakToCurrentPct < FROM_PEAK_DISPLAY_THRESHOLD_PCT;
  const peakLabel = isPastPeak
    ? t("trajectory.fromPeak", { value: peakToCurrentPct.toFixed(1) })
    : t("trajectory.peakLabel", { month: formatMonth(peakMonth, locale) });

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {badgeContent && (
        <Badge variant="outline" className={className}>
          {badgeContent}
        </Badge>
      )}
      <span className="text-[var(--text-xs)] text-muted-foreground/70 font-medium">
        {peakLabel}
      </span>
    </div>
  );
}

function PercentileBadge({
  percentile,
  invert = false,
  label,
}: {
  percentile: number;
  invert?: boolean;
  label: string;
}) {
  const isGood = invert ? percentile >= 75 : percentile <= 25;
  const isMid = invert ? percentile >= 25 : percentile <= 75;
  const rounded = Math.round(percentile);

  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="flex items-center justify-between gap-2">
        <span className="v2-field-label">{label}</span>
        <Badge
          variant={isGood ? "default" : isMid ? "secondary" : "outline"}
          className="h-5 text-[var(--text-xs)] font-extrabold"
        >
          {rounded}%
        </Badge>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted/50">
        <div
          className={cn(
            "h-full rounded-full",
            isGood ? "bg-success" : isMid ? "bg-primary" : "bg-destructive",
          )}
          style={{ width: `${Math.max(0, Math.min(100, rounded))}%` }}
        />
      </div>
    </div>
  );
}

function AmenityCard({
  icon: Icon,
  label,
  count1km,
  count2km,
  nearestDistance,
  nearbyItems,
  showDistanceBands = false,
  showMrtLineColors = false,
  showLabel = true,
  t,
  locale,
}: {
  icon?: React.ElementType;
  label?: string;
  count1km?: number;
  count2km?: number;
  nearestDistance?: number | null;
  nearbyItems?: { name: string; distanceMeters: number; walkingTimeSeconds?: number }[];
  showDistanceBands?: boolean;
  showMrtLineColors?: boolean;
  showLabel?: boolean;
  t: Translator;
  locale: Locale;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-none bg-muted/30 p-3">
      {showLabel && Icon && label && (
        <div className="mb-2 flex items-center gap-2">
          <Icon data-icon className="size-4 text-primary/70" aria-hidden="true" />
          <span className="v2-field-label">{label}</span>
        </div>
      )}
      <div className="flex flex-col gap-1">
        {count1km !== undefined && (
          <div className="text-sm font-extrabold">{t("detail.within1km", { count: count1km })}</div>
        )}
        {count2km !== undefined && (
          <div className="text-xs text-muted-foreground">
            {t("detail.within2km", { count: count2km })}
          </div>
        )}
        {nearbyItems && nearbyItems.length > 0 ? (
          <ul className={showLabel ? "mt-1 flex flex-col gap-0.5" : "flex flex-col gap-0.5"}>
            {nearbyItems.map((item) => {
              const distanceBand = showDistanceBands
                ? classifyPrimarySchoolDistance(item.distanceMeters)
                : null;

              return (
                <li
                  key={`${item.name}-${item.distanceMeters}`}
                  className="flex items-baseline justify-between gap-1 text-xs text-muted-foreground"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    {showMrtLineColors ? (
                      <MrtLineDots stationName={item.name} />
                    ) : (
                      <div
                        className="size-1 shrink-0 rounded-full bg-muted-foreground/30"
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{item.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {distanceBand ? (
                      <span className="rounded-none bg-primary/10 px-1.5 py-0.5 text-[var(--text-xs)] font-bold uppercase tracking-wider text-primary">
                        {t(`detail.schoolBand.${distanceBand}`)}
                      </span>
                    ) : null}
                    <span
                      className="font-mono text-[0.75rem] tabular-nums"
                      title={
                        item.walkingTimeSeconds !== undefined
                          ? formatMeters(item.distanceMeters, t, locale)
                          : undefined
                      }
                      aria-label={
                        item.walkingTimeSeconds !== undefined
                          ? `${formatMinutesWalk(item.walkingTimeSeconds, t, locale)} (${formatMeters(item.distanceMeters, t, locale)})`
                          : undefined
                      }
                    >
                      {item.walkingTimeSeconds !== undefined
                        ? formatMinutesWalk(item.walkingTimeSeconds, t, locale)
                        : formatMeters(item.distanceMeters, t, locale)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : nearestDistance != null ? (
          <div className="text-xs text-muted-foreground">
            {t("detail.nearest", {
              distance: formatMeters(nearestDistance, t, locale),
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DetailDrawer({
  selectedBlock,
  detail,
  comparison,
  allBlocks,
  isLoading,
  isComparisonLoading,
  isSaved,
  remainingLeaseMin,
  referenceMonth,
  filters = DEFAULT_FILTERS,
  searchProfile = null,
  onClose,
  onToggleShortlist,
  onSelectBlock,
}: DetailDrawerProps) {
  const { locale, t } = useI18n();
  const [activeTab, setActiveTab] = useState("overview");
  const [isCopied, setIsCopied] = useState(false);
  const [trendRange, setTrendRange] = useState<TrendRangeKey>("5y");
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentYear = getCurrentYear();
  const currentSummary = detail?.summary ?? selectedBlock;

  const blockShareUrl = useMemo(() => {
    if (!currentSummary) return "";
    const shareFilters: FilterState = {
      ...filters,
      selectedAddressKey: currentSummary.addressKey,
    };
    return buildBlockShareUrl(shareFilters, `${window.location.origin}${window.location.pathname}`);
  }, [currentSummary, filters]);
  const isDrawerOpen = Boolean(currentSummary || filters?.selectedAddressKey);
  const explanationCodes = useMemo(
    () =>
      currentSummary ? buildBlockExplanation({ block: currentSummary, comparison, filters }) : [],
    [comparison, currentSummary, filters],
  );
  const nearbyStations = (currentSummary?.nearbyMrts ?? []).slice(0, 3);

  const similarBlocks = useMemo(
    () => (selectedBlock ? rankSimilarBlocks(selectedBlock, allBlocks, { limit: 6 }) : []),
    [selectedBlock, allBlocks],
  );

  const comparableRange = useMemo(
    () => (selectedBlock ? computeComparableRange(selectedBlock, similarBlocks) : null),
    [selectedBlock, similarBlocks],
  );

  const affordabilityVerdict = useMemo(() => {
    if (!searchProfile || !currentSummary) return null;
    return computeAffordabilityVerdict(
      {
        monthlyIncome: searchProfile.monthlyIncome,
        cpfOABalance: searchProfile.cpfOABalance,
        age: searchProfile.age,
        coApplicantAge: searchProfile.coApplicantAge,
      },
      currentSummary.medianPrice,
    );
  }, [searchProfile, currentSummary]);

  const trajectory = useMemo(
    () => (detail ? computeBlockTrajectory(detail.monthlyTrend) : null),
    [detail],
  );

  const leaseSignals = useMemo(
    () =>
      currentSummary
        ? buildLeaseSignals(currentSummary.leaseCommenceRange, currentYear, remainingLeaseMin)
        : [],
    [currentSummary, currentYear, remainingLeaseMin],
  );

  const leaseFinancing = useMemo(() => {
    if (!currentSummary) return null;
    // Guard against malformed data: a missing lease-commence year would
    // propagate as NaN and render garbage rather than a useful verdict.
    const leaseCommence = currentSummary.leaseCommenceRange?.[0];
    if (leaseCommence == null) return null;
    // Use the block's oldest units (fewest remaining years) so the CPF/loan
    // fit and decay clock reflect the buyer-protective worst case.
    const remainingLeaseYears = computeRemainingLeaseYears(leaseCommence, currentYear);
    return assessLeaseFinancing({
      remainingLeaseYears,
      applicantAge: searchProfile?.age ?? null,
      coApplicantAge: searchProfile?.coApplicantAge ?? null,
    });
  }, [currentSummary, currentYear, searchProfile?.age, searchProfile?.coApplicantAge]);

  const flatTypeLadder = useMemo(() => {
    if (!currentSummary || !detail?.recentTransactions) return [];
    return deriveFlatTypePriceLadder(currentSummary.flatTypes, detail.recentTransactions);
  }, [currentSummary, detail]);

  const trendPoints = useMemo(() => {
    if (!detail) return [];
    return sliceTrendByRange(detail.monthlyTrend, trendRange);
  }, [detail, trendRange]);
  const recentTransactionOutliers = useMemo(
    () =>
      detail
        ? detectRecentTransactionOutliers(detail.recentTransactions)
        : new Map<string, RecentTransactionOutlier>(),
    [detail],
  );

  const peakMonthInView = useMemo(() => {
    if (!trajectory) return null;
    const inView = trendPoints.some((p) => p.month === trajectory.peakMonth);
    return inView ? trajectory.peakMonth : null;
  }, [trajectory, trendPoints]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const handleCopyAddress = () => {
    if (!currentSummary) {
      return;
    }

    void navigator.clipboard
      .writeText(`${currentSummary.block} ${currentSummary.streetName} Singapore`)
      .then(() => {
        setIsCopied(true);
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
      })
      .catch(() => {
        setIsCopied(false);
      });
  };

  return (
    <Drawer open={isDrawerOpen} onClose={onClose}>
      <DrawerContent
        data-testid="detail-drawer"
        className="h-full min-h-0 max-h-full w-full border-border/40 bg-card"
        hideHandle={true}
      >
        <div className="flex h-full flex-col overflow-hidden">
          <DrawerHeader className="shrink-0 border-b border-border/40 bg-background pb-4 pl-12 pr-12 sm:pl-6">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-2 top-4 sm:hidden"
                  onClick={onClose}
                  aria-label={t("app.close")}
                >
                  <ChevronLeft data-icon="inline-start" className="size-5" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("app.close")}</TooltipContent>
            </Tooltip>
            <div className="flex flex-col items-start gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-bold tracking-wider">
                  {currentSummary ? localizeTownName(currentSummary.town, locale) : null}
                </Badge>
                {isLoading && (
                  <Badge variant="ghost" className="animate-pulse bg-muted/50">
                    {t("app.loadingDetails")}
                  </Badge>
                )}
              </div>
              <div className="flex w-full items-center justify-between gap-4">
                <DrawerTitle className="min-w-0 truncate text-left font-heading text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
                  {currentSummary ? `${currentSummary.block} ${currentSummary.streetName}` : "…"}
                </DrawerTitle>
                {currentSummary && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "shrink-0 transition-colors",
                          isCopied
                            ? "text-primary hover:text-primary"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                        onClick={handleCopyAddress}
                        aria-label={isCopied ? t("detail.copiedAddress") : t("detail.copyAddress")}
                      >
                        {isCopied ? (
                          <Check data-icon="inline-start" className="size-4" aria-hidden="true" />
                        ) : (
                          <Copy data-icon="inline-start" className="size-4" aria-hidden="true" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isCopied ? t("detail.copiedAddress") : t("detail.copyAddress")}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              {trajectory && <TrajectoryBadge trajectory={trajectory} t={t} locale={locale} />}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-4 top-4 opacity-70 transition-opacity hover:opacity-100"
                  onClick={onClose}
                  aria-label={t("app.close")}
                >
                  <X data-icon="inline-start" className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("app.close")}</TooltipContent>
            </Tooltip>
          </DrawerHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 sm:px-6">
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                // View Transitions API needs the DOM committed before its
                // callback resolves so it can snapshot the "after" state.
                // startTransition defers the commit, so we use flushSync here
                // to force a synchronous render; fall back to startTransition
                // when the API is unavailable.
                if (typeof document !== "undefined" && document.startViewTransition) {
                  document.startViewTransition(() => {
                    flushSync(() => setActiveTab(v));
                  });
                } else {
                  startTransition(() => setActiveTab(v));
                }
              }}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <TabsList className="mb-4 grid w-full shrink-0 grid-cols-4 rounded-none bg-muted/40 p-1">
                <TabsTrigger
                  value="overview"
                  className="gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wider"
                >
                  <Info data-icon className="size-3" aria-hidden="true" />
                  {t("detail.overview")}
                </TabsTrigger>
                <TabsTrigger
                  value="trends"
                  className="gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wider"
                >
                  <TrendingUp data-icon className="size-3" aria-hidden="true" />
                  {t("detail.trends")}
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wider"
                >
                  <History data-icon className="size-3" aria-hidden="true" />
                  {t("detail.history")}
                </TabsTrigger>
                <TabsTrigger
                  value="negotiate"
                  className="gap-1.5 text-[0.75rem] font-semibold uppercase tracking-wider"
                >
                  <Scale data-icon className="size-3" aria-hidden="true" />
                  {t("detail.negotiate")}
                </TabsTrigger>
              </TabsList>

              <div className="min-h-0 flex-1 overflow-y-auto v2-scrollbar drawer-body-vt">
                {/* ── OVERVIEW ── */}
                <TabsContent
                  value="overview"
                  className="mt-0 flex flex-col gap-5 pb-8 focus-visible:outline-none"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col rounded-none bg-muted/30 p-3">
                      <div className="mb-2 flex items-center gap-2 v2-field-label">
                        <Coins data-icon className="size-3.5 text-primary/70" aria-hidden="true" />
                        {t("results.medianResale")}
                      </div>
                      <div className="flex flex-col">
                        <div className="font-heading text-xl font-extrabold tracking-tight v2-tabular">
                          {currentSummary
                            ? formatCurrency(currentSummary.medianPrice, locale)
                            : "…"}
                        </div>
                        {currentSummary
                          ? (() => {
                              const qualityTag = getBlockDataQualityTag({
                                transactionCount: currentSummary.transactionCount,
                                latestMonth: currentSummary.latestMonth,
                                referenceMonth,
                              });
                              return (
                                <>
                                  <Badge
                                    variant="outline"
                                    className="mt-2 w-fit text-[var(--text-xs)] font-bold uppercase tracking-wider"
                                  >
                                    {t(QUALITY_LABEL_KEYS[qualityTag])}
                                  </Badge>
                                  <div className="mt-1 text-[var(--text-xs)] font-semibold text-muted-foreground">
                                    {t(QUALITY_HINT_KEYS[qualityTag])}
                                  </div>
                                </>
                              );
                            })()
                          : null}
                        {currentSummary &&
                        (filters.budgetMin != null || filters.budgetMax != null) ? (
                          <BudgetMatchBadge
                            medianPrice={currentSummary.medianPrice}
                            budgetMin={filters.budgetMin}
                            budgetMax={filters.budgetMax}
                            t={t}
                            locale={locale}
                            className="mt-2"
                          />
                        ) : null}
                        {detail?.summary.pricePerSqftMedian ? (
                          <div className="mt-1 text-xs font-medium text-muted-foreground">
                            {t("unit.psf", {
                              value: formatNumber(detail.summary.pricePerSqftMedian, 0, locale),
                            })}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col rounded-none bg-muted/30 p-3">
                      <div className="mb-2 flex items-center gap-2 v2-field-label">
                        <Clock3 data-icon className="size-3.5 text-primary/70" aria-hidden="true" />
                        {t("results.remainingLease")}
                      </div>
                      <div className="font-heading text-sm font-extrabold tracking-tight">
                        {currentSummary
                          ? formatRemainingLease(currentSummary.leaseCommenceRange, t)
                          : "…"}
                      </div>
                    </div>
                  </div>

                  {comparableRange ? (
                    <section
                      aria-labelledby="comparable-range-title"
                      data-testid="comparable-range-headline"
                      className="rounded-none border border-border/40 bg-muted/20 p-3"
                    >
                      <div
                        id="comparable-range-title"
                        className="mb-1 flex items-center gap-2 v2-field-label"
                      >
                        <Scale data-icon className="size-3.5 text-primary/70" aria-hidden="true" />
                        {t("detail.comparableRange.title")}
                      </div>
                      <p className="font-heading text-sm font-extrabold tracking-tight v2-tabular">
                        {t("detail.comparableRange.summary", {
                          min: formatCurrency(comparableRange.minPrice, locale),
                          max: formatCurrency(comparableRange.maxPrice, locale),
                          median: formatCurrency(comparableRange.medianPrice, locale),
                          count: formatNumber(comparableRange.sampleSize, 0, locale),
                        })}
                      </p>
                      <p className="mt-1 text-[0.75rem] font-medium text-muted-foreground">
                        {Math.abs(comparableRange.deltaFromMedianPct) < 0.5
                          ? t("detail.comparableRange.inline")
                          : comparableRange.deltaFromMedianPct >= 0
                            ? t("detail.comparableRange.above", {
                                value: formatNumber(comparableRange.deltaFromMedianPct, 1, locale),
                              })
                            : t("detail.comparableRange.below", {
                                value: formatNumber(
                                  Math.abs(comparableRange.deltaFromMedianPct),
                                  1,
                                  locale,
                                ),
                              })}
                      </p>
                    </section>
                  ) : null}

                  {affordabilityVerdict && affordabilityVerdict.status !== "unknown" ? (
                    <section
                      aria-labelledby="affordability-title"
                      data-testid="affordability-section"
                      className="rounded-none border border-border/40 bg-muted/20 p-3"
                    >
                      <div
                        id="affordability-title"
                        className="mb-2 flex items-center gap-2 v2-field-label"
                      >
                        <Coins data-icon className="size-3.5 text-primary/70" aria-hidden="true" />
                        {t("affordability.breakdownTitle")}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[var(--text-xs)] font-medium text-muted-foreground">
                            {t("affordability.loanAmount")}
                          </span>
                          <div className="font-heading text-sm font-extrabold tabular-nums">
                            {formatCurrency(affordabilityVerdict.loanAmount, locale)}
                          </div>
                        </div>
                        <div>
                          <span className="text-[var(--text-xs)] font-medium text-muted-foreground">
                            {t("affordability.monthlyRepayment")}
                          </span>
                          <div className="font-heading text-sm font-extrabold tabular-nums">
                            {formatCurrency(affordabilityVerdict.monthlyRepayment, locale)}
                            <span className="text-[var(--text-xs)] font-normal text-muted-foreground">
                              {t("unit.perMonth")}
                            </span>
                          </div>
                        </div>
                        <div>
                          <span className="text-[var(--text-xs)] font-medium text-muted-foreground">
                            {t("affordability.downPayment")}
                          </span>
                          <div className="font-heading text-sm font-extrabold tabular-nums">
                            {formatCurrency(
                              affordabilityVerdict.downPaymentFromCpf +
                                affordabilityVerdict.cashOutlay,
                              locale,
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="text-[var(--text-xs)] font-medium text-muted-foreground">
                            {t("affordability.fromCpf")}
                          </span>
                          <div className="font-heading text-sm font-extrabold tabular-nums">
                            {formatCurrency(affordabilityVerdict.downPaymentFromCpf, locale)}
                          </div>
                        </div>
                        <div className="col-span-2">
                          <span className="text-[var(--text-xs)] font-medium text-muted-foreground">
                            {t("affordability.cashRequired")}
                          </span>
                          <div className="font-heading text-sm font-extrabold tabular-nums">
                            {formatCurrency(affordabilityVerdict.cashOutlay, locale)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 text-[var(--text-xs)] font-bold">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            affordabilityVerdict.status === "comfortable" && "bg-success",
                            affordabilityVerdict.status === "stretch" && "bg-warning",
                            affordabilityVerdict.status === "over" && "bg-destructive",
                          )}
                        />
                        <span className="uppercase tracking-wider text-muted-foreground">
                          {t("affordability.ceiling", {
                            price: formatCurrency(affordabilityVerdict.maxAffordablePrice, locale),
                          })}
                        </span>
                        <span
                          className={cn(
                            "ml-auto rounded-none px-2 py-0.5 text-[var(--text-xs)] font-bold uppercase",
                            affordabilityVerdict.status === "comfortable" &&
                              "bg-success/10 text-success",
                            affordabilityVerdict.status === "stretch" &&
                              "bg-warning/10 text-warning",
                            affordabilityVerdict.status === "over" &&
                              "bg-destructive/10 text-destructive",
                          )}
                        >
                          {affordabilityVerdict.status === "comfortable"
                            ? t("affordability.comfortable")
                            : affordabilityVerdict.status === "stretch"
                              ? t("affordability.stretch")
                              : t("affordability.over")}
                        </span>
                      </div>
                    </section>
                  ) : searchProfile && searchProfile.monthlyIncome === null ? (
                    <section className="rounded-none border border-border/40 bg-muted/20 p-3">
                      <div className="mb-2 flex items-center gap-2 v2-field-label">
                        <Coins data-icon className="size-3.5 text-primary/70" aria-hidden="true" />
                        {t("affordability.title")}
                      </div>
                      <p className="text-xs text-muted-foreground italic">
                        {t("affordability.setProfileHint")}
                      </p>
                    </section>
                  ) : null}

                  <LeaseWarningPanel signals={leaseSignals} t={t} />

                  {leaseFinancing ? (
                    <LeaseFinancingPanel assessment={leaseFinancing} t={t} />
                  ) : null}

                  {flatTypeLadder.length > 0 && (
                    <section>
                      <h3 className="v2-section-title mb-2 flex items-center gap-2 text-[0.75rem]">
                        <TrendingUp data-icon className="size-3.5" aria-hidden="true" />
                        {t("detail.priceLadder")}
                      </h3>
                      <FlatTypePriceLadder entries={flatTypeLadder} />
                      <p className="mt-1 text-[var(--text-xs)] text-muted-foreground">
                        {t("detail.priceLadderHint")}
                      </p>
                    </section>
                  )}

                  <section>
                    <h3 className="v2-section-title mb-3 flex items-center gap-2">
                      <Table data-icon className="size-4" aria-hidden="true" />
                      {t("detail.unitAttributes")}
                    </h3>
                    <Card className="v2-card rounded-none border-border/40 bg-card py-0 shadow-none">
                      <CardContent className="divide-y divide-border/40 p-0">
                        <div className="flex items-center justify-between p-3">
                          <span className="text-sm font-medium text-muted-foreground">
                            {t("detail.availableLayouts")}
                          </span>
                          <div className="flex flex-wrap justify-end gap-1.5 max-w-[60%]">
                            {currentSummary?.flatTypes.map((type) => (
                              <Badge
                                key={type}
                                variant="outline"
                                className="h-5 text-[var(--text-xs)] font-bold uppercase"
                              >
                                {localizeFlatType(type, locale)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3">
                          <span className="text-sm font-medium text-muted-foreground">
                            {t("filters.flatModel")}
                          </span>
                          <div className="flex flex-wrap justify-end gap-1.5 max-w-[60%]">
                            {currentSummary?.flatModels.map((model) => (
                              <Badge
                                key={model}
                                variant="secondary"
                                className="h-5 text-[var(--text-xs)] font-bold uppercase tracking-tight"
                              >
                                {model}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3">
                          <span className="text-sm font-medium text-muted-foreground">
                            {t("filters.floorAreaRange")}
                          </span>
                          <span className="font-heading text-sm font-bold">
                            {currentSummary
                              ? `${Math.round(currentSummary.floorAreaRange[0])} - ${Math.round(
                                  currentSummary.floorAreaRange[1],
                                )} ${t("unit.sqm", { value: "" }).trim()}`
                              : "…"}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </section>

                  {nearbyStations.length > 0 && (
                    <section>
                      <h3 className="v2-section-title mb-3 flex items-center gap-2">
                        <TrainFront data-icon className="size-4" aria-hidden="true" />
                        {t("detail.connectivity")}
                      </h3>
                      <AmenityCard
                        nearbyItems={nearbyStations.map((mrt) => ({
                          name: mrt.stationName,
                          distanceMeters: mrt.distanceMeters,
                          walkingTimeSeconds: mrt.walkingTimeSeconds,
                        }))}
                        showLabel={false}
                        showMrtLineColors
                        t={t}
                        locale={locale}
                      />
                    </section>
                  )}

                  <section>
                    <h3 className="v2-section-title mb-3 flex items-center gap-2">
                      <Info data-icon className="size-4" aria-hidden="true" />
                      {t("detail.whyThisBlock")}
                    </h3>
                    <Card className="v2-card rounded-none border-border/40 bg-card py-0 shadow-none">
                      <CardContent className="p-3">
                        {isComparisonLoading ? (
                          <div className="flex flex-col gap-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div
                                key={i}
                                className="h-3 w-full animate-pulse rounded-full bg-muted/40"
                              />
                            ))}
                          </div>
                        ) : explanationCodes.length > 0 ? (
                          <ul className="flex flex-col gap-1.5">
                            {explanationCodes.map((code) => (
                              <li
                                key={code}
                                className="text-xs text-muted-foreground leading-relaxed"
                              >
                                • {t(`detail.why.${code}`)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">
                            {t("detail.why.none")}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </section>

                  <section>
                    <h3 className="v2-section-title mb-3 flex items-center gap-2">
                      <Trees data-icon className="size-4" aria-hidden="true" />
                      {t("detail.nearbyAmenities")}
                    </h3>
                    {isComparisonLoading ? (
                      <div className="grid grid-cols-2 gap-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-20 w-full animate-pulse rounded-none bg-muted/40"
                          />
                        ))}
                      </div>
                    ) : comparison ? (
                      <div className="grid grid-cols-2 gap-3">
                        <AmenityCard
                          icon={GraduationCap}
                          label={t("detail.amenity.schools")}
                          count1km={comparison.amenities.primarySchoolsWithin1km}
                          count2km={comparison.amenities.primarySchoolsWithin2km}
                          nearestDistance={comparison.amenities.nearestPrimarySchoolMeters}
                          nearbyItems={comparison.amenities.nearestPrimarySchools?.slice(0, 3)}
                          showDistanceBands
                          t={t}
                          locale={locale}
                        />
                        <AmenityCard
                          icon={UtensilsCrossed}
                          label={t("detail.amenity.hawkers")}
                          count1km={comparison.amenities.hawkerCentresWithin1km}
                          nearestDistance={comparison.amenities.nearestHawkerCentreMeters}
                          t={t}
                          locale={locale}
                        />
                        <AmenityCard
                          icon={ShoppingCart}
                          label={t("detail.amenity.supermarkets")}
                          count1km={comparison.amenities.supermarketsWithin1km}
                          nearestDistance={comparison.amenities.nearestSupermarketMeters}
                          t={t}
                          locale={locale}
                        />
                        <AmenityCard
                          icon={Trees}
                          label={t("detail.amenity.parks")}
                          count1km={comparison.amenities.parksWithin1km}
                          nearestDistance={comparison.amenities.nearestParkMeters}
                          t={t}
                          locale={locale}
                        />
                      </div>
                    ) : null}
                    {!isComparisonLoading && !comparison && (
                      <p className="py-4 text-sm text-muted-foreground italic">
                        {t("detail.noComparisonData")}
                      </p>
                    )}
                  </section>

                  <section>
                    <h3 className="v2-section-title mb-3 flex items-center gap-2">
                      <TrendingUp data-icon className="size-4" aria-hidden="true" />
                      {t("detail.marketPercentiles")}
                    </h3>
                    {isComparisonLoading ? (
                      <div className="grid grid-cols-2 gap-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-16 w-full animate-pulse rounded-none bg-muted/40"
                          />
                        ))}
                      </div>
                    ) : comparison ? (
                      <div className="grid grid-cols-2 gap-3">
                        <PercentileBadge
                          label={t("detail.rank.price")}
                          percentile={comparison.percentileRanks.pricePercentile}
                        />
                        <PercentileBadge
                          label={t("detail.rank.pricePerSqm")}
                          percentile={comparison.percentileRanks.pricePerSqmPercentile}
                        />
                        <PercentileBadge
                          label={t("detail.rank.lease")}
                          percentile={comparison.percentileRanks.leasePercentile}
                          invert
                        />
                        <PercentileBadge
                          label={t("detail.rank.mrt")}
                          percentile={comparison.percentileRanks.mrtDistancePercentile}
                          invert
                        />
                        <PercentileBadge
                          label={t("detail.rank.liquidity")}
                          percentile={comparison.percentileRanks.transactionCountPercentile}
                          invert
                        />
                        <PercentileBadge
                          label={t("detail.rank.recency")}
                          percentile={comparison.percentileRanks.recencyPercentile}
                          invert
                        />
                      </div>
                    ) : (
                      <p className="py-4 text-sm text-muted-foreground italic">
                        {t("detail.noPercentileData")}
                      </p>
                    )}
                  </section>

                  <section>
                    <div className="mb-3">
                      <h3 className="v2-section-title flex items-center gap-2">
                        <LayoutGrid data-icon className="size-4" aria-hidden="true" />
                        {t("detail.similarBlocks")}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {t("detail.similarBlocks.hint")}
                      </p>
                    </div>
                    {similarBlocks.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {similarBlocks.map((block) => (
                          <SimilarBlockCard
                            key={block.addressKey}
                            block={block}
                            onSelect={onSelectBlock}
                            t={t}
                            locale={locale}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="py-4 text-sm text-muted-foreground italic">
                        {t("detail.similarBlocks.empty")}
                      </p>
                    )}
                  </section>
                </TabsContent>

                {/* ── TRENDS ── */}
                <TabsContent
                  value="trends"
                  className="mt-0 flex flex-col gap-6 pb-8 focus-visible:outline-none"
                >
                  <section>
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 text-[0.75rem] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                        <TrendingUp data-icon className="size-4" aria-hidden="true" />
                        {t("detail.priceTrendFull")}
                      </h3>
                      <div className="flex items-center gap-1">
                        {RANGE_KEYS.map((key) => (
                          <button
                            key={key}
                            onClick={() => setTrendRange(key)}
                            className={cn(
                              "rounded px-2 py-0.5 text-[var(--text-xs)] font-bold uppercase tracking-wider transition-colors",
                              trendRange === key
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                            )}
                            aria-pressed={trendRange === key}
                          >
                            {t(`trend.range.${key}`)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Card className="overflow-hidden border-border/40 bg-muted/10 shadow-none">
                      <CardContent className="p-0">
                        <div className="flex h-[280px] items-center justify-center pt-4">
                          {detail ? (
                            <ErrorBoundary
                              fill
                              className="h-full w-full"
                              reloadOnRecovery={false}
                              fallbackText={t("error.trendFallback")}
                              actionText={t("error.retry")}
                            >
                              <Suspense
                                fallback={
                                  <div className="flex flex-col items-center gap-3 text-muted-foreground opacity-40">
                                    <TrendingUp
                                      data-icon
                                      className="size-8 stroke-[1px] animate-pulse"
                                      aria-hidden="true"
                                    />
                                    <p className="text-xs font-medium tracking-widest uppercase">
                                      {t("detail.calculatingTrends")}
                                    </p>
                                  </div>
                                }
                              >
                                <TrendChart
                                  points={trendPoints}
                                  t={t}
                                  peakMonth={peakMonthInView}
                                  height={260}
                                />
                              </Suspense>
                            </ErrorBoundary>
                          ) : (
                            <div className="flex flex-col items-center gap-3 text-muted-foreground opacity-40">
                              <TrendingUp
                                data-icon
                                className="size-8 stroke-[1px]"
                                aria-hidden="true"
                              />
                              <p className="text-xs font-medium tracking-widest uppercase">
                                {t("detail.calculatingTrends")}
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {trajectory && (
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <StatPill
                          label={t("results.medianResale")}
                          value={formatCurrency(trajectory.currentMedian, locale)}
                        />
                        <StatPill
                          label={t("trend.peak")}
                          value={formatCurrency(trajectory.peakPrice, locale)}
                          sub={formatMonth(trajectory.peakMonth, locale)}
                        />
                        {trajectory.yoyDeltaPct != null && (
                          <StatPill
                            label={t("trend.yoyChange")}
                            value={`${trajectory.yoyDeltaPct >= 0 ? "+" : ""}${trajectory.yoyDeltaPct.toFixed(1)}%`}
                            tone={trajectory.yoyDeltaPct >= 0 ? "positive" : "negative"}
                          />
                        )}
                        {trajectory.peakToCurrentPct < FROM_PEAK_DISPLAY_THRESHOLD_PCT && (
                          <StatPill
                            label={t("trend.fromPeak")}
                            value={`${trajectory.peakToCurrentPct.toFixed(1)}%`}
                            tone="negative"
                          />
                        )}
                      </div>
                    )}
                  </section>

                  <div className="grid grid-cols-1 gap-4">
                    <Card className="border-border/40 bg-card shadow-sm transition-[border-color,box-shadow] hover:border-primary/20">
                      <CardHeader className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-1">
                            <CardDescription className="text-[var(--text-xs)] font-bold uppercase tracking-[var(--tracking-label)]">
                              {t("detail.marketRank")}
                            </CardDescription>
                            <CardTitle className="text-xl font-bold tracking-tight">
                              {t("detail.townAverage", {
                                town: currentSummary
                                  ? localizeTownName(currentSummary.town, locale)
                                  : "",
                              })}
                            </CardTitle>
                          </div>
                          <div className="rounded-none bg-primary/5 p-2 text-primary">
                            <TrendingUp data-icon className="size-5" aria-hidden="true" />
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4 pt-0">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {t("detail.marketRankDescription", {
                            town: currentSummary
                              ? localizeTownName(currentSummary.town, locale)
                              : "",
                          })}
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ── HISTORY ── */}
                <TabsContent value="history" className="mt-0 pb-8 focus-visible:outline-none">
                  <section>
                    <h3 className="mb-4 flex items-center justify-between text-[0.75rem] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                      <span className="flex items-center gap-2">
                        <History data-icon className="size-4" aria-hidden="true" />
                        {t("detail.recentTransactions")}
                      </span>
                      <div className="flex items-center gap-2">
                        {recentTransactionOutliers.size > 0 && (
                          <Badge
                            variant="outline"
                            className="h-5 gap-1 border-warning/40 bg-warning/10 text-[var(--text-xs)] font-bold text-warning"
                          >
                            <AlertTriangle data-icon className="size-3" aria-hidden="true" />
                            {t("detail.outlierCount", { count: recentTransactionOutliers.size })}
                          </Badge>
                        )}
                        <Badge variant="outline" className="font-mono text-[0.75rem]">
                          {t("detail.totalCount", {
                            count: detail?.recentTransactions.length ?? 0,
                          })}
                        </Badge>
                      </div>
                    </h3>
                    {recentTransactionOutliers.size > 0 && (
                      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                        {t("detail.outlierRule", {
                          minCount: RECENT_TRANSACTION_OUTLIER_MIN_SAMPLE_SIZE,
                          iqrMult: RECENT_TRANSACTION_OUTLIER_IQR_MULTIPLIER,
                          pctThreshold: RECENT_TRANSACTION_OUTLIER_MEDIAN_PCT_THRESHOLD,
                        })}
                      </p>
                    )}
                    <ItemGroup
                      className="flex flex-col gap-3 pb-8"
                      style={{ "--cv-intrinsic-height": "72px" } as CSSProperties}
                    >
                      {detail?.recentTransactions.map((tx) => {
                        const outlier = recentTransactionOutliers.get(tx.id);
                        return (
                          <Item
                            key={tx.id}
                            variant="outline"
                            className="bg-card px-4 py-3 transition-colors hover:bg-muted/30 cv-auto"
                          >
                            <ItemHeader>
                              <ItemContent>
                                <div className="flex flex-col gap-0.5">
                                  <strong className="text-sm font-bold tracking-tight">
                                    {formatCurrency(tx.resalePrice, locale)}
                                  </strong>
                                  <ItemDescription className="text-[0.75rem] font-bold uppercase tracking-wider">
                                    {tx.flatType} • {tx.storeyRange}
                                  </ItemDescription>
                                  {outlier?.direction === "high" && (
                                    <Badge
                                      variant="outline"
                                      className="mt-1 h-5 w-fit border-warning/40 bg-warning/10 px-1.5 text-[var(--text-xs)] font-bold uppercase tracking-[0.1em] text-warning"
                                    >
                                      {t("detail.outlier.high")}
                                    </Badge>
                                  )}
                                  {outlier?.direction === "low" && (
                                    <Badge
                                      variant="outline"
                                      className="mt-1 h-5 w-fit border-primary/40 bg-primary/10 px-1.5 text-[var(--text-xs)] font-bold uppercase tracking-[0.1em] text-primary"
                                    >
                                      {t("detail.outlier.low")}
                                    </Badge>
                                  )}
                                </div>
                              </ItemContent>
                              <ItemActions>
                                <div className="flex flex-col items-end gap-1">
                                  <Badge
                                    variant="secondary"
                                    className="h-5 text-[var(--text-xs)] font-mono tracking-tighter"
                                  >
                                    {formatMonth(tx.month, locale)}
                                  </Badge>
                                  <span className="text-[var(--text-xs)] font-medium text-muted-foreground/60 tracking-tight">
                                    {t("unit.sqm", { value: tx.floorAreaSqm })}
                                  </span>
                                </div>
                              </ItemActions>
                            </ItemHeader>
                          </Item>
                        );
                      })}
                      {!detail && (
                        <div className="flex flex-col gap-3 py-12">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <div
                              key={i}
                              className="h-16 w-full animate-pulse rounded-none bg-muted/40"
                            />
                          ))}
                        </div>
                      )}
                    </ItemGroup>
                  </section>
                </TabsContent>

                {/* ── NEGOTIATE ── */}
                <TabsContent value="negotiate" className="mt-0 pb-8 focus-visible:outline-none">
                  {detail ? (
                    <ErrorBoundary
                      reloadOnRecovery={false}
                      fallbackText={t("error.askingPriceFallback")}
                      actionText={t("error.retry")}
                    >
                      <Suspense
                        fallback={
                          <div className="flex flex-col gap-3 py-12">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div
                                key={i}
                                className="h-20 w-full animate-pulse rounded-none bg-muted/40"
                              />
                            ))}
                          </div>
                        }
                      >
                        <AskingPriceCheck
                          key={`${detail.summary.block}-${detail.summary.streetName}`}
                          detail={detail}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  ) : (
                    <div className="flex flex-col gap-3 py-12">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-20 w-full animate-pulse rounded-none bg-muted/40" />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>

          <div className="shrink-0 border-t border-border/40 bg-background p-4 sm:p-6">
            <div className="mx-auto flex w-full items-center gap-2.5 sm:gap-4">
              <Button
                className="min-w-0 flex-1 gap-1.5 px-3 text-[0.75rem] font-bold uppercase tracking-[var(--tracking-label)] transition-[color,background-color,transform] active:scale-[0.98] sm:gap-2 sm:text-sm sm:tracking-widest"
                size="lg"
                onClick={onToggleShortlist}
                variant={isSaved ? "secondary" : "default"}
                aria-pressed={isSaved}
                aria-label={t("detail.save")}
                disabled={!currentSummary}
              >
                <Bookmark
                  data-icon="inline-start"
                  className={cn("size-4", isSaved && "fill-current")}
                  aria-hidden="true"
                />
                <span className="truncate">
                  <span className="sm:hidden">
                    {isSaved ? t("results.saved") : t("results.save")}
                  </span>
                  <span className="hidden sm:inline">
                    {isSaved ? t("detail.saved") : t("detail.save")}
                  </span>
                </span>
              </Button>
              <ShareButton
                url={blockShareUrl}
                title={t("app.title")}
                ariaLabel={t("share.blockLink")}
                ariaLabelCopied={t("share.linkCopied")}
                errorLabel={t("share.copyError")}
                variant="outline"
                size="icon-xs"
                className="shrink-0 rounded-none border-border/50 bg-card"
              />
              <Button
                variant="outline"
                className="min-w-0 flex-1 gap-1.5 border-border/60 px-3 text-[0.75rem] font-bold uppercase tracking-[var(--tracking-label)] transition-[color,background-color,transform] active:scale-[0.98] sm:gap-2 sm:text-sm sm:tracking-widest"
                size="lg"
                disabled={!currentSummary}
                onClick={() => {
                  const url = new URL("https://www.google.com/maps/search/");
                  url.searchParams.append("api", "1");
                  url.searchParams.append(
                    "query",
                    `${currentSummary?.block} ${currentSummary?.streetName} Singapore`,
                  );
                  window.open(url.toString(), "_blank", "noopener,noreferrer");
                }}
              >
                <MapPin data-icon="inline-start" className="size-4" aria-hidden="true" />
                <span className="truncate">{t("detail.directions")}</span>
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function SimilarBlockCard({
  block,
  onSelect,
  t,
  locale,
}: {
  block: BlockSummary;
  onSelect: (addressKey: string) => void;
  t: Translator;
  locale: Locale;
}) {
  const address = `${block.block} ${block.streetName}`;
  return (
    <button
      type="button"
      className="w-full rounded-none bg-muted/20 px-3 py-2.5 text-left transition-colors hover:bg-muted/30 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      onClick={() => onSelect(block.addressKey)}
      aria-label={t("detail.similarBlocks.viewBlock", { address })}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold leading-tight">{address}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[var(--text-xs)] font-extrabold uppercase tracking-[0.1em] text-muted-foreground/70">
              {localizeTownName(block.town, locale)}
            </span>
            {block.flatTypes.slice(0, 2).map((ft) => (
              <Badge
                key={ft}
                variant="outline"
                className="h-4 px-1 text-[var(--text-xs)] font-bold uppercase"
              >
                {localizeFlatType(ft, locale)}
              </Badge>
            ))}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-heading text-sm font-extrabold tabular-nums">
            {formatCurrency(block.medianPrice, locale)}
          </div>
          {block.nearestMrt && (
            <div
              className="mt-0.5 text-[var(--text-xs)] text-muted-foreground/70 tabular-nums"
              title={formatMeters(block.nearestMrt.distanceMeters, t, locale)}
              aria-label={`${formatMinutesWalk(block.nearestMrt.walkingTimeSeconds, t, locale)} (${formatMeters(block.nearestMrt.distanceMeters, t, locale)})`}
            >
              {formatMinutesWalk(block.nearestMrt.walkingTimeSeconds, t, locale)}
              {" · "}
              <TrainFront data-icon className="inline size-2.5 align-baseline" aria-hidden="true" />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function StatPill({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "positive" | "negative";
}) {
  return (
    <div className="rounded-none bg-muted/30 px-3 py-2">
      <div className="v2-field-label">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-sm font-extrabold tabular-nums",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[var(--text-xs)] text-muted-foreground">{sub}</div>}
    </div>
  );
}
