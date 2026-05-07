import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  Languages,
  List,
  Moon,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import {
  DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS,
  HEADER_DISMISSED_STORAGE_KEY,
  MEDIAN_PRICE_LEGEND_GRADIENT,
} from "@/lib/constants";
import {
  getSelectionByAddressKey,
  matchesFilter,
  matchesGeographicSearchIntent,
  resolveGeographicSearchIntent,
} from "@/lib/filtering";
import { getActiveFilterChipDescriptors } from "@/lib/filterChips";
import { useI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/types";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useShortlist } from "@/hooks/useShortlist";
import { useManifestData } from "@/hooks/useManifestData";
import { useSelectedBlockArtifacts } from "@/hooks/useSelectedBlockArtifacts";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { usePanelState, type PanelTab } from "@/hooks/usePanelState";
import { useBlockLoading } from "@/hooks/useBlockLoading";
import { useShortlistArtifacts } from "@/hooks/useShortlistArtifacts";
import { useTheme } from "@/hooks/useTheme";
import { safeStorage } from "@/lib/storage";
import { formatDateTime, formatMonth } from "@/lib/format";
import type {
  Coordinates,
} from "@/types/data";
import { DrawerSkeleton } from "@/components/DrawerSkeleton";
import { FilterPanel } from "@/components/FilterPanel";
import { MapSkeleton } from "@/components/MapSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const MapView = lazy(() => import("@/components/MapView").then((m) => ({ default: m.MapView })));
const DetailDrawer = lazy(() =>
  import("@/components/DetailDrawer").then((m) => ({ default: m.DetailDrawer })),
);
const ShortlistDrawer = lazy(() =>
  import("@/components/ShortlistDrawer").then((m) => ({
    default: m.ShortlistDrawer,
  })),
);
const ResultsPane = lazy(() =>
  import("@/components/ResultsPane").then((m) => ({ default: m.ResultsPane })),
);

type FilterChip = {
  key: string;
  label: string;
  onRemove: () => void;
};

function App() {
  const { locale, setLocale, t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { manifest, error } = useManifestData();
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [isMobileHeaderOpen, setIsMobileHeaderOpen] = useState(false);

  const shortlist = useShortlist();
  const { isDesktop, desktopTab, mobileTab, isDesktopPanelOpen, isShortlistOpen, resultsVisible, savedVisible, setDesktopTab, setMobileTab, setIsDesktopPanelOpen, setIsShortlistOpen } = usePanelState();
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [hasInteractedWithMap, setHasInteractedWithMap] = useState(false);
  const [hasLoadedHeaderPreference, setHasLoadedHeaderPreference] = useState(false);
  const { toggle: toggleShortlist } = shortlist;
  const { filters, patchFilters, resetFilters } = useUrlFilters();
  const selectedAddressKey = filters.selectedAddressKey;
  const { detail, comparison, isDetailLoading, isComparisonLoading } =
    useSelectedBlockArtifacts(selectedAddressKey);
  // Debounce search for the map only so list interactions stay in sync with
  // the visible result rows while the heavier map updates trail slightly.
  const debouncedSearch = useDebouncedValue(filters.search, 200);

  const sortedTowns = useMemo(
    () => manifest?.filterOptions.towns.slice().sort((a, b) => b.length - a.length) ?? [],
    [manifest],
  );

  const { blocks, loadError } = useBlockLoading({
    manifest,
    townFilter: filters.town,
    debouncedSearch,
    userLocationPresent: Boolean(userLocation),
    selectedAddressKey,
    sortedTowns,
    savedVisible,
    shortlistCount: shortlist.items.length,
  });



  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = safeStorage.getItem(HEADER_DISMISSED_STORAGE_KEY);
      if (stored === "1") {
        setIsHeaderVisible(false);
        setHasInteractedWithMap(true);
      }
      setHasLoadedHeaderPreference(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hasLoadedHeaderPreference) {
      return;
    }

    safeStorage.setItem(HEADER_DISMISSED_STORAGE_KEY, isHeaderVisible ? "0" : "1");
  }, [hasLoadedHeaderPreference, isHeaderVisible]);

  const stableFilters = useMemo(
    () => ({ ...filters, selectedAddressKey: null }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      filters.search,
      filters.town,
      filters.flatType,
      filters.flatModel,
      filters.budgetMin,
      filters.budgetMax,
      filters.areaMin,
      filters.areaMax,
      filters.remainingLeaseMin,
      filters.startMonth,
      filters.endMonth,
      filters.mrtMax,
    ],
  );
  const mapFilters = useMemo(
    () => ({ ...stableFilters, search: debouncedSearch }),
    [debouncedSearch, stableFilters],
  );
  const geographicIntent = useMemo(
    () =>
      resolveGeographicSearchIntent(
        filters.search,
        blocks,
        filters.mrtMax ?? DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS,
        userLocation,
        t("filters.nearMe"),
      ),
    [blocks, filters.mrtMax, filters.search, userLocation, t],
  );
  const mapGeographicIntent = useMemo(
    () =>
      resolveGeographicSearchIntent(
        mapFilters.search,
        blocks,
        mapFilters.mrtMax ?? DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS,
        userLocation,
        t("filters.nearMe"),
      ),
    [blocks, mapFilters.mrtMax, mapFilters.search, userLocation, t],
  );
  const hasResultScope = Boolean(
    filters.town || filters.search.trim() || geographicIntent || selectedAddressKey,
  );
  const hasMapMarkerScope = Boolean(
    mapFilters.town || mapFilters.search.trim() || mapGeographicIntent,
  );
  const filteredBlocks = useMemo(
    () =>
      resultsVisible && hasResultScope
        ? blocks.filter((block) => {
            if (!matchesFilter(block, stableFilters, geographicIntent)) {
              return false;
            }
            return geographicIntent ? matchesGeographicSearchIntent(block, geographicIntent) : true;
          })
        : [],
    [blocks, geographicIntent, hasResultScope, resultsVisible, stableFilters],
  );
  const mapFilteredBlocks = useMemo(() => {
    const scopedBlocks = hasMapMarkerScope
      ? blocks.filter((block) => {
          if (!matchesFilter(block, mapFilters, mapGeographicIntent)) {
            return false;
          }
          return mapGeographicIntent
            ? matchesGeographicSearchIntent(block, mapGeographicIntent)
            : true;
        })
      : [];

    if (!selectedAddressKey) {
      return scopedBlocks;
    }

    if (scopedBlocks.some((block) => block.addressKey === selectedAddressKey)) {
      return scopedBlocks;
    }

    const selected = getSelectionByAddressKey(blocks, selectedAddressKey);
    return selected ? [...scopedBlocks, selected] : scopedBlocks;
  }, [blocks, hasMapMarkerScope, mapFilters, mapGeographicIntent, selectedAddressKey]);
  const shortlistKeySet = useMemo(
    () => new Set(shortlist.items.map((item) => item.addressKey)),
    [shortlist.items],
  );
  const selectedBlock = useMemo(
    () => getSelectionByAddressKey(blocks, selectedAddressKey),
    [blocks, selectedAddressKey],
  );
  const detailVisible = Boolean(selectedAddressKey);
  const detailLoading = detailVisible && isDetailLoading;
  const comparisonLoading = detailVisible && isComparisonLoading;
  const { shortlistRows } = useShortlistArtifacts({
    blocks,
    items: shortlist.items,
    savedVisible,
    selectedDetail: detail,
    selectedComparison: comparison,
    isShortlistOpen,
  });


  const activeFilterChips = useMemo<FilterChip[]>(
    () =>
      getActiveFilterChipDescriptors(filters, locale, t).map((chip) => ({
        key: chip.key,
        label: chip.label,
        onRemove: () => patchFilters(chip.clearPatch),
      })),
    [filters, locale, patchFilters, t],
  );

  const handleSelectAddress = useCallback(
    (addressKey: string) => {
      if (isDesktop) {
        setIsDesktopPanelOpen(true);
        setDesktopTab("results");
      } else {
        setMobileTab("results");
      }

      patchFilters({ selectedAddressKey: addressKey });
    },
    [isDesktop, patchFilters, setDesktopTab, setIsDesktopPanelOpen, setMobileTab],
  );

  const handleToggleShortlist = useCallback(
    (addressKey: string) => toggleShortlist(addressKey),
    [toggleShortlist],
  );

  const handleGeolocate = useCallback(
    (coords: Coordinates) => {
      setUserLocation(coords);
      patchFilters({ search: t("filters.nearMe") });
    },
    [patchFilters, t],
  );

  function handleMapInteract(interactionType: "background" | "feature" = "background") {
    if (!hasInteractedWithMap) {
      setIsHeaderVisible(false);
      setHasInteractedWithMap(true);
    }

    if (interactionType === "feature") {
      return;
    }

    if (isDesktop) {
      setIsDesktopPanelOpen(false);
      return;
    }

    setMobileTab(null);
  }

  if (error || loadError) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center p-4 sm:p-6 lg:p-8">
        <Card className="w-full bg-background">
          <CardHeader className="gap-3">
            <CardTitle className="text-3xl">{t("app.title")}</CardTitle>
            <CardDescription>
              {t("app.missingData")} · {error ?? loadError}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2 text-sm text-muted-foreground">
            {t("app.syncDataHint")}
          </CardContent>
        </Card>
      </main>
    );
  }

  if (!manifest) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center p-4 sm:p-6 lg:p-8">
        <Card className="w-full bg-background">
          <CardHeader className="gap-3">
            <CardTitle className="text-3xl">{t("app.title")}</CardTitle>
            <CardDescription>
              {t("app.loadingData")} · {t("app.loadingDescription")}
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // Shared content blocks (rendered in both mobile tabs and desktop grid)
  const filterContent = (
    <FilterPanel
      filters={filters}
      maxMonth={manifest.dataWindow.maxMonth}
      minMonth={manifest.dataWindow.minMonth}
      onChange={patchFilters}
      onReset={() => {
        resetFilters();
      }}
      options={manifest.filterOptions}
    />
  );

  const mapContent = (
    <Suspense fallback={<MapSkeleton />}>
      <MapView
        blocks={mapFilteredBlocks}
        onSelect={handleSelectAddress}
        selectedAddressKey={selectedAddressKey}
        townFilter={mapFilters.town}
        autoFitKey={
          mapGeographicIntent
            ? `${mapGeographicIntent.type}:${mapFilters.search.trim().toLowerCase()}`
            : mapFilters.search.trim()
              ? `search:${mapFilters.search.trim().toLowerCase()}`
              : null
        }
        showBlockMarkers={hasMapMarkerScope}
        onMapInteract={handleMapInteract}
        onGeolocate={handleGeolocate}
        locale={locale}
        t={t}
      />
    </Suspense>
  );

  const selectedDetailContent =
    detailVisible || detailLoading ? (
      <Suspense fallback={<DrawerSkeleton label={t("app.loadingDetails")} />}>
        <DetailDrawer
          detail={detail}
          comparison={comparison}
          selectedBlock={selectedBlock}
          isLoading={detailLoading}
          isComparisonLoading={comparisonLoading}
          isSaved={selectedBlock ? shortlist.has(selectedBlock.addressKey) : false}
          onClose={() => patchFilters({ selectedAddressKey: null })}
          onToggleShortlist={() => {
            if (selectedBlock) {
              shortlist.toggle(selectedBlock.addressKey);
            }
          }}
        />
      </Suspense>
    ) : null;

  const resultsPaneContent = resultsVisible ? (
    <Suspense fallback={<DrawerSkeleton label={t("app.loadingResults")} />}>
      <ResultsPane
        blocks={filteredBlocks}
        hasResultScope={hasResultScope}
        onSelect={handleSelectAddress}
        onToggleShortlist={handleToggleShortlist}
        selectedAddressKey={selectedAddressKey}
        shortlistKeys={shortlistKeySet}
        isCompact
      />
    </Suspense>
  ) : null;
  const savedContent = savedVisible ? (
    <Suspense fallback={<DrawerSkeleton label={t("app.loadingShortlist")} />}>
      <ShortlistDrawer
        isOpen={isShortlistOpen}
        onSelectAddress={handleSelectAddress}
        onRemove={(addressKey) => shortlist.toggle(addressKey)}
        onToggleOpen={() => setIsShortlistOpen((current) => !current)}
        onUpdate={(addressKey, patch) => shortlist.update(addressKey, patch)}
        rows={shortlistRows}
      />
    </Suspense>
  ) : null;

  const desktopPanelWidths: Record<PanelTab, string> = {
    filters: "w-[min(30rem,34vw)]",
    results: "w-[min(34rem,38vw)]",
    saved: "w-[min(44rem,48vw)]",
  };
  const isSavedDashboardOpen = isDesktop && isDesktopPanelOpen && desktopTab === "saved";

  return (
    <>
      <main
        className={cn(
          "fixed inset-0 w-full overflow-hidden",
          isSavedDashboardOpen && "saved-dashboard-open",
        )}
      >
        <h1 className="sr-only">{t("app.title")}</h1>
        <div className="absolute inset-0">{mapContent}</div>
        <a
          className="map-attribution-link"
          href="https://www.onemap.gov.sg/home"
          rel="noopener noreferrer"
          target="_blank"
        >
          © OneMap contributors
        </a>

        {(!isDesktop || isHeaderVisible) && manifest ? (
          <header
            data-testid={isDesktop ? "global-header" : undefined}
            className={cn(
              "pointer-events-none absolute z-30 flex items-start gap-2",
              isDesktop ? "left-6 top-6 max-w-[min(42rem,calc(100vw-12rem))]" : "left-3 top-3 max-w-[70vw]",
            )}
          >
            <button
              type="button"
              aria-expanded={isMobileHeaderOpen}
              onClick={() => setIsMobileHeaderOpen((o) => !o)}
              className={cn(
                "pointer-events-auto flex min-w-0 items-center gap-2 rounded-xl border border-border/20 bg-background/90 px-3 py-2 text-left backdrop-blur-[20px] transition-all shadow-[0_4px_16px_rgba(23,28,31,0.08)] dark:border-primary/15 dark:bg-card/90 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_4px_24px_rgba(4,12,24,0.7)]",
                isMobileHeaderOpen && "items-start",
              )}
            >
              {!isMobileHeaderOpen ? (
                <>
                  <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
                  <span data-testid="header-title" className="truncate text-[0.7rem] font-bold leading-none">
                    {t("app.title")}
                  </span>
                  <Badge variant="outline" className="h-5 shrink-0 border-border/35 bg-muted/30 px-1.5 text-[0.58rem] font-bold">
                    {t("stats.dataThrough", { month: formatMonth(manifest.dataWindow.maxMonth, locale) })}
                  </Badge>
                  <span className="hidden text-[0.6rem] font-medium text-muted-foreground sm:inline">
                    · {manifest.counts.transactions.toLocaleString(locale)}
                  </span>
                </>
              ) : (
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
                    <span data-testid="header-title" className="truncate text-[0.82rem] font-bold leading-tight">
                      {t("app.title")}
                    </span>
                  </span>
                  <Badge variant="outline" className="h-5 w-fit border-border/35 bg-muted/30 px-1.5 text-[0.58rem] font-bold">
                    {t("stats.dataThrough", { month: formatMonth(manifest.dataWindow.maxMonth, locale) })}
                  </Badge>
                  <span className="text-[0.6rem] font-medium text-muted-foreground">
                    {t("stats.txns", { count: manifest.counts.transactions.toLocaleString(locale) })} ·{" "}
                    {t("stats.built", { date: formatDateTime(manifest.generatedAt, locale) })} · OneMap
                  </span>
                </span>
              )}
            </button>

            {isDesktop ? (
              <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-border/20 bg-background/90 p-1 backdrop-blur-[20px] shadow-[0_4px_16px_rgba(23,28,31,0.08)] dark:border-primary/15 dark:bg-card/90 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_4px_24px_rgba(4,12,24,0.7)]">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 p-0 text-muted-foreground hover:text-foreground"
                  onClick={toggleTheme}
                  aria-label={t("app.toggleTheme")}
                >
                  {theme === "light" ? (
                    <Moon data-icon className="size-4" />
                  ) : (
                    <Sun data-icon className="size-4" />
                  )}
                </Button>

                <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                  <SelectTrigger
                    aria-label={t("language.label")}
                    className="h-8 min-w-20 border-border/30 bg-background/60 px-2 py-0 text-xs shadow-sm backdrop-blur-sm"
                  >
                    <div className="flex items-center gap-1.5">
                      <Languages data-icon className="size-3 opacity-60" />
                      <SelectValue placeholder={t("language.label")} />
                    </div>
                  </SelectTrigger>
                  <SelectContent align="end">
                    <SelectItem value="en-SG" className="text-xs">
                      {t("language.en")}
                    </SelectItem>
                    <SelectItem value="zh-SG" className="text-xs">
                      {t("language.zh")}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsHeaderVisible(false)}
                  aria-label={t("app.dismissHeader")}
                >
                  <X data-icon className="size-4" />
                </Button>
              </div>
            ) : null}
          </header>
        ) : null}

        {/* Price-color map legend — only when map is visible (no mobile panel open) */}
        {hasMapMarkerScope && (isDesktop || mobileTab === null) && (
          <div
            role="img"
            aria-label="Map legend: median price colour ramp from S$400K (low) to S$1.3M+ (high)"
            className="pointer-events-none absolute z-25 rounded-lg border border-border/20 bg-background/90 p-2 backdrop-blur-[20px] shadow-[0_4px_16px_rgba(23,28,31,0.06)] dark:border-primary/10 dark:bg-card/90 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_4px_20px_rgba(4,12,24,0.7)]"
            style={{ bottom: isDesktop ? "4rem" : "8rem", right: isDesktop ? "4.5rem" : "0.75rem" }}
          >
            <p className="mb-1 text-[0.55rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">Median S$</p>
            <div
              aria-hidden="true"
              className="h-1.5 w-20 rounded-full"
              style={{ background: MEDIAN_PRICE_LEGEND_GRADIENT }}
            />
            <div aria-hidden="true" className="mt-0.5 flex justify-between text-[0.55rem] font-medium text-muted-foreground">
              <span>400K</span><span>1.3M</span>
            </div>
          </div>
        )}

        {activeFilterChips.length > 0 && (
          <div
            role="toolbar"
            aria-label={t("filters.title")}
            className={cn(
              "pointer-events-auto absolute z-25 flex gap-2 overflow-x-auto pb-1 transition-all",
              isDesktop ? cn("left-6 top-[5rem]", isSavedDashboardOpen ? "right-[calc(min(44rem,48vw)+2rem)]" : "right-[8rem]") : "left-0 right-0 top-[3.6rem] px-3",
            )}
            style={{ scrollbarWidth: "none" }}
          >
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                aria-label={t("filters.removeChip", { label: chip.label })}
                onClick={chip.onRemove}
                className="filter-chip flex shrink-0 items-center gap-1 rounded-full border border-foreground/80 bg-foreground px-3 py-1.5 text-[0.65rem] font-semibold leading-none text-background shadow-sm backdrop-blur-[16px] transition-all"
              >
                {chip.label} <span aria-hidden="true" className="opacity-70">×</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (isDesktop) {
                  setDesktopTab("filters");
                  setIsDesktopPanelOpen(true);
                  return;
                }
                setMobileTab("filters");
              }}
              className="filter-chip flex shrink-0 items-center gap-1 rounded-full border border-border/30 bg-background/90 px-3 py-1.5 text-[0.65rem] font-semibold leading-none text-foreground shadow-sm backdrop-blur-[16px] transition-all"
            >
              <SlidersHorizontal className="size-3" aria-hidden="true" /> {t("tab.filters")}
            </button>
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 z-20 flex h-full flex-col gap-3 overflow-hidden p-3 pb-[calc(var(--mobile-tab-bar-height)+env(safe-area-inset-bottom,0px)+0.5rem)] sm:p-4 lg:gap-4 lg:p-6 lg:pb-6">
          {isDesktop && !isHeaderVisible ? (
            <div className="pointer-events-auto absolute left-6 top-6 z-30">
              <Button
                variant="outline"
                size="xs"
                className="h-8 rounded-xl border-border/20 bg-background/90 px-3 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground backdrop-blur-[20px] transition-colors hover:text-foreground shadow-[0_4px_16px_rgba(23,28,31,0.08)] dark:border-primary/15 dark:bg-card/90 dark:text-primary/60 dark:hover:text-primary dark:shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_4px_24px_rgba(4,12,24,0.7)]"
                onClick={() => setIsHeaderVisible(true)}
              >
                {t("app.showHeader")}
              </Button>
            </div>
          ) : null}

          {isDesktop ? (
            <section className="pointer-events-none relative min-h-0 flex-1">
              <aside
                id="desktop-panel"
                aria-hidden={!isDesktopPanelOpen}
                {...(!isDesktopPanelOpen && { inert: true })}
                data-open={isDesktopPanelOpen ? "true" : "false"}
                data-mode={desktopTab}
                className={cn(
                  "pointer-events-auto absolute flex max-w-[calc(100vw-3rem)] flex-col overflow-hidden border border-border/20 bg-card/94 backdrop-blur-[20px] transition-[transform,opacity] duration-200 ease-out shadow-[0_-8px_32px_rgba(23,28,31,0.08)] dark:border-primary/10 dark:bg-card dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_-16px_64px_rgba(4,12,24,0.92)]",
                  desktopTab === "saved"
                    ? "bottom-0 right-0 top-0 max-h-none min-h-full rounded-none border-y-0 border-r-0 shadow-[-8px_0_32px_rgba(23,28,31,0.08)]"
                    : "bottom-20 left-6 max-h-[min(44rem,calc(100vh-12rem))] min-h-[24rem] rounded-2xl",
                  isDesktopPanelOpen
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-6 opacity-0",
                  desktopPanelWidths[desktopTab],
                )}
              >
                <div className="flex h-full min-h-0 flex-col">
                  <div
                    id="desktop-filters-content"
                    aria-hidden={desktopTab !== "filters"}
                    className={cn(
                      "h-full overflow-y-auto p-3 pb-8",
                      desktopTab === "filters" ? "block" : "hidden",
                    )}
                  >
                    {filterContent}
                  </div>
                  <div
                    id="desktop-results-content"
                    aria-hidden={desktopTab !== "results"}
                    className={cn(
                      "h-full min-h-0 flex-col gap-3 overflow-hidden p-3 pb-8",
                      desktopTab === "results" ? "flex" : "hidden",
                    )}
                  >
                    <div
                      className={cn(
                        "min-h-0 flex-1 flex-col",
                        detailVisible || detailLoading ? "hidden" : "flex",
                      )}
                    >
                      {resultsPaneContent}
                    </div>
                    {/* Render detail inline so it replaces results when active */}
                    <div
                      className={cn(
                        "min-h-0 flex-1 flex-col",
                        detailVisible || detailLoading ? "flex" : "hidden",
                      )}
                    >
                      {selectedDetailContent}
                    </div>
                  </div>
                  <div
                    id="desktop-saved-content"
                    aria-hidden={desktopTab !== "saved"}
                    className={cn(
                      "h-full min-h-0 flex-col overflow-hidden p-3 pb-8",
                      desktopTab === "saved" ? "flex" : "hidden",
                    )}
                  >
                    {savedContent}
                  </div>
                </div>
              </aside>
            </section>
          ) : (
            <section className="pointer-events-none relative min-h-0 flex-1">
              {mobileTab && (
                <div
                  id="mobile-panel"
                  className={cn(
                    "pointer-events-auto absolute inset-x-0 bottom-0 overflow-hidden rounded-t-2xl border border-border/20 bg-card/94 backdrop-blur-[20px] transition-all shadow-[0_-8px_32px_rgba(23,28,31,0.08)] dark:border-primary/10 dark:bg-card dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),inset_0_1px_0_rgba(34,211,238,0.05),0_-16px_48px_rgba(4,12,24,0.92)]",
                    activeFilterChips.length > 0 ? "top-[4.5rem]" : "top-0"
                  )}
                >
                  <div
                    id="mobile-filters-content"
                    className={cn("h-full overflow-y-auto p-3 pb-12", mobileTab === "filters" ? "block" : "hidden")}
                  >
                    {filterContent}
                  </div>
                  <div
                    id="mobile-results-content"
                    className={cn("h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 pb-12", mobileTab === "results" ? "flex" : "hidden")}
                  >
                    <div
                      className={cn(
                        "min-h-0 flex-1 flex-col",
                        detailVisible || detailLoading ? "hidden" : "flex",
                      )}
                    >
                      {resultsPaneContent}
                    </div>
                    {/* Render detail inline so it replaces results when active */}
                    <div
                      className={cn(
                        "min-h-0 flex-1 flex-col",
                        detailVisible || detailLoading ? "flex" : "hidden",
                      )}
                    >
                      {selectedDetailContent}
                    </div>
                  </div>
                  <div
                    id="mobile-saved-content"
                    className={cn("h-full min-h-0 flex-col overflow-hidden p-3 pb-12", mobileTab === "saved" ? "flex" : "hidden")}
                  >
                    {savedContent}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {isDesktop && (
        <nav className="desktop-tab-bar" aria-label={t("app.title")}>
          <Button
            type="button"
            variant={desktopTab === "filters" && isDesktopPanelOpen ? "secondary" : "ghost"}
            size="sm"
            data-active={desktopTab === "filters" && isDesktopPanelOpen}
            aria-expanded={desktopTab === "filters" && isDesktopPanelOpen}
            aria-controls={desktopTab === "filters" && isDesktopPanelOpen ? "desktop-filters-content" : undefined}
            onClick={() => {
              setDesktopTab("filters");
              setIsDesktopPanelOpen((current) => (desktopTab === "filters" ? !current : true));
            }}
          >
            <SlidersHorizontal data-icon />
            <span>{t("tab.filters")}</span>
          </Button>
          <Button
            type="button"
            variant={desktopTab === "results" && isDesktopPanelOpen ? "secondary" : "ghost"}
            size="sm"
            data-active={desktopTab === "results" && isDesktopPanelOpen}
            aria-expanded={desktopTab === "results" && isDesktopPanelOpen}
            aria-controls={desktopTab === "results" && isDesktopPanelOpen ? "desktop-results-content" : undefined}
            onClick={() => {
              setDesktopTab("results");
              setIsDesktopPanelOpen((current) => (desktopTab === "results" ? !current : true));
            }}
          >
            <List data-icon />
            <span>{t("tab.results")}</span>
          </Button>
          <Button
            type="button"
            variant={desktopTab === "saved" && isDesktopPanelOpen ? "secondary" : "ghost"}
            size="sm"
            data-active={desktopTab === "saved" && isDesktopPanelOpen}
            aria-expanded={desktopTab === "saved" && isDesktopPanelOpen}
            aria-controls={desktopTab === "saved" && isDesktopPanelOpen ? "desktop-saved-content" : undefined}
            onClick={() => {
              setDesktopTab("saved");
              setIsDesktopPanelOpen((current) => (desktopTab === "saved" ? !current : true));
            }}
          >
            <Bookmark data-icon className={desktopTab === "saved" && isDesktopPanelOpen ? "fill-current" : ""} />
            <span>{t("tab.saved")}</span>
            {shortlist.items.length > 0 ? (
              <Badge variant="outline" className="ml-0.5 h-4 min-w-4 px-1 text-[0.58rem]">
                {shortlist.items.length}
              </Badge>
            ) : null}
          </Button>
        </nav>
      )}

      {/* Mobile bottom tab bar */}
      {!isDesktop && (
        <nav className="mobile-tab-bar" aria-label={t("app.title")}>
          <Button
            type="button"
            variant={mobileTab === "filters" ? "secondary" : "ghost"}
            size="sm"
            data-active={mobileTab === "filters"}
            aria-expanded={mobileTab === "filters"}
            aria-controls={mobileTab === "filters" ? "mobile-filters-content" : undefined}
            onClick={() => setMobileTab((current) => (current === "filters" ? null : "filters"))}
          >
            <SlidersHorizontal data-icon />
            <span>{t("tab.filters")}</span>
          </Button>
          <Button
            type="button"
            variant={mobileTab === "results" ? "secondary" : "ghost"}
            size="sm"
            data-active={mobileTab === "results"}
            aria-expanded={mobileTab === "results"}
            aria-controls={mobileTab === "results" ? "mobile-results-content" : undefined}
            onClick={() => setMobileTab((current) => (current === "results" ? null : "results"))}
          >
            <List data-icon />
            <span>{t("tab.results")}</span>
          </Button>
          <Button
            type="button"
            variant={mobileTab === "saved" ? "secondary" : "ghost"}
            size="sm"
            data-active={mobileTab === "saved"}
            aria-expanded={mobileTab === "saved"}
            aria-controls={mobileTab === "saved" ? "mobile-saved-content" : undefined}
            onClick={() => setMobileTab((current) => (current === "saved" ? null : "saved"))}
          >
            <Bookmark data-icon className={mobileTab === "saved" ? "fill-current" : ""} />
            <span>{t("tab.saved")}</span>
            {shortlist.items.length > 0 ? (
              <Badge variant="outline" className="ml-0.5 h-4 min-w-4 px-1 text-[0.58rem]">
                {shortlist.items.length}
              </Badge>
            ) : null}
          </Button>
        </nav>
      )}
    </>
  );
}

export default App;
