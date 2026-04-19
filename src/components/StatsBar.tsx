import { formatCompactCurrency, formatMonth, formatNumber } from "@/lib/format";
import type { BlockSummary, Manifest } from "@/types/data";

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
    <div className="stats-bar" data-testid="stats-bar">
      <div className="stats-bar__brand">
        <span className="eyebrow">Current official data</span>
        <h1>HDB Resale Visualizer</h1>
        <p>
          Open-data map for shortlist-first resale browsing in Singapore. No
          prediction model, just the market as it stands.
        </p>
      </div>
      <div className="stats-bar__metrics">
        <article>
          <span>Visible blocks</span>
          <strong>{formatNumber(filteredCount)}</strong>
        </article>
        <article>
          <span>Tracked transactions</span>
          <strong>{formatNumber(manifest.counts.transactions)}</strong>
        </article>
        <article>
          <span>Data through</span>
          <strong>{formatMonth(manifest.dataWindow.maxMonth)}</strong>
        </article>
        <article>
          <span>Top visible median</span>
          <strong>{priciest ? formatCompactCurrency(priciest.medianPrice) : "N/A"}</strong>
        </article>
      </div>
    </div>
  );
}
