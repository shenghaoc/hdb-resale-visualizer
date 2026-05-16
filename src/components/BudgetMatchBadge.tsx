import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { getBudgetMatchSignal } from "@/lib/budget-signals";
import type { Locale, Translator } from "@/lib/i18n";

type BudgetMatchBadgeProps = {
  medianPrice: number;
  budgetMin: number | null;
  budgetMax: number | null;
  t: Translator;
  locale: Locale;
  variant?: "default" | "compact";
  className?: string;
};

export function BudgetMatchBadge({
  medianPrice,
  budgetMin,
  budgetMax,
  t,
  locale,
  variant = "default",
  className,
}: BudgetMatchBadgeProps) {
  const signal = getBudgetMatchSignal(medianPrice, budgetMin, budgetMax);
  if (signal.status === "no-budget") return null;

  const isCompact = variant === "compact";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded text-[0.58rem] font-bold uppercase",
        isCompact ? "px-0 py-0" : "px-1.5 py-0.5",
        signal.status === "within" &&
          (isCompact
            ? "text-emerald-700 dark:text-emerald-400"
            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"),
        (signal.status === "above-max" || signal.status === "below-min") &&
          (isCompact
            ? "text-rose-700 dark:text-rose-400"
            : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"),
        (signal.status === "near-above" || signal.status === "near-below") &&
          (isCompact
            ? "text-amber-700 dark:text-amber-400"
            : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"),
        className,
      )}
    >
      {signal.status === "within" && t("budget.within")}
      {signal.status === "above-max" && t("budget.aboveMax")}
      {signal.status === "below-min" && t("budget.belowMin")}
      {signal.status === "near-above" &&
        t("budget.nearAbove", { value: formatCurrency(signal.diffAmount ?? 0, locale) })}
      {signal.status === "near-below" &&
        t("budget.nearBelow", { value: formatCurrency(signal.diffAmount ?? 0, locale) })}
    </span>
  );
}
