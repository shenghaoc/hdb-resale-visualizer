import { useCallback, useRef, useState } from "react";
import { Bookmark, List, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocaleSelector } from "@/components/LocaleSelector";
import type { LeftTab } from "@/hooks/usePanelState";
import type { Translator } from "@/lib/i18n";

type DesktopTabBarProps = {
  leftTab: LeftTab;
  isLeftPanelOpen: boolean;
  isSavedPanelOpen: boolean;
  shortlistCount: number;
  theme: "light" | "dark";
  t: Translator;
  onFiltersClick: () => void;
  onResultsClick: () => void;
  onSavedClick: () => void;
  onToggleTheme: () => void;
};

export function DesktopTabBar({
  leftTab,
  isLeftPanelOpen,
  isSavedPanelOpen,
  shortlistCount,
  theme,
  t,
  onFiltersClick,
  onResultsClick,
  onSavedClick,
  onToggleTheme,
}: DesktopTabBarProps) {
  const filtersActive = leftTab === "filters" && isLeftPanelOpen;
  const resultsActive = leftTab === "results" && isLeftPanelOpen;

  // Roving arrow-key navigation across all toolbar elements.
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
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
    },
    [],
  );

  const filtersLabel = t("tab.filters");
  const resultsLabel = t("tab.results");
  const savedLabel = t("tab.saved");

  return (
    <nav
      className="desktop-tab-bar"
      data-testid="desktop-tab-bar"
      aria-label={t("app.primaryNav")}
      role="toolbar"
    >
      <Button
        ref={(node) => {
          itemRefs.current[0] = node;
        }}
        type="button"
        variant={filtersActive ? "secondary" : "ghost"}
        size="sm"
        data-active={filtersActive}
        aria-pressed={filtersActive}
        aria-controls="desktop-filters-content"
        title={filtersLabel}
        tabIndex={focusedIndex === 0 ? 0 : -1}
        onClick={onFiltersClick}
        onKeyDown={(e) => handleKeyDown(e, 0)}
        onFocus={() => setFocusedIndex(0)}
      >
        <SlidersHorizontal data-icon />
        <span>{filtersLabel}</span>
      </Button>
      <Button
        ref={(node) => {
          itemRefs.current[1] = node;
        }}
        type="button"
        variant={resultsActive ? "secondary" : "ghost"}
        size="sm"
        data-active={resultsActive}
        aria-pressed={resultsActive}
        aria-controls="desktop-results-content"
        title={resultsLabel}
        tabIndex={focusedIndex === 1 ? 0 : -1}
        onClick={onResultsClick}
        onKeyDown={(e) => handleKeyDown(e, 1)}
        onFocus={() => setFocusedIndex(1)}
      >
        <List data-icon />
        <span>{resultsLabel}</span>
      </Button>
      <span className="desktop-tab-bar-divider" aria-hidden="true" />
      <Button
        ref={(node) => {
          itemRefs.current[2] = node;
        }}
        type="button"
        variant={isSavedPanelOpen ? "secondary" : "ghost"}
        size="sm"
        data-active={isSavedPanelOpen}
        aria-pressed={isSavedPanelOpen}
        aria-controls="desktop-saved-content"
        title={savedLabel}
        tabIndex={focusedIndex === 2 ? 0 : -1}
        onClick={onSavedClick}
        onKeyDown={(e) => handleKeyDown(e, 2)}
        onFocus={() => setFocusedIndex(2)}
      >
        <Bookmark data-icon className={isSavedPanelOpen ? "fill-current" : ""} />
        <span>{savedLabel}</span>
        {shortlistCount > 0 ? (
          <Badge variant="outline" className="ml-0.5 h-4 min-w-4 px-1 text-[0.58rem]">
            {shortlistCount}
          </Badge>
        ) : null}
      </Button>
      <span className="desktop-tab-bar-divider" aria-hidden="true" />
      <LocaleSelector
        ref={(node) => {
          itemRefs.current[3] = node;
        }}
        variant="desktop"
        tabIndex={focusedIndex === 3 ? 0 : -1}
        onKeyDown={(e) => handleKeyDown(e, 3)}
        onFocus={() => setFocusedIndex(3)}
      />
      <Button
        ref={(node) => {
          itemRefs.current[4] = node;
        }}
        type="button"
        size="icon"
        variant="ghost"
        className="desktop-tab-bar-icon-btn"
        tabIndex={focusedIndex === 4 ? 0 : -1}
        onClick={onToggleTheme}
        onKeyDown={(e) => handleKeyDown(e, 4)}
        onFocus={() => setFocusedIndex(4)}
        aria-label={t("app.toggleTheme")}
        aria-pressed={theme === "dark"}
        title={t("app.toggleTheme")}
      >
        {theme === "light" ? (
          <Moon data-icon className="size-4" />
        ) : (
          <Sun data-icon className="size-4" />
        )}
      </Button>
    </nav>
  );
}
