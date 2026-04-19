import { formatCompactCurrency, formatDateTime, formatMonth, formatNumber } from "@/lib/format";
import type { BlockSummary, Manifest } from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StatsBarProps = {
  manifest: Manifest;
  filteredCount: number;
  blocks: BlockSummary[];
  mode?: "header" | "summary";
  testId?: string;
};

export function StatsBar({
  manifest,
  filteredCount,
  blocks,
  mode = "summary",
  testId = "stats-bar",
}: StatsBarProps) {
  const priciest = blocks.reduce((current, block) => {
    if (!current || block.medianPrice > current.medianPrice) {
      return block;
    }
    return current;
  }, blocks[0]);

  return (
    <section data-testid={testId}>
      <Card
        size={mode === "summary" ? "sm" : "default"}
        className={mode === "summary" ? "overflow-visible bg-background py-1" : "overflow-visible bg-background"}
      >
        {mode === "header" ? (
          <CardHeader className="gap-2">
            <div className="flex flex-wrap items-start gap-4">
              <div className="flex flex-1 flex-col gap-1">
                <CardTitle className="text-lg leading-none sm:text-xl">
                  HDB Resale Visualizer
                </CardTitle>
              </div>
              <CardAction className="min-w-fit">
                <div className="flex flex-wrap items-center justify-end gap-3 text-right">
                  <Badge variant="outline">Data through {formatMonth(manifest.dataWindow.maxMonth)}</Badge>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Built {formatDateTime(manifest.generatedAt)}
                  </p>
                </div>
              </CardAction>
            </div>
          </CardHeader>
        ) : (
          <CardContent className="flex flex-col gap-1 py-1">
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
              <article className="flex flex-col gap-1">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Visible blocks
                </span>
                <strong className="font-heading text-xl font-semibold leading-none">
                  {formatNumber(filteredCount)}
                </strong>
              </article>
              <article className="flex flex-col gap-1">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Tracked transactions
                </span>
                <strong className="font-heading text-xl font-semibold leading-none">
                  {formatNumber(manifest.counts.transactions)}
                </strong>
              </article>
              <article className="flex flex-col gap-1">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Highest visible median
                </span>
                <strong className="font-heading text-xl font-semibold leading-none">
                  {priciest ? formatCompactCurrency(priciest.medianPrice) : "N/A"}
                </strong>
              </article>
              <div className="flex flex-wrap items-center gap-1.5 self-start sm:justify-end">
                <Badge variant="outline">HDB</Badge>
                <Badge variant="outline">LTA</Badge>
                <Badge variant="outline">data.gov.sg</Badge>
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    </section>
  );
}
