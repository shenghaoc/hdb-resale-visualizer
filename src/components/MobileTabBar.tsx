import { useCallback, useRef, useState } from "react";
import { Bookmark, CircleHelp, List, Moon, Scale, SlidersHorizontal, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PanelTab } from "@/hooks/usePanelState";
import type { Translator } from "@/shared/lib/i18n";

type MobileTabBarProps = {
  mobileTab: PanelTab | null;
  shortlistCount: number;
  theme: "light" | "dark";
  t: Translator;
  onFiltersClick: () => void;
  onResultsClick: () => void;
  onCheckClick: () => void;
  onSavedClick: () => void;
  onToggleTheme: () => void;
  onOpenGuide: () => void;
};

export function MobileTabBar({
  mobileTab,
  shortlistCount,
  theme,
  t,
  onFiltersClick,
  onResultsClick,
  onCheckClick,
  onSavedClick,
  onToggleTheme,
  onOpenGuide,
}: MobileTabBarProps) {
  // Roving arrow-key navigation across all toolbar elements.
  const [focusedIndex, setFocusedIndex] = useState(2); // Default to Filters
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent, index: number) => {
    const items = itemRefs.current.filter((b): b is HTMLButtonElement => b !== null);
    if (items.length === 0) return;

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % items.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + items.length) % items.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      setFocusedIndex(nextIndex);
      items[nextIndex]?.focus();
    }
  }, []);

  const filtersLabel = t("tab.filters");
  const resultsLabel = t("tab.results");
  const checkLabel = t("tab.check");
  const savedLabel = t("tab.saved");

  return (
    <nav
      className="mobile-tab-bar"
      data-testid="mobile-tab-bar"
      role="toolbar"
      aria-label={t("app.primaryNav")}
    >
      <Button
        ref={(node) => {
          itemRefs.current[0] = node;
        }}
        type="button"
        size="icon"
        variant="ghost"
        className="mobile-mode-button"
        tabIndex={focusedIndex === 0 ? 0 : -1}
        onClick={onToggleTheme}
        onKeyDown={(e) => handleKeyDown(e, 0)}
        onFocus={() => setFocusedIndex(0)}
        aria-label={t("app.toggleTheme")}
        aria-pressed={theme === "dark"}
        title={t("app.toggleTheme")}
      >
        {theme === "light" ? (
          <Moon data-icon="inline-start" className="size-4" aria-hidden="true" />
        ) : (
          <Sun data-icon="inline-start" className="size-4" aria-hidden="true" />
        )}
      </Button>
      <Button
        ref={(node) => {
          itemRefs.current[1] = node;
        }}
        type="button"
        size="icon"
        variant="ghost"
        className="mobile-mode-button"
        tabIndex={focusedIndex === 1 ? 0 : -1}
        onClick={onOpenGuide}
        onKeyDown={(e) => handleKeyDown(e, 1)}
        onFocus={() => setFocusedIndex(1)}
        aria-label={t("app.openGuide")}
        title={t("app.openGuide")}
      >
        <CircleHelp data-icon="inline-start" className="size-4" aria-hidden="true" />
      </Button>
      <Button
        ref={(node) => {
          itemRefs.current[2] = node;
        }}
        type="button"
        variant={mobileTab === "filters" ? "secondary" : "ghost"}
        size="sm"
        className="mobile-tab-button"
        data-active={mobileTab === "filters"}
        aria-pressed={mobileTab === "filters"}
        aria-controls={mobileTab === "filters" ? "mobile-filters-content" : undefined}
        title={filtersLabel}
        tabIndex={focusedIndex === 2 ? 0 : -1}
        onClick={onFiltersClick}
        onKeyDown={(e) => handleKeyDown(e, 2)}
        onFocus={() => setFocusedIndex(2)}
      >
        <SlidersHorizontal data-icon="inline-start" />
        <span>{filtersLabel}</span>
      </Button>
      <Button
        ref={(node) => {
          itemRefs.current[3] = node;
        }}
        type="button"
        variant={mobileTab === "results" ? "secondary" : "ghost"}
        size="sm"
        className="mobile-tab-button"
        data-active={mobileTab === "results"}
        aria-pressed={mobileTab === "results"}
        aria-controls={mobileTab === "results" ? "mobile-results-content" : undefined}
        title={resultsLabel}
        tabIndex={focusedIndex === 3 ? 0 : -1}
        onClick={onResultsClick}
        onKeyDown={(e) => handleKeyDown(e, 3)}
        onFocus={() => setFocusedIndex(3)}
      >
        <List data-icon="inline-start" />
        <span>{resultsLabel}</span>
      </Button>
      <Button
        ref={(node) => {
          itemRefs.current[4] = node;
        }}
        type="button"
        variant={mobileTab === "check" ? "secondary" : "ghost"}
        size="sm"
        className="mobile-tab-button"
        data-active={mobileTab === "check"}
        aria-pressed={mobileTab === "check"}
        aria-controls={mobileTab === "check" ? "mobile-check-content" : undefined}
        title={checkLabel}
        tabIndex={focusedIndex === 4 ? 0 : -1}
        onClick={onCheckClick}
        onKeyDown={(e) => handleKeyDown(e, 4)}
        onFocus={() => setFocusedIndex(4)}
      >
        <Scale data-icon="inline-start" />
        <span>{checkLabel}</span>
      </Button>
      <Button
        ref={(node) => {
          itemRefs.current[5] = node;
        }}
        type="button"
        variant={mobileTab === "saved" ? "secondary" : "ghost"}
        size="sm"
        className="mobile-tab-button"
        data-active={mobileTab === "saved"}
        aria-pressed={mobileTab === "saved"}
        aria-controls={mobileTab === "saved" ? "mobile-saved-content" : undefined}
        title={savedLabel}
        tabIndex={focusedIndex === 5 ? 0 : -1}
        onClick={onSavedClick}
        onKeyDown={(e) => handleKeyDown(e, 5)}
        onFocus={() => setFocusedIndex(5)}
      >
        <Bookmark
          data-icon="inline-start"
          className={mobileTab === "saved" ? "fill-current" : ""}
        />
        <span>{savedLabel}</span>
        {shortlistCount > 0 ? (
          <Badge variant="outline" className="ml-0.5 h-4 min-w-4 px-1 text-[0.58rem]">
            {shortlistCount}
          </Badge>
        ) : null}
      </Button>
    </nav>
  );
}
