import { lazy, startTransition, Suspense, useEffect, useMemo, useState } from "react";
import { DEFAULT_FILTERS } from "@/lib/constants";
import { fetchAddressDetail, fetchBlockSummaries, fetchManifest } from "@/lib/data";
import { getFilterOptions, getSelectionByAddressKey, matchesFilter } from "@/lib/filtering";
import { parseFilters, serializeFilters } from "@/lib/queryState";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useShortlist } from "@/hooks/useShortlist";
import type { AddressDetail, BlockSummary, FilterState, Manifest } from "@/types/data";
import { DrawerSkeleton } from "@/components/DrawerSkeleton";
import { FilterPanel } from "@/components/FilterPanel";
import { MapSkeleton } from "@/components/MapSkeleton";
import { ResultsPane } from "@/components/ResultsPane";
import { StatsBar } from "@/components/StatsBar";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

  return (
    <main className="mx-auto flex min-h-screen lg:h-screen lg:overflow-hidden w-full max-w-[1680px] flex-col gap-4 p-4 lg:p-6 lg:pb-0">
      <StatsBar
        manifest={manifest}
        filteredCount={filteredBlocks.length}
        blocks={filteredBlocks}
        mode="header"
        testId="stats-bar"
      />

      <section className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)_30rem] xl:grid-cols-[18rem_minmax(0,1fr)_36rem] lg:min-h-0 lg:flex-1">
        <div className="lg:max-h-full lg:overflow-y-auto lg:pb-6 pr-1">
          <FilterPanel
            filters={filters}
            manifest={manifest}
            maxMonth={manifest.dataWindow.maxMonth}
            minMonth={manifest.dataWindow.minMonth}
            onChange={patchFilters}
            onReset={() => setFilters(DEFAULT_FILTERS)}
            options={filterOptions}
          />
        </div>

        <section className="flex min-w-0 min-h-0 flex-col gap-4 lg:pb-6 pr-1">
          <Card className="overflow-hidden bg-card shrink-0">
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
            <CardContent className="pt-4">
              <Suspense fallback={<MapSkeleton />}>
                <MapView
                  blocks={filteredBlocks}
                  onSelect={(addressKey) => patchFilters({ selectedAddressKey: addressKey })}
                  selectedAddressKey={filters.selectedAddressKey}
                />
              </Suspense>
            </CardContent>
          </Card>

          <ResultsPane
            blocks={filteredBlocks}
            onSelect={(addressKey) => patchFilters({ selectedAddressKey: addressKey })}
            onToggleShortlist={(addressKey) => shortlist.toggle(addressKey)}
            selectedAddressKey={filters.selectedAddressKey}
            shortlistKeys={shortlistKeySet}
          />
        </section>

        <section className="flex min-w-0 min-h-0 flex-col gap-4 pr-1 lg:pb-6">
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

          <Suspense fallback={<DrawerSkeleton label="Loading shortlist…" />}>
            <ShortlistDrawer
              isOpen={isShortlistOpen}
              onRemove={(addressKey) => shortlist.toggle(addressKey)}
              onToggleOpen={() => setIsShortlistOpen((current) => !current)}
              onUpdate={(addressKey, patch) => shortlist.update(addressKey, patch)}
              rows={shortlistRows}
            />
          </Suspense>
        </section>
      </section>

      <StatsBar
        manifest={manifest}
        filteredCount={filteredBlocks.length}
        blocks={filteredBlocks}
        mode="summary"
        testId="market-summary"
      />
    </main>
  );
}

export default App;
