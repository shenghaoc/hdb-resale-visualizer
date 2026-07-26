import { lazy, Suspense, useCallback, useEffect, useMemo } from "react";
import { useI18n } from "@/shared/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import { useManifestData } from "@/hooks/useManifestData";
import { useShortlist } from "@/features/shortlist/useShortlist";
import { useShortlistRemovalUndo } from "@/features/shortlist/useShortlistRemovalUndo";
import { ShortlistUndoToast } from "@/features/shortlist/ShortlistUndoToast";
import { useSelectedBlockArtifacts } from "@/hooks/useSelectedBlockArtifacts";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { usePanelState } from "@/hooks/usePanelState";
import { useShortlistArtifacts } from "@/features/shortlist/useShortlistArtifacts";
import { useGeolocation } from "@/features/map-explorer/useGeolocation";
import { useHeaderState } from "@/hooks/useHeaderState";
import { useFilterPipeline } from "@/hooks/useFilterPipeline";
import { useAppShellController } from "@/hooks/useAppShellController";
import { useDeepLinkPanelInit } from "@/hooks/useDeepLinkPanelInit";
import { getActiveFilterChipDescriptors } from "@/shared/lib/filterChips";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppHeader } from "@/components/AppHeader";
import { MapLocaleControl } from "@/features/map-explorer/MapLocaleControl";
import { SearchProfileWizard } from "@/features/search-profile/SearchProfileWizard";
import {
  useSearchProfileControllerState,
  useSearchProfileControllerView,
} from "@/features/search-profile/useSearchProfileController";
import { AmenityLayersControl } from "@/features/map-explorer/AmenityLayersControl";
import { AppPanelShell } from "@/components/AppPanelShell";
import { AppTabBars } from "@/components/AppTabBars";
import { FilterChipsBar } from "@/components/FilterChipsBar";
import { ScopePrompt } from "@/components/ScopePrompt";
import { DrawerSkeleton } from "@/components/DrawerSkeleton";
import { FilterPanel } from "@/components/FilterPanel";
import { MapSkeleton } from "@/features/map-explorer/MapSkeleton";
import { PriceHeatmapControl } from "@/features/map-explorer/PriceHeatmapControl";
import { PriceLegend } from "@/features/map-explorer/PriceLegend";
import { useMapExplorerController } from "@/features/map-explorer/useMapExplorerController";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildFilterShareUrl, shareViaNavigator } from "@/shared/lib/shareUrls";
import { isAffordabilityProfileComplete } from "@/shared/lib/affordability";
import { useListingCheckController } from "@/features/listing-check/useListingCheckController";
import { DocsLink } from "@/features/docs/DocsLink";
import { isDocsPath, navigate, usePathname, DOCS_PATH_PREFIX } from "@/features/docs/docsRouter";
import type { FilterState } from "@/types/data";
import type { SearchProfile } from "@/types/searchProfile";

