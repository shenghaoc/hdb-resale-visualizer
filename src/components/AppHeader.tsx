import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SearchCombobox } from "@/components/SearchCombobox";
import type { Suggestion } from "@/types/data";
import { formatDateTime, formatMonth, formatNumber } from "@/shared/lib/format";
import type { Locale, Translator } from "@/shared/lib/i18n";
import type { Manifest } from "@/types/data";
import { cn } from "@/shared/lib/utils";
import { deriveDataQualityState } from "@/shared/lib/dataQuality";

type AppHeaderProps = {
  manifest: Manifest;
  isDesktop: boolean;
  locale: Locale;
  t: Translator;
  search: string;
  onSearchChange: (value: string) => void;
  onSelectSuggestion: (suggestion: Suggestion) => void;
  isMobileHeaderOpen: boolean;
  onToggleMobileHeader: () => void;
  onDismiss: () => void;
  mobileTab: string | null;
  onClearMobileTab?: () => void;
};

const HEADER_SURFACE_CLASS = "rounded-xl border bg-popover/90 backdrop-blur-[20px] shadow-lg";

export function AppHeader({
  manifest,
  isDesktop,
  locale,
  t,
  search,
  onSearchChange,
  onSelectSuggestion,
  isMobileHeaderOpen,
  onToggleMobileHeader,
  onDismiss,
  mobileTab,
  onClearMobileTab,
}: AppHeaderProps) {
  const dataQuality = deriveDataQualityState(manifest);
  const baseSourceLabel = dataQuality.sourceLabels.join(" + ");
  // Surface the resale collection identifier (verifiable provenance, R3.1) when
  // the manifest carries it.
  const sourceLabel = dataQuality.resaleCollectionId
    ? `${baseSourceLabel} (${dataQuality.resaleCollectionId})`
    : baseSourceLabel;
  const headerSearchId = useId();
  const overlaySearchId = useId();
  const overlayContainerId = useId();
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const closeMobileSearch = useCallback(() => {
    setIsMobileSearchOpen(false);
  }, []);

  const openMobileSearch = useCallback(() => {
    if (mobileTab != null) {
      onClearMobileTab?.();
    }
    setIsMobileSearchOpen(true);
  }, [mobileTab, onClearMobileTab]);

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
      overlayInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isMobileSearchOpen]);

  return (
    <>
      <header
        data-testid="global-header"
        className={cn(
          "pointer-events-none absolute flex min-w-0 items-start gap-2",
          isDesktop ? "z-30" : "z-40",
          isDesktop
            ? "left-6 top-6 max-w-[min(52rem,calc(100vw-12rem))]"
            : "left-3 top-3 max-w-[calc(100vw-4.75rem)]",
        )}
      >
        <button
          type="button"
          aria-expanded={isMobileHeaderOpen}
          onClick={onToggleMobileHeader}
          className={cn(
            "pointer-events-auto flex min-w-0 items-center gap-2 px-3 py-2 text-left transition-all",
            !isDesktop && "min-w-0 flex-1 overflow-hidden",
            isDesktop && "shrink-0",
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
              {dataQuality.lastSyncedAt ? (
                <span className="hidden text-[0.6rem] font-medium text-muted-foreground lg:inline">
                  {" "}
                  · {t("stats.synced", { date: formatDateTime(dataQuality.lastSyncedAt, locale) })}
                </span>
              ) : null}
              {sourceLabel ? (
                <span className="hidden text-[0.6rem] font-medium text-muted-foreground xl:inline">
                  {" "}
                  · {t("stats.sources", { sources: sourceLabel })}
                </span>
              ) : null}
              {dataQuality.syncState === "partial" ? (
                <span className="text-[0.6rem] font-medium text-muted-foreground">
                  {" "}
                  · {t("stats.metadataPartial")}
                </span>
              ) : null}
              {dataQuality.syncState === "missing" ? (
                <span className="text-[0.6rem] font-medium text-muted-foreground">
                  {" "}
                  · {t("stats.metadataUnavailable")}
                </span>
              ) : null}
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
                })}
                {dataQuality.generatedAt
                  ? ` · ${t("stats.built", { date: formatDateTime(dataQuality.generatedAt, locale) })}`
                  : ""}
                {dataQuality.lastSyncedAt
                  ? ` · ${t("stats.synced", { date: formatDateTime(dataQuality.lastSyncedAt, locale) })}`
                  : ""}
                {sourceLabel ? ` · ${t("stats.sources", { sources: sourceLabel })}` : ""}
                {dataQuality.syncState === "partial" ? ` · ${t("stats.metadataPartial")}` : ""}
                {dataQuality.syncState === "missing" ? ` · ${t("stats.metadataUnavailable")}` : ""}
              </span>
            </span>
          )}
        </button>

        <div
          className={cn(
            "pointer-events-auto hidden min-w-0 flex-1 items-center sm:flex",
            HEADER_SURFACE_CLASS,
            "px-2 py-1 focus-within:ring-2 focus-within:ring-ring/20",
          )}
        >
          <Search
            data-icon="inline-start"
            className="ml-1 size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <SearchCombobox
            id={headerSearchId}
            data-testid="header-search-input"
            aria-label={t("filters.searchLabel")}
            value={search}
            onValueChange={onSearchChange}
            onSelectSuggestion={onSelectSuggestion}
            suggestActive={isDesktop}
            t={t}
            inputClassName="h-8 min-w-0 border-0 bg-transparent px-2 text-[0.72rem] shadow-none focus-visible:border-0 focus-visible:ring-0"
          />
        </div>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          data-testid="header-search-toggle"
          aria-label={t("header.openSearch")}
          aria-expanded={isMobileSearchOpen}
          aria-controls={isMobileSearchOpen ? overlayContainerId : undefined}
          onClick={openMobileSearch}
          className={cn(
            "pointer-events-auto size-9 shrink-0 p-0 text-muted-foreground hover:text-foreground sm:hidden",
            HEADER_SURFACE_CLASS,
          )}
        >
          <Search data-icon="inline-start" className="size-4" />
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
                  <X data-icon="inline-start" className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("app.dismissHeader")}</TooltipContent>
            </Tooltip>
          </div>
        ) : null}
      </header>

      {isMobileSearchOpen && mobileTab == null ? (
        <div
          id={overlayContainerId}
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
            <div
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 px-2 py-1 focus-within:ring-2 focus-within:ring-ring/20",
                HEADER_SURFACE_CLASS,
              )}
            >
              <Search
                data-icon="inline-start"
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <SearchCombobox
                ref={overlayInputRef}
                id={overlaySearchId}
                data-testid="header-search-overlay-input"
                aria-label={t("filters.searchLabel")}
                value={search}
                onValueChange={onSearchChange}
                onSelectSuggestion={onSelectSuggestion}
                suggestActive={isMobileSearchOpen}
                t={t}
                inputClassName="h-10 min-w-0 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0"
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
              <X data-icon="inline-start" className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
