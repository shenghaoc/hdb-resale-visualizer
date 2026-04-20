import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowUpDown, Bookmark, Clock3, Coins, TrainFront, WalletCards } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCompactCurrency, formatMeters, formatMonth, formatRemainingLease } from "@/lib/format";
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
  scrollParent: HTMLElement | null;
};

type SortMode = "median-asc" | "median-desc" | "lease-desc" | "mrt-asc" | "latest-desc";

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "median-asc", label: "Lowest median first" },
  { value: "median-desc", label: "Highest median first" },
  { value: "lease-desc", label: "Longest lease first" },
  { value: "mrt-asc", label: "Nearest MRT first" },
  { value: "latest-desc", label: "Most recent activity" },
];

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
  onSelect,
  onToggleShortlist,
}: {
  block: BlockSummary;
  isFeatured?: boolean;
  isSaved: boolean;
  onSelect: (addressKey: string) => void;
  onToggleShortlist: (addressKey: string) => void;
}) {
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
          {isFeatured ? <Badge>Selected</Badge> : null}
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
            {isSaved ? "Saved" : "Save"}
          </Button>
        </ItemActions>
      </ItemHeader>

      <div className="grid basis-full gap-4 border-t border-border/60 pt-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <WalletCards className="size-3.5" />
            Median resale
          </span>
          <strong className="font-heading text-2xl font-semibold">
            {formatCompactCurrency(block.medianPrice)}
          </strong>
        </div>
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <TrainFront className="size-3.5" />
            Nearest MRT
          </span>
          <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
            {block.nearestMrt
              ? `${block.nearestMrt.stationName} • ${formatMeters(block.nearestMrt.distanceMeters)}`
              : "No match"}
          </strong>
        </div>
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Coins className="size-3.5" />
            Remaining lease
          </span>
          <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
            {formatRemainingLease(block.leaseCommenceRange)}
          </strong>
        </div>
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Clock3 className="size-3.5" />
            Latest month
          </span>
          <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
            {formatMonth(block.latestMonth)}
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
          {block.transactionCount} recent transactions
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
}: ResultsPaneProps) {
  const [sortMode, setSortMode] = useState<SortMode>("median-asc");
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const sortedBlocks = useMemo(() => {
    return [...blocks].sort((left, right) => {
      return getSortValue(left, sortMode) - getSortValue(right, sortMode);
    });
  }, [blocks, sortMode]);

  const virtualizer = useVirtualizer({
    count: sortedBlocks.length,
    getScrollElement: () => scrollParent,
    estimateSize: () => 214,
    overscan: 6,
    scrollMargin,
  });

  useEffect(() => {
    if (!scrollParent || !listRef.current) {
      return;
    }

    const updateScrollMargin = () => {
      const nextMargin =
        listRef.current!.getBoundingClientRect().top -
        scrollParent.getBoundingClientRect().top +
        scrollParent.scrollTop;
      setScrollMargin(nextMargin);
    };

    updateScrollMargin();
    window.addEventListener("resize", updateScrollMargin);

    return () => {
      window.removeEventListener("resize", updateScrollMargin);
    };
  }, [scrollParent]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <section data-testid="results-pane">
      <Card className="bg-background">
        <CardHeader className="gap-4 border-b border-border pb-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <Badge variant="secondary">Current shortlist candidates</Badge>
              <CardTitle className="text-2xl">Filtered blocks</CardTitle>
            </div>
            <CardAction className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <Badge>{blocks.length} shown</Badge>
              <div className="flex min-w-[14rem] items-center gap-3">
                <span className="inline-flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  <ArrowUpDown className="size-3.5" />
                  Sort
                </span>
                <Select onValueChange={(value) => setSortMode(value as SortMode)} value={sortMode}>
                  <SelectTrigger className="w-full sm:w-[15rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardAction>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {!hasTownFilter ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <ArrowUpDown className="size-6 opacity-40" />
              <p className="text-sm font-medium">Select a town to browse blocks</p>
              <p className="text-xs">Use the Town filter on the left to narrow results.</p>
            </div>
          ) : blocks.length === 0 ? (
            <div className="empty-state">
              No blocks match your current filters. Try broadening your search or resetting filters.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div ref={listRef} className="pr-2">
                <ItemGroup
                  className="relative"
                  style={{ height: `${virtualizer.getTotalSize()}px` }}
                >
                  {virtualItems.map((virtualRow) => {
                    const block = sortedBlocks[virtualRow.index];

                    return (
                      <div
                        key={block.addressKey}
                        ref={virtualizer.measureElement}
                        data-index={virtualRow.index}
                        className="absolute inset-x-0 top-0"
                        style={{ transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
                      >
                        <BlockCard
                          block={block}
                          isFeatured={block.addressKey === selectedAddressKey}
                          isSaved={shortlistKeys.has(block.addressKey)}
                          onSelect={onSelect}
                          onToggleShortlist={onToggleShortlist}
                        />
                      </div>
                    );
                  })}
                </ItemGroup>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
