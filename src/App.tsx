import { lazy, Suspense, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { useManifestData } from "@/hooks/useManifestData";
import { useShortlist } from "@/hooks/useShortlist";
import { useSelectedBlockArtifacts } from "@/hooks/useSelectedBlockArtifacts";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { usePanelState } from "@/hooks/usePanelState";
import { useShortlistArtifacts } from "@/hooks/useShortlistArtifacts";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useHeaderState } from "@/hooks/useHeaderState";
import { usePriceHeatmap } from "@/hooks/usePriceHeatmap";
import { useFilterPipeline } from "@/hooks/useFilterPipeline";
import { useAppShellController } from "@/hooks/useAppShellController";
import { getActiveFilterChipDescriptors } from "@/lib/filterChips";
import { AppHeader } from "@/components/AppHeader";
import { AppPanelShell } from "@/components/AppPanelShell";
import { AppTabBars } from "@/components/AppTabBars";
import { FilterChipsBar } from "@/components/FilterChipsBar";
import { ScopePrompt } from "@/components/ScopePrompt";
import { DrawerSkeleton } from "@/components/DrawerSkeleton";
import { FilterPanel } from "@/components/FilterPanel";
import { MapSkeleton } from "@/components/MapSkeleton";
import { PriceHeatmapControl } from "@/components/PriceHeatmapControl";
import { PriceLegend } from "@/components/PriceLegend";
import { SchoolOverlayControl } from "@/components/SchoolOverlayControl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPrimarySchoolsForOverlay, type PrimarySchoolWithBand } from "@/lib/school-proximity";

