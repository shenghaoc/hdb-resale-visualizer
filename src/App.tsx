import { lazy, startTransition, Suspense, useEffect, useMemo, useState } from "react";
import { Bookmark, List, Map as MapIcon, SlidersHorizontal } from "lucide-react";
import { DEFAULT_FILTERS } from "@/lib/constants";
import { fetchAddressDetail, fetchBlockSummaries, fetchManifest } from "@/lib/data";
import { getFilterOptions, getSelectionByAddressKey, matchesFilter } from "@/lib/filtering";
import { parseFilters, serializeFilters } from "@/lib/queryState";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useShortlist } from "@/hooks/useShortlist";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type { AddressDetail, BlockSummary, FilterState, Manifest } from "@/types/data";
import { DrawerSkeleton } from "@/components/DrawerSkeleton";
import { FilterPanel } from "@/components/FilterPanel";
import { MapSkeleton } from "@/components/MapSkeleton";
import { ResultsPane } from "@/components/ResultsPane";
import { GlobalHeader } from "@/components/StatsBar";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

function App() {
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
  const [detail, setDetail] = useState<AddressDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isShortlistOpen, setIsShortlistOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shortlist = useShortlist();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  type DesktopTab = "filters" | "results" | "saved";
  type MobileTab = "map" | "filters" | "results" | "saved";
  const [desktopTab, setDesktopTab] = useState<DesktopTab>("filters");
  const [mobileTab, setMobileTab] = useState<MobileTab>("map");

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
    if (!filters.selectedAddressKey) {
      setDetail(null);
      return;
    }

    let isMounted = true;
    setIsDetailLoading(true);

    void fetchAddressDetail(filters.selectedAddressKey)
      .then((nextDetail) => {
        if (!isMounted) {
          return;
        }

        setDetail(nextDetail);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setDetail(null);
      })
      .finally(() => {
        if (isMounted) {
          setIsDetailLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [filters.selectedAddressKey]);

  // Debounce the search string so every keystroke doesn't trigger 10K-point
  // map re-renders and GeoJSON source updates.
  const debouncedSearch = useDebouncedValue(filters.search, 200);
  const stableFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debouncedSearch, filters.town, filters.flatType, filters.flatModel,
     filters.budgetMin, filters.budgetMax, filters.areaMin, filters.areaMax,
     filters.remainingLeaseMin, filters.startMonth, filters.endMonth,
     filters.mrtMax, filters.selectedAddressKey],
  );
  const filteredBlocks = useMemo(
    () => blocks.filter((block) => matchesFilter(block, stableFilters)),
    [blocks, stableFilters],
  );
  const filterOptions = useMemo(() => getFilterOptions(blocks), [blocks]);
  const shortlistKeySet = useMemo(
    () => new Set(shortlist.items.map((item) => item.addressKey)),
    [shortlist.items],
  );
  const shortlistRows = useMemo(
    () =>
      shortlist.items
        .map((item) => {
          const summary = blocks.find((block) => block.addressKey === item.addressKey);
          if (!summary) {
            return null;
          }

          return { item, summary };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((left, right) => {
          const leftGap =
            left.item.targetPrice !== null
              ? Math.abs(left.item.targetPrice - left.summary.medianPrice)
              : Number.POSITIVE_INFINITY;
          const rightGap =
            right.item.targetPrice !== null
              ? Math.abs(right.item.targetPrice - right.summary.medianPrice)
              : Number.POSITIVE_INFINITY;

          if (leftGap !== rightGap) {
            return leftGap - rightGap;
          }

          return left.item.addedAt.localeCompare(right.item.addedAt);
        }),
    [blocks, shortlist.items],
  );
  const selectedBlock = useMemo(
    () => getSelectionByAddressKey(blocks, filters.selectedAddressKey),
    [blocks, filters.selectedAddressKey],
  );

  function patchFilters(patch: Partial<FilterState>) {
    startTransition(() => {
      setFilters((current) => ({ ...current, ...patch }));
    });
  }

  if (error) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-7xl items-center p-4 sm:p-6 lg:p-8">
        <Card className="w-full bg-background">
          <CardHeader className="gap-3">
            <Badge variant="secondary">Static data missing</Badge>
            <CardTitle className="text-3xl">HDB Resale Visualizer</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent className="pt-2 text-sm text-muted-foreground">
            Run `bun run sync-data` to generate the static data artifacts for the app.
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
            <Badge variant="secondary">Loading static data</Badge>
            <CardTitle className="text-3xl">HDB Resale Visualizer</CardTitle>
            <CardDescription>
              Preparing block summaries, detail files, and the market map.
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
      onReset={() => setFilters(DEFAULT_FILTERS)}
      options={filterOptions}
    />
  );

  const mapContent = (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card">
      <CardHeader className="gap-4 border-b border-border pb-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-1 flex-col gap-1">
            <CardTitle className="text-xl sm:text-2xl">Singapore resale map</CardTitle>
          </div>
          <CardAction>
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block size-2.5 bg-[#d7d0c5]" />
                Lower median
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="inline-block size-2.5 bg-[#5a3e2d]" />
                Higher median
              </span>
            </div>
          </CardAction>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 p-4">
        <div className="flex min-h-0 flex-1">
          <Suspense fallback={<MapSkeleton />}>
            <MapView
              blocks={filteredBlocks}
              onSelect={(addressKey) => patchFilters({ selectedAddressKey: addressKey })}
              selectedAddressKey={filters.selectedAddressKey}
            />
          </Suspense>
        </div>
      </CardContent>
    </Card>
  );

  const selectedDetailContent =
    filters.selectedAddressKey || isDetailLoading ? (
      <Suspense fallback={<DrawerSkeleton label="Loading block details…" />}>
        <DetailDrawer
          detail={detail}
          selectedBlock={selectedBlock}
          isLoading={isDetailLoading}
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

  const savedContent = (
    <Suspense fallback={<DrawerSkeleton label="Loading shortlist…" />}>
      <ShortlistDrawer
        isOpen={isShortlistOpen}
        onRemove={(addressKey) => shortlist.toggle(addressKey)}
        onToggleOpen={() => setIsShortlistOpen((current) => !current)}
        onUpdate={(addressKey, patch) => shortlist.update(addressKey, patch)}
        rows={shortlistRows}
      />
    </Suspense>
  );

  return (
    <>
      <main className="mx-auto flex min-h-screen lg:h-screen lg:overflow-hidden w-full max-w-[1680px] flex-col gap-4 p-4 pb-20 lg:p-6 lg:pb-0">
        {/* Desktop: 2-column grid */}
        {isDesktop ? (
          <section className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)] xl:grid-cols-[28rem_minmax(0,1fr)] lg:min-h-0 lg:flex-1 lg:[grid-template-rows:minmax(0,1fr)]">
            <section className="flex min-w-0 min-h-0 flex-col pr-1 pt-1 gap-4 lg:max-h-full lg:overflow-hidden lg:pb-6">
              <GlobalHeader manifest={manifest} />
              <Tabs 
                value={desktopTab}
                onValueChange={(value) => setDesktopTab(value as DesktopTab)}
                className="flex flex-col h-full overflow-hidden"
              >
                <TabsList className="grid w-full grid-cols-3 shrink-0">
                  <TabsTrigger value="filters">Filters</TabsTrigger>
                  <TabsTrigger value="results">Results</TabsTrigger>
                  <TabsTrigger value="saved">Saved</TabsTrigger>
                </TabsList>
                <TabsContent value="filters" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                  {filterContent}
                </TabsContent>
                <TabsContent value="results" className="mt-4 flex min-h-0 flex-1 flex-col pr-1">
                  <div className="flex min-h-0 flex-1 flex-col gap-4">
                    {selectedDetailContent}
                    <div className={`min-h-0 flex-1 flex-col ${filters.selectedAddressKey || isDetailLoading ? "hidden" : "flex"}`}>
                      <ResultsPane
                        blocks={filteredBlocks}
                        hasTownFilter={!!filters.town || !!filters.search}
                        onSelect={(addressKey) => patchFilters({ selectedAddressKey: addressKey })}
                        onToggleShortlist={(addressKey) => shortlist.toggle(addressKey)}
                        selectedAddressKey={filters.selectedAddressKey}
                        shortlistKeys={shortlistKeySet}
                        isCompact={false}
                      />
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="saved" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
                  {savedContent}
                </TabsContent>
              </Tabs>
            </section>

            <section className="flex min-w-0 min-h-0 flex-1 flex-col gap-4 lg:max-h-full lg:overflow-hidden lg:pb-6">
              {mapContent}
            </section>
          </section>
        ) : (
          <section className="flex flex-col gap-4 min-h-0 flex-1">
            <GlobalHeader manifest={manifest} />
            {/* Mobile: tab-switched content */}
            {mobileTab === "map" && (
              <div className="flex flex-col gap-4">
                {mapContent}
              </div>
            )}
            {mobileTab === "filters" && filterContent}
            {mobileTab === "results" && (
              <div className="flex flex-col gap-4 min-h-0 flex-1">
                {selectedDetailContent}
                <div className={`min-h-0 flex-1 flex-col ${filters.selectedAddressKey || isDetailLoading ? "hidden" : "flex"}`}>
                  <ResultsPane
                    blocks={filteredBlocks}
                    hasTownFilter={!!filters.town || !!filters.search}
                    onSelect={(addressKey) => patchFilters({ selectedAddressKey: addressKey })}
                    onToggleShortlist={(addressKey) => shortlist.toggle(addressKey)}
                    selectedAddressKey={filters.selectedAddressKey}
                    shortlistKeys={shortlistKeySet}
                    isCompact={true}
                  />
                </div>
              </div>
            )}
            {mobileTab === "saved" && (
              <div className="flex flex-col gap-4">
                {savedContent}
              </div>
            )}
          </section>
        )}

      </main>

      {/* Mobile bottom tab bar */}
      {!isDesktop && (
        <nav className="mobile-tab-bar">
          <button type="button" data-active={mobileTab === "map"} onClick={() => setMobileTab("map")}>
            <MapIcon />
            Map
          </button>
          <button type="button" data-active={mobileTab === "filters"} onClick={() => setMobileTab("filters")}>
            <SlidersHorizontal />
            Filters
          </button>
          <button type="button" data-active={mobileTab === "results"} onClick={() => setMobileTab("results")}>
            <List />
            Results
          </button>
          <button type="button" data-active={mobileTab === "saved"} onClick={() => setMobileTab("saved")}>
            <Bookmark />
            Saved{shortlist.items.length > 0 ? ` (${shortlist.items.length})` : ""}
          </button>
        </nav>
      )}
    </>
  );
}

export default App;
