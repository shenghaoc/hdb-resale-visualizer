import { formatCompactCurrency, formatDateTime, formatMonth, formatNumber } from "@/lib/format";
import type { BlockSummary, Manifest } from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
        <CardHeader className="gap-4 border-b border-border pb-4">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <CardTitle className="text-2xl leading-none sm:text-3xl">
                HDB Resale Visualizer
              </CardTitle>
            </div>
            <CardAction className="min-w-fit">
              <div className="flex flex-row items-center gap-3 text-right">
                <Badge variant="outline">Data through {formatMonth(manifest.dataWindow.maxMonth)}</Badge>
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Built {formatDateTime(manifest.generatedAt)}
                </p>
              </div>
            </CardAction>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-4">
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
      </Card>
    </section>
  );
}
