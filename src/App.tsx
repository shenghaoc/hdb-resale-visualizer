import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Languages,
  List,
  Loader2,
  LocateFixed,
  Moon,
  SlidersHorizontal,
  Sun,
  X,
} from "lucide-react";
import {
  DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS,
  getDefaultTransactionStartMonth,
  HEADER_DISMISSED_STORAGE_KEY,
  MEDIAN_PRICE_LEGEND_GRADIENT,
  NEAR_ME_SEARCH_QUERY,
} from "@/lib/constants";
import {
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
import { usePanelState } from "@/hooks/usePanelState";
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
  const [isLocating, setIsLocating] = useState(false);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const geolocationRequestRef = useRef(0);
  const [isMobileHeaderOpen, setIsMobileHeaderOpen] = useState(false);

  const shortlist = useShortlist();
  const { isDesktop, leftTab, isLeftPanelOpen, isRightPanelOpen, setLeftTab, setIsLeftPanelOpen, setIsRightPanelOpen, mobileTab, setMobileTab, isShortlistOpen, resultsVisible, savedVisible, setIsShortlistOpen } = usePanelState();
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [hasInteractedWithMap, setHasInteractedWithMap] = useState(false);
  const [hasLoadedHeaderPreference, setHasLoadedHeaderPreference] = useState(false);
  const { toggle: toggleShortlist } = shortlist;
  const { filters, patchFilters, resetFilters } = useUrlFilters();
  const [useDefaultStartMonth, setUseDefaultStartMonth] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }

    return !new URLSearchParams(window.location.search).has("startMonth");
  });
  const defaultStartMonth = useMemo(
    () =>
      manifest
        ? getDefaultTransactionStartMonth(manifest.dataWindow.minMonth, manifest.dataWindow.maxMonth)
        : null,
    [manifest],
  );
  const effectiveFilters = useMemo(
    () =>
      useDefaultStartMonth && defaultStartMonth && filters.startMonth === null
        ? { ...filters, startMonth: defaultStartMonth }
        : filters,
    [defaultStartMonth, filters, useDefaultStartMonth],
  );
  const selectedAddressKey = filters.selectedAddressKey;
  const { detail, comparison, isDetailLoading, isComparisonLoading } =
    useSelectedBlockArtifacts(selectedAddressKey);
  // "near me" is a sentinel that requires userLocation to resolve. Without a
  // location it must not run as a literal text search against blocks.
  const resolvedSearch = useMemo(
    () => (filters.search === NEAR_ME_SEARCH_QUERY && !userLocation ? "" : filters.search),
    [filters.search, userLocation],
  );
  // Debounce search for the map only so list interactions stay in sync with
  // the visible result rows while the heavier map updates trail slightly.
  const debouncedSearch = useDebouncedValue(resolvedSearch, 200);

  const sortedTowns = useMemo(
    () => manifest?.filterOptions.towns.slice().sort((a, b) => b.length - a.length) ?? [],
    [manifest],
  );

  const { blocks, loadError } = useBlockLoading({
    manifest,
    townFilter: effectiveFilters.town,
    debouncedSearch,
    userLocationPresent: Boolean(userLocation),
    selectedAddressKey,
    sortedTowns,
    savedVisible,
    shortlistCount: shortlist.items.length,
  });

  // O(1) address key lookup — replaces linear blocks.find() calls throughout the component.
  const blocksByKey = useMemo(
    () => new Map(blocks.map((block) => [block.addressKey, block])),
    [blocks],
  );

  // Shared single-pass filter function used by both the results pane and map pane.
  // Centralises filter logic so future changes only need to be made in one place.
  const filterScopedBlocks = useCallback(
    (
      scopeBlocks: typeof blocks,
      scopeFilters: typeof stableFilters,
      scopeIntent: ReturnType<typeof resolveGeographicSearchIntent>,
    ) =>
      scopeBlocks.filter((block) => {
        if (!matchesFilter(block, scopeFilters, scopeIntent)) {
          return false;
        }
        return scopeIntent ? matchesGeographicSearchIntent(block, scopeIntent) : true;
      }),
    [],
  );



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
    () => ({ ...effectiveFilters, search: resolvedSearch, selectedAddressKey: null }),
    // Intentional: list filter fields explicitly to avoid reference churn when
    // effectiveFilters is recreated without a meaningful filter value change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      resolvedSearch,
      effectiveFilters.town,
      effectiveFilters.flatType,
      effectiveFilters.flatModel,
      effectiveFilters.budgetMin,
      effectiveFilters.budgetMax,
      effectiveFilters.areaMin,
      effectiveFilters.areaMax,
      effectiveFilters.remainingLeaseMin,
      effectiveFilters.startMonth,
      effectiveFilters.endMonth,
      effectiveFilters.mrtMax,
    ],
  );
  const mapFilters = useMemo(
    () => ({ ...stableFilters, search: debouncedSearch }),
    [debouncedSearch, stableFilters],
  );
  const geographicIntent = useMemo(
    () =>
      resolveGeographicSearchIntent(
        effectiveFilters.search,
        blocks,
        effectiveFilters.mrtMax ?? DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS,
        userLocation,
        t("filters.nearMe"),
      ),
    [blocks, effectiveFilters.mrtMax, effectiveFilters.search, userLocation, t],
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
    effectiveFilters.town || resolvedSearch.trim() || geographicIntent || selectedAddressKey,
  );
  const hasMapMarkerScope = Boolean(
    mapFilters.town || mapFilters.search.trim() || mapGeographicIntent,
  );
  const filteredBlocks = useMemo(
    () =>
      resultsVisible && hasResultScope
        ? filterScopedBlocks(blocks, stableFilters, geographicIntent)
        : [],
    [blocks, filterScopedBlocks, geographicIntent, hasResultScope, resultsVisible, stableFilters],
  );
  const mapFilteredBlocks = useMemo(() => {
    const scopedBlocks = hasMapMarkerScope
      ? filterScopedBlocks(blocks, mapFilters, mapGeographicIntent)
      : [];

    if (!selectedAddressKey) {
      return scopedBlocks;
    }

    if (scopedBlocks.some((block) => block.addressKey === selectedAddressKey)) {
      return scopedBlocks;
    }

    const selected = blocksByKey.get(selectedAddressKey) ?? null;
    return selected ? [...scopedBlocks, selected] : scopedBlocks;
  }, [blocksByKey, blocks, filterScopedBlocks, hasMapMarkerScope, mapFilters, mapGeographicIntent, selectedAddressKey]);
  const shortlistKeySet = useMemo(
    () => new Set(shortlist.items.map((item) => item.addressKey)),
    [shortlist.items],
  );
  const selectedBlock = useMemo(
    () => (selectedAddressKey ? (blocksByKey.get(selectedAddressKey) ?? null) : null),
    [blocksByKey, selectedAddressKey],
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
        setIsLeftPanelOpen(true);
        setLeftTab("results");
      } else {
        setMobileTab("results");
      }

      patchFilters({ selectedAddressKey: addressKey });
    },
    [isDesktop, patchFilters, setLeftTab, setIsLeftPanelOpen, setMobileTab],
  );

  const handleToggleShortlist = useCallback(
    (addressKey: string) => toggleShortlist(addressKey),
    [toggleShortlist],
  );

  const patchUserFilters = useCallback(
    (patch: Partial<typeof filters>) => {
      if ("startMonth" in patch) {
        setUseDefaultStartMonth(false);
      }

      if ("search" in patch || "town" in patch || "selectedAddressKey" in patch) {
        setGeolocationError(null);
      }

      // Selecting a town while "near me" is the active search would apply both
      // a geographic radius and a town boundary simultaneously. Clear the sentinel
      // so town selection shows all blocks in that town without a radius constraint.
      const resolved =
        "town" in patch && filters.search === NEAR_ME_SEARCH_QUERY
          ? { ...patch, search: "" }
          : patch;
      patchFilters(resolved);
    },
    [patchFilters, filters.search],
  );

  const handleResetFilters = useCallback(() => {
    setUseDefaultStartMonth(true);
    setGeolocationError(null);
    resetFilters();
  }, [resetFilters]);

  const handleGeolocate = useCallback(
    (coords: Coordinates) => {
      setUserLocation(coords);
      setGeolocationError(null);
      patchFilters({ search: NEAR_ME_SEARCH_QUERY, town: "", selectedAddressKey: null });

      if (isDesktop) {
        setLeftTab("results");
        setIsLeftPanelOpen(true);
      }
      // Mobile: stay on the map so nearby markers are visible once scope resolves.
    },
    [isDesktop, patchFilters, setLeftTab, setIsLeftPanelOpen],
  );

  const handleChooseTown = useCallback((options?: { clearGeolocationError?: boolean }) => {
    if (options?.clearGeolocationError !== false) {
      setGeolocationError(null);
    }

    // Invalidate any pending geolocation request so a late response
    // does not overwrite the user's manual town selection.
    geolocationRequestRef.current += 1;
    setIsLocating(false);

    if (isDesktop) {
      setLeftTab("filters");
      setIsLeftPanelOpen(true);
      return;
    }

    setMobileTab("filters");
  }, [isDesktop, setLeftTab, setIsLeftPanelOpen, setMobileTab, setGeolocationError, setIsLocating]);

  const handleUseCurrentLocation = useCallback(() => {
    if (isLocating) {
      return;
    }

    if (!navigator.geolocation) {
      setGeolocationError(t("app.locationUnavailable"));
      handleChooseTown({ clearGeolocationError: false });
      return;
    }

    setGeolocationError(null);
    setIsLocating(true);
    const requestId = ++geolocationRequestRef.current;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (geolocationRequestRef.current !== requestId) {
          return;
        }
        setIsLocating(false);
        handleGeolocate({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => {
        if (geolocationRequestRef.current !== requestId) {
          return;
        }
        setIsLocating(false);
        setGeolocationError(t("app.locationFailed"));
        handleChooseTown({ clearGeolocationError: false });
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 10_000,
      },
    );
  }, [handleChooseTown, handleGeolocate, isLocating, t]);

  function handleMapInteract(interactionType: "background" | "feature" = "background") {
    if (!hasInteractedWithMap) {
      if (isDesktop) setIsHeaderVisible(false);
      setHasInteractedWithMap(true);
    }

    if (interactionType === "feature") {
      return;
    }

    if (isDesktop) {
      setIsLeftPanelOpen(false);
      setIsRightPanelOpen(false);
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
      filters={effectiveFilters}
      maxMonth={manifest.dataWindow.maxMonth}
      minMonth={manifest.dataWindow.minMonth}
      onChange={patchUserFilters}
      onReset={handleResetFilters}
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
        isDarkMode={theme === "dark"}
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

  const isSavedDashboardOpen = isDesktop && isRightPanelOpen;
  const showFloatingHeader = isDesktop ? isHeaderVisible : mobileTab === null;
  const showScopePrompt = Boolean(
    manifest && !hasResultScope && (isDesktop ? !isLeftPanelOpen && !isRightPanelOpen : mobileTab === null),
  );

  // Width classes for the left (Filters/Results) panel per tab
  const leftPanelWidths: Record<string, string> = {
    filters: "w-[min(30rem,34vw)]",
    results: "w-[min(34rem,38vw)]",
  };

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

        {showFloatingHeader && manifest ? (
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
              isDesktop ? cn("left-6 top-[5rem]", isSavedDashboardOpen ? "right-[calc(var(--saved-panel-width)+2rem)]" : "right-[8rem]") : "left-0 right-0 top-[3.6rem] px-3",
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
                  setLeftTab("filters");
                  setIsLeftPanelOpen(true);
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

        {showScopePrompt ? (
          <div
            className={cn(
              "pointer-events-auto absolute z-25 max-w-[22rem] rounded-xl border border-border/20 bg-background/92 p-3 text-sm shadow-[0_8px_28px_rgba(23,28,31,0.10)] backdrop-blur-[20px] dark:border-primary/10 dark:bg-card/92 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_16px_48px_rgba(4,12,24,0.82)]",
              isDesktop
                ? "bottom-[5.75rem] left-6"
                : "bottom-[calc(var(--mobile-tab-bar-height)+env(safe-area-inset-bottom,0px)+2.9rem)] left-3 right-3",
            )}
          >
            <p className="v2-section-title">{t("app.scopePromptTitle")}</p>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              {t("app.scopePromptDescription")}
            </p>
            {geolocationError ? (
              <p className="mt-2 text-xs font-medium leading-snug text-destructive">
                {geolocationError}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="xs"
                className="h-8 rounded-lg px-2.5 text-[0.62rem] font-extrabold uppercase tracking-wider"
                onClick={handleUseCurrentLocation}
                disabled={isLocating}
              >
                {isLocating ? (
                  <Loader2 data-icon className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <LocateFixed data-icon className="size-3.5" aria-hidden="true" />
                )}
                {isLocating ? t("app.locating") : t("app.useCurrentLocation")}
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="h-8 rounded-lg px-2.5 text-[0.62rem] font-extrabold uppercase tracking-wider"
                onClick={() => handleChooseTown()}
              >
                <SlidersHorizontal data-icon className="size-3.5" aria-hidden="true" />
                {t("app.chooseTown")}
              </Button>
            </div>
          </div>
        ) : null}

        {geolocationError && !showScopePrompt ? (
          <div
            role="status"
            className={cn(
              "pointer-events-auto absolute z-25 rounded-lg border border-destructive/30 bg-background/95 px-3 py-2 text-xs font-medium leading-snug text-destructive shadow-[0_8px_28px_rgba(23,28,31,0.10)] backdrop-blur-[20px] dark:bg-card/95",
              isDesktop
                ? "bottom-[5.75rem] left-6 max-w-[22rem]"
                : "bottom-[calc(var(--mobile-tab-bar-height)+env(safe-area-inset-bottom,0px)+0.75rem)] left-3 right-3",
            )}
          >
            {geolocationError}
          </div>
        ) : null}

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
              {/* Left panel: Filters / Results */}
              <aside
                id="desktop-left-panel"
                aria-hidden={!isLeftPanelOpen}
                {...(!isLeftPanelOpen && { inert: true })}
                data-open={isLeftPanelOpen ? "true" : "false"}
                data-mode={leftTab}
                className={cn(
                  "pointer-events-auto absolute bottom-20 left-6 flex max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border/20 bg-card/94 backdrop-blur-[20px] transition-[transform,opacity] duration-200 ease-out shadow-[0_-8px_32px_rgba(23,28,31,0.08)] dark:border-primary/10 dark:bg-card dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_-16px_64px_rgba(4,12,24,0.92)]",
                  "max-h-[min(44rem,calc(100vh-12rem))] min-h-[24rem]",
                  isLeftPanelOpen
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-6 opacity-0",
                  leftPanelWidths[leftTab],
                )}
              >
                <div className="flex h-full min-h-0 flex-col">
                  <div
                    id="desktop-filters-content"
                    aria-hidden={leftTab !== "filters"}
                    className={cn(
                      "h-full overflow-y-auto p-3 pb-8",
                      leftTab === "filters" ? "block" : "hidden",
                    )}
                  >
                    {filterContent}
                  </div>
                  <div
                    id="desktop-results-content"
                    aria-hidden={leftTab !== "results"}
                    className={cn(
                      "h-full min-h-0 flex-col gap-3 overflow-hidden p-3 pb-8",
                      leftTab === "results" ? "flex" : "hidden",
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
                </div>
              </aside>

              {/* Right panel: Saved */}
              <aside
                id="desktop-right-panel"
                aria-hidden={!isRightPanelOpen}
                {...(!isRightPanelOpen && { inert: true })}
                data-open={isRightPanelOpen ? "true" : "false"}
                data-mode="saved"
                className={cn(
                  "pointer-events-auto absolute bottom-0 right-0 top-0 flex min-h-full max-w-[calc(100vw-3rem)] flex-col overflow-hidden border-l border-border/20 bg-card/94 backdrop-blur-[20px] transition-[transform,opacity] duration-200 ease-out shadow-[-8px_0_32px_rgba(23,28,31,0.08)] dark:border-primary/10 dark:bg-card dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_-16px_64px_rgba(4,12,24,0.92)]",
                  "w-[var(--saved-panel-width)]",
                  isRightPanelOpen
                    ? "translate-x-0 opacity-100"
                    : "pointer-events-none translate-x-6 opacity-0",
                )}
              >
                <div className="flex h-full min-h-0 flex-col">
                  <div
                    id="desktop-saved-content"
                    className="flex h-full min-h-0 flex-col overflow-hidden p-3 pb-8"
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
            variant={leftTab === "filters" && isLeftPanelOpen ? "secondary" : "ghost"}
            size="sm"
            data-active={leftTab === "filters" && isLeftPanelOpen}
            aria-expanded={leftTab === "filters" && isLeftPanelOpen}
            aria-controls={leftTab === "filters" && isLeftPanelOpen ? "desktop-filters-content" : undefined}
            onClick={() => {
              setLeftTab("filters");
              setIsLeftPanelOpen((current) => (leftTab === "filters" ? !current : true));
            }}
          >
            <SlidersHorizontal data-icon />
            <span>{t("tab.filters")}</span>
          </Button>
          <Button
            type="button"
            variant={leftTab === "results" && isLeftPanelOpen ? "secondary" : "ghost"}
            size="sm"
            data-active={leftTab === "results" && isLeftPanelOpen}
            aria-expanded={leftTab === "results" && isLeftPanelOpen}
            aria-controls={leftTab === "results" && isLeftPanelOpen ? "desktop-results-content" : undefined}
            onClick={() => {
              setLeftTab("results");
              setIsLeftPanelOpen((current) => (leftTab === "results" ? !current : true));
            }}
          >
            <List data-icon />
            <span>{t("tab.results")}</span>
          </Button>
        </nav>
      )}

      {isDesktop && (
        <nav className={cn("desktop-tab-bar desktop-tab-bar--right", isSavedDashboardOpen && "desktop-tab-bar--shifted")} aria-label={t("tab.saved")}>
          <Button
            type="button"
            variant={isRightPanelOpen ? "secondary" : "ghost"}
            size="sm"
            data-active={isRightPanelOpen}
            aria-expanded={isRightPanelOpen}
            aria-controls={isRightPanelOpen ? "desktop-saved-content" : undefined}
            onClick={() => setIsRightPanelOpen((current) => !current)}
          >
            <Bookmark data-icon className={isRightPanelOpen ? "fill-current" : ""} />
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
            size="icon"
            variant="ghost"
            className="mobile-mode-button"
            onClick={toggleTheme}
            aria-label={t("app.toggleTheme")}
            title={t("app.toggleTheme")}
          >
            {theme === "light" ? (
              <Moon data-icon className="size-4" aria-hidden="true" />
            ) : (
              <Sun data-icon className="size-4" aria-hidden="true" />
            )}
          </Button>
          <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
            <SelectTrigger
              aria-label={t("language.label")}
              title={t("language.label")}
              className="mobile-language-trigger"
            >
              <Languages data-icon className="size-4" aria-hidden="true" />
              <span>{t("language.short_name")}</span>
            </SelectTrigger>
            <SelectContent position="popper" side="top" align="start" sideOffset={4}>
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
            variant={mobileTab === "filters" ? "secondary" : "ghost"}
            size="sm"
            className="mobile-tab-button"
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
            className="mobile-tab-button"
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
            className="mobile-tab-button"
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
