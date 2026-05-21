import { useCallback, useEffect, useId, useState } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LocationSearchInput } from "@/components/LocationSearchInput";
import { formatDateTime, formatMonth, formatNumber } from "@/lib/format";
import type { Locale, Translator } from "@/lib/i18n";
import type { Manifest } from "@/types/data";
import { cn } from "@/lib/utils";

type AppHeaderProps = {
  manifest: Manifest;
  isDesktop: boolean;
  locale: Locale;
  t: Translator;
  search: string;
  onSearchChange: (value: string) => void;
  isMobileHeaderOpen: boolean;
  onToggleMobileHeader: () => void;
  onDismiss: () => void;
};

const HEADER_SURFACE_CLASS =
  "rounded-xl border border-border/20 bg-background/90 backdrop-blur-[20px] shadow-[0_4px_16px_rgba(23,28,31,0.08)] dark:border-primary/15 dark:bg-card/90 dark:shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_4px_24px_rgba(4,12,24,0.7)]";

export function AppHeader({
  manifest,
  isDesktop,
  locale,
  t,
  search,
  onSearchChange,
  isMobileHeaderOpen,
  onToggleMobileHeader,
  onDismiss,
}: AppHeaderProps) {
  const headerSearchId = useId();
  const overlaySearchId = useId();
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const closeMobileSearch = useCallback(() => {
    setIsMobileSearchOpen(false);
  }, []);

  const openMobileSearch = useCallback(() => {
    setIsMobileSearchOpen(true);
  }, []);

  useEffect(() => {
    if (!isMobileSearchOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMobileSearch();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeMobileSearch, isMobileSearchOpen]);

  useEffect(() => {
    if (!isMobileSearchOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      document.getElementById(overlaySearchId)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isMobileSearchOpen, overlaySearchId]);

  return (
    <>
      <header
        data-testid="global-header"
        className={cn(
          "pointer-events-none absolute z-30 flex min-w-0 items-start gap-2",
          isDesktop
            ? "left-6 top-6 max-w-[min(52rem,calc(100vw-12rem))]"
            : "left-3 top-3 max-w-[calc(100vw-1.5rem)]",
        )}
      >
        <button
          type="button"
          aria-expanded={isMobileHeaderOpen}
          onClick={onToggleMobileHeader}
          className={cn(
            "pointer-events-auto flex min-w-0 shrink-0 items-center gap-2 px-3 py-2 text-left transition-all",
            HEADER_SURFACE_CLASS,
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
                ·{" "}
                {t("stats.transactions", {
                  count: formatNumber(manifest.counts.transactions, 0, locale),
                })}
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
                {t("stats.transactions", {
                  count: formatNumber(manifest.counts.transactions, 0, locale),
                })}{" "}
                · {t("stats.built", { date: formatDateTime(manifest.generatedAt, locale) })} ·
                OneMap
              </span>
            </span>
          )}
        </button>

        <div
          className={cn(
            "pointer-events-auto hidden min-w-0 flex-1 items-center sm:flex",
            HEADER_SURFACE_CLASS,
            "px-2 py-1",
          )}
        >
          <Search data-icon className="ml-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <LocationSearchInput
            id={headerSearchId}
            data-testid="header-search-input"
            aria-label={t("filters.searchLabel")}
            placeholder={t("filters.searchPlaceholder")}
            value={search}
            onValueChange={onSearchChange}
            className="h-8 min-w-0 border-0 bg-transparent px-2 text-[0.72rem] shadow-none focus-visible:border-0 focus-visible:ring-0"
          />
        </div>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          data-testid="header-search-toggle"
          aria-label={t("header.openSearch")}
          aria-expanded={isMobileSearchOpen}
          aria-controls={overlaySearchId}
          onClick={openMobileSearch}
          className={cn(
            "pointer-events-auto size-9 shrink-0 p-0 text-muted-foreground hover:text-foreground sm:hidden",
            HEADER_SURFACE_CLASS,
          )}
        >
          <Search data-icon className="size-4" />
        </Button>

        {isDesktop ? (
          <div
            className={cn(
              "pointer-events-auto flex shrink-0 items-center gap-1 p-1",
              HEADER_SURFACE_CLASS,
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent>{t("app.dismissHeader")}</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </header>

      {isMobileSearchOpen ? (
        <div
          className="pointer-events-auto fixed inset-0 z-40 sm:hidden"
          data-testid="header-search-overlay"
        >
          <button
            type="button"
            data-testid="header-search-scrim"
            className="absolute inset-0 bg-background/55 backdrop-blur-[2px]"
            aria-label={t("header.closeSearch")}
            onClick={closeMobileSearch}
          />
          <div className="absolute inset-x-3 top-3 flex items-center gap-2">
            <div className={cn("flex min-w-0 flex-1 items-center gap-2 px-2 py-1", HEADER_SURFACE_CLASS)}>
              <Search data-icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <LocationSearchInput
                id={overlaySearchId}
                data-testid="header-search-overlay-input"
                aria-label={t("filters.searchLabel")}
                placeholder={t("filters.searchPlaceholder")}
                value={search}
                onValueChange={onSearchChange}
                className="h-10 min-w-0 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0"
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t("header.closeSearch")}
              onClick={closeMobileSearch}
              className={cn("size-9 shrink-0 p-0", HEADER_SURFACE_CLASS)}
            >
              <X data-icon className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
