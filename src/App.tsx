import { startTransition, useEffect, useMemo, useState } from "react";
import { DEFAULT_FILTERS } from "@/lib/constants";
import { fetchAddressDetail, fetchBlockSummaries, fetchManifest } from "@/lib/data";
import { getFilterOptions, getSelectionByAddressKey, matchesFilter } from "@/lib/filtering";
import { parseFilters, serializeFilters } from "@/lib/queryState";
import { useShortlist } from "@/hooks/useShortlist";
import type { AddressDetail, BlockSummary, FilterState, Manifest } from "@/types/data";
import { DetailDrawer } from "@/components/DetailDrawer";
import { FilterPanel } from "@/components/FilterPanel";
import { MapView } from "@/components/MapView";
import { ResultsPane } from "@/components/ResultsPane";
import { ShortlistDrawer } from "@/components/ShortlistDrawer";
import { StatsBar } from "@/components/StatsBar";

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

  const filteredBlocks = useMemo(
    () => blocks.filter((block) => matchesFilter(block, filters)),
    [blocks, filters],
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
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
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
          <MapView
            blocks={filteredBlocks}
            onSelect={(addressKey) => patchFilters({ selectedAddressKey: addressKey })}
            selectedAddressKey={filters.selectedAddressKey}
          />
        </section>

        <ResultsPane
          blocks={filteredBlocks.slice(0, 250)}
          onSelect={(addressKey) => patchFilters({ selectedAddressKey: addressKey })}
          onToggleShortlist={(addressKey) => shortlist.toggle(addressKey)}
          selectedAddressKey={filters.selectedAddressKey}
          shortlistKeys={shortlistKeySet}
        />
      </section>

      <DetailDrawer
        detail={detail}
        isLoading={isDetailLoading}
        isSaved={selectedBlock ? shortlist.has(selectedBlock.addressKey) : false}
        onClose={() => patchFilters({ selectedAddressKey: null })}
        onToggleShortlist={() => {
          if (selectedBlock) {
            shortlist.toggle(selectedBlock.addressKey);
          }
        }}
      />

      <ShortlistDrawer
        isOpen={isShortlistOpen}
        onRemove={(addressKey) => shortlist.toggle(addressKey)}
        onToggleOpen={() => setIsShortlistOpen((current) => !current)}
        onUpdate={(addressKey, patch) => shortlist.update(addressKey, patch)}
        rows={shortlistRows}
      />
    </main>
  );
}

export default App;
