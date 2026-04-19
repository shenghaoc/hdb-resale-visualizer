import { Suspense, lazy } from "react";
import { MapPinned, MoveUpRight, TrainFront } from "lucide-react";
import { formatCurrency, formatMeters, formatMonth, formatNumber, formatRemainingLease } from "@/lib/format";
import type { AddressDetail, BlockSummary } from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
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
    <aside data-testid="detail-drawer">
      <Card className="bg-background">
        <CardHeader className="gap-4 border-b border-border pb-6">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex flex-1 flex-col gap-2">
              <Badge variant="secondary">Selected block</Badge>
              <CardTitle className="text-2xl">
                {currentSummary
                  ? `${currentSummary.block} ${currentSummary.streetName}`
                  : "Choose a block from the map or results"}
              </CardTitle>
              <CardDescription>
                {currentSummary?.town ??
                  "Block-level trend, transaction evidence, and local notes appear here once you select a candidate."}
              </CardDescription>
            </div>
            {currentSummary ? (
              <CardAction className="flex flex-wrap items-center gap-2">
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

        <CardContent className="pt-6">
          {isLoading ? <div className="empty-state">Loading block detail...</div> : null}

          {currentSummary ? (
            <ScrollArea className="max-h-[72vh] pr-3">
              <div className="flex flex-col gap-6">
                <section className="grid gap-4 sm:grid-cols-2">
                  <article className="flex flex-col gap-2 border-b border-border pb-4 sm:pb-0">
                    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Median price
                    </span>
                    <strong className="font-heading text-3xl font-semibold">
                      {detail ? formatCurrency(detail.summary.medianPrice) : "Loading..."}
                    </strong>
                  </article>
                  <article className="flex flex-col gap-2 border-b border-border pb-4 sm:pb-0">
                    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Price IQR
                    </span>
                    <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                      {detail
                        ? `${formatCurrency(detail.summary.priceIqr[0])} to ${formatCurrency(
                            detail.summary.priceIqr[1],
                          )}`
                        : "Loading..."}
                    </strong>
                  </article>
                  <article className="flex flex-col gap-2 border-b border-border pb-4 sm:border-b-0 sm:pb-0">
                    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Floor area
                    </span>
                    <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                      {detail
                        ? `${formatNumber(detail.summary.floorAreaRange[0], 1)} to ${formatNumber(
                            detail.summary.floorAreaRange[1],
                            1,
                          )} sqm`
                        : "Loading..."}
                    </strong>
                  </article>
                  <article className="flex flex-col gap-2 border-b border-border pb-4 sm:border-b-0 sm:pb-0">
                    <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Remaining lease
                    </span>
                    <strong className="text-sm font-semibold uppercase tracking-[0.12em]">
                      {detail ? formatRemainingLease(detail.summary.leaseCommenceRange) : "Loading..."}
                    </strong>
                  </article>
                </section>

                <section className="flex flex-col gap-3 border-t border-border pt-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="secondary">
                      <TrainFront data-icon="inline-start" />
                      {detail?.summary.nearestMrt
                        ? `${detail.summary.nearestMrt.stationName} • ${formatMeters(
                            detail.summary.nearestMrt.distanceMeters,
                          )}`
                        : currentSummary.nearestMrt
                          ? `${currentSummary.nearestMrt.stationName} • ${formatMeters(
                              currentSummary.nearestMrt.distanceMeters,
                            )}`
                          : "No station match"}
                    </Badge>
                    <Badge variant="secondary">
                      <MapPinned data-icon="inline-start" />
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
                    <Card size="sm" className="bg-muted/40">
                      <CardHeader className="gap-3 border-b border-border/60 pb-5">
                        <div className="flex flex-wrap items-start gap-3">
                          <div className="flex flex-1 flex-col gap-2">
                            <Badge variant="secondary">12 to 24 month trend</Badge>
                            <CardTitle className="text-lg">Monthly median</CardTitle>
                          </div>
                          <CardAction>
                            <Badge>{detail.monthlyTrend.length} months</Badge>
                          </CardAction>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-5">
                        <Suspense fallback={<div className="empty-state">Loading chart engine...</div>}>
                          <TrendChart points={detail.monthlyTrend.slice(-24)} />
                        </Suspense>
                      </CardContent>
                    </Card>

                    <Card size="sm" className="bg-muted/40">
                      <CardHeader className="gap-3 border-b border-border/60 pb-5">
                        <div className="flex flex-col gap-2">
                          <Badge variant="secondary">Recent evidence</Badge>
                          <CardTitle className="text-lg">Latest transactions</CardTitle>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-5">
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
                            {detail.recentTransactions.slice(0, 8).map((transaction) => (
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
            </ScrollArea>
          ) : null}
        </CardContent>
      </Card>
    </aside>
  );
}