const EMPTY_SCHOOLS: PrimarySchoolWithBand[] = [];

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
  const [schoolOverlayEnabled, setSchoolOverlayEnabled] = useState(false);

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
  const primarySchoolsForOverlay = useMemo(
    () => getPrimarySchoolsForOverlay(comparison?.amenities.nearestPrimarySchools ?? []),
    [comparison],
  );
  const showSchoolOverlay = schoolOverlayEnabled && primarySchoolsForOverlay.length > 0;

  const activeFilterChips = useMemo(
    () =>
      getActiveFilterChipDescriptors(filters, locale, t).map((chip) => ({
        key: chip.key,
        label: chip.label,
        onRemove: () => patchFilters(chip.clearPatch),
      })),
    [filters, locale, patchFilters, t],
  );

  const {
    patchUserFilters,
    handleResetFilters,
    handleSelectAddress,
    handleToggleShortlist,
    handleChooseTown,
    handleGeolocate,
    handleUseCurrentLocation,
    handleMapInteract,
    handleOpenFilters,
    handleDesktopFiltersClick,
    handleDesktopResultsClick,
    handleDesktopSavedClick,
    handleMobileFiltersClick,
    handleMobileResultsClick,
    handleMobileSavedClick,
  } = useAppShellController({
    filters,
    patchFilters,
    resetFilters,
    setUseDefaultStartMonth,
    clearGeolocationError: geo.clearError,
    cancelPendingGeolocationRequest: geo.cancelPendingRequest,
    locate: geo.locate,
    setUserLocation: geo.setUserLocation,
    isDesktop: panel.isDesktop,
    setLeftTab: panel.setLeftTab,
    setIsLeftPanelOpen: panel.setIsLeftPanelOpen,
    setMobileTab: panel.setMobileTab,
    setIsSavedPanelOpen: panel.setIsSavedPanelOpen,
    hasInteractedWithMap: header.hasInteractedWithMap,
    setIsHeaderVisible: header.setIsHeaderVisible,
    setHasInteractedWithMap: header.setHasInteractedWithMap,
    toggleShortlist: shortlist.toggle,
    leftTab: panel.leftTab,
  });

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
        heatmapMode={heatmap.heatmapMode}
        primarySchools={showSchoolOverlay ? primarySchoolsForOverlay : EMPTY_SCHOOLS}
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
          filters={filters}
          allBlocks={pipeline.blocks}
          isLoading={detailLoading}
          isComparisonLoading={comparisonLoading}
          isSaved={selectedBlock ? shortlist.has(selectedBlock.addressKey) : false}
          remainingLeaseMin={filters.remainingLeaseMin}
          onClose={() => patchFilters({ selectedAddressKey: null })}
          onToggleShortlist={() => {
            if (selectedBlock) shortlist.toggle(selectedBlock.addressKey);
          }}
          onSelectBlock={handleSelectAddress}
        />
      </Suspense>
    ) : null;

  const resultsPaneContent = (
    <div hidden={!panel.resultsVisible}>
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
    </div>
  );

  const savedContent = panel.savedVisible ? (
    <Suspense fallback={<DrawerSkeleton label={t("app.loadingShortlist")} />}>
      <ShortlistDrawer
        isOpen={panel.isShortlistOpen}
        onSelectAddress={handleSelectAddress}
        onRemove={(addressKey) => shortlist.toggle(addressKey)}
        onToggleOpen={() => panel.setIsShortlistOpen((c) => !c)}
        onUpdate={(addressKey, patch) => shortlist.update(addressKey, patch)}
        rows={shortlistRows}
        remainingLeaseMin={filters.remainingLeaseMin}
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
          mode={heatmap.heatmapMode}
          t={t}
        />

        {/* Price heatmap toggle */}
        {(panel.isDesktop || panel.mobileTab === null) && (
          <PriceHeatmapControl
            isEnabled={heatmap.priceHeatmapEnabled}
            opacity={heatmap.priceHeatmapOpacity}
            mode={heatmap.heatmapMode}
            onToggle={heatmap.togglePriceHeatmap}
            onOpacityChange={heatmap.setPriceHeatmapOpacity}
            onModeChange={heatmap.setHeatmapMode}
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

        {(panel.isDesktop || panel.mobileTab === null) && (
          <SchoolOverlayControl
            isEnabled={schoolOverlayEnabled}
            hasSchools={primarySchoolsForOverlay.length > 0}
            onToggle={() => setSchoolOverlayEnabled((enabled) => !enabled)}
            t={t}
            className="absolute z-25 w-32"
            style={{
              bottom: panel.isDesktop
                ? pipeline.hasMapMarkerScope
                  ? "11rem"
                  : "7.5rem"
                : pipeline.hasMapMarkerScope
                  ? "15rem"
                  : "11.5rem",
              right: panel.isDesktop ? "4.5rem" : "0.75rem",
            }}
          />
        )}

        <FilterChipsBar
          chips={activeFilterChips}
          isDesktop={panel.isDesktop}
          t={t}
          onOpenFilters={handleOpenFilters}
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

        <AppPanelShell
          isDesktop={panel.isDesktop}
          isHeaderVisible={header.isHeaderVisible}
          leftTab={panel.leftTab}
          isLeftPanelOpen={panel.isLeftPanelOpen}
          isSavedPanelOpen={panel.isSavedPanelOpen}
          mobileTab={panel.mobileTab}
          activeFilterChipCount={activeFilterChips.length}
          detailVisible={detailVisible}
          detailLoading={detailLoading}
          filterContent={filterContent}
          resultsPaneContent={resultsPaneContent}
          selectedDetailContent={selectedDetailContent}
          savedContent={savedContent}
          onShowHeader={() => header.setIsHeaderVisible(true)}
          showHeaderLabel={t("app.showHeader")}
        />
      </main>

      <AppTabBars
        isDesktop={panel.isDesktop}
        leftTab={panel.leftTab}
        mobileTab={panel.mobileTab}
        isLeftPanelOpen={panel.isLeftPanelOpen}
        isSavedPanelOpen={panel.isSavedPanelOpen}
        shortlistCount={shortlist.items.length}
        theme={theme}
        t={t}
        onDesktopFiltersClick={handleDesktopFiltersClick}
        onDesktopResultsClick={handleDesktopResultsClick}
        onDesktopSavedClick={handleDesktopSavedClick}
        onMobileFiltersClick={handleMobileFiltersClick}
        onMobileResultsClick={handleMobileResultsClick}
        onMobileSavedClick={handleMobileSavedClick}
        onToggleTheme={toggleTheme}
      />
    </>
  );
}

export default App;
