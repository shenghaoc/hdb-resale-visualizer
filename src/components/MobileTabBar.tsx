import { useCallback, useRef } from "react";
import { Bookmark, List, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocaleSelector } from "@/components/LocaleSelector";
import type { PanelTab } from "@/hooks/usePanelState";
import type { Translator } from "@/lib/i18n";

type MobileTabBarProps = {
  mobileTab: PanelTab | null;
  shortlistCount: number;
  theme: "light" | "dark";
  t: Translator;
  onFiltersClick: () => void;
  onResultsClick: () => void;
  onSavedClick: () => void;
  onToggleTheme: () => void;
};

export function MobileTabBar({
  mobileTab,
  shortlistCount,
  theme,
  t,
  onFiltersClick,
  onResultsClick,
  onSavedClick,
  onToggleTheme,
}: MobileTabBarProps) {
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
      className="mobile-tab-bar"
      data-testid="mobile-tab-bar"
      aria-label={t("app.primaryNav")}
      role="toolbar"
    >
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="mobile-mode-button"
        onClick={onToggleTheme}
        aria-label={t("app.toggleTheme")}
        aria-pressed={theme === "dark"}
        title={t("app.toggleTheme")}
      >
        {theme === "light" ? (
          <Moon data-icon className="size-4" aria-hidden="true" />
        ) : (
          <Sun data-icon className="size-4" aria-hidden="true" />
        )}
      </Button>
      <LocaleSelector variant="mobile" />
      <Button
        ref={(node) => {
          toggleRefs.current[0] = node;
        }}
        type="button"
        variant={mobileTab === "filters" ? "secondary" : "ghost"}
        size="sm"
        className="mobile-tab-button"
        data-active={mobileTab === "filters"}
        aria-pressed={mobileTab === "filters"}
        aria-controls="mobile-filters-content"
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
        variant={mobileTab === "results" ? "secondary" : "ghost"}
        size="sm"
        className="mobile-tab-button"
        data-active={mobileTab === "results"}
        aria-pressed={mobileTab === "results"}
        aria-controls="mobile-results-content"
        title={resultsLabel}
        onClick={onResultsClick}
        onKeyDown={(event) => handleToggleKeyDown(event, 1)}
      >
        <List data-icon />
        <span>{resultsLabel}</span>
      </Button>
      <Button
        ref={(node) => {
          toggleRefs.current[2] = node;
        }}
        type="button"
        variant={mobileTab === "saved" ? "secondary" : "ghost"}
        size="sm"
        className="mobile-tab-button"
        data-active={mobileTab === "saved"}
        aria-pressed={mobileTab === "saved"}
        aria-controls="mobile-saved-content"
        title={savedLabel}
        onClick={onSavedClick}
        onKeyDown={(event) => handleToggleKeyDown(event, 2)}
      >
        <Bookmark data-icon className={mobileTab === "saved" ? "fill-current" : ""} />
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
