import { type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { formatCurrency, formatMonth } from "@/shared/lib/format";
import { useI18n } from "@/shared/lib/i18n";
import type { AddressDetailTransaction } from "@/types/data";
import type { AdjustmentLabel } from "../../shared/data-types";
import { Badge } from "@/components/ui/badge";

export type AdjustmentInfo = {
  adjustedResalePrice: number | null;
  adjustedPricePerSqm: number | null;
  adjustmentLabel: AdjustmentLabel | null;
};

export type ComparableTransactionsListProps = {
  transactions: ReadonlyArray<AddressDetailTransaction>;
  expanded: boolean;
  onToggle: () => void;
  maxItems?: number;
  /** Optional map from transaction ID → adjustment metadata.
   *  When provided, adjusted prices are shown alongside raw prices. */
  adjustmentMap?: ReadonlyMap<string, AdjustmentInfo>;
  /** Whether the adjustment toggle is active (controls visibility). */
  showAdjusted?: boolean;
};

export function ComparableTransactionsList({
  transactions,
  expanded,
  onToggle,
  maxItems = 8,
  adjustmentMap,
  showAdjusted = false,
}: ComparableTransactionsListProps) {
  const { locale, t } = useI18n();

  if (transactions.length === 0) return null;

  return (
    <section>
      <button
        type="button"
        className="mb-2 flex w-full items-center justify-between gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-left text-[var(--text-xs)] font-extrabold uppercase tracking-[var(--tracking-label)] text-muted-foreground transition-colors hover:bg-muted/40"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{t("askingCheck.comparablesTitle")}</span>
          <Badge variant="outline" className="h-5 shrink-0 font-mono text-[var(--text-xs)]">
            {transactions.length}
          </Badge>
        </span>
        <ChevronDown
          data-icon
          className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")}
          aria-hidden="true"
        />
        <span className="sr-only">
          {expanded
            ? t("askingCheck.toggleComparablesHide")
            : t("askingCheck.toggleComparablesShow")}
        </span>
      </button>
      {expanded ? (
        <ul
          className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1 v2-scrollbar"
          style={{ "--cv-intrinsic-height": "56px" } as CSSProperties}
        >
          {transactions.slice(0, maxItems).map((tx) => {
            const adj = adjustmentMap?.get(tx.id);
            const adjustedPrice = showAdjusted ? (adj?.adjustedResalePrice ?? null) : null;
            const hasAdjusted = adjustedPrice != null;
            const showMissingIndicator = showAdjusted && !hasAdjusted;
            return (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-2 rounded-md bg-muted/20 px-3 py-2 text-xs cv-auto"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className={cn(
                        "font-bold tabular-nums",
                        (hasAdjusted || showMissingIndicator) &&
                          "text-muted-foreground text-[0.75rem]",
                        hasAdjusted && "line-through",
                      )}
                    >
                      {formatCurrency(tx.resalePrice, locale)}
                    </span>
                    {hasAdjusted && (
                      <span className="font-bold tabular-nums text-primary">
                        {formatCurrency(adjustedPrice, locale)}
                      </span>
                    )}
                    {showMissingIndicator && (
                      <span className="font-normal text-[var(--text-xs)] italic text-muted-foreground/60">
                        {t("check.noAdjustmentData")}
                      </span>
                    )}
                  </div>
                  <span className="truncate text-[0.75rem] uppercase tracking-wider text-muted-foreground">
                    {tx.storeyRange} · {Math.round(tx.floorAreaSqm)}
                    {t("unit.sqmShort")}
                    {hasAdjusted && adj?.adjustmentLabel && (
                      <span className="ml-1 text-primary/70">
                        ·{" "}
                        {adj.adjustmentLabel.type === "at_latest"
                          ? t("check.adjustmentLabel.atLatest")
                          : t("check.adjustmentLabel.adjustedFrom", {
                              month: adj.adjustmentLabel.month,
                            })}
                      </span>
                    )}
                  </span>
                </div>
                <Badge variant="secondary" className="h-5 shrink-0 font-mono text-[var(--text-xs)]">
                  {formatMonth(tx.month, locale)}
                </Badge>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
