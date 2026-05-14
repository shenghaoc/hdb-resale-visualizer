import { useCallback, useRef } from "react";
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

  // Roving arrow-key navigation across the three toggle buttons.
  const toggleRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const handleToggleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      const buttons = toggleRefs.current.filter(
        (b): b is HTMLButtonElement => b !== null,
      );
      if (buttons.length === 0) return;
      let nextIndex: number | null = null;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown":
          nextIndex = (index + 1) % buttons.length;
          break;
        case "ArrowLeft":
        case "ArrowUp":
          nextIndex = (index - 1 + buttons.length) % buttons.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = buttons.length - 1;
          break;
      }
      if (nextIndex !== null) {
        event.preventDefault();
        buttons[nextIndex]?.focus();
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
          toggleRefs.current[0] = node;
        }}
        type="button"
        variant={filtersActive ? "secondary" : "ghost"}
        size="sm"
        data-active={filtersActive}
        aria-pressed={filtersActive}
        aria-controls="desktop-filters-content"
        title={filtersLabel}
        onClick={onFiltersClick}
        onKeyDown={(event) => handleToggleKeyDown(event, 0)}
      >
        <SlidersHorizontal data-icon />
        <span>{filtersLabel}</span>
      </Button>
      <Button
        ref={(node) => {
          toggleRefs.current[1] = node;
        }}
        type="button"
        variant={resultsActive ? "secondary" : "ghost"}
        size="sm"
        data-active={resultsActive}
        aria-pressed={resultsActive}
        aria-controls="desktop-results-content"
        title={resultsLabel}
        onClick={onResultsClick}
        onKeyDown={(event) => handleToggleKeyDown(event, 1)}
      >
        <List data-icon />
        <span>{resultsLabel}</span>
      </Button>
      <span className="desktop-tab-bar-divider" aria-hidden="true" />
      <Button
        ref={(node) => {
          toggleRefs.current[2] = node;
        }}
        type="button"
        variant={isSavedPanelOpen ? "secondary" : "ghost"}
        size="sm"
        data-active={isSavedPanelOpen}
        aria-pressed={isSavedPanelOpen}
        aria-controls="desktop-saved-content"
        title={savedLabel}
        onClick={onSavedClick}
        onKeyDown={(event) => handleToggleKeyDown(event, 2)}
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
      <LocaleSelector variant="desktop" />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="desktop-tab-bar-icon-btn"
        onClick={onToggleTheme}
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
