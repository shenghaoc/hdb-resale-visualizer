import { formatCompactCurrency, formatDateTime, formatMonth, formatNumber } from "@/lib/format";
import type { BlockSummary, Manifest } from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type StatsBarProps = {
  manifest: Manifest;
  filteredCount: number;
  blocks: BlockSummary[];
};

export function StatsBar({ manifest, filteredCount, blocks }: StatsBarProps) {
  const priciest = blocks.reduce((current, block) => {
    if (!current || block.medianPrice > current.medianPrice) {
      return block;
    }
    return current;
  }, blocks[0]);

  return (
    <section data-testid="stats-bar">
      <Card className="overflow-visible bg-background">
        <CardHeader className="gap-4 border-b border-border pb-8">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex flex-1 flex-col gap-3">
              <Badge variant="secondary" className="text-[0.65rem]">
                Current official data
              </Badge>
              <CardTitle className="text-3xl leading-none sm:text-4xl lg:text-5xl">
                HDB Resale Visualizer
              </CardTitle>
              <CardDescription className="max-w-3xl text-base text-muted-foreground sm:text-lg">
                Open-data resale browsing for shortlist-first buying in Singapore. No prediction
                model, just the market as it stands right now.
              </CardDescription>
            </div>
            <CardAction className="min-w-fit">
              <div className="flex flex-col items-end gap-2 text-right">
                <Badge variant="outline">Data through {formatMonth(manifest.dataWindow.maxMonth)}</Badge>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Built {formatDateTime(manifest.generatedAt)}
                </p>
              </div>
            </CardAction>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 pt-8 sm:grid-cols-2 xl:grid-cols-4">
          <article className="flex flex-col gap-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Visible blocks
            </span>
            <strong className="font-heading text-3xl font-semibold leading-none">
              {formatNumber(filteredCount)}
            </strong>
          </article>
          <article className="flex flex-col gap-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Tracked transactions
            </span>
            <strong className="font-heading text-3xl font-semibold leading-none">
              {formatNumber(manifest.counts.transactions)}
            </strong>
          </article>
          <article className="flex flex-col gap-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Most expensive visible median
            </span>
            <strong className="font-heading text-3xl font-semibold leading-none">
              {priciest ? formatCompactCurrency(priciest.medianPrice) : "N/A"}
            </strong>
          </article>
          <article className="flex flex-col gap-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Official sources
            </span>
            <strong className="text-sm font-semibold uppercase tracking-[0.16em]">
              HDB + LTA + data.gov.sg
            </strong>
          </article>
        </CardContent>
        <Separator />
        <div className="px-8 py-4 text-sm leading-relaxed text-muted-foreground">
          The shortlist is local-only. Coordinates are resolved offline during data refresh, and
          nearest MRT distance is a straight-line measure rather than route time.
        </div>
      </Card>
    </section>
  );
}
