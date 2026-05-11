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
  return (
    <nav className="mobile-tab-bar" data-testid="mobile-tab-bar" aria-label={t("app.title")}>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="mobile-mode-button"
        onClick={onToggleTheme}
        aria-label={t("app.toggleTheme")}
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
        type="button"
        variant={mobileTab === "filters" ? "secondary" : "ghost"}
        size="sm"
        className="mobile-tab-button"
        data-active={mobileTab === "filters"}
        aria-expanded={mobileTab === "filters"}
        aria-controls={mobileTab === "filters" ? "mobile-filters-content" : undefined}
        onClick={onFiltersClick}
      >
        <SlidersHorizontal data-icon />
        <span>{t("tab.filters")}</span>
      </Button>
      <Button
        type="button"
        variant={mobileTab === "results" ? "secondary" : "ghost"}
        size="sm"
        className="mobile-tab-button"
        data-active={mobileTab === "results"}
        aria-expanded={mobileTab === "results"}
        aria-controls={mobileTab === "results" ? "mobile-results-content" : undefined}
        onClick={onResultsClick}
      >
        <List data-icon />
        <span>{t("tab.results")}</span>
      </Button>
      <Button
        type="button"
        variant={mobileTab === "saved" ? "secondary" : "ghost"}
        size="sm"
        className="mobile-tab-button"
        data-active={mobileTab === "saved"}
        aria-expanded={mobileTab === "saved"}
        aria-controls={mobileTab === "saved" ? "mobile-saved-content" : undefined}
        onClick={onSavedClick}
      >
        <Bookmark data-icon className={mobileTab === "saved" ? "fill-current" : ""} />
        <span>{t("tab.saved")}</span>
        {shortlistCount > 0 ? (
          <Badge variant="outline" className="ml-0.5 h-4 min-w-4 px-1 text-[0.58rem]">
            {shortlistCount}
          </Badge>
        ) : null}
      </Button>
    </nav>
  );
}
