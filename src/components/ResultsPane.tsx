import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Bookmark, Clock3, Coins, TrainFront, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatCompactCurrency,
  formatMeters,
  formatMonth,
  formatRemainingLease,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { BlockSummary } from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemHeader,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ResultsPaneProps = {
  blocks: BlockSummary[];
  hasTownFilter: boolean;
  selectedAddressKey: string | null;
  shortlistKeys: Set<string>;
  onSelect: (addressKey: string) => void;
  onToggleShortlist: (addressKey: string) => void;
  scrollParent?: HTMLElement | null;
  isCompact?: boolean;
};

type SortMode = "median-asc" | "median-desc" | "lease-desc" | "mrt-asc" | "latest-desc";

function getSortValue(block: BlockSummary, mode: SortMode) {
  const currentYear = new Date().getFullYear();

  switch (mode) {
    case "median-asc":
      return block.medianPrice;
    case "median-desc":
      return -block.medianPrice;
    case "lease-desc":
      return -(99 - (currentYear - block.leaseCommenceRange[1]));
    case "mrt-asc":
      return block.nearestMrt?.distanceMeters ?? Number.POSITIVE_INFINITY;
    case "latest-desc":
      return -Number(block.latestMonth.replace("-", ""));
    default:
      return block.medianPrice;
  }
}

