import type { AskingPriceAssessment } from "@/entities/transaction/transaction-analysis";
import { formatCompactCurrency } from "@/shared/lib/format";

export type DistributionBarProps = {
  assessment: AskingPriceAssessment;
  askingPrice: number;
};

export function DistributionBar({ assessment, askingPrice }: DistributionBarProps) {
  const { summary } = assessment;
  const min = Math.min(summary.minPrice, askingPrice);
  const max = Math.max(summary.maxPrice, askingPrice);
  const span = Math.max(max - min, 1);
  const pct = (value: number) => ((value - min) / span) * 100;

  const askingPctRaw = pct(askingPrice);
  const askingPct = Math.max(0, Math.min(100, askingPctRaw));
  const p25Pct = pct(summary.p25Price);
  const p75Pct = pct(summary.p75Price);
  const medianPct = pct(summary.medianPrice);

  const askingPositionStyle = { left: `${askingPct}%` };
  const iqrStyle = {
    left: `${p25Pct}%`,
    width: `${Math.max(p75Pct - p25Pct, 1)}%`,
  };
  const medianStyle = { left: `${medianPct}%` };

  return (
    <div className="px-1 pt-2">
      <div className="relative h-7">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary/30"
          style={iqrStyle}
        />
        <div
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-primary"
          style={medianStyle}
          aria-hidden="true"
        />
        <div
          className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center"
          style={askingPositionStyle}
        >
          <div className="size-3 rotate-45 rounded-none bg-foreground shadow" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[length:var(--text-xs)] font-mono uppercase tracking-wider text-muted-foreground">
        <span>{formatCompactCurrency(min)}</span>
        <span>{formatCompactCurrency(max)}</span>
      </div>
    </div>
  );
}