const DocsPage = lazy(() =>
  import("@/features/docs/DocsPage").then((m) => ({ default: m.DocsPage })),
);
const MapView = lazy(() =>
  import("@/features/map-explorer/MapView").then((module) => ({
    default: module.MapView,
  })),
);
const DetailDrawer = lazy(() =>
  import("@/features/block-detail/DetailDrawer").then((module) => ({
    default: module.DetailDrawer,
  })),
);
const ShortlistDrawer = lazy(() =>
  import("@/features/shortlist/ShortlistDrawer").then((module) => ({
    default: module.ShortlistDrawer,
  })),
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
  const { manifest, error, retry: retryManifest } = useManifestData();
  const shortlist = useShortlist();
  const {
    pendingRemoval: pendingShortlistRemoval,
    restoreError: shortlistRestoreError,
    remove: removeShortlistWithUndo,
    undo: undoShortlistRemoval,
  } = useShortlistRemovalUndo({
    onRemove: shortlist.toggle,
    onRestore: shortlist.restore,
  });
  const panel = usePanelState();
  const { filters, patchFilters, resetFilters } = useUrlFilters();
  const geo = useGeolocation({ t });
  const header = useHeaderState();
  const searchProfileState = useSearchProfileControllerState();
  const affordabilityProfileComplete = isAffordabilityProfileComplete({
    monthlyIncome: searchProfileState.profile.monthlyIncome,
    cpfOABalance: searchProfileState.profile.cpfOABalance,
    age: searchProfileState.profile.age,
    coApplicantAge: searchProfileState.profile.coApplicantAge,
  });
  const activeFilters = useMemo<FilterState>(
    () =>
      filters.affordable && !affordabilityProfileComplete
        ? { ...filters, affordable: "" }
        : filters,
    [affordabilityProfileComplete, filters],
  );

  useEffect(() => {
    if (filters.affordable && !affordabilityProfileComplete) {
      patchFilters({ affordable: "" });
    }
  }, [affordabilityProfileComplete, filters.affordable, patchFilters]);

  const pipeline = useFilterPipeline({
    manifest,
    rawFilters: activeFilters,
    userLocation: geo.userLocation,
    resultsVisible: panel.resultsVisible,
    savedVisible: panel.savedVisible,
    shortlistCount: shortlist.items.length,
    searchProfile: searchProfileState.profile,
    t,
  });

  const totalBlocks = manifest?.counts.blocks ?? 0;
  const searchProfile = useSearchProfileControllerView(searchProfileState, {
    blocks: pipeline.blocks,
    totalBlocks,
    hasResultScope: pipeline.hasResultScope,
    effectiveTown: pipeline.effectiveFilters.town || null,
  });
  const townOverviewTown =
    pipeline.effectiveFilters.town &&
    !pipeline.effectiveFilters.search &&
    !pipeline.effectiveFilters.flatType &&
    !pipeline.effectiveFilters.flatModel &&
    pipeline.effectiveFilters.budgetMin === null &&
    pipeline.effectiveFilters.budgetMax === null &&
    pipeline.effectiveFilters.areaMin === null &&
    pipeline.effectiveFilters.areaMax === null &&
    pipeline.effectiveFilters.remainingLeaseMin === null &&
    activeFilters.startMonth === null &&
    activeFilters.endMonth === null &&
    pipeline.effectiveFilters.mrtMax === null &&
    !pipeline.effectiveFilters.affordable
      ? pipeline.effectiveFilters.town
      : null;

  const { detail, comparison, isDetailLoading, isComparisonLoading } = useSelectedBlockArtifacts(
    activeFilters.selectedAddressKey,
  );

  const { shortlistRows } = useShortlistArtifacts({
    blocks: pipeline.blocks,
    items: shortlist.items,
    savedVisible: panel.savedVisible,
    selectedDetail: detail,
    selectedComparison: comparison,
    isShortlistOpen: panel.isShortlistOpen,
  });
  const isShortlistResolving =
    panel.savedVisible &&
    shortlist.items.length > 0 &&
    (pipeline.blocksLoading ||
      manifest === null ||
      pipeline.blocks.length < manifest.counts.blocks);
  const unresolvedShortlistItems = useMemo(() => {
    if (isShortlistResolving) return [];
    const resolvedKeys = new Set(shortlistRows.map((row) => row.item.addressKey));
    return shortlist.items.filter((item) => !resolvedKeys.has(item.addressKey));
  }, [isShortlistResolving, shortlist.items, shortlistRows]);

  const handleShortlistToggle = useCallback(
    (addressKey: string) => {
      const index = shortlist.items.findIndex((item) => item.addressKey === addressKey);
      if (index < 0) {
        shortlist.toggle(addressKey);
        return;
      }

      const item = shortlist.items[index];
      const block = pipeline.blocksByKey.get(addressKey);
      removeShortlistWithUndo({
        item,
        index,
        label: block ? `${block.block} ${block.streetName}` : addressKey,
      });
    },
    [pipeline.blocksByKey, removeShortlistWithUndo, shortlist],
  );

  const selectedBlock = useMemo(
    () =>
      activeFilters.selectedAddressKey
        ? (pipeline.blocksByKey.get(activeFilters.selectedAddressKey) ?? null)
        : null,
    [activeFilters.selectedAddressKey, pipeline.blocksByKey],
  );

  useDeepLinkPanelInit({
    selectedAddressKey: activeFilters.selectedAddressKey,
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

  const detailVisible = Boolean(activeFilters.selectedAddressKey);
  const detailLoading = detailVisible && isDetailLoading;
  const comparisonLoading = detailVisible && isComparisonLoading;

  const activeFilterChips = useMemo(() => {
    return getActiveFilterChipDescriptors(activeFilters, locale, t).map((chip) => ({
      key: chip.key,
      label: chip.label,
      onRemove: () => patchFilters(chip.clearPatch),
    }));
  }, [activeFilters, locale, patchFilters, t]);

  const handleCompleteSearchProfile = useCallback(
    (profile: SearchProfile) => {
      searchProfile.replaceProfile(profile);
      patchFilters({
        ...(profile.mainFlatType ? { flatType: profile.mainFlatType } : {}),
        // Budget and lease are optional wizard steps. Writing the blank answer
        // through would silently erase a budget or lease the user had already
        // set in Filters, so only apply what they actually answered.
        ...(profile.maxBudget !== null ? { budgetMax: profile.maxBudget } : {}),
        ...(profile.minimumRemainingLeaseYears !== null
          ? { remainingLeaseMin: profile.minimumRemainingLeaseYears }
          : {}),
        affordable: isAffordabilityProfileComplete({
          monthlyIncome: profile.monthlyIncome,
          cpfOABalance: profile.cpfOABalance,
          age: profile.age,
          coApplicantAge: profile.coApplicantAge,
        })
          ? activeFilters.affordable
          : "",
      });
    },
    [activeFilters.affordable, patchFilters, searchProfile],
  );

  // ── Listing check workflow ───────────────────────────────────────────────
  const {
    isDesktop: isPanelDesktop,
    setLeftTab: setPanelLeftTab,
    setIsLeftPanelOpen: setPanelLeftPanelOpen,
    setMobileTab: setPanelMobileTab,
    setIsSavedPanelOpen: setPanelSavedPanelOpen,
  } = panel;
  const openCheckPanel = useCallback(() => {
    if (isPanelDesktop) {
      setPanelLeftTab("check");
      setPanelLeftPanelOpen(true);
      setPanelSavedPanelOpen(false);
      return;
    }
    setPanelMobileTab("check");
  }, [
    isPanelDesktop,
    setPanelLeftPanelOpen,
    setPanelLeftTab,
    setPanelMobileTab,
    setPanelSavedPanelOpen,
  ]);

  const listingCheck = useListingCheckController({
    shortlistItems: shortlist.items,
    toggleShortlist: handleShortlistToggle,
    updateShortlist: shortlist.update,
    openCheckPanel,
    shareTitle: t("app.title"),
  });

  const {
    patchUserFilters,
    handleSelectSuggestion,
    handleResetFilters,
    handleSelectAddress,
    handleToggleShortlist,
    handleChooseTown,
    handleOpenFilters,
    handleDesktopFiltersClick,
    handleDesktopResultsClick,
    handleDesktopCheckClick,
    handleDesktopSavedClick,
    handleMobileMapClick,
    handleMobileFiltersClick,
    handleMobileResultsClick,
    handleMobileCheckClick,
    handleMobileSavedClick,
  } = useAppShellController({
    filters: activeFilters,
    patchFilters,
    resetFilters,
    clearGeolocationError: geo.clearError,
    cancelPendingGeolocationRequest: geo.cancelPendingRequest,
    isDesktop: panel.isDesktop,
    setLeftTab: panel.setLeftTab,
    setIsLeftPanelOpen: panel.setIsLeftPanelOpen,
    setMobileTab: panel.setMobileTab,
    setIsSavedPanelOpen: panel.setIsSavedPanelOpen,
    isSavedPanelOpen: panel.isSavedPanelOpen,
    listingCheckAddressKey: listingCheck.state.selectedAddressKey,
    prepareListingCheckForAddress: listingCheck.onAddressSelect,
    toggleShortlist: handleShortlistToggle,
    leftTab: panel.leftTab,
  });
  const retryBlockLoading = pipeline.retryBlockLoading;
  const handleBlockLoadRecovery = useCallback(() => {
    handleResetFilters();
    retryBlockLoading();
  }, [handleResetFilters, retryBlockLoading]);

  const mapExplorer = useMapExplorerController({
    filters: activeFilters,
    patchFilters,
    geographicIntent: pipeline.effectiveMapGeographicIntent,
    mapSearch: pipeline.mapFilters.search,
    hasMapMarkerScope: pipeline.hasMapMarkerScope,
    selectedComparison: comparison,
    isComparisonLoading,
    isDesktop: panel.isDesktop,
    controlsVisible: panel.isDesktop || panel.mobileTab === null,
    setLeftTab: panel.setLeftTab,
    setIsLeftPanelOpen: panel.setIsLeftPanelOpen,
    setMobileTab: panel.setMobileTab,
    setIsSavedPanelOpen: panel.setIsSavedPanelOpen,
    hasInteractedWithMap: header.hasInteractedWithMap,
    setIsHeaderVisible: header.setIsHeaderVisible,
    setHasInteractedWithMap: header.setHasInteractedWithMap,
    geolocation: geo,
    onCannotLocate: () => handleChooseTown({ clearGeolocationError: false }),
  });

  const resultsShareUrl = useMemo(
    () =>
      buildFilterShareUrl(activeFilters, `${window.location.origin}${window.location.pathname}`),
    [activeFilters],
  );
  const shareableResultsUrl = activeFilters.affordable ? undefined : resultsShareUrl;

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
              {t("app.missingData")} ·{" "}
              {error ? t("app.manifestLoadFailed") : t("app.resultsLoadFailed")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3 pt-2 text-sm text-muted-foreground">
            <span>{t("app.devFunctionsHint")}</span>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={error ? retryManifest : handleBlockLoadRecovery}
            >
              {error ? t("error.retry") : t("app.resetFiltersAndRetry")}
            </Button>
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
      onOpenBuyerSetup={searchProfile.openWizard}
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
          selectedAddressKey={activeFilters.selectedAddressKey}
          townFilter={pipeline.mapFilters.town}
          flatType={activeFilters.flatType}
          autoFitKey={mapExplorer.autoFitKey}
          showBlockMarkers={pipeline.hasMapMarkerScope}
          isDarkMode={theme === "dark"}
          // Same gate as PriceHeatmapControl. Without it the layer keeps
          // rendering after map scope is lost, while the switch reads OFF and
          // is disabled — leaving a heat blob the user cannot turn off.
          priceHeatmapEnabled={mapExplorer.priceHeatmapEnabled && pipeline.hasMapMarkerScope}
          priceHeatmapOpacity={mapExplorer.priceHeatmapOpacity}
          mrtEnabled={mapExplorer.mrtEnabled}
          heatmapMode={mapExplorer.heatmapMode}
          primarySchools={mapExplorer.primarySchoolsForOverlay}
          schoolOverlayEnabled={mapExplorer.effectiveSchoolOverlayEnabled}
          geographicIntent={pipeline.effectiveMapGeographicIntent}
          onMapInteract={mapExplorer.handleMapInteract}
          onGeolocate={mapExplorer.handleGeolocate}
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
            filters={activeFilters}
            allBlocks={pipeline.blocks}
            isLoading={detailLoading}
            isComparisonLoading={comparisonLoading}
            isSaved={selectedBlock ? shortlist.has(selectedBlock.addressKey) : false}
            shortlistFull={shortlist.isFull}
            remainingLeaseMin={activeFilters.remainingLeaseMin}
            referenceMonth={manifest.dataWindow.maxMonth}
            searchProfile={searchProfile.profile}
            onClose={() => patchFilters({ selectedAddressKey: null })}
            onToggleShortlist={() => {
              if (selectedBlock) handleShortlistToggle(selectedBlock.addressKey);
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
            selectedAddressKey={activeFilters.selectedAddressKey}
            shortlistKeys={shortlistKeySet}
            shortlistFull={shortlist.isFull}
            isCompact
            flatType={pipeline.effectiveFilters.flatType}
            budgetMin={activeFilters.budgetMin}
            budgetMax={activeFilters.budgetMax}
            searchProfile={searchProfile.profile}
            affordabilityMode={activeFilters.affordable}
            onClearAffordabilityFilter={() => patchUserFilters({ affordable: "" })}
            sortMode={activeFilters.sort}
            onSortChange={(sort) => patchUserFilters({ sort })}
            profileTown={townOverviewTown}
            profileTownBlocks={searchProfile.townProfileBlocks}
            profileDataWindow={manifest.dataWindow}
            profileStartMonth={pipeline.effectiveFilters.startMonth}
            profileEndMonth={pipeline.effectiveFilters.endMonth}
            compareTown={activeFilters.compareTown || null}
            availableTowns={manifest.filterOptions.towns}
            onChangeCompareTown={(compareTown) => patchFilters({ compareTown })}
            townRecommendations={searchProfile.townRecommendations}
            townRecommendationsLoading={searchProfile.townRecommendationsLoading}
            onSelectTown={(town) =>
              patchUserFilters({ town, selectedAddressKey: null, compareTown: "" })
            }
            searchTruncated={pipeline.searchTruncated}
            refinementUnsupported={pipeline.refinementUnsupported}
            onClearUnsupportedRefinements={() =>
              patchUserFilters({
                flatModel: "",
                areaMin: null,
                areaMax: null,
                startMonth: null,
                endMonth: null,
              })
            }
            shareUrl={shareableResultsUrl}
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
          filters={activeFilters}
          onSelectAddress={handleSelectAddress}
          onRemove={handleShortlistToggle}
          onRestore={shortlist.restore}
          onToggleOpen={() => panel.setIsShortlistOpen((c) => !c)}
          onUpdate={(addressKey, patch) => shortlist.update(addressKey, patch)}
          rows={shortlistRows}
          unresolvedItems={unresolvedShortlistItems}
          isResolvingRows={isShortlistResolving}
          removalMode="external"
          remainingLeaseMin={activeFilters.remainingLeaseMin}
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
        savedToShortlist={listingCheck.savedToShortlist}
        shortlistFull={
          shortlist.isFull &&
          !(
            listingCheck.state.selectedAddressKey &&
            shortlist.has(listingCheck.state.selectedAddressKey)
          )
        }
        referenceMonth={manifest?.dataWindow.maxMonth}
      />
    </Suspense>
  );

  // ── Derived layout flags ─────────────────────────────────────────────────

  const showFloatingHeader = header.isHeaderVisible;
  const showScopePrompt = Boolean(
    !pipeline.hasResultScope &&
    (panel.isDesktop
      ? !panel.isLeftPanelOpen && !panel.isSavedPanelOpen
      : panel.mobileTab === null),
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
            onOpenGuide={() => navigate(DOCS_PATH_PREFIX)}
            mobileTab={panel.mobileTab}
          />
        ) : null}

        {mapExplorer.controlsVisible && <MapLocaleControl isDesktop={panel.isDesktop} />}

        {/* Price-colour legend — only when map is visible */}
        <PriceLegend
          isDesktop={panel.isDesktop}
          isVisible={pipeline.hasMapMarkerScope && mapExplorer.controlsVisible && !showScopePrompt}
          // The dots are always coloured by median price; only the heatmap
          // honours $/sqm. Showing the $/sqm ramp with no heatmap on screen
          // mislabels the markers it sits next to.
          mode={
            mapExplorer.priceHeatmapEnabled && pipeline.hasMapMarkerScope
              ? mapExplorer.heatmapMode
              : "price"
          }
          t={t}
        />

        {/* Price heatmap toggle */}
        {mapExplorer.controlsVisible && !showScopePrompt && (
          <PriceHeatmapControl
            isEnabled={mapExplorer.priceHeatmapEnabled}
            opacity={mapExplorer.priceHeatmapOpacity}
            mode={mapExplorer.heatmapMode}
            onToggle={mapExplorer.togglePriceHeatmap}
            onOpacityChange={mapExplorer.setPriceHeatmapOpacity}
            onModeChange={mapExplorer.setHeatmapMode}
            hasScope={pipeline.hasMapMarkerScope}
            t={t}
            className="absolute z-25"
            style={mapExplorer.heatmapControlStyle}
          />
        )}

        {mapExplorer.controlsVisible && !showScopePrompt && (
          <AmenityLayersControl
            mrtEnabled={mapExplorer.mrtEnabled}
            schoolOverlayEnabled={mapExplorer.effectiveSchoolOverlayEnabled}
            schoolOverlayAvailable={mapExplorer.schoolOverlayAvailable}
            schoolOverlayLoading={mapExplorer.schoolOverlayLoading}
            hasBlockSelection={mapExplorer.hasBlockSelection}
            onToggleMrt={mapExplorer.toggleMrt}
            onToggleSchoolOverlay={mapExplorer.toggleSchoolOverlay}
            t={t}
            className="absolute z-25 w-36"
            style={mapExplorer.amenityControlStyle}
          />
        )}

        <FilterChipsBar
          chips={activeFilterChips}
          isDesktop={panel.isDesktop}
          t={t}
          onOpenFilters={handleOpenFilters}
          onShare={activeFilters.affordable ? undefined : handleShareFilters}
          hidden={detailVisible && panel.isDesktop}
        />

        <ScopePrompt
          showScopePrompt={showScopePrompt}
          geolocationError={mapExplorer.geolocationError}
          isDesktop={panel.isDesktop}
          isLocating={mapExplorer.isLocating}
          t={t}
          onUseCurrentLocation={mapExplorer.handleUseCurrentLocation}
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

        {searchProfile.shouldShowWizard ? (
          <SearchProfileWizard
            options={manifest.filterOptions}
            initialProfile={searchProfile.profile}
            onComplete={handleCompleteSearchProfile}
            onSkip={searchProfile.dismissWizard}
          />
        ) : null}
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
        onMobileMapClick={handleMobileMapClick}
        onMobileFiltersClick={handleMobileFiltersClick}
        onMobileResultsClick={handleMobileResultsClick}
        onMobileCheckClick={handleMobileCheckClick}
        onMobileSavedClick={handleMobileSavedClick}
        onToggleTheme={toggleTheme}
        onOpenGuide={() => navigate(DOCS_PATH_PREFIX)}
      />
      <ShortlistUndoToast
        pendingRemoval={pendingShortlistRemoval}
        restoreError={shortlistRestoreError}
        onUndo={undoShortlistRemoval}
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
