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
import { useDeepLinkPanelInit } from "@/hooks/useDeepLinkPanelInit";
import { getActiveFilterChipDescriptors } from "@/lib/filterChips";
import { getSearchProfileChipDescriptors } from "@/lib/searchProfileChips";
import { buildTownRecommendations } from "@/lib/town-recommendations";
import { AppHeader } from "@/components/AppHeader";
import { MapLocaleControl } from "@/components/MapLocaleControl";
import { SearchProfileWizard } from "@/components/SearchProfileWizard";
import { AmenityLayersControl } from "@/components/AmenityLayersControl";
import { AppPanelShell } from "@/components/AppPanelShell";
import { AppTabBars } from "@/components/AppTabBars";
import { FilterChipsBar } from "@/components/FilterChipsBar";
import { ScopePrompt } from "@/components/ScopePrompt";
import { DrawerSkeleton } from "@/components/DrawerSkeleton";
import { FilterPanel } from "@/components/FilterPanel";
import { MapSkeleton } from "@/components/MapSkeleton";
import { PriceHeatmapControl } from "@/components/PriceHeatmapControl";
import { PriceLegend } from "@/components/PriceLegend";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPrimarySchoolsForOverlay } from "@/lib/school-proximity";
import { useSearchProfile } from "@/hooks/useSearchProfile";

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
  const searchProfile = useSearchProfile();
  const [mrtStationsEnabled, setMrtStationsEnabled] = useState(false);
  const [mrtExitsEnabled, setMrtExitsEnabled] = useState(false);

  const pipeline = useFilterPipeline({
    manifest,
    rawFilters: filters,
    userLocation: geo.userLocation,
    resultsVisible: panel.resultsVisible,
    savedVisible: panel.savedVisible,
    shortlistCount: shortlist.items.length,
    searchProfile: searchProfile.profile,
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

  useDeepLinkPanelInit({
    selectedAddressKey: filters.selectedAddressKey,
    selectedBlock,
    isDesktop: panel.isDesktop,
    setLeftTab: panel.setLeftTab,
    setIsLeftPanelOpen: panel.setIsLeftPanelOpen,
    setMobileTab: panel.setMobileTab,
  });

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
  const canShowSchoolOverlay = primarySchoolsForOverlay.length > 0;
  const schoolOverlaySelectionActive = Boolean(filters.selectedAddressKey);
  const schoolOverlayLoading = schoolOverlaySelectionActive && isComparisonLoading;

  const activeFilterChips = useMemo(() => {
    const filterChips = getActiveFilterChipDescriptors(filters, locale, t).map((chip) => ({
      key: chip.key,
      label: chip.label,
      onRemove: () => patchFilters(chip.clearPatch),
    }));
    const profileChips = getSearchProfileChipDescriptors(searchProfile.profile, locale, t).map((chip) => ({
      key: chip.key,
      label: chip.label,
      onRemove: () => searchProfile.patchProfile(chip.clearPatch),
    }));
    return [...profileChips, ...filterChips];
  }, [filters, locale, patchFilters, searchProfile, t]);

  const townProfileBlocks = useMemo(
    () =>
      pipeline.effectiveFilters.town
        ? pipeline.blocks.filter((b) => b.town === pipeline.effectiveFilters.town)
        : [],
    [pipeline.blocks, pipeline.effectiveFilters.town],
  );

  const totalBlocks = manifest?.counts.blocks ?? 0;
  const hasAllBlocksLoaded = totalBlocks > 0 && pipeline.blocks.length >= totalBlocks;
  const townRecommendations = useMemo(() => {
    if (!searchProfile.completed) return [];
    if (pipeline.hasResultScope) return [];
    if (!hasAllBlocksLoaded) return [];
    return buildTownRecommendations(searchProfile.profile, pipeline.blocks);
  }, [
    searchProfile.completed,
    searchProfile.profile,
    pipeline.blocks,
    pipeline.hasResultScope,
    hasAllBlocksLoaded,
  ]);

  const townRecommendationsLoading =
    Boolean(manifest) && searchProfile.completed && !pipeline.hasResultScope && !hasAllBlocksLoaded;

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
            {t("app.devFunctionsHint")}
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

  if (searchProfile.shouldShowWizard) {
    return (
      <SearchProfileWizard
        options={manifest.filterOptions}
        onComplete={(profile) => searchProfile.replaceProfile(profile)}
        onSkip={searchProfile.dismissWizard}
      />
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
      desktopToggle={
        panel.isDesktop
          ? { isOpen: panel.isLeftPanelOpen, onToggle: handleDesktopFiltersClick }
          : undefined
      }
      searchProfile={searchProfile.profile}
    />
  );

  const mapContent = (
    <Suspense fallback={<MapSkeleton />}>
      <MapView
        blocks={pipeline.mapFilteredBlocks}
        onSelect={handleSelectAddress}
        selectedAddressKey={filters.selectedAddressKey}
        townFilter={pipeline.mapFilters.town}
        flatType={filters.flatType}
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
        mrtStationsEnabled={mrtStationsEnabled}
        mrtExitsEnabled={mrtExitsEnabled}
        heatmapMode={heatmap.heatmapMode}
        primarySchools={primarySchoolsForOverlay}
        schoolOverlayEnabled={schoolOverlayEnabled && canShowSchoolOverlay}
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
          searchProfile={searchProfile.profile}
          onClose={() => patchFilters({ selectedAddressKey: null })}
          onToggleShortlist={() => {
            if (selectedBlock) shortlist.toggle(selectedBlock.addressKey);
          }}
          onSelectBlock={handleSelectAddress}
        />
      </Suspense>
    ) : null;

  const resultsPaneContent = (
    <div
      hidden={!panel.resultsVisible}
      className={panel.resultsVisible ? "flex min-h-0 flex-1 flex-col" : undefined}
    >
      <Suspense fallback={<DrawerSkeleton label={t("app.loadingResults")} />}>
        <ResultsPane
          blocks={pipeline.filteredBlocks}
          hasResultScope={pipeline.hasResultScope}
          onSelect={handleSelectAddress}
          onToggleShortlist={handleToggleShortlist}
          selectedAddressKey={filters.selectedAddressKey}
          shortlistKeys={shortlistKeySet}
          isCompact
          budgetMin={filters.budgetMin}
          budgetMax={filters.budgetMax}
          searchProfile={searchProfile.profile}
          affordabilityMode={filters.affordable}
          onClearAffordabilityFilter={() => patchUserFilters({ affordable: "" })}
          sortMode={filters.sort}
          onSortChange={(sort) => patchUserFilters({ sort })}
          profileTown={pipeline.effectiveFilters.town || null}
          profileTownBlocks={townProfileBlocks}
          profileDataWindow={manifest.dataWindow}
          profileStartMonth={pipeline.effectiveFilters.startMonth}
          profileEndMonth={pipeline.effectiveFilters.endMonth}
          compareTown={filters.compareTown || null}
          availableTowns={manifest.filterOptions.towns}
          onChangeCompareTown={(compareTown) => patchFilters({ compareTown })}
          townRecommendations={townRecommendations}
          townRecommendationsLoading={townRecommendationsLoading}
          onSelectTown={(town) => patchUserFilters({ town, selectedAddressKey: null, compareTown: "" })}
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
        budgetMin={filters.budgetMin}
        budgetMax={filters.budgetMax}
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
            search={pipeline.filterPanelFilters.search}
            onSearchChange={(search) => patchUserFilters({ search })}
            isMobileHeaderOpen={header.isMobileHeaderOpen}
            onToggleMobileHeader={() => header.setIsMobileHeaderOpen((o) => !o)}
            onDismiss={() => header.setIsHeaderVisible(false)}
          />
        ) : null}

        {(panel.isDesktop || panel.mobileTab === null) && (
          <MapLocaleControl isDesktop={panel.isDesktop} />
        )}

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
            hasScope={pipeline.hasMapMarkerScope}
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
          <AmenityLayersControl
            mrtStationsEnabled={mrtStationsEnabled}
            mrtExitsEnabled={mrtExitsEnabled}
            schoolOverlayEnabled={schoolOverlayEnabled}
            schoolOverlayAvailable={canShowSchoolOverlay}
            schoolOverlayLoading={schoolOverlayLoading}
            hasBlockSelection={schoolOverlaySelectionActive}
            onToggleMrtStations={() => setMrtStationsEnabled((v) => !v)}
            onToggleMrtExits={() => setMrtExitsEnabled((v) => !v)}
            onToggleSchoolOverlay={() => setSchoolOverlayEnabled((v) => !v)}
            t={t}
            className="absolute z-25 w-36"
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
          hidden={detailVisible && panel.isDesktop}
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
