import { lazy, startTransition, Suspense, useEffect, useMemo, useState } from "react";
import { Bookmark, List, PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from "lucide-react";
import { DEFAULT_FILTERS } from "@/lib/constants";
import { fetchAddressDetail, fetchBlockSummaries, fetchManifest } from "@/lib/data";
import { getSelectionByAddressKey, matchesFilter } from "@/lib/filtering";
import { parseFilters, serializeFilters } from "@/lib/queryState";
import { useI18n } from "@/lib/i18n";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useShortlist } from "@/hooks/useShortlist";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import type {
  AddressDetail,
  AddressDetailSummary,
  BlockSummary,
  FilterState,
  Manifest,
} from "@/types/data";
import { DrawerSkeleton } from "@/components/DrawerSkeleton";
import { FilterPanel } from "@/components/FilterPanel";
import { MapSkeleton } from "@/components/MapSkeleton";
import { GlobalHeader } from "@/components/StatsBar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
const ResultsPane = lazy(() =>
  import("@/components/ResultsPane").then((m) => ({ default: m.ResultsPane })),
);

type LoadedDetail = {
  addressKey: string;
  data: AddressDetail | null;
};

function App() {
  const { locale, setLocale, t } = useI18n();
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
  const [isDetailLoading, setIsDetailLoading] = useState(() => Boolean(filters.selectedAddressKey));
  const [isShortlistOpen, setIsShortlistOpen] = useState(true);
  const [shortlistDetailSummaries, setShortlistDetailSummaries] = useState<
    Record<string, AddressDetailSummary | null>
  >({});
  const [error, setError] = useState<string | null>(null);
  const shortlist = useShortlist();
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  type DesktopTab = "filters" | "results" | "saved";
  type MobileTab = "filters" | "results" | "saved";
  const [desktopTab, setDesktopTab] = useState<DesktopTab>("filters");
  const [mobileTab, setMobileTab] = useState<MobileTab | null>(null);
  const [isDesktopPanelOpen, setIsDesktopPanelOpen] = useState(true);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const selectedAddressKey = filters.selectedAddressKey;
  const resultsVisible = isDesktop
    ? isDesktopPanelOpen && desktopTab === "results"
    : mobileTab === "results";
  const savedVisible = isDesktop
    ? isDesktopPanelOpen && desktopTab === "saved"
    : mobileTab === "saved";

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
  const filteredBlocks = useMemo(
    () => (resultsVisible ? blocks.filter((block) => matchesFilter(block, stableFilters)) : []),
    [blocks, resultsVisible, stableFilters],
  );
  const mapFilteredBlocks = useMemo(
    () => blocks.filter((block) => matchesFilter(block, mapFilters)),
    [blocks, mapFilters],
  );
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
  const selectedDetail =
    selectedAddressKey && detail?.addressKey === selectedAddressKey ? detail.data : null;
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
              shortlistDetailSummaries[item.addressKey] ??
              (selectedDetail?.summary.addressKey === item.addressKey
                ? selectedDetail.summary
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
    [blocks, savedVisible, selectedDetail, shortlist.items, shortlistDetailSummaries],
  );

  useEffect(() => {
    if (!savedVisible || !isShortlistOpen || shortlist.items.length === 0) {
      return;
    }

    const missingAddressKeys = shortlist.items
      .map((item) => item.addressKey)
      .filter((addressKey) => !(addressKey in shortlistDetailSummaries));

    if (missingAddressKeys.length === 0) {
      return;
    }

    let isMounted = true;

    void Promise.all(
      missingAddressKeys.map(async (addressKey) => {
        try {
          const nextDetail = await fetchAddressDetail(addressKey);
          return [addressKey, nextDetail.summary] as const;
        } catch {
          return [addressKey, null] as const;
        }
      }),
    ).then((entries) => {
      if (!isMounted) {
        return;
      }

      setShortlistDetailSummaries((current) => {
        const next = { ...current };
        for (const [addressKey, summary] of entries) {
          next[addressKey] = summary;
        }

        return next;
      });
    });

    return () => {
      isMounted = false;
    };
  }, [isShortlistOpen, savedVisible, shortlist.items, shortlistDetailSummaries]);

  function handleSelectAddress(addressKey: string) {
    if (isDesktop) {
      setIsDesktopPanelOpen(true);
      setDesktopTab("results");
    } else {
      setMobileTab("results");
    }

    patchFilters({ selectedAddressKey: addressKey });
  }

  function patchFilters(patch: Partial<FilterState>) {
    if ("selectedAddressKey" in patch) {
      setIsDetailLoading(Boolean(patch.selectedAddressKey));
      if (!patch.selectedAddressKey) {
        setDetail(null);
      }
    }

    startTransition(() => {
      setFilters((current) => ({ ...current, ...patch }));
    });
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
        setIsDetailLoading(false);
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
        townFilter={filters.town}
        onMapInteract={() => setIsHeaderVisible(false)}
      />
    </Suspense>
  );

  const selectedDetailContent =
    detailVisible || detailLoading ? (
      <Suspense fallback={<DrawerSkeleton label="Loading block details…" />}>
        <DetailDrawer
          detail={selectedDetail}
          selectedBlock={selectedBlock}
          isLoading={detailLoading}
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
    <Suspense fallback={<DrawerSkeleton label="Loading results…" />}>
      <ResultsPane
        blocks={filteredBlocks}
        hasTownFilter={!!filters.town || !!filters.search}
        onSelect={handleSelectAddress}
        onToggleShortlist={(addressKey) => shortlist.toggle(addressKey)}
        selectedAddressKey={selectedAddressKey}
        shortlistKeys={shortlistKeySet}
        isCompact={!isDesktop}
      />
    </Suspense>
  ) : null;
  const savedContent = savedVisible ? (
    <Suspense fallback={<DrawerSkeleton label="Loading shortlist…" />}>
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
      <main className="relative min-h-dvh w-full overflow-hidden">
        <div className="absolute inset-0">
          {mapContent}
        </div>

        <div className="pointer-events-none absolute inset-0 z-10 flex min-h-dvh flex-col gap-4 overflow-hidden p-4 pb-20 lg:p-6 lg:pb-6">
          {isDesktop && (
            <div className="pointer-events-auto absolute left-6 top-6 z-20">
              <button
                type="button"
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border/70 bg-background/85 px-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground shadow-sm backdrop-blur-sm transition-colors hover:text-foreground"
                onClick={() => setIsDesktopPanelOpen((current) => !current)}
              >
                {isDesktopPanelOpen ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
                {isDesktopPanelOpen ? "Hide panel" : "Show panel"}
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-start gap-3 lg:pl-36">
            <div className="pointer-events-auto flex min-w-0 flex-1 flex-wrap items-stretch gap-2">
              <div className="pointer-events-auto flex shrink-0 items-center gap-2 rounded-md border border-border/70 bg-background/85 px-2 py-1 text-sm shadow-sm backdrop-blur-sm">
                <label htmlFor="locale-select" className="text-muted-foreground">{t("language.label")}</label>
                <select
                  id="locale-select"
                  className="rounded-md border border-border bg-background px-2 py-1"
                  value={locale}
                  onChange={(event) => setLocale(event.target.value as typeof locale)}
                >
                  <option value="en-SG">{t("language.en")}</option>
                  <option value="zh-SG">{t("language.zh")}</option>
                </select>
              </div>
              <div className="pointer-events-auto min-w-0 flex-1 basis-[22rem]">
                <GlobalHeader
                  manifest={manifest}
                  isVisible={isHeaderVisible}
                  onDismiss={() => setIsHeaderVisible(false)}
                  onShow={() => setIsHeaderVisible(true)}
                />
              </div>
            </div>
          </div>

          {isDesktop ? (
            <section className="pointer-events-none relative min-h-0 flex-1">
              <aside
                className={`pointer-events-auto absolute left-0 top-0 h-full w-[min(34rem,48vw)] max-w-[96vw] transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                  isDesktopPanelOpen ? "translate-x-0" : "-translate-x-[calc(100%+1rem)]"
                }`}
              >
                <Card className="flex h-full min-h-0 flex-col border-border/70 bg-background/88 shadow-sm backdrop-blur-sm">
                  <CardContent className="flex min-h-0 flex-1 flex-col p-3">
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
                      <TabsContent value="filters" className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                        {filterContent}
                      </TabsContent>
                      <TabsContent value="results" className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
                        <div className="flex min-h-0 flex-1 flex-col gap-4">
                          {selectedDetailContent}
                          <div className={`min-h-0 flex-1 flex-col ${detailVisible || detailLoading ? "hidden" : "flex"}`}>
                            {resultsPaneContent}
                          </div>
                        </div>
                      </TabsContent>
                      <TabsContent value="saved" className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
                        {savedContent}
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              </aside>
            </section>
          ) : (
            <section className="pointer-events-none relative min-h-0 flex-1">
              {mobileTab && (
                <div className="pointer-events-auto absolute inset-0 overflow-hidden rounded-xl border border-border/70 bg-background/90 p-3 shadow-sm backdrop-blur-sm">
                  {mobileTab === "filters" && (
                    <div className="h-full overflow-y-auto pr-1">
                      {filterContent}
                    </div>
                  )}
                  {mobileTab === "results" && (
                    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
                      {selectedDetailContent}
                      <div className={`min-h-0 flex-1 flex-col ${detailVisible || detailLoading ? "hidden" : "flex"}`}>
                        {resultsPaneContent}
                      </div>
                    </div>
                  )}
                  {mobileTab === "saved" && (
                    <div className="h-full min-h-0 overflow-y-auto">
                      {savedContent}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      {!isDesktop && (
        <nav className="mobile-tab-bar">
          <button
            type="button"
            data-active={mobileTab === "filters"}
            onClick={() => setMobileTab((current) => (current === "filters" ? null : "filters"))}
          >
            <SlidersHorizontal />
            {t("tab.filters")}
          </button>
          <button
            type="button"
            data-active={mobileTab === "results"}
            onClick={() => setMobileTab((current) => (current === "results" ? null : "results"))}
          >
            <List />
            {t("tab.results")}
          </button>
          <button
            type="button"
            data-active={mobileTab === "saved"}
            onClick={() => setMobileTab((current) => (current === "saved" ? null : "saved"))}
          >
            <Bookmark />
            {t("tab.saved")}{shortlist.items.length > 0 ? ` (${shortlist.items.length})` : ""}
          </button>
        </nav>
      )}
    </>
  );
}

export default App;
