import { lazy, Suspense, useCallback, useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { useManifestData } from "@/hooks/useManifestData";
import { useShortlist } from "@/hooks/useShortlist";
import { useSelectedBlockArtifacts } from "@/hooks/useSelectedBlockArtifacts";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { usePanelState, LEFT_PANEL_WIDTHS, DESKTOP_PANEL_LAYOUT } from "@/hooks/usePanelState";
import { useShortlistArtifacts } from "@/hooks/useShortlistArtifacts";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useHeaderState } from "@/hooks/useHeaderState";
import { usePriceHeatmap } from "@/hooks/usePriceHeatmap";
import { useFilterPipeline } from "@/hooks/useFilterPipeline";
import { getActiveFilterChipDescriptors } from "@/lib/filterChips";
import { NEAR_ME_SEARCH_QUERY } from "@/lib/constants";
import { AppHeader } from "@/components/AppHeader";
import { FilterChipsBar } from "@/components/FilterChipsBar";
import { ScopePrompt } from "@/components/ScopePrompt";
import { DesktopTabBar } from "@/components/DesktopTabBar";
import { MobileTabBar } from "@/components/MobileTabBar";
import { DrawerSkeleton } from "@/components/DrawerSkeleton";
import { FilterPanel } from "@/components/FilterPanel";
import { MapSkeleton } from "@/components/MapSkeleton";
import { PriceHeatmapControl } from "@/components/PriceHeatmapControl";
import { PriceLegend } from "@/components/PriceLegend";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const MapView = lazy(() => import("@/components/MapView").then((m) => ({ default: m.MapView })));
const DetailDrawer = lazy(() =>
  import("@/components/DetailDrawer").then((m) => ({ default: m.DetailDrawer })),
);
const ShortlistDrawer = lazy(() =>
  import("@/components/ShortlistDrawer").then((m) => ({ default: m.ShortlistDrawer })),
);
const ResultsPane = lazy(() =>
  import("@/components/ResultsPane").then((m) => ({ default: m.ResultsPane })),
);

