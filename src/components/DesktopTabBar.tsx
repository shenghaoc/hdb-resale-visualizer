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
  return (
    <nav className="desktop-tab-bar" data-testid="desktop-tab-bar" aria-label={t("app.title")}>
      <Button
        type="button"
        variant={leftTab === "filters" && isLeftPanelOpen ? "secondary" : "ghost"}
        size="sm"
        data-active={leftTab === "filters" && isLeftPanelOpen}
        aria-expanded={leftTab === "filters" && isLeftPanelOpen}
        aria-controls={
          leftTab === "filters" && isLeftPanelOpen ? "desktop-filters-content" : undefined
        }
        onClick={onFiltersClick}
      >
        <SlidersHorizontal data-icon />
        <span>{t("tab.filters")}</span>
      </Button>
      <Button
        type="button"
        variant={leftTab === "results" && isLeftPanelOpen ? "secondary" : "ghost"}
        size="sm"
        data-active={leftTab === "results" && isLeftPanelOpen}
        aria-expanded={leftTab === "results" && isLeftPanelOpen}
        aria-controls={
          leftTab === "results" && isLeftPanelOpen ? "desktop-results-content" : undefined
        }
        onClick={onResultsClick}
      >
        <List data-icon />
        <span>{t("tab.results")}</span>
      </Button>
      <span className="desktop-tab-bar-divider" aria-hidden="true" />
      <Button
        type="button"
        variant={isSavedPanelOpen ? "secondary" : "ghost"}
        size="sm"
        data-active={isSavedPanelOpen}
        aria-expanded={isSavedPanelOpen}
        aria-controls={isSavedPanelOpen ? "desktop-saved-content" : undefined}
        onClick={onSavedClick}
      >
        <Bookmark data-icon className={isSavedPanelOpen ? "fill-current" : ""} />
        <span>{t("tab.saved")}</span>
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
