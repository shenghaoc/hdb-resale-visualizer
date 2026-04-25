import { lazy, startTransition, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, Info, List, PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from "lucide-react";
import {
  DEFAULT_FILTERS,
  DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS,
  HEADER_DISMISSED_STORAGE_KEY,
} from "@/lib/constants";
import { fetchAddressDetail, fetchBlockSummaries, fetchComparisonArtifact, fetchManifest } from "@/lib/data";
import {
  getSelectionByAddressKey,
  matchesFilter,
  matchesGeographicSearchIntent,
  resolveGeographicSearchIntent,
} from "@/lib/filtering";
import { parseFilters, serializeFilters } from "@/lib/queryState";
import { useI18n } from "@/lib/i18n";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useShortlist } from "@/hooks/useShortlist";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type {
  AddressDetail,
  BlockSummary,
  ComparisonArtifact,
  FilterState,
  Manifest,
} from "@/types/data";
import { DrawerSkeleton } from "@/components/DrawerSkeleton";
import { FilterPanel } from "@/components/FilterPanel";
import { MapSkeleton } from "@/components/MapSkeleton";
import { GlobalHeader } from "@/components/StatsBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const MapView = lazy(() =>
  import("@/components/MapView").then((m) => ({ default: m.MapView })),
);
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

type LoadedDetail = {
  addressKey: string;
  data: AddressDetail | null;
};

type LoadedComparison = {
  addressKey: string;
  data: ComparisonArtifact | null;
};