function App() {
  const { locale, t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { manifest, error } = useManifestData();
  const shortlist = useShortlist();
  const panel = usePanelState();
  const { filters, patchFilters, resetFilters } = useUrlFilters();
  const geo = useGeolocation({ t });
  const header = useHeaderState();
  const heatmap = usePriceHeatmap();

  const pipeline = useFilterPipeline({
    manifest,
    rawFilters: filters,
    userLocation: geo.userLocation,
    resultsVisible: panel.resultsVisible,
    savedVisible: panel.savedVisible,
    shortlistCount: shortlist.items.length,
    t,
  });

  const { setUseDefaultStartMonth } = pipeline;
  const { clearError, locate, cancelPendingRequest, setUserLocation } = geo;
  const { isDesktop, setLeftTab, setIsLeftPanelOpen, setMobileTab, setIsSavedPanelOpen } = panel;
  const { toggle: toggleShortlist } = shortlist;
  const { hasInteractedWithMap, setIsHeaderVisible, setHasInteractedWithMap } = header;

  const { detail, comparison, isDetailLoading, isComparisonLoading } =
    useSelectedBlockArtifacts(filters.selectedAddressKey);

  const { shortlistRows } = useShortlistArtifacts({
    blocks: pipeline.blocks,
    items: shortlist.items,
    savedVisible: panel.savedVisible,
    selectedDetail: detail,
    selectedComparison: comparison,
    isShortlistOpen: panel.isShortlistOpen,
  });

  const selectedBlock = useMemo(
    () =>
      filters.selectedAddressKey
        ? (pipeline.blocksByKey.get(filters.selectedAddressKey) ?? null)
        : null,
    [pipeline.blocksByKey, filters.selectedAddressKey],
  );

  const shortlistKeySet = useMemo(
    () => new Set(shortlist.items.map((i) => i.addressKey)),
    [shortlist.items],
  );

  const detailVisible = Boolean(filters.selectedAddressKey);
  const detailLoading = detailVisible && isDetailLoading;
  const comparisonLoading = detailVisible && isComparisonLoading;

  const activeFilterChips = useMemo(
    () =>
      getActiveFilterChipDescriptors(filters, locale, t).map((chip) => ({
        key: chip.key,
        label: chip.label,
        onRemove: () => patchFilters(chip.clearPatch),
      })),
    [filters, locale, patchFilters, t],
  );

  // Cross-cutting filter handler: coordinates useDefaultStartMonth, geo error,
  // and the near-me sentinel when a town is selected simultaneously.
  const patchUserFilters = useCallback(
    (patch: Partial<typeof filters>) => {
      if ("startMonth" in patch) {
        setUseDefaultStartMonth(false);
      }
      if ("search" in patch || "town" in patch || "selectedAddressKey" in patch) {
        clearError();
      }
      // Selecting a town while "near me" is active would apply both a radius and
      // a town boundary. Clear the sentinel so town selection is unambiguous.
      const resolved =
        "town" in patch && filters.search === NEAR_ME_SEARCH_QUERY
          ? { ...patch, search: "" }
          : patch;
      patchFilters(resolved);
    },
    [patchFilters, setUseDefaultStartMonth, clearError, filters.search],
  );

  const handleResetFilters = useCallback(() => {
    setUseDefaultStartMonth(true);
    clearError();
    resetFilters();
  }, [setUseDefaultStartMonth, clearError, resetFilters]);

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
    [isDesktop, setIsLeftPanelOpen, setLeftTab, setMobileTab, patchFilters],
  );

  const handleToggleShortlist = useCallback(
    (addressKey: string) => toggleShortlist(addressKey),
    [toggleShortlist],
  );

  const handleChooseTown = useCallback(
    (options?: { clearGeolocationError?: boolean }) => {
      if (options?.clearGeolocationError !== false) clearError();
      cancelPendingRequest();
      if (isDesktop) {
        setLeftTab("filters");
        setIsLeftPanelOpen(true);
        return;
      }
      setMobileTab("filters");
    },
    [clearError, cancelPendingRequest, isDesktop, setLeftTab, setIsLeftPanelOpen, setMobileTab],
  );

  const handleGeolocate = useCallback(
    (coords: Parameters<typeof setUserLocation>[0]) => {
      setUserLocation(coords);
      clearError();
      patchFilters({ search: NEAR_ME_SEARCH_QUERY, town: "", selectedAddressKey: null });
      if (isDesktop) {
        setLeftTab("results");
        setIsLeftPanelOpen(true);
      }
    },
    [setUserLocation, clearError, patchFilters, isDesktop, setLeftTab, setIsLeftPanelOpen],
  );

  const handleUseCurrentLocation = useCallback(() => {
    locate(
      (coords) => {
        patchFilters({ search: NEAR_ME_SEARCH_QUERY, town: "", selectedAddressKey: null });
        if (isDesktop) {
          setLeftTab("results");
          setIsLeftPanelOpen(true);
        }
        // Mobile: stay on map so nearby markers are visible once scope resolves.
        // The geo hook already called setUserLocation before invoking this callback.
        void coords;
      },
      () => handleChooseTown({ clearGeolocationError: false }),
    );
  }, [locate, patchFilters, isDesktop, setLeftTab, setIsLeftPanelOpen, handleChooseTown]);

  const handleMapInteract = useCallback(
    (interactionType: "background" | "feature" = "background") => {
      if (!hasInteractedWithMap) {
        if (isDesktop) setIsHeaderVisible(false);
        setHasInteractedWithMap(true);
      }
      if (interactionType === "feature") return;
      if (isDesktop) {
        setIsLeftPanelOpen(false);
        setIsSavedPanelOpen(false);
        return;
      }
      setMobileTab(null);
    },
    [
      hasInteractedWithMap,
      isDesktop,
      setIsHeaderVisible,
      setHasInteractedWithMap,
      setIsLeftPanelOpen,
      setIsSavedPanelOpen,
      setMobileTab,
    ],
  );

  // ── Error / loading states ───────────────────────────────────────────────

  if (error || pipeline.loadError) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center p-4 sm:p-6 lg:p-8">
        <Card className="w-full bg-background">
          <CardHeader className="gap-3">
            <CardTitle className="text-3xl">{t("app.title")}</CardTitle>
            <CardDescription>
              {t("app.missingData")} · {error ?? pipeline.loadError}
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

  // ── Shared content blocks ────────────────────────────────────────────────

  const filterContent = (
    <FilterPanel
      filters={pipeline.filterPanelFilters}
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
        blocks={pipeline.mapFilteredBlocks}
        onSelect={handleSelectAddress}
        selectedAddressKey={filters.selectedAddressKey}
        townFilter={pipeline.mapFilters.town}
        autoFitKey={
          pipeline.effectiveMapGeographicIntent?.type === "coordinates"
            ? `coordinates:${pipeline.effectiveMapGeographicIntent.coordinates.lat},${pipeline.effectiveMapGeographicIntent.coordinates.lng}`
            : pipeline.effectiveMapGeographicIntent?.type === "station"
              ? `station:${pipeline.effectiveMapGeographicIntent.stationName.toLowerCase()}`
              : pipeline.mapFilters.search.trim()
                ? `search:${pipeline.mapFilters.search.trim().toLowerCase()}`
                : null
        }
        showBlockMarkers={pipeline.hasMapMarkerScope}
        isDarkMode={theme === "dark"}
        priceHeatmapEnabled={heatmap.priceHeatmapEnabled}
        priceHeatmapOpacity={heatmap.priceHeatmapOpacity}
        geographicIntent={pipeline.effectiveMapGeographicIntent}
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
            if (selectedBlock) shortlist.toggle(selectedBlock.addressKey);
          }}
        />
      </Suspense>
    ) : null;

  const resultsPaneContent = panel.resultsVisible ? (
    <Suspense fallback={<DrawerSkeleton label={t("app.loadingResults")} />}>
      <ResultsPane
        blocks={pipeline.filteredBlocks}
        hasResultScope={pipeline.hasResultScope}
        onSelect={handleSelectAddress}
        onToggleShortlist={handleToggleShortlist}
        selectedAddressKey={filters.selectedAddressKey}
        shortlistKeys={shortlistKeySet}
        isCompact
      />
    </Suspense>
  ) : null;

  const savedContent = panel.savedVisible ? (
    <Suspense fallback={<DrawerSkeleton label={t("app.loadingShortlist")} />}>
      <ShortlistDrawer
        isOpen={panel.isShortlistOpen}
        onSelectAddress={handleSelectAddress}
        onRemove={(addressKey) => shortlist.toggle(addressKey)}
        onToggleOpen={() => panel.setIsShortlistOpen((c) => !c)}
        onUpdate={(addressKey, patch) => shortlist.update(addressKey, patch)}
        rows={shortlistRows}
      />
    </Suspense>
  ) : null;

  // ── Derived layout flags ─────────────────────────────────────────────────

  const showFloatingHeader = panel.isDesktop ? header.isHeaderVisible : panel.mobileTab === null;
  const showScopePrompt = Boolean(
    !pipeline.hasResultScope &&
      (panel.isDesktop
        ? !panel.isLeftPanelOpen && !panel.isSavedPanelOpen
        : panel.mobileTab === null),
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <main className="fixed inset-0 w-full overflow-hidden">
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

        {showFloatingHeader ? (
          <AppHeader
            manifest={manifest}
            isDesktop={panel.isDesktop}
            locale={locale}
            t={t}
            isMobileHeaderOpen={header.isMobileHeaderOpen}
            onToggleMobileHeader={() => header.setIsMobileHeaderOpen((o) => !o)}
            onDismiss={() => header.setIsHeaderVisible(false)}
          />
        ) : null}

        {/* Price-colour legend — only when map is visible */}
        <PriceLegend
          isDesktop={panel.isDesktop}
          isVisible={pipeline.hasMapMarkerScope && (panel.isDesktop || panel.mobileTab === null)}
          t={t}
        />

        {/* Price heatmap toggle */}
        {(panel.isDesktop || panel.mobileTab === null) && (
          <PriceHeatmapControl
            isEnabled={heatmap.priceHeatmapEnabled}
            opacity={heatmap.priceHeatmapOpacity}
            onToggle={heatmap.togglePriceHeatmap}
            onOpacityChange={heatmap.setPriceHeatmapOpacity}
            t={t}
            className="absolute z-25"
            style={{
              bottom: panel.isDesktop
                ? pipeline.hasMapMarkerScope
                  ? "7.5rem"
                  : "4rem"
                : pipeline.hasMapMarkerScope
                  ? "11.5rem"
                  : "8rem",
              right: panel.isDesktop ? "4.5rem" : "0.75rem",
            }}
          />
        )}

        <FilterChipsBar
          chips={activeFilterChips}
          isDesktop={panel.isDesktop}
          t={t}
          onOpenFilters={() => {
            if (panel.isDesktop) {
              panel.setLeftTab("filters");
              panel.setIsLeftPanelOpen(true);
              return;
            }
            panel.setMobileTab("filters");
          }}
        />

        <ScopePrompt
          showScopePrompt={showScopePrompt}
          geolocationError={geo.geolocationError}
          isDesktop={panel.isDesktop}
          isLocating={geo.isLocating}
          t={t}
          onUseCurrentLocation={handleUseCurrentLocation}
          onChooseTown={() => handleChooseTown()}
        />

        <div className="pointer-events-none absolute inset-0 z-20 flex h-full flex-col gap-3 overflow-hidden p-3 pb-[calc(var(--mobile-tab-bar-height)+env(safe-area-inset-bottom,0px)+0.5rem)] sm:p-4 lg:gap-4 lg:p-6 lg:pb-6">
          {panel.isDesktop && !header.isHeaderVisible ? (
            <div className="pointer-events-auto absolute left-6 top-6 z-30">
              <Button
                variant="outline"
                size="xs"
                className="h-8 rounded-xl border-border/20 bg-background/90 px-3 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground backdrop-blur-[20px] transition-colors hover:text-foreground shadow-[0_4px_16px_rgba(23,28,31,0.08)] dark:border-primary/15 dark:bg-card/90 dark:text-primary/60 dark:hover:text-primary dark:shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_4px_24px_rgba(4,12,24,0.7)]"
                onClick={() => header.setIsHeaderVisible(true)}
              >
                {t("app.showHeader")}
              </Button>
            </div>
          ) : null}

          {panel.isDesktop ? (
            <section className="pointer-events-none relative min-h-0 flex-1">
              {/* Left panel: Filters / Results */}
              <aside
                id="desktop-left-panel"
                aria-hidden={!panel.isLeftPanelOpen}
                {...(!panel.isLeftPanelOpen && { inert: true })}
                data-open={panel.isLeftPanelOpen ? "true" : "false"}
                data-mode={panel.leftTab}
                className={cn(
                  "pointer-events-auto absolute bottom-20 left-6 flex max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border/20 bg-card/94 backdrop-blur-[20px] transition-[transform,opacity] duration-200 ease-out shadow-[0_-8px_32px_rgba(23,28,31,0.08)] dark:border-primary/10 dark:bg-card dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_-16px_64px_rgba(4,12,24,0.92)]",
                  "max-h-[min(44rem,calc(100vh-12rem))] min-h-[24rem]",
                  panel.isLeftPanelOpen
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-6 opacity-0",
                )}
                style={{ width: LEFT_PANEL_WIDTHS[panel.leftTab] }}
              >
                <div className="flex h-full min-h-0 flex-col">
                  <div
                    id="desktop-filters-content"
                    aria-hidden={panel.leftTab !== "filters"}
                    className={cn(
                      "h-full overflow-y-auto p-3 pb-8",
                      panel.leftTab === "filters" ? "block" : "hidden",
                    )}
                  >
                    {filterContent}
                  </div>
                  <div
                    id="desktop-results-content"
                    aria-hidden={panel.leftTab !== "results"}
                    className={cn(
                      "h-full min-h-0 flex-col gap-3 overflow-hidden p-3 pb-8",
                      panel.leftTab === "results" ? "flex" : "hidden",
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

              {/* Saved panel */}
              <aside
                id="desktop-saved-panel"
                aria-hidden={!panel.isSavedPanelOpen}
                {...(!panel.isSavedPanelOpen && { inert: true })}
                data-open={panel.isSavedPanelOpen ? "true" : "false"}
                data-mode="saved"
                className={cn(
                  "pointer-events-auto absolute bottom-20 flex max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-border/20 bg-card/94 backdrop-blur-[20px] transition-[transform,opacity,left] duration-200 ease-out shadow-[0_-8px_32px_rgba(23,28,31,0.08)] dark:border-primary/10 dark:bg-card dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),0_-16px_64px_rgba(4,12,24,0.92)]",
                  "max-h-[min(44rem,calc(100vh-12rem))] min-h-[24rem] w-[min(28rem,32vw)]",
                  panel.isSavedPanelOpen
                    ? "translate-y-0 opacity-100"
                    : "pointer-events-none translate-y-6 opacity-0",
                )}
                style={{
                  left: panel.isLeftPanelOpen
                    ? `calc(${DESKTOP_PANEL_LAYOUT.edgeInset} + ${LEFT_PANEL_WIDTHS[panel.leftTab]} + ${DESKTOP_PANEL_LAYOUT.panelGap})`
                    : DESKTOP_PANEL_LAYOUT.edgeInset,
                }}
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
              {panel.mobileTab && (
                <div
                  id="mobile-panel"
                  className={cn(
                    "pointer-events-auto absolute inset-x-0 bottom-0 overflow-hidden rounded-t-2xl border border-border/20 bg-card/94 backdrop-blur-[20px] transition-all shadow-[0_-8px_32px_rgba(23,28,31,0.08)] dark:border-primary/10 dark:bg-card dark:shadow-[0_0_0_1px_rgba(34,211,238,0.07),inset_0_1px_0_rgba(34,211,238,0.05),0_-16px_48px_rgba(4,12,24,0.92)]",
                    activeFilterChips.length > 0 ? "top-[4.5rem]" : "top-0",
                  )}
                >
                  <div
                    id="mobile-filters-content"
                    className={cn(
                      "h-full overflow-y-auto p-3 pb-12",
                      panel.mobileTab === "filters" ? "block" : "hidden",
                    )}
                  >
                    {filterContent}
                  </div>
                  <div
                    id="mobile-results-content"
                    className={cn(
                      "h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 pb-12",
                      panel.mobileTab === "results" ? "flex" : "hidden",
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
                    className={cn(
                      "h-full min-h-0 flex-col overflow-hidden p-3 pb-12",
                      panel.mobileTab === "saved" ? "flex" : "hidden",
                    )}
                  >
                    {savedContent}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {panel.isDesktop && (
        <DesktopTabBar
          leftTab={panel.leftTab}
          isLeftPanelOpen={panel.isLeftPanelOpen}
          isSavedPanelOpen={panel.isSavedPanelOpen}
          shortlistCount={shortlist.items.length}
          theme={theme}
          t={t}
          onFiltersClick={() => {
            panel.setLeftTab("filters");
            panel.setIsLeftPanelOpen((c) => (panel.leftTab === "filters" ? !c : true));
          }}
          onResultsClick={() => {
            panel.setLeftTab("results");
            panel.setIsLeftPanelOpen((c) => (panel.leftTab === "results" ? !c : true));
          }}
          onSavedClick={() => panel.setIsSavedPanelOpen((c) => !c)}
          onToggleTheme={toggleTheme}
        />
      )}

      {!panel.isDesktop && (
        <MobileTabBar
          mobileTab={panel.mobileTab}
          shortlistCount={shortlist.items.length}
          theme={theme}
          t={t}
          onFiltersClick={() =>
            panel.setMobileTab((c) => (c === "filters" ? null : "filters"))
          }
          onResultsClick={() =>
            panel.setMobileTab((c) => (c === "results" ? null : "results"))
          }
          onSavedClick={() => panel.setMobileTab((c) => (c === "saved" ? null : "saved"))}
          onToggleTheme={toggleTheme}
        />
      )}
    </>
  );
}

export default App;
