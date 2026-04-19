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
      <main className="app-shell app-shell--error">
        <div className="panel">
          <span className="eyebrow">Static data missing</span>
          <h1>HDB Resale Visualizer</h1>
          <p>{error}</p>
          <p>Run `bun run sync-data` to generate the static data artifacts for the app.</p>
        </div>
      </main>
    );
  }

  if (!manifest) {
    return (
      <main className="app-shell app-shell--loading">
        <div className="panel">
          <span className="eyebrow">Loading static data</span>
          <h1>HDB Resale Visualizer</h1>
          <p>Preparing block summaries, detail files, and the market map.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <StatsBar manifest={manifest} filteredCount={filteredBlocks.length} blocks={filteredBlocks} />

      <section className="workspace">
        <FilterPanel
          filters={filters}
          manifest={manifest}
          maxMonth={manifest.dataWindow.maxMonth}
          minMonth={manifest.dataWindow.minMonth}
          onChange={patchFilters}
          onReset={() => setFilters(DEFAULT_FILTERS)}
          options={filterOptions}
        />

        <section className="map-stage panel">
          <div className="panel__header">
            <div>
              <span className="eyebrow">Map-first browsing</span>
              <h2>Singapore resale map</h2>
            </div>
            <div className="map-stage__legend">
              <span className="legend legend--cool">Lower median</span>
              <span className="legend legend--warm">Higher median</span>
            </div>
          </div>
          <Suspense fallback={<MapSkeleton />}>
            <MapView
              blocks={filteredBlocks}
              onSelect={(addressKey) => patchFilters({ selectedAddressKey: addressKey })}
              selectedAddressKey={filters.selectedAddressKey}
            />
          </Suspense>
        </section>

        <ResultsPane
          blocks={filteredBlocks}
          onSelect={(addressKey) => patchFilters({ selectedAddressKey: addressKey })}
          onToggleShortlist={(addressKey) => shortlist.toggle(addressKey)}
          selectedAddressKey={filters.selectedAddressKey}
          shortlistKeys={shortlistKeySet}
        />
      </section>

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
    </main>
  );
}

export default App;
