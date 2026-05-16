import type { FlatTypeLadderEntry } from "@/lib/flat-type-ladder";
import { formatCompactCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { localizeFlatType } from "@/lib/i18n/domain";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <ul role="list" className={cn("flex flex-wrap items-center gap-2 text-[0.7rem]", className)} aria-label={t("detail.priceLadder")}>
      {entries.map((entry, idx) => (
        <li key={entry.flatType} className="flex items-center gap-1.5">
          <div
            className={cn(
              "rounded-md border px-2 py-1 text-center",
              entry.medianPrice === null
                ? "border-dashed border-border/40 bg-muted/30 text-muted-foreground"
                : "border-border/30 bg-background",
            )}
          >
            <div className="font-semibold tracking-tight">{localizeFlatType(entry.flatType, locale)}</div>
            {entry.medianPrice !== null ? (
              <div className="v2-tabular font-extrabold tabular-nums text-foreground">
                {formatCompactCurrency(entry.medianPrice, locale)}
              </div>
            ) : (
              <div className="text-[0.58rem] font-medium uppercase tracking-[0.1em]">{t("detail.unavailable")}</div>
            )}
            {entry.transactionCount > 0 && (
              <div className="text-[0.55rem] text-muted-foreground">
                {t("stats.txns", { count: entry.transactionCount })}
              </div>
            )}
          </div>
          {idx < entries.length - 1 && <ArrowRight className="size-3 text-muted-foreground/60" aria-hidden />}
        </li>
      ))}
    </ul>
  );
}
