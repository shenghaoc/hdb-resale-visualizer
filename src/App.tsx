import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { useI18n } from "@/shared/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { useManifestData } from "@/hooks/useManifestData";
import { useShortlist } from "@/features/shortlist/useShortlist";
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
import { getActiveFilterChipDescriptors } from "@/shared/lib/filterChips";
import { getSearchProfileChipDescriptors } from "@/features/search-profile/searchProfileChips";
import { buildTownRecommendations } from "@/features/search-profile/town-recommendations";
import { ErrorBoundary } from "@/components/ErrorBoundary";
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
import { getPrimarySchoolsForOverlay } from "@/features/map-explorer/school-proximity";
import { buildFilterShareUrl, shareViaNavigator } from "@/shared/lib/shareUrls";
import { useSearchProfile } from "@/hooks/useSearchProfile";
import { useListingCheckController } from "@/features/listing-check/useListingCheckController";
import { DocsLink } from "@/features/docs/DocsLink";
import { isDocsPath, navigate, usePathname, DOCS_PATH_PREFIX } from "@/features/docs/docsRouter";

const DocsPage = lazy(() =>
  import("@/features/docs/DocsPage").then((m) => ({ default: m.DocsPage })),
);
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
const ListingCheckPanel = lazy(() =>
  import("@/features/listing-check/ListingCheckPanel").then((module) => ({
    default: module.ListingCheckPanel,
  })),
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

  const { detail, comparison, isDetailLoading, isComparisonLoading } = useSelectedBlockArtifacts(
    filters.selectedAddressKey,
  );

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
    const profileChips = getSearchProfileChipDescriptors(searchProfile.profile, locale, t).map(
      (chip) => ({
        key: chip.key,
        label: chip.label,
        onRemove: () => searchProfile.patchProfile(chip.clearPatch),
      }),
    );
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

  // ── Listing check workflow ───────────────────────────────────────────────
  const {
    isDesktop: isPanelDesktop,
    setLeftTab: setPanelLeftTab,
    setIsLeftPanelOpen: setPanelLeftPanelOpen,
    setMobileTab: setPanelMobileTab,
  } = panel;
  const openCheckPanel = useCallback(() => {
    if (isPanelDesktop) {
      setPanelLeftTab("check");
      setPanelLeftPanelOpen(true);
      return;
    }
    setPanelMobileTab("check");
  }, [isPanelDesktop, setPanelLeftPanelOpen, setPanelLeftTab, setPanelMobileTab]);

  const listingCheck = useListingCheckController({
    blocks: pipeline.blocks,
    shortlistItems: shortlist.items,
    toggleShortlist: shortlist.toggle,
    updateShortlist: shortlist.update,
    openCheckPanel,
    shareTitle: t("app.title"),
  });

  const handleOpenCandidates = useCallback(() => {
    const tab = pipeline.hasResultScope ? "results" : "filters";
    if (panel.isDesktop) {
      panel.setLeftTab(tab);
      panel.setIsLeftPanelOpen(true);
      return;
    }
    panel.setMobileTab(tab);
  }, [panel, pipeline.hasResultScope]);

  const handleOpenShortlist = useCallback(() => {
    if (panel.isDesktop) {
      panel.setIsSavedPanelOpen(true);
      return;
    }
    panel.setMobileTab("saved");
  }, [panel]);

  const {
    patchUserFilters,
    handleSelectSuggestion,
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
    handleDesktopCheckClick,
    handleDesktopSavedClick,
    handleMobileFiltersClick,
    handleMobileResultsClick,
    handleMobileCheckClick,
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

  const resultsShareUrl = useMemo(
    () => buildFilterShareUrl(filters, `${window.location.origin}${window.location.pathname}`),
    [filters],
  );

  const handleShareFilters = useCallback(async () => {
    try {
      return await shareViaNavigator(resultsShareUrl, t("app.title"));
    } catch {
      return null;
    }
  }, [resultsShareUrl, t]);

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
          <CardContent className="flex flex-col gap-2 pt-2 text-sm text-muted-foreground">
            <span>{t("app.devFunctionsHint")}</span>
            <DocsLink slug="troubleshooting">{t("docs.linkTroubleshooting")}</DocsLink>
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
    <ErrorBoundary
      fill
      className="size-full"
      reloadOnRecovery={false}
      fallbackText={t("error.mapFallback")}
      actionText={t("error.retry")}
    >
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
    </ErrorBoundary>
  );

  const selectedDetailContent =
    detailVisible || detailLoading ? (
      <ErrorBoundary
        className="min-h-0"
        reloadOnRecovery={false}
        fallbackText={t("error.detailFallback")}
        actionText={t("error.retry")}
      >
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
            referenceMonth={manifest.dataWindow.maxMonth}
            searchProfile={searchProfile.profile}
            onClose={() => patchFilters({ selectedAddressKey: null })}
            onToggleShortlist={() => {
              if (selectedBlock) shortlist.toggle(selectedBlock.addressKey);
            }}
            onSelectBlock={handleSelectAddress}
          />
        </Suspense>
      </ErrorBoundary>
    ) : null;

  const resultsPaneContent = (
    <div
      hidden={!panel.resultsVisible}
      className={panel.resultsVisible ? "flex min-h-0 flex-1 flex-col" : undefined}
    >
      <ErrorBoundary
        className="min-h-0 flex-1"
        reloadOnRecovery={false}
        fallbackText={t("error.resultsFallback")}
        actionText={t("error.retry")}
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
            onSelectTown={(town) =>
              patchUserFilters({ town, selectedAddressKey: null, compareTown: "" })
            }
            searchTruncated={pipeline.searchTruncated}
            shareUrl={resultsShareUrl}
          />
        </Suspense>
      </ErrorBoundary>
    </div>
  );

  const savedContent = panel.savedVisible ? (
    <ErrorBoundary
      className="min-h-0 flex-1"
      reloadOnRecovery={false}
      fallbackText={t("error.shortlistFallback")}
      actionText={t("error.retry")}
    >
      <Suspense fallback={<DrawerSkeleton label={t("app.loadingShortlist")} />}>
        <ShortlistDrawer
          isOpen={panel.isShortlistOpen}
          filters={filters}
          onSelectAddress={handleSelectAddress}
          onRemove={(addressKey) => shortlist.toggle(addressKey)}
          onRestore={shortlist.restore}
          onToggleOpen={() => panel.setIsShortlistOpen((c) => !c)}
          onUpdate={(addressKey, patch) => shortlist.update(addressKey, patch)}
          rows={shortlistRows}
          remainingLeaseMin={filters.remainingLeaseMin}
          budgetMin={filters.budgetMin}
          budgetMax={filters.budgetMax}
          referenceMonth={manifest.dataWindow.maxMonth}
          sync={shortlist.sync}
        />
      </Suspense>
    </ErrorBoundary>
  ) : null;

  const checkContent = (
    <Suspense fallback={<DrawerSkeleton label={t("app.loadingDetails")} />}>
      <ListingCheckPanel
        key={listingCheck.panelKey}
        selectedAddressKey={listingCheck.state.selectedAddressKey}
        askingPrice={listingCheck.state.askingPrice}
        floorAreaSqm={listingCheck.state.floorAreaSqm}
        flatType={listingCheck.state.flatType}
        storeyRange={listingCheck.state.storeyRange}
        leaseCommenceYear={listingCheck.state.leaseCommenceYear}
        onAddressSelect={listingCheck.onAddressSelect}
        onAskingPriceChange={listingCheck.onAskingPriceChange}
        onFloorAreaChange={listingCheck.onFloorAreaChange}
        onFlatTypeChange={listingCheck.onFlatTypeChange}
        onStoreyRangeChange={listingCheck.onStoreyRangeChange}
        onLeaseYearChange={listingCheck.onLeaseYearChange}
        onSaveToShortlist={listingCheck.onSaveToShortlist}
        onShare={() => {
          void listingCheck.onShare();
        }}
        onUseSampleCheck={listingCheck.onUseSampleCheck}
        onOpenCandidates={handleOpenCandidates}
        onOpenShortlist={handleOpenShortlist}
        savedToShortlist={listingCheck.savedToShortlist}
        referenceMonth={manifest?.dataWindow.maxMonth}
      />
    </Suspense>
  );

  // ── Derived layout flags ─────────────────────────────────────────────────

  const showFloatingHeader = header.isHeaderVisible;
  const showScopePrompt = Boolean(
    !pipeline.hasResultScope && (panel.isDesktop || panel.mobileTab === null),
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-none focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-bold focus-visible:text-primary-foreground focus-visible:shadow-lg"
      >
        {t("app.skipToContent")}
      </a>
      <main
        id="main-content"
        tabIndex={-1}
        className="fixed inset-0 w-full overflow-hidden focus:outline-none"
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

        {showFloatingHeader ? (
          <AppHeader
            manifest={manifest}
            isDesktop={panel.isDesktop}
            locale={locale}
            t={t}
            search={pipeline.filterPanelFilters.search}
            onSearchChange={(search) => patchUserFilters({ search })}
            onSelectSuggestion={handleSelectSuggestion}
            isMobileHeaderOpen={header.isMobileHeaderOpen}
            onToggleMobileHeader={() => header.setIsMobileHeaderOpen((o) => !o)}
            onDismiss={() => header.setIsHeaderVisible(false)}
            mobileTab={panel.mobileTab}
            onClearMobileTab={() => panel.setMobileTab(null)}
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
          onShare={handleShareFilters}
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
          onCheckListing={openCheckPanel}
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
          checkContent={checkContent}
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
        onDesktopCheckClick={handleDesktopCheckClick}
        onDesktopSavedClick={handleDesktopSavedClick}
        onMobileFiltersClick={handleMobileFiltersClick}
        onMobileResultsClick={handleMobileResultsClick}
        onMobileCheckClick={handleMobileCheckClick}
        onMobileSavedClick={handleMobileSavedClick}
        onToggleTheme={toggleTheme}
        onOpenGuide={() => navigate(DOCS_PATH_PREFIX)}
      />
    </>
  );
}

function AppWithErrorBoundary() {
  // Lightweight path routing: /docs and its subpaths render the in-app user
  // guide instead of the map shell. All other app state stays in the query
  // string, so leaving the guide restores the previous view. Deployed refreshes
  // work via the Worker's single-page-application asset fallback.
  const pathname = usePathname();

  // Root boundary: a crash here means the whole app (including the I18nProvider)
  // is unusable, so recovery falls back to a full reload and the fallback uses
  // the default English copy — translations aren't reachable once the provider
  // tree has failed.
  return (
    <ErrorBoundary fill className="min-h-screen">
      {isDocsPath(pathname) ? (
        <Suspense fallback={null}>
          <DocsPage />
        </Suspense>
      ) : null}
      <div hidden={isDocsPath(pathname)}>
        <App />
      </div>
    </ErrorBoundary>
  );
}

export default AppWithErrorBoundary;