function App() {
  const { t } = useI18n();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [filters, setFilters] = useState<FilterState>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_FILTERS;
    }

    return {
      ...DEFAULT_FILTERS,
      ...parseFilters(window.location.search),
    };
  });
  const [detail, setDetail] = useState<LoadedDetail | null>(null);
  const [comparison, setComparison] = useState<LoadedComparison | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(() => Boolean(filters.selectedAddressKey));
  const [isComparisonLoading, setIsComparisonLoading] = useState(() => Boolean(filters.selectedAddressKey));
  const [isShortlistOpen, setIsShortlistOpen] = useState(true);
  const [shortlistDetails, setShortlistDetails] = useState<Record<string, AddressDetail | null>>({});
  const [shortlistComparisons, setShortlistComparisons] = useState<Record<string, ComparisonArtifact | null>>({});
  const [error, setError] = useState<string | null>(null);
  const shortlist = useShortlist();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  type DesktopTab = "filters" | "results" | "saved";
  type MobileTab = "filters" | "results" | "saved";
  const [desktopTab, setDesktopTab] = useState<DesktopTab>("filters");
  const [mobileTab, setMobileTab] = useState<MobileTab | null>(null);
  const [isDesktopPanelOpen, setIsDesktopPanelOpen] = useState(true);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [hasInteractedWithMap, setHasInteractedWithMap] = useState(false);
  const [hasLoadedHeaderPreference, setHasLoadedHeaderPreference] = useState(false);
  const { toggle: toggleShortlist } = shortlist;
  const selectedAddressKey = filters.selectedAddressKey;
  const resultsVisible = isDesktop
    ? isDesktopPanelOpen && desktopTab === "results"
    : mobileTab === "results";
  const savedVisible = isDesktop
    ? isDesktopPanelOpen && desktopTab === "saved"
    : mobileTab === "saved";
  const showMobileHeader = isDesktop || mobileTab === null;

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const [nextManifest, nextBlocks] = await Promise.all([
          fetchManifest(),
          fetchBlockSummaries(),
        ]);

        if (!isMounted) {
          return;
        }

        setManifest(nextManifest);
        setBlocks(nextBlocks);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "Failed to load static data");
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const nextSearch = serializeFilters(filters);
    window.history.replaceState({}, "", `${window.location.pathname}${nextSearch}`);
  }, [filters]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem(HEADER_DISMISSED_STORAGE_KEY);
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

    window.localStorage.setItem(HEADER_DISMISSED_STORAGE_KEY, isHeaderVisible ? "0" : "1");
  }, [hasLoadedHeaderPreference, isHeaderVisible]);

  useEffect(() => {
    if (!selectedAddressKey) {
      return;
    }

    let isMounted = true;

    void fetchAddressDetail(selectedAddressKey)
      .then((nextDetail) => {
        if (!isMounted) {
          return;
        }

        setDetail({ addressKey: selectedAddressKey, data: nextDetail });
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setDetail({ addressKey: selectedAddressKey, data: null });
      })
      .finally(() => {
        if (isMounted) {
          setIsDetailLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedAddressKey]);

  useEffect(() => {
    if (!selectedAddressKey) {
      return;
    }

    let isMounted = true;

    void fetchComparisonArtifact(selectedAddressKey)
      .then((nextComparison) => {
        if (!isMounted) {
          return;
        }

        setComparison({ addressKey: selectedAddressKey, data: nextComparison });
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setComparison({ addressKey: selectedAddressKey, data: null });
      })
      .finally(() => {
        if (isMounted) {
          setIsComparisonLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedAddressKey]);

  // Debounce search for the map only so list interactions stay in sync with
  // the visible result rows while the heavier map updates trail slightly.
  const debouncedSearch = useDebouncedValue(filters.search, 200);
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
      ),
    [blocks, filters.mrtMax, filters.search],
  );
  const mapGeographicIntent = useMemo(
    () =>
      resolveGeographicSearchIntent(
        mapFilters.search,
        blocks,
        mapFilters.mrtMax ?? DEFAULT_GEOGRAPHIC_SEARCH_RADIUS_METERS,
      ),
    [blocks, mapFilters.mrtMax, mapFilters.search],
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
            return geographicIntent
              ? matchesGeographicSearchIntent(block, geographicIntent)
              : true;
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
  const selectedDetail =
    selectedAddressKey && detail?.addressKey === selectedAddressKey ? detail.data : null;
  const selectedComparison =
    selectedAddressKey && comparison?.addressKey === selectedAddressKey ? comparison.data : null;
  const shortlistRows = useMemo(
    () => {
      if (!savedVisible) {
        return [];
      }

      return shortlist.items
        .map((item) => {
          const block = blocks.find((candidate) => candidate.addressKey === item.addressKey);
          if (!block) {
            return null;
          }

          return {
            item,
            block,
            detailSummary:
              shortlistDetails[item.addressKey]?.summary ??
              (selectedDetail?.summary.addressKey === item.addressKey
                ? selectedDetail.summary
                : null),
            monthlyTrend:
              shortlistDetails[item.addressKey]?.monthlyTrend ??
              (selectedDetail?.summary.addressKey === item.addressKey
                ? selectedDetail.monthlyTrend
                : []),
            comparison:
              shortlistComparisons[item.addressKey] ??
              (selectedComparison?.addressKey === item.addressKey
                ? selectedComparison
                : null),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((left, right) => {
          const leftGap =
            left.item.targetPrice !== null
              ? Math.abs(left.item.targetPrice - left.block.medianPrice)
              : Number.POSITIVE_INFINITY;
          const rightGap =
            right.item.targetPrice !== null
              ? Math.abs(right.item.targetPrice - right.block.medianPrice)
              : Number.POSITIVE_INFINITY;

          if (leftGap !== rightGap) {
            return leftGap - rightGap;
          }

          return left.item.addedAt.localeCompare(right.item.addedAt);
        });
    },
    [blocks, savedVisible, selectedDetail, selectedComparison, shortlist.items, shortlistDetails, shortlistComparisons],
  );

  useEffect(() => {
    if (!savedVisible || !isShortlistOpen || shortlist.items.length === 0) {
      return;
    }

    const missingAddressKeys = shortlist.items
      .map((item) => item.addressKey)
      .filter((addressKey) => !(addressKey in shortlistDetails));

    if (missingAddressKeys.length === 0) {
      return;
    }

    let isMounted = true;

    void Promise.all(
      missingAddressKeys.map(async (addressKey) => {
        try {
          const nextDetail = await fetchAddressDetail(addressKey);
          return [addressKey, nextDetail] as const;
        } catch {
          return [addressKey, null] as const;
        }
      }),
    ).then((entries) => {
      if (!isMounted) {
        return;
      }

      setShortlistDetails((current) => {
        const next = { ...current };
        for (const [addressKey, detailData] of entries) {
          next[addressKey] = detailData;
        }

        return next;
      });
    });

    return () => {
      isMounted = false;
    };
  }, [isShortlistOpen, savedVisible, shortlist.items, shortlistDetails]);

  useEffect(() => {
    if (!savedVisible || !isShortlistOpen || shortlist.items.length === 0) {
      return;
    }

    const missingComparisonKeys = shortlist.items
      .map((item) => item.addressKey)
      .filter((addressKey) => !(addressKey in shortlistComparisons));

    if (missingComparisonKeys.length === 0) {
      return;
    }

    let isMounted = true;

    void Promise.all(
      missingComparisonKeys.map(async (addressKey) => {
        try {
          const nextComparison = await fetchComparisonArtifact(addressKey);
          return [addressKey, nextComparison] as const;
        } catch {
          return [addressKey, null] as const;
        }
      }),
    ).then((entries) => {
      if (!isMounted) {
        return;
      }

      setShortlistComparisons((current) => {
        const next = { ...current };
        for (const [addressKey, comparisonData] of entries) {
          next[addressKey] = comparisonData;
        }

        return next;
      });
    });

    return () => {
      isMounted = false;
    };
  }, [isShortlistOpen, savedVisible, shortlist.items, shortlistComparisons]);

  const patchFilters = useCallback((patch: Partial<FilterState>) => {
    if ("selectedAddressKey" in patch) {
      setIsDetailLoading(Boolean(patch.selectedAddressKey));
      setIsComparisonLoading(Boolean(patch.selectedAddressKey));
      if (!patch.selectedAddressKey) {
        setDetail(null);
        setComparison(null);
      }
    }

    startTransition(() => {
      setFilters((current) => ({ ...current, ...patch }));
    });
  }, []);

  const handleSelectAddress = useCallback((addressKey: string) => {
    if (isDesktop) {
      setIsDesktopPanelOpen(true);
      setDesktopTab("results");
    } else {
      setMobileTab("results");
    }

    patchFilters({ selectedAddressKey: addressKey });
  }, [isDesktop, patchFilters]);

  const handleToggleShortlist = useCallback(
    (addressKey: string) => toggleShortlist(addressKey),
    [toggleShortlist],
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

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center p-4 sm:p-6 lg:p-8">
        <Card className="w-full bg-background">
          <CardHeader className="gap-3">
            <CardTitle className="text-3xl">{t("app.title")}</CardTitle>
            <CardDescription>
              {t("app.missingData")} · {error}
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
        setDetail(null);
        setComparison(null);
        setIsDetailLoading(false);
        setIsComparisonLoading(false);
        setFilters(DEFAULT_FILTERS);
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
        t={t}
      />
    </Suspense>
  );

  const selectedDetailContent =
    detailVisible || detailLoading ? (
      <Suspense fallback={<DrawerSkeleton label={t("app.loadingDetails")} />}>
        <DetailDrawer
          detail={selectedDetail}
          comparison={selectedComparison}
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
        isCompact={!isDesktop}
      />
    </Suspense>
  ) : null;
  const savedContent = savedVisible ? (
    <Suspense fallback={<DrawerSkeleton label={t("app.loadingShortlist")} />}>
      <ShortlistDrawer
        isOpen={isShortlistOpen}
        onRemove={(addressKey) => shortlist.toggle(addressKey)}
        onToggleOpen={() => setIsShortlistOpen((current) => !current)}
        onUpdate={(addressKey, patch) => shortlist.update(addressKey, patch)}
        rows={shortlistRows}
      />
    </Suspense>
  ) : null;

  return (
    <>
      <main className="relative h-dvh w-full overflow-hidden">
        <div className="absolute inset-0">{mapContent}</div>
        <a
          className="map-attribution-link"
          href="https://www.onemap.gov.sg/home"
          rel="noreferrer"
          target="_blank"
        >
          © OneMap contributors
        </a>

        <div className="pointer-events-none absolute inset-0 z-10 flex h-full flex-col gap-3 overflow-hidden p-3 pb-[calc(var(--mobile-tab-bar-height)+var(--mobile-map-attrib-height)+env(safe-area-inset-bottom,0px)+1rem)] sm:p-4 lg:gap-4 lg:p-6 lg:pb-6">
          {isDesktop && (
            <div className="pointer-events-auto absolute left-6 top-6 z-20">
              <Button
                variant="outline"
                size="sm"
                className="h-9 border-border/70 bg-background/85 px-3 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
                onClick={() => setIsDesktopPanelOpen((current) => !current)}
                aria-expanded={isDesktopPanelOpen}
                aria-controls="desktop-panel"
              >
                {isDesktopPanelOpen ? (
                  <PanelLeftClose data-icon="inline-start" />
                ) : (
                  <PanelLeftOpen data-icon="inline-start" />
                )}
                {isDesktopPanelOpen ? t("app.hidePanel") : t("app.showPanel")}
              </Button>
            </div>
          )}
          {!isHeaderVisible ? (
            <div className="pointer-events-auto absolute right-4 top-4 z-20 lg:right-6 lg:top-6">
              <Button
                variant="outline"
                size="sm"
                className="h-9 border-border/70 bg-background/85 px-3 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
                onClick={() => setIsHeaderVisible(true)}
              >
                <Info data-icon="inline-start" />
                {t("app.showHeader")}
              </Button>
            </div>
          ) : null}

          {showMobileHeader ? (
            <div className="flex flex-wrap items-start gap-3 lg:pl-36">
              <div className="pointer-events-auto flex min-w-0 flex-1 flex-wrap items-stretch gap-2">
                <div className="pointer-events-auto min-w-0 flex-1 basis-[22rem]">
                  <GlobalHeader
                    manifest={manifest}
                    isVisible={isHeaderVisible}
                    onDismiss={() => setIsHeaderVisible(false)}
                  />
                </div>
              </div>
            </div>
          ) : null}

          {isDesktop ? (
            <section className="pointer-events-none relative min-h-0 flex-1">
              <aside
                id="desktop-panel"
                className={cn(
                  "pointer-events-auto absolute left-0 top-0 h-full w-[min(46rem,62vw)] max-w-[96vw] transition-transform duration-300 ease-out",
                  isDesktopPanelOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]",
                )}
                {...(!isDesktopPanelOpen && { inert: true })}
              >
                <div className="flex h-full min-h-0 flex-col overflow-hidden border border-border/70 bg-background/92 p-3 shadow-sm backdrop-blur-md">
                  <Tabs
                    value={desktopTab}
                    onValueChange={(value) => setDesktopTab(value as DesktopTab)}
                    className="flex h-full flex-col overflow-hidden"
                  >
                    <TabsList className="grid w-full shrink-0 grid-cols-3">
                      <TabsTrigger value="filters">{t("tab.filters")}</TabsTrigger>
                      <TabsTrigger value="results">{t("tab.results")}</TabsTrigger>
                      <TabsTrigger value="saved">{t("tab.saved")}</TabsTrigger>
                    </TabsList>
                    <TabsContent
                      value="filters"
                      className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1"
                    >
                      {filterContent}
                    </TabsContent>
                    <TabsContent
                      value="results"
                      className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1"
                    >
                      <div className="flex min-h-0 flex-1 flex-col gap-4">
                        {selectedDetailContent}
                        <div
                          className={cn(
                            "min-h-0 flex-1 flex-col",
                            detailVisible || detailLoading ? "hidden" : "flex",
                          )}
                        >
                          {resultsPaneContent}
                        </div>
                      </div>
                    </TabsContent>
                    <TabsContent
                      value="saved"
                      className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden"
                    >
                      {savedContent}
                    </TabsContent>
                  </Tabs>
                </div>
              </aside>
            </section>
          ) : (
            <section className="pointer-events-none relative min-h-0 flex-1">
              {mobileTab && (
                <div
                  id="mobile-panel"
                  className="pointer-events-auto absolute inset-0 overflow-hidden border border-border/70 bg-background/94 p-2 shadow-sm backdrop-blur-md"
                >
                  {mobileTab === "filters" && (
                    <div id="mobile-filters-content" className="h-full overflow-y-auto pr-1">{filterContent}</div>
                  )}
                  {mobileTab === "results" && (
                    <div id="mobile-results-content" className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
                      {selectedDetailContent}
                      <div
                        className={cn(
                          "min-h-0 flex-1 flex-col",
                          detailVisible || detailLoading ? "hidden" : "flex",
                        )}
                      >
                        {resultsPaneContent}
                      </div>
                    </div>
                  )}
                  {mobileTab === "saved" && (
                    <div id="mobile-saved-content" className="flex h-full min-h-0 flex-col overflow-hidden">{savedContent}</div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </main>

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