function BlockCard({
  block,
  isFeatured = false,
  isSaved,
  isCompact = false,
  onSelect,
  onToggleShortlist,
}: {
  block: BlockSummary;
  isFeatured?: boolean;
  isSaved: boolean;
  isCompact?: boolean;
  onSelect: (addressKey: string) => void;
  onToggleShortlist: (addressKey: string) => void;
}) {
  const { locale, t } = useI18n();
  const nearbyStations = (block.nearbyMrts ?? []).slice(0, 2);

  if (isCompact) {
    return (
      <Item
        data-state={isFeatured ? "selected" : "idle"}
        variant="outline"
        className={cn(
          "cursor-pointer bg-card transition-transform duration-150 hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-muted/40",
          isFeatured && "border-foreground/20 bg-muted/40 shadow-sm",
          "h-[86px] min-h-[86px] max-h-[86px] gap-2 px-3 py-2.5",
        )}
        onClick={() => onSelect(block.addressKey)}
      >
        <ItemHeader className="basis-full min-w-0">
          <ItemContent className="min-w-0">
            <div className="result-address flex min-w-0 flex-col">
              <strong className="truncate font-heading text-base font-semibold leading-tight">
                {block.block} {block.streetName}
              </strong>
              <span className="truncate text-[0.6rem] font-bold uppercase tracking-wider text-muted-foreground">
                {block.town}
              </span>
            </div>
          </ItemContent>
          <ItemActions className="shrink-0">
            <Button
              size="xs"
              variant={isSaved ? "secondary" : "ghost"}
              onClick={(event) => {
                event.stopPropagation();
                onToggleShortlist(block.addressKey);
              }}
              type="button"
              className="size-7 p-0"
              aria-label={isSaved ? t("results.saved") : t("results.save")}
              title={isSaved ? t("results.saved") : t("results.save")}
            >
              <Bookmark className={cn("size-3.5", isSaved && "fill-current")} />
            </Button>
          </ItemActions>
        </ItemHeader>
        <div className="flex w-full min-w-0 items-center justify-between border-t border-border/40 pt-2">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 text-[0.6rem] font-bold uppercase tracking-widest text-muted-foreground/60">
              {t("results.median")}:{" "}
            </span>
            <strong className="truncate font-heading text-sm font-semibold">
              {formatCompactCurrency(block.medianPrice, locale)}
            </strong>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="secondary" className="h-4 px-1.5 py-0 text-[0.6rem]">
              {block.flatTypes[0]}
            </Badge>
            {block.nearestMrt && (
              <span className="text-[0.65rem] font-medium text-muted-foreground">
                {formatMeters(block.nearestMrt.distanceMeters, t, locale)} {t("results.toMrt")}
              </span>
            )}
          </div>
        </div>
      </Item>
    );
  }

  return (
    <Item
      data-state={isFeatured ? "selected" : "idle"}
      variant="outline"
      className={cn(
        "cursor-pointer bg-card transition-transform duration-150 hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-muted/40",
        isFeatured && "border-foreground/20 bg-muted/40 shadow-sm",
      )}
      onClick={() => onSelect(block.addressKey)}
    >
      <ItemHeader>
        <ItemContent>
          <div className="result-address flex flex-col gap-1">
            <strong className="font-heading text-xl font-semibold leading-none tracking-tight">
              {block.block} {block.streetName}
            </strong>
            <span className="text-sm uppercase tracking-[0.14em] text-muted-foreground">
              {block.town}
            </span>
          </div>
        </ItemContent>
        <ItemActions className="flex-wrap justify-end">
          {isFeatured ? <Badge>{t("results.selected")}</Badge> : null}
          <Button
            size="xs"
            variant={isSaved ? "secondary" : "ghost"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleShortlist(block.addressKey);
            }}
            type="button"
          >
            <Bookmark data-icon="inline-start" />
            {isSaved ? t("results.saved") : t("results.save")}
          </Button>
        </ItemActions>
      </ItemHeader>

      <div className="grid basis-full gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <WalletCards className="size-3.5" />
            {t("results.medianResale")}
          </span>
          <strong className="font-heading text-2xl font-semibold">
            {formatCompactCurrency(block.medianPrice, locale)}
          </strong>
        </div>
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <TrainFront className="size-3.5" />
            {t("results.nearestMrt")}
          </span>
          <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
            {block.nearestMrt
              ? `${block.nearestMrt.stationName} • ${formatMeters(block.nearestMrt.distanceMeters, t, locale)}`
              : t("results.noMatch")}
          </strong>
          {nearbyStations.length > 1 ? (
            <span className="text-xs text-muted-foreground">
              Also near {nearbyStations.slice(1).map((station) => station.stationName).join(", ")}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Coins className="size-3.5" />
            {t("results.remainingLease")}
          </span>
          <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
            {formatRemainingLease(block.leaseCommenceRange, t)}
          </strong>
        </div>
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Clock3 className="size-3.5" />
            {t("results.latestMonth")}
          </span>
          <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
            {formatMonth(block.latestMonth, locale)}
          </strong>
        </div>
      </div>

      <ItemFooter className="flex-wrap gap-2 border-t border-border/60 pt-4">
        {block.flatTypes.slice(0, 3).map((flatType) => (
          <Badge key={flatType} variant="secondary">
            {flatType}
          </Badge>
        ))}
        <ItemDescription className="ml-auto text-right">
          {t("results.transactions", { count: block.transactionCount })}
        </ItemDescription>
      </ItemFooter>
    </Item>
  );
}

export function ResultsPane({
  blocks,
  hasTownFilter,
  selectedAddressKey,
  shortlistKeys,
  onSelect,
  onToggleShortlist,
  scrollParent,
  isCompact = false,
}: ResultsPaneProps) {
  const { t } = useI18n();
  const sortOptions: Array<{ value: SortMode; label: string }> = [
    { value: "median-asc", label: t("results.sort.lowestMedian") },
    { value: "median-desc", label: t("results.sort.highestMedian") },
    { value: "lease-desc", label: t("results.sort.longestLease") },
    { value: "mrt-asc", label: t("results.sort.nearestMrt") },
    { value: "latest-desc", label: t("results.sort.recentActivity") },
  ];
  const [sortMode, setSortMode] = useState<SortMode>("median-asc");
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const itemsPerPage = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const compactRowHeight = 86;
  const compactRowGap = 8;
  const compactRowStride = compactRowHeight + compactRowGap;

  const sortedBlocks = useMemo(() => {
    return [...blocks].sort((left, right) => {
      return getSortValue(left, sortMode) - getSortValue(right, sortMode);
    });
  }, [blocks, sortMode]);
  const shouldVirtualize = isCompact && sortedBlocks.length > 80;

  useEffect(() => {
    if (!isCompact || !hasTownFilter) {
      return;
    }

    const container = listContainerRef.current;
    const scroller = scrollParent ?? container;
    if (!container || !scroller) {
      return;
    }

    const updateViewport = () => {
      setViewportHeight(scroller.clientHeight);
    };

    const handleScroll = () => {
      const currentScrollTop =
        scroller === container
          ? container.scrollTop
          : Math.max(0, scroller.getBoundingClientRect().top - container.getBoundingClientRect().top);
      setScrollTop(currentScrollTop);
    };

    updateViewport();
    handleScroll();
    scroller.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", updateViewport);

    return () => {
      scroller.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateViewport);
    };
  }, [hasTownFilter, isCompact, scrollParent, sortedBlocks.length]);

  const [prevBlocks, setPrevBlocks] = useState(blocks);
  if (blocks !== prevBlocks) {
    setPrevBlocks(blocks);
    setCurrentPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(sortedBlocks.length / itemsPerPage));
  const visiblePage = Math.min(currentPage, totalPages);
  const currentBlocks = sortedBlocks.slice(
    (visiblePage - 1) * itemsPerPage,
    visiblePage * itemsPerPage,
  );
  const overscan = 8;
  const virtualStartIndex = Math.max(0, Math.floor(scrollTop / compactRowStride) - overscan);
  const virtualVisibleRows =
    Math.ceil((viewportHeight || compactRowStride * 8) / compactRowStride) + overscan * 2;
  const virtualEndIndex = Math.min(sortedBlocks.length, virtualStartIndex + virtualVisibleRows);
  const virtualBlocks = sortedBlocks.slice(virtualStartIndex, virtualEndIndex);
  const virtualTopPadding = virtualStartIndex * compactRowStride;
  const virtualBottomPadding = Math.max(0, (sortedBlocks.length - virtualEndIndex) * compactRowStride);

  const renderPagination = () => {
    if (totalPages <= 1) return null;
    let startPage = Math.max(1, visiblePage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }
    const pages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

    return (
      <div className="mt-4 flex flex-wrap items-center justify-center gap-1.5 border-t border-border/40 py-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => p - 1)}
          disabled={visiblePage === 1}
        >
          {t("results.prev")}
        </Button>
        {startPage > 1 && (
          <>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)}>
              1
            </Button>
            {startPage > 2 && <span className="px-1 text-muted-foreground">...</span>}
          </>
        )}
        {pages.map((p) => (
          <Button
            key={p}
            variant={p === visiblePage ? "default" : "outline"}
            size="sm"
            onClick={() => setCurrentPage(p)}
          >
            {p}
          </Button>
        ))}
        {endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && <span className="px-1 text-muted-foreground">...</span>}
            <Button variant="outline" size="sm" onClick={() => setCurrentPage(totalPages)}>
              {totalPages}
            </Button>
          </>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => p + 1)}
          disabled={visiblePage === totalPages}
        >
          {t("results.next")}
        </Button>
      </div>
    );
  };

  return (
    <section data-testid="results-pane" className="flex min-h-0 flex-1 flex-col">
      <Card className="flex min-h-0 flex-1 flex-col bg-background">
        <CardHeader className="gap-4 border-b border-border pb-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <Badge variant="secondary">{t("results.shortlistCandidates")}</Badge>
              <CardTitle className="text-2xl">{t("results.filteredBlocks")}</CardTitle>
            </div>
            <CardAction className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              {hasTownFilter ? <Badge>{t("results.shown", { count: blocks.length })}</Badge> : null}
              {hasTownFilter ? (
                <div className="flex min-w-[14rem] items-center gap-3">
                  <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <ArrowUpDown className="size-3.5" />
                    {t("results.sort")}
                  </span>
                  <Select
                    onValueChange={(value) => {
                      setSortMode(value as SortMode);
                      setCurrentPage(1);
                    }}
                    value={sortMode}
                  >
                    <SelectTrigger className="w-full sm:w-[15rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sortOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </CardAction>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col pt-4">
          {!hasTownFilter ? (
            <div className="flex min-h-[14rem] flex-1 flex-col items-center justify-center gap-2 py-8 text-center text-muted-foreground">
              <ArrowUpDown className="size-6 opacity-40" />
              <p className="text-sm font-medium">{t("results.selectTown")}</p>
              <p className="text-xs">{t("results.useTownFilter")}</p>
            </div>
          ) : blocks.length === 0 ? (
            <div className="flex flex-1 items-start">
              <div className="empty-state w-full">{t("results.noMatchFilters")}</div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <div
                ref={listContainerRef}
                className={cn("min-h-0 flex-1 pr-2", !scrollParent && "overflow-y-auto")}
              >
                <ItemGroup
                  className={cn("flex flex-col", isCompact ? "gap-2" : "gap-4")}
                  style={
                    shouldVirtualize
                      ? {
                          paddingTop: virtualTopPadding,
                          paddingBottom: virtualBottomPadding,
                        }
                      : undefined
                  }
                >
                  {(shouldVirtualize ? virtualBlocks : isCompact ? sortedBlocks : currentBlocks).map((block) => (
                    <BlockCard
                      key={block.addressKey}
                      block={block}
                      isFeatured={block.addressKey === selectedAddressKey}
                      isSaved={shortlistKeys.has(block.addressKey)}
                      isCompact={isCompact}
                      onSelect={onSelect}
                      onToggleShortlist={onToggleShortlist}
                    />
                  ))}
                </ItemGroup>
                {!isCompact ? renderPagination() : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
