import { Suspense, lazy } from "react";
import { Clock3, Coins, MapPinned, MoveUpRight, TrainFront, WalletCards } from "lucide-react";
import { formatCompactCurrency, formatCurrency, formatMeters, formatMonth, formatRemainingLease } from "@/lib/format";
import type { AddressDetail, BlockSummary } from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const TrendChart = lazy(() =>
  import("./TrendChart").then((m) => ({ default: m.TrendChart })),
);

type DetailDrawerProps = {
  detail: AddressDetail | null;
  selectedBlock: BlockSummary | null;
  isLoading: boolean;
  isSaved: boolean;
  onClose: () => void;
  onToggleShortlist: () => void;
};

export function DetailDrawer({
  detail,
  selectedBlock,
  isLoading,
  isSaved,
  onClose,
  onToggleShortlist,
}: DetailDrawerProps) {
  const currentSummary = detail?.summary ?? selectedBlock;

  return (
    <aside data-testid="detail-drawer" className="w-full min-w-0">
      <Card size="sm" className="bg-background">
        <CardHeader className="gap-2 border-b border-border pb-4">
          <div className="flex flex-col gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="text-lg">
                {currentSummary
                  ? `${currentSummary.block} ${currentSummary.streetName}`
                  : "Choose a block from the map or results"}
              </CardTitle>
            </div>
            {currentSummary ? (
              <CardAction className="col-start-auto row-span-1 row-start-auto flex flex-wrap items-center gap-2 self-start justify-self-auto">
                <Button onClick={onToggleShortlist} size="sm" variant={isSaved ? "secondary" : "outline"} type="button">
                  {isSaved ? "Saved to shortlist" : "Add to shortlist"}
                </Button>
                <Button onClick={onClose} size="sm" variant="ghost" type="button">
                  Clear
                </Button>
              </CardAction>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="pt-3">
          {isLoading ? <div className="empty-state">Loading block detail...</div> : null}

          {currentSummary ? (
              <div className="flex flex-col gap-4 min-w-0 w-full">
                <div className="grid grid-cols-2 gap-3">
                  <article className="flex flex-col gap-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <WalletCards className="size-3.5" />
                      Median resale
                    </span>
                    <strong className="font-heading text-xl font-semibold">
                      {detail ? formatCompactCurrency(detail.summary.medianPrice) : "Loading..."}
                    </strong>
                  </article>
                  <article className="flex flex-col gap-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <TrainFront className="size-3.5" />
                      Nearest MRT
                    </span>
                    <strong className="text-xs font-semibold uppercase tracking-[0.1em]">
                      {detail?.summary.nearestMrt
                        ? `${detail.summary.nearestMrt.stationName} • ${formatMeters(
                            detail.summary.nearestMrt.distanceMeters,
                          )}`
                        : currentSummary.nearestMrt
                          ? `${currentSummary.nearestMrt.stationName} • ${formatMeters(
                              currentSummary.nearestMrt.distanceMeters,
                            )}`
                          : "No match"}
                    </strong>
                  </article>
                  <article className="flex flex-col gap-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <Coins className="size-3.5" />
                      Remaining lease
                    </span>
                    <strong className="text-xs font-semibold uppercase tracking-[0.1em]">
                      {detail ? formatRemainingLease(detail.summary.leaseCommenceRange) : "Loading..."}
                    </strong>
                  </article>
                  <article className="flex flex-col gap-1.5">
                    <span className="inline-flex items-center gap-1.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                      <Clock3 className="size-3.5" />
                      Latest month
                    </span>
                    <strong className="text-xs font-semibold uppercase tracking-[0.1em]">
                      {detail ? formatMonth(detail.summary.latestMonth) : "Loading..."}
                    </strong>
                  </article>
                </div>

                <section className="flex flex-col gap-2 border-t border-border pt-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="secondary" className="text-xs">
                      <MapPinned data-icon="inline-start" className="size-3" />
                      {currentSummary.town}
                    </Badge>
                    <Button asChild size="xs" variant="ghost">
                      <a
                        href={`https://www.onemap.gov.sg/?lat=${currentSummary.coordinates.lat}&lng=${currentSummary.coordinates.lng}`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <MoveUpRight data-icon="inline-start" />
                        Open in OneMap
                      </a>
                    </Button>
                  </div>
                </section>

                {detail ? (
                  <>
                    <div className="min-w-0">
                      <Card size="sm" className="bg-muted/40 w-full">
                        <CardHeader className="gap-2 border-b border-border/60 pb-3">
                          <div className="flex flex-wrap items-start gap-3">
                            <div className="flex flex-1 flex-col gap-1">
                              <CardTitle className="text-base text-muted-foreground">Monthly median</CardTitle>
                            </div>
                            <CardAction>
                              <Badge>{detail.monthlyTrend.length} months</Badge>
                            </CardAction>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-3">
                          <Suspense fallback={<div className="empty-state">Loading chart engine...</div>}>
                            <TrendChart points={detail.monthlyTrend.slice(-24)} />
                          </Suspense>
                        </CardContent>
                      </Card>
                    </div>

                    <Card size="sm" className="bg-muted/40">
                      <CardHeader className="gap-2 border-b border-border/60 pb-3">
                        <div className="flex flex-col gap-1">
                          <CardTitle className="text-base text-muted-foreground">Latest transactions</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-3">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Price</TableHead>
                              <TableHead>Month</TableHead>
                              <TableHead>Layout</TableHead>
                              <TableHead>Storey</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {detail.recentTransactions.slice(0, 4).map((transaction) => (
                              <TableRow key={transaction.id}>
                                <TableCell>{formatCurrency(transaction.resalePrice)}</TableCell>
                                <TableCell>{formatMonth(transaction.month)}</TableCell>
                                <TableCell>
                                  {transaction.flatType} • {transaction.floorAreaSqm} sqm
                                </TableCell>
                                <TableCell>{transaction.storeyRange}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </>
                ) : null}
              </div>
          ) : null}
        </CardContent>
      </Card>
    </aside>
  );
}
