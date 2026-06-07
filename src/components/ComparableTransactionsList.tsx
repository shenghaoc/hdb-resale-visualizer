import { type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatMonth } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { AddressDetailTransaction } from "@/types/data";
import { Badge } from "@/components/ui/badge";

export type ComparableTransactionsListProps = {
  transactions: ReadonlyArray<AddressDetailTransaction>;
  expanded: boolean;
  onToggle: () => void;
  maxItems?: number;
};

export function ComparableTransactionsList({
  transactions,
  expanded,
  onToggle,
  maxItems = 8,
}: ComparableTransactionsListProps) {
  const { locale, t } = useI18n();

  if (transactions.length === 0) return null;

  return (
    <section>
      <button
        type="button"
        className="mb-2 flex w-full items-center justify-between gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-left text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-muted/40"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{t("askingCheck.comparablesTitle")}</span>
          <Badge variant="outline" className="h-5 shrink-0 font-mono text-[0.6rem]">
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
          {transactions.slice(0, maxItems).map((tx) => (
            <li
              key={tx.id}
              className="flex items-center justify-between gap-2 rounded-md bg-muted/20 px-3 py-2 text-xs cv-auto"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-bold tabular-nums">
                  {formatCurrency(tx.resalePrice, locale)}
                </span>
                <span className="truncate text-[0.65rem] uppercase tracking-wider text-muted-foreground">
                  {tx.storeyRange} · {Math.round(tx.floorAreaSqm)}
                  {t("unit.sqmShort")}
                </span>
              </div>
              <Badge variant="secondary" className="h-5 shrink-0 font-mono text-[0.6rem]">
                {formatMonth(tx.month, locale)}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
