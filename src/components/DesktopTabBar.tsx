import { useCallback, useRef, useState } from "react";
import { Bookmark, CircleHelp, List, Moon, Scale, SlidersHorizontal, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LeftTab } from "@/hooks/usePanelState";
import type { Translator } from "@/shared/lib/i18n";

type DesktopTabBarProps = {
  leftTab: LeftTab;
  isLeftPanelOpen: boolean;
  isSavedPanelOpen: boolean;
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

export function DesktopTabBar({
  leftTab,
  isLeftPanelOpen,
  isSavedPanelOpen,
  shortlistCount,
  theme,
  t,
  onFiltersClick,
  onResultsClick,
  onCheckClick,
  onSavedClick,
  onToggleTheme,
  onOpenGuide,
}: DesktopTabBarProps) {
  const filtersActive = leftTab === "filters" && isLeftPanelOpen;
  const resultsActive = leftTab === "results" && isLeftPanelOpen;
  const checkActive = leftTab === "check" && isLeftPanelOpen;

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
  const checkLabel = t("tab.check");
  const savedLabel = t("tab.saved");

  return (
    <nav
      className="desktop-tab-bar"
      data-testid="desktop-tab-bar"
      role="toolbar"
      aria-label={t("app.primaryNav")}
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
        <SlidersHorizontal data-icon="inline-start" />
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
        <List data-icon="inline-start" />
        <span>{resultsLabel}</span>
      </Button>
      <Button
        ref={(node) => {
          itemRefs.current[2] = node;
        }}
        type="button"
        variant={checkActive ? "secondary" : "ghost"}
        size="sm"
        data-active={checkActive}
        aria-pressed={checkActive}
        aria-controls="desktop-check-content"
        title={checkLabel}
        tabIndex={focusedIndex === 2 ? 0 : -1}
        onClick={onCheckClick}
        onKeyDown={(e) => handleKeyDown(e, 2)}
        onFocus={() => setFocusedIndex(2)}
      >
        <Scale data-icon="inline-start" />
        <span>{checkLabel}</span>
      </Button>
      <span className="desktop-tab-bar-divider" aria-hidden="true" />
      <Button
        ref={(node) => {
          itemRefs.current[3] = node;
        }}
        type="button"
        variant={isSavedPanelOpen ? "secondary" : "ghost"}
        size="sm"
        data-active={isSavedPanelOpen}
        aria-pressed={isSavedPanelOpen}
        aria-controls="desktop-saved-content"
        title={savedLabel}
        tabIndex={focusedIndex === 3 ? 0 : -1}
        onClick={onSavedClick}
        onKeyDown={(e) => handleKeyDown(e, 3)}
        onFocus={() => setFocusedIndex(3)}
      >
        <Bookmark data-icon="inline-start" className={isSavedPanelOpen ? "fill-current" : ""} />
        <span>{savedLabel}</span>
        {shortlistCount > 0 ? (
          <Badge variant="outline" className="ml-0.5 h-4 min-w-4 px-1 text-[0.58rem]">
            {shortlistCount}
          </Badge>
        ) : null}
      </Button>
      <span className="desktop-tab-bar-divider" aria-hidden="true" />
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
      <Button
        ref={(node) => {
          itemRefs.current[5] = node;
        }}
        type="button"
        size="icon"
        variant="ghost"
        className="desktop-tab-bar-icon-btn"
        tabIndex={focusedIndex === 5 ? 0 : -1}
        onClick={onOpenGuide}
        onKeyDown={(e) => handleKeyDown(e, 5)}
        onFocus={() => setFocusedIndex(5)}
        aria-label={t("app.openGuide")}
        title={t("app.openGuide")}
      >
        <CircleHelp data-icon className="size-4" />
      </Button>
    </nav>
  );
}
