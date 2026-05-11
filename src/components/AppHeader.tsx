import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatMonth } from "@/lib/format";
import type { Locale, Translator } from "@/lib/i18n";
import type { Manifest } from "@/types/data";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  manifest: Manifest;
  isDesktop: boolean;
  locale: Locale;
  t: Translator;
  isMobileHeaderOpen: boolean;
  onToggleMobileHeader: () => void;
  onDismiss: () => void;
};

export function AppHeader({
  manifest,
  isDesktop,
  locale,
  t,
  isMobileHeaderOpen,
  onToggleMobileHeader,
  onDismiss,
}: AppHeaderProps) {
  return (
    <header
      data-testid={isDesktop ? "global-header" : undefined}
      className={cn(
        "pointer-events-none absolute z-30 flex items-start gap-2",
        isDesktop
          ? "left-6 top-6 max-w-[min(42rem,calc(100vw-12rem))]"
          : "left-3 top-3 max-w-[70vw]",
      )}
    >
      <button
        type="button"
        aria-expanded={isMobileHeaderOpen}
        onClick={onToggleMobileHeader}
        className={cn(
          "pointer-events-auto flex min-w-0 items-center gap-2 rounded-xl border border-border/20 bg-background/90 px-3 py-2 text-left backdrop-blur-[20px] transition-all shadow-[0_4px_16px_rgba(23,28,31,0.08)] dark:border-primary/15 dark:bg-card/90 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_4px_24px_rgba(4,12,24,0.7)]",
          isMobileHeaderOpen && "items-start",
        )}
      >
        {!isMobileHeaderOpen ? (
          <>
            <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
            <span
              data-testid="header-title"
              className="truncate text-[0.7rem] font-bold leading-none"
            >
              {t("app.title")}
            </span>
            <Badge
              variant="outline"
              className="h-5 shrink-0 border-border/35 bg-muted/30 px-1.5 text-[0.58rem] font-bold"
            >
              {t("stats.dataThrough", {
                month: formatMonth(manifest.dataWindow.maxMonth, locale),
              })}
            </Badge>
            <span className="hidden text-[0.6rem] font-medium text-muted-foreground sm:inline">
              · {manifest.counts.transactions.toLocaleString(locale)}
            </span>
          </>
        ) : (
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
              <span
                data-testid="header-title"
                className="truncate text-[0.82rem] font-bold leading-tight"
              >
                {t("app.title")}
              </span>
            </span>
            <Badge
              variant="outline"
              className="h-5 w-fit border-border/35 bg-muted/30 px-1.5 text-[0.58rem] font-bold"
            >
              {t("stats.dataThrough", {
                month: formatMonth(manifest.dataWindow.maxMonth, locale),
              })}
            </Badge>
            <span className="text-[0.6rem] font-medium text-muted-foreground">
              {t("stats.txns", {
                count: manifest.counts.transactions.toLocaleString(locale),
              })}{" "}
              · {t("stats.built", { date: formatDateTime(manifest.generatedAt, locale) })} ·
              OneMap
            </span>
          </span>
        )}
      </button>

      {isDesktop ? (
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-border/20 bg-background/90 p-1 backdrop-blur-[20px] shadow-[0_4px_16px_rgba(23,28,31,0.08)] dark:border-primary/15 dark:bg-card/90 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_4px_24px_rgba(4,12,24,0.7)]">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 p-0 text-muted-foreground hover:text-foreground"
            onClick={onDismiss}
            aria-label={t("app.dismissHeader")}
          >
            <X data-icon className="size-4" />
          </Button>
        </div>
      ) : null}
    </header>
  );
}
