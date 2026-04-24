import { startTransition, useState } from "react";
import {
  Bookmark,
  Clock3,
  Coins,
  Compass,
  GraduationCap,
  History,
  Info,
  MapPin,
  Maximize2,
  Store,
  Table,
  TrainFront,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatMeters, formatMonth, formatRemainingLease } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { AddressDetail, BlockSummary } from "@/types/data";
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

const TrendChart = lazy(() => import("./TrendChart").then((m) => ({ default: m.TrendChart })));

type DetailDrawerProps = {
  selectedBlock: BlockSummary | null;
  detail: AddressDetail | null;
  isLoading: boolean;
  isSaved: boolean;
  onClose: () => void;
  onToggleShortlist: () => void;
};

export function DetailDrawer({
  selectedBlock,
  detail,
  isLoading,
  isSaved,
  onClose,
  onToggleShortlist,
}: DetailDrawerProps) {
  const { locale, t } = useI18n();
  const [activeTab, setActiveTab] = useState("overview");

  const currentSummary = detail?.summary ?? selectedBlock;
  const nearbyStations = (currentSummary?.nearbyMrts ?? []).slice(0, 3);

  return (
    <Drawer open={Boolean(selectedBlock)} onClose={onClose} dismissible={false}>
      <DrawerContent
        data-testid="detail-drawer"
        className="h-[85vh] sm:h-[92vh] lg:left-auto lg:right-4 lg:top-4 lg:h-[calc(100vh-2rem)] lg:w-[32rem]"
        hideHandle={true}
      >
        <div className="flex h-full flex-col overflow-hidden">
          <DrawerHeader className="shrink-0 border-b border-border/40 pb-4 pr-12">
            <div className="flex flex-col items-start gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="font-bold tracking-wider">
                  {currentSummary?.town}
                </Badge>
                {isLoading && (
                  <Badge variant="ghost" className="animate-pulse bg-muted/50">
                    {t("app.loadingDetails")}
                  </Badge>
                )}
              </div>
              <DrawerTitle className="text-left font-heading text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {currentSummary ? `${currentSummary.block} ${currentSummary.streetName}` : "..."}
              </DrawerTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-4 top-4 opacity-70 transition-opacity hover:opacity-100"
              onClick={onClose}
              aria-label={t("app.close")}
            >
              <Maximize2 data-icon />
            </Button>
          </DrawerHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6">
            <Tabs
              value={activeTab}
              onValueChange={(v) => startTransition(() => setActiveTab(v))}
              className="flex h-full flex-col"
            >
              <TabsList className="mb-6 grid w-full grid-cols-3 bg-muted/30 p-1">
                <TabsTrigger
                  value="overview"
                  className="gap-2 text-xs font-semibold uppercase tracking-wider"
                >
                  <Info className="size-3.5" />
                  {t("detail.overview")}
                </TabsTrigger>
                <TabsTrigger
                  value="trends"
                  className="gap-2 text-xs font-semibold uppercase tracking-wider"
                >
                  <TrendingUp className="size-3.5" />
                  {t("detail.trends")}
                </TabsTrigger>
                <TabsTrigger
                  value="history"
                  className="gap-2 text-xs font-semibold uppercase tracking-wider"
                >
                  <History className="size-3.5" />
                  {t("detail.history")}
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="overview"
                className="mt-0 flex-1 flex flex-col gap-8 pb-8 focus-visible:outline-none"
              >
                {/* Key Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <Card className="border-border/40 bg-muted/20 shadow-none">
                    <CardHeader className="p-4 pb-2">
                      <CardDescription className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.14em]">
                        <Coins className="size-3.5 text-primary/70" />
                        {t("results.medianResale")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="font-heading text-2xl font-bold tracking-tight">
                        {currentSummary
                          ? formatCurrency(currentSummary.medianPrice, locale)
                          : "..."}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-border/40 bg-muted/20 shadow-none">
                    <CardHeader className="p-4 pb-2">
                      <CardDescription className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.14em]">
                        <Clock3 className="size-3.5 text-primary/70" />
                        {t("results.remainingLease")}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="font-heading text-sm font-bold tracking-tight">
                        {currentSummary
                          ? formatRemainingLease(currentSummary.leaseCommenceRange, t)
                          : "..."}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* MRT Connectivity */}
                <section>
                  <h3 className="mb-4 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                    <TrainFront className="size-4" />
                    {t("detail.connectivity")}
                  </h3>
                  <div className="flex flex-col gap-3">
                    {nearbyStations.length > 0 ? (
                      nearbyStations.map((mrt, idx) => (
                        <div
                          key={mrt.stationName}
                          className={cn(
                            "flex items-center justify-between rounded-lg border border-border/40 p-3 shadow-sm",
                            idx === 0 ? "bg-primary/[0.03] ring-1 ring-primary/10" : "bg-card",
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div className="size-2 rounded-full bg-primary ring-2 ring-offset-2 ring-primary/20" />
                            <div className="flex flex-col">
                              <span className="text-sm font-bold leading-none">
                                {mrt.stationName}
                              </span>
                            </div>
                          </div>
                          <Badge
                            variant={idx === 0 ? "default" : "secondary"}
                            className="h-6 font-mono text-[0.7rem] tabular-nums"
                          >
                            {formatMeters(mrt.distanceMeters, t, locale)}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <p className="py-2 text-sm text-muted-foreground italic">
                        {t("detail.noMrtData")}
                      </p>
                    )}
                  </div>
                </section>

                {/* Flat Types & Attributes */}
                <section>
                  <h3 className="mb-4 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                    <Table className="size-4" />
                    {t("detail.unitAttributes")}
                  </h3>
                  <Card className="border-border/40 bg-card/50 shadow-none">
                    <CardContent className="divide-y divide-border/40 p-0">
                      <div className="flex items-center justify-between p-4">
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
                              {type}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-4">
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
	                      <div className="flex items-center justify-between p-4">
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
	                      <div className="flex items-center justify-between p-4">
	                        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
	                          <Compass className="size-3.5" />
	                          Orientation
	                        </span>
	                        <Badge variant="ghost" className="text-[0.65rem] font-bold uppercase">
	                          Pipeline coming soon
	                        </Badge>
	                      </div>
	                      <div className="flex items-center justify-between p-4">
	                        <span className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
	                          <Users className="size-3.5" />
	                          EIP Quota Status
	                        </span>
	                        <Badge variant="ghost" className="text-[0.65rem] font-bold uppercase">
	                          Pipeline coming soon
	                        </Badge>
	                      </div>
	                    </CardContent>
	                  </Card>
	                </section>

                        {/* Environment & Amenities */}
                        <section>
                        <h3 className="mb-4 flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                        <MapPin className="size-4" />
                        Environment & Amenities
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                        <Card className="border-border/40 bg-muted/20 shadow-none">
                        <CardHeader className="p-4 pb-2">
                          <CardDescription className="flex items-center gap-2 text-[0.6rem] font-bold uppercase tracking-[0.14em]">
                            <GraduationCap className="size-3.5 text-primary/70" />
                            Primary Schools
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <p className="text-xs italic text-muted-foreground/60">
                            Data pipeline for 1km/2km school proximity is coming soon.
                          </p>
                        </CardContent>
                        </Card>
                        <Card className="border-border/40 bg-muted/20 shadow-none">
                        <CardHeader className="p-4 pb-2">
                          <CardDescription className="flex items-center gap-2 text-[0.6rem] font-bold uppercase tracking-[0.14em]">
                            <Store className="size-3.5 text-primary/70" />
                            Local Amenities
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                          <p className="text-xs italic text-muted-foreground/60">
                            Data pipeline for nearby markets and hawkers is coming soon.
                          </p>
                        </CardContent>
                        </Card>
                        </div>
                        </section>

              </TabsContent>

              <TabsContent
                value="trends"
                className="mt-0 flex-1 flex flex-col gap-6 focus-visible:outline-none"
              >
                <section>
                  <h3 className="mb-4 flex items-center justify-between text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                    <span className="flex items-center gap-2">
                      <TrendingUp className="size-4" />
                      {t("detail.priceTrend", { count: 24 })}
                    </span>
                    <Badge variant="outline" className="font-mono text-[0.65rem]">
                      {t("shortlist.currencyCode")} / {t("unit.month")}
                    </Badge>
                  </h3>
                  <Card className="overflow-hidden border-border/40 bg-muted/10 shadow-none">
                    <CardContent className="p-0">
                      <div className="flex h-[280px] items-center justify-center pt-4">
                        {detail ? (
                          <TrendChart points={detail.monthlyTrend.slice(-24)} />
                        ) : (
                          <div className="flex flex-col items-center gap-3 text-muted-foreground opacity-40">
                            <TrendingUp className="size-8 stroke-[1px]" />
                            <p className="text-xs font-medium tracking-widest uppercase">
                              {t("detail.calculatingTrends")}
                            </p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
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
                            {t("detail.townAverage", { town: currentSummary?.town ?? "" })}
                          </CardTitle>
                        </div>
                        <div className="rounded-full bg-primary/5 p-2 text-primary">
                          <TrendingUp className="size-5" />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 pt-0">
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {t("detail.marketRankDescription", { town: currentSummary?.town ?? "" })}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="history" className="mt-0 flex-1 focus-visible:outline-none">
                <section>
                  <h3 className="mb-4 flex items-center justify-between text-[0.7rem] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                    <span className="flex items-center gap-2">
                      <History className="size-4" />
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
            </Tabs>
          </div>

          <div className="shrink-0 border-t border-border/40 bg-background/80 p-4 backdrop-blur-md sm:p-6">
            <div className="mx-auto flex w-full gap-3 sm:gap-4">
              <Button
                className="flex-1 gap-2 font-bold uppercase tracking-widest transition-all active:scale-[0.98]"
                size="lg"
                onClick={onToggleShortlist}
                variant={isSaved ? "secondary" : "default"}
              >
                <Bookmark data-icon="inline-start" className={isSaved ? "fill-current" : ""} />
                {isSaved ? t("detail.saved") : t("detail.save")}
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2 border-border/60 font-bold uppercase tracking-widest transition-all active:scale-[0.98]"
                size="lg"
                onClick={() => {
                  const url = new URL("https://www.google.com/maps/search/");
                  url.searchParams.append("api", "1");
                  url.searchParams.append(
                    "query",
                    `${currentSummary?.block} ${currentSummary?.streetName} Singapore`,
                  );
                  window.open(url.toString(), "_blank");
                }}
              >
                <MapPin data-icon />
                {t("detail.directions")}
              </Button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
