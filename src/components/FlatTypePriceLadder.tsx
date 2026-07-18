import type { FlatTypeLadderEntry } from "@/features/block-detail/flat-type-ladder";
import { formatCompactCurrency } from "@/shared/lib/format";
import { useI18n } from "@/shared/lib/i18n";
import { localizeFlatType } from "@/shared/lib/i18n/domain";
import { ArrowRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";

type FlatTypePriceLadderProps = {
  entries: FlatTypeLadderEntry[];
  className?: string;
};

export function FlatTypePriceLadder({ entries, className }: FlatTypePriceLadderProps) {
  const { locale, t } = useI18n();

  if (entries.length === 0) {
    return null;
  }

  return (
    <ul
      role="list"
      className={cn("flex flex-wrap items-center gap-2 text-[0.75rem]", className)}
      aria-label={t("detail.priceLadder")}
    >
      {entries.map((entry, idx) => (
        <li key={entry.flatType} className="flex items-center gap-1.5">
          <div
            className={cn(
              "rounded-none border px-2 py-1 text-center",
              entry.medianPrice === null
                ? "border-dashed border-border/40 bg-muted/30 text-muted-foreground"
                : "border-border/30 bg-background",
            )}
          >
            <div className="font-semibold tracking-tight">
              {localizeFlatType(entry.flatType, locale)}
            </div>
            {entry.medianPrice !== null ? (
              <div className="v2-tabular font-extrabold tabular-nums text-foreground">
                {formatCompactCurrency(entry.medianPrice, locale)}
              </div>
            ) : (
              <div className="text-[var(--text-xs)] font-medium uppercase tracking-[0.1em]">
                {t("detail.unavailable")}
              </div>
            )}
            {entry.transactionCount > 0 && (
              <div className="text-[var(--text-xs)] text-muted-foreground">
                {t("stats.txns", { count: entry.transactionCount })}
              </div>
            )}
          </div>
          {idx < entries.length - 1 && (
            <ArrowRight className="size-3 text-muted-foreground/60" aria-hidden />
          )}
        </li>
      ))}
    </ul>
  );
}
