import { startTransition, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  Check,
  Clock3,
  Coins,
  Copy,
  GraduationCap,
  History,
  Info,
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
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatMeters,
  formatMonth,
  formatNumber,
  formatRemainingLease,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Locale, Translator } from "@/lib/i18n";
import { localizeFlatType, localizeTownName } from "@/lib/i18n/domain";
import type { AddressDetail, BlockSummary, ComparisonArtifact } from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { lazy } from "react";
import {
  computeBlockTrajectory,
  sliceTrendByRange,
  type TrendRangeKey,
} from "@/lib/transaction-analysis";

const TrendChart = lazy(() => import("./TrendChart").then((m) => ({ default: m.TrendChart })));
const AskingPriceCheck = lazy(() =>
  import("./AskingPriceCheck").then((m) => ({ default: m.AskingPriceCheck })),
);

type DetailDrawerProps = {
  selectedBlock: BlockSummary | null;
  detail: AddressDetail | null;
  comparison: ComparisonArtifact | null;
  isLoading: boolean;
  isComparisonLoading: boolean;
  isSaved: boolean;
  onClose: () => void;
  onToggleShortlist: () => void;
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
  let className = "h-5 gap-1 text-[0.6rem] font-extrabold px-1.5";

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
      <span className="text-[0.58rem] text-muted-foreground/70 font-medium">
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
    <div className="rounded-lg border border-border/40 bg-muted/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[0.6rem] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        <Badge
          variant={isGood ? "default" : isMid ? "secondary" : "outline"}
          className="h-5 text-[0.6rem] font-extrabold"
        >
          {rounded}%
        </Badge>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
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
  showLabel = true,
  t,
  locale,
}: {
  icon?: React.ElementType;
  label?: string;
  count1km?: number;
  count2km?: number;
  nearestDistance?: number | null;
  nearbyItems?: { name: string; distanceMeters: number }[];
  showLabel?: boolean;
  t: Translator;
  locale: Locale;
}) {
  return (
    <Card className="v2-card gap-0 rounded-xl border-border/40 bg-card/80 py-0 shadow-none">
      <CardContent className="p-3">
        {showLabel && Icon && label && (
          <div className="mb-2 flex items-center gap-2">
            <Icon data-icon className="size-4 text-primary/70" aria-hidden="true" />
            <span className="text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
              {label}
            </span>
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
              {nearbyItems.map((item) => (
                <li key={`${item.name}-${item.distanceMeters}`} className="flex items-baseline justify-between gap-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="size-1 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
                    <span className="truncate">{item.name}</span>
                  </div>
                  <span className="shrink-0 font-mono text-[0.65rem] tabular-nums">
                    {formatMeters(item.distanceMeters, t, locale)}
                  </span>
                </li>
              ))}
            </ul>
          ) : nearestDistance != null ? (
            <div className="text-xs text-muted-foreground">
              {t("detail.nearest", {
                distance: formatMeters(nearestDistance, t, locale),
              })}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function DetailDrawer({
  selectedBlock,
  detail,
  comparison,
  isLoading,
  isComparisonLoading,
  isSaved,
  onClose,
  onToggleShortlist,
}: DetailDrawerProps) {
  const { locale, t } = useI18n();
  const [activeTab, setActiveTab] = useState("overview");
  const [isCopied, setIsCopied] = useState(false);
  const [trendRange, setTrendRange] = useState<TrendRangeKey>("5y");
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentSummary = detail?.summary ?? selectedBlock;
  const nearbyStations = (currentSummary?.nearbyMrts ?? []).slice(0, 3);

  const trajectory = useMemo(
    () => (detail ? computeBlockTrajectory(detail.monthlyTrend) : null),
    [detail],
  );

  const trendPoints = useMemo(() => {
    if (!detail) return [];
    return sliceTrendByRange(detail.monthlyTrend, trendRange);
  }, [detail, trendRange]);

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
    <Drawer open={Boolean(selectedBlock)} onClose={onClose} dismissible={false}>
      <DrawerContent
        data-testid="detail-drawer"
        className="h-full max-h-full border-border/40 bg-card/95 backdrop-blur-xl sm:h-[92vh] lg:left-auto lg:right-4 lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-[32rem]"
        hideHandle={true}
      >
        <div className="flex h-full flex-col overflow-hidden">
          <DrawerHeader className="shrink-0 border-b border-border/40 bg-background/80 pb-4 pr-12 backdrop-blur-xl">
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
                  {currentSummary ? `${currentSummary.block} ${currentSummary.streetName}` : "..."}
                </DrawerTitle>
                {currentSummary && (
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
                    title={isCopied ? t("detail.copiedAddress") : t("detail.copyAddress")}
                    aria-label={isCopied ? t("detail.copiedAddress") : t("detail.copyAddress")}
                  >
                    {isCopied ? <Check data-icon className="size-4" aria-hidden="true" /> : <Copy data-icon className="size-4" aria-hidden="true" />}
                  </Button>
                )}
              </div>
              {trajectory && (
                <TrajectoryBadge trajectory={trajectory} t={t} locale={locale} />
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 opacity-70 transition-opacity hover:opacity-100"
              onClick={onClose}
              aria-label={t("app.close")}
              title={t("app.close")}
            >
              <X data-icon className="size-4" aria-hidden="true" />
            </Button>
          </DrawerHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 sm:px-6 v2-scrollbar">
            <Tabs
              value={activeTab}
              onValueChange={(v) => startTransition(() => setActiveTab(v))}
              className="flex h-full flex-col"
            >
              <TabsList className="mb-4 grid w-full grid-cols-4 rounded-xl bg-muted/40 p-1">
                <TabsTrigger
                  value="overview"
                  className="gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider"
                >
                  <Info data-icon className="size-3" aria-hidden="true" />
                  {t("detail.overview")}
                </TabsTrigger>
                <TabsTrigger
                  value="trends"
                  className="gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider"
                >
                  <TrendingUp data-icon className="size-3" aria-hidden="true" />
                  {t("detail.trends")}
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider"
                >
                  <History data-icon className="size-3" aria-hidden="true" />
                  {t("detail.history")}
                </TabsTrigger>
                <TabsTrigger
                  value="negotiate"
                  className="gap-1.5 text-[0.65rem] font-semibold uppercase tracking-wider"
                >
                  <Scale data-icon className="size-3" aria-hidden="true" />
                  {t("detail.negotiate")}
                </TabsTrigger>
              </TabsList>

              {/* ── OVERVIEW ── */}
              <TabsContent
                value="overview"
                className="mt-0 flex-1 flex flex-col gap-5 pb-8 focus-visible:outline-none"
              >
                <div className="grid grid-cols-2 gap-3">
                  <Card className="v2-card rounded-xl border-border/40 bg-muted/20 py-0 shadow-none">
                    <CardHeader className="p-3 pb-2">
                      <CardDescription className="flex items-center gap-2 text-[0.6rem] font-extrabold uppercase tracking-[0.14em]">
                        <Coins data-icon className="size-3.5 text-primary/70" aria-hidden="true" />
                        {t("results.medianResale")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="font-heading text-xl font-extrabold tracking-tight v2-tabular">
                        {currentSummary
                          ? formatCurrency(currentSummary.medianPrice, locale)
                          : "..."}
                      </div>
                      {detail?.summary.pricePerSqftMedian ? (
                        <div className="mt-1 text-xs font-medium text-muted-foreground">
                          {t("unit.psf", {
                            value: formatNumber(detail.summary.pricePerSqftMedian, 0, locale),
                          })}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                  <Card className="v2-card rounded-xl border-border/40 bg-muted/20 py-0 shadow-none">
                    <CardHeader className="p-3 pb-2">
                      <CardDescription className="flex items-center gap-2 text-[0.6rem] font-extrabold uppercase tracking-[0.14em]">
                        <Clock3 data-icon className="size-3.5 text-primary/70" aria-hidden="true" />
                        {t("results.remainingLease")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="font-heading text-sm font-extrabold tracking-tight">
                        {currentSummary
                          ? formatRemainingLease(currentSummary.leaseCommenceRange, t)
                          : "..."}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <section>
                  <h3 className="v2-section-title mb-3 flex items-center gap-2">
                    <Table data-icon className="size-4" aria-hidden="true" />
                    {t("detail.unitAttributes")}
                  </h3>
                  <Card className="v2-card rounded-xl border-border/40 bg-card/70 py-0 shadow-none">
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
                              className="h-5 text-[0.6rem] font-bold uppercase"
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
                              className="h-5 text-[0.6rem] font-bold uppercase tracking-tight"
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
                            : "..."}
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
                      }))}
                      showLabel={false}
                      t={t}
                      locale={locale}
                    />
                  </section>
                )}

                <section>
                  <h3 className="v2-section-title mb-3 flex items-center gap-2">
                    <Trees data-icon className="size-4" aria-hidden="true" />
                    {t("detail.nearbyAmenities")}
                  </h3>
                  {isComparisonLoading ? (
                    <div className="grid grid-cols-2 gap-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-20 w-full animate-pulse rounded-lg bg-muted/40" />
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
                        <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-muted/40" />
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
              </TabsContent>

              {/* ── TRENDS ── */}
              <TabsContent
                value="trends"
                className="mt-0 flex-1 flex flex-col gap-6 pb-8 focus-visible:outline-none"
              >
                <section>
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                      <TrendingUp data-icon className="size-4" aria-hidden="true" />
                      {t("detail.priceTrendFull")}
                    </h3>
                    <div className="flex items-center gap-1">
                      {RANGE_KEYS.map((key) => (
                        <button
                          key={key}
                          onClick={() => setTrendRange(key)}
                          className={cn(
                            "rounded px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider transition-colors",
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
                          <Suspense fallback={
                            <div className="flex flex-col items-center gap-3 text-muted-foreground opacity-40">
                              <TrendingUp data-icon className="size-8 stroke-[1px] animate-pulse" aria-hidden="true" />
                              <p className="text-xs font-medium tracking-widest uppercase">
                                {t("detail.calculatingTrends")}
                              </p>
                            </div>
                          }>
                            <TrendChart
                              points={trendPoints}
                              t={t}
                              peakMonth={peakMonthInView}
                              height={260}
                            />
                          </Suspense>
                        ) : (
                          <div className="flex flex-col items-center gap-3 text-muted-foreground opacity-40">
                            <TrendingUp data-icon className="size-8 stroke-[1px]" aria-hidden="true" />
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
                  <Card className="border-border/40 bg-card shadow-sm transition-all hover:border-primary/20">
                    <CardHeader className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <CardDescription className="text-[0.6rem] font-bold uppercase tracking-[0.16em]">
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
                        <div className="rounded-full bg-primary/5 p-2 text-primary">
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
              <TabsContent value="history" className="mt-0 flex-1 focus-visible:outline-none">
                <section>
                  <h3 className="mb-4 flex items-center justify-between text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                    <span className="flex items-center gap-2">
                      <History data-icon className="size-4" aria-hidden="true" />
                      {t("detail.recentTransactions")}
                    </span>
                    <Badge variant="outline" className="font-mono text-[0.65rem]">
                      {t("detail.totalCount", { count: detail?.recentTransactions.length ?? 0 })}
                    </Badge>
                  </h3>
                  <ItemGroup className="flex flex-col gap-3 pb-8">
                    {detail?.recentTransactions.map((tx) => (
                      <Item
                        key={tx.id}
                        variant="outline"
                        className="bg-card px-4 py-3 transition-colors hover:bg-muted/30"
                      >
                        <ItemHeader>
                          <ItemContent>
                            <div className="flex flex-col gap-0.5">
                              <strong className="text-sm font-bold tracking-tight">
                                {formatCurrency(tx.resalePrice, locale)}
                              </strong>
                              <ItemDescription className="text-[0.65rem] font-bold uppercase tracking-wider">
                                {tx.flatType} • {tx.storeyRange}
                              </ItemDescription>
                            </div>
                          </ItemContent>
                          <ItemActions>
                            <div className="flex flex-col items-end gap-1">
                              <Badge
                                variant="secondary"
                                className="h-5 text-[0.6rem] font-mono tracking-tighter"
                              >
                                {formatMonth(tx.month, locale)}
                              </Badge>
                              <span className="text-[0.6rem] font-medium text-muted-foreground/60 tracking-tight">
                                {t("unit.sqm", { value: tx.floorAreaSqm })}
                              </span>
                            </div>
                          </ItemActions>
                        </ItemHeader>
                      </Item>
                    ))}
                    {!detail && (
                      <div className="flex flex-col gap-3 py-12">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-16 w-full animate-pulse rounded-lg bg-muted/40"
                          />
                        ))}
                      </div>
                    )}
                  </ItemGroup>
                </section>
              </TabsContent>

              {/* ── NEGOTIATE ── */}
              <TabsContent value="negotiate" className="mt-0 flex-1 pb-8 focus-visible:outline-none">
                {detail ? (
                  <Suspense fallback={
                    <div className="flex flex-col gap-3 py-12">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-20 w-full animate-pulse rounded-lg bg-muted/40" />
                      ))}
                    </div>
                  }>
                    <AskingPriceCheck detail={detail} />
                  </Suspense>
                ) : (
                  <div className="flex flex-col gap-3 py-12">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-20 w-full animate-pulse rounded-lg bg-muted/40" />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          <div className="shrink-0 border-t border-border/40 bg-background/80 p-4 backdrop-blur-md sm:p-6">
            <div className="mx-auto grid w-full grid-cols-2 gap-2.5 sm:gap-4">
              <Button
                className="min-w-0 gap-1.5 px-3 text-[0.68rem] font-bold uppercase tracking-[0.12em] transition-all active:scale-[0.98] sm:gap-2 sm:text-sm sm:tracking-widest"
                size="lg"
                onClick={onToggleShortlist}
                variant={isSaved ? "secondary" : "default"}
                aria-label={isSaved ? t("detail.saved") : t("detail.save")}
              >
                <Bookmark data-icon="inline-start" className={cn("size-4", isSaved && "fill-current")} aria-hidden="true" />
                <span className="truncate">
                  <span className="sm:hidden">
                    {isSaved ? t("results.saved") : t("results.save")}
                  </span>
                  <span className="hidden sm:inline">
                    {isSaved ? t("detail.saved") : t("detail.save")}
                  </span>
                </span>
              </Button>
              <Button
                variant="outline"
                className="min-w-0 gap-1.5 border-border/60 px-3 text-[0.68rem] font-bold uppercase tracking-[0.12em] transition-all active:scale-[0.98] sm:gap-2 sm:text-sm sm:tracking-widest"
                size="lg"
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
                <MapPin data-icon className="size-4" aria-hidden="true" />
                <span className="truncate">{t("detail.directions")}</span>
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
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
    <div className="rounded-md border border-border/40 bg-card/70 px-3 py-2">
      <div className="text-[0.55rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-sm font-extrabold tabular-nums",
          tone === "positive" && "text-success",
          tone === "negative" && "text-destructive",
        )}
      >
        {value}
      </div>
      {sub && <div className="text-[0.58rem] text-muted-foreground">{sub}</div>}
    </div>
  );
}
