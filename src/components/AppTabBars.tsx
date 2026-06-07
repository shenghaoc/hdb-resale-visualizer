import { DesktopTabBar } from "@/components/DesktopTabBar";
import { MobileTabBar } from "@/components/MobileTabBar";
import type { LeftTab, PanelTab } from "@/hooks/usePanelState";
import type { Translator } from "@/lib/i18n";

type AppTabBarsProps = {
  isDesktop: boolean;
  leftTab: LeftTab;
  mobileTab: PanelTab | null;
  isLeftPanelOpen: boolean;
  isSavedPanelOpen: boolean;
  shortlistCount: number;
  theme: "light" | "dark";
  t: Translator;
  onDesktopFiltersClick: () => void;
  onDesktopResultsClick: () => void;
  onDesktopCheckClick: () => void;
  onDesktopSavedClick: () => void;
  onMobileFiltersClick: () => void;
  onMobileResultsClick: () => void;
  onMobileCheckClick: () => void;
  onMobileSavedClick: () => void;
  onToggleTheme: () => void;
};

export function AppTabBars({
  isDesktop,
  leftTab,
  mobileTab,
  isLeftPanelOpen,
  isSavedPanelOpen,
  shortlistCount,
  theme,
  t,
  onDesktopFiltersClick,
  onDesktopResultsClick,
  onDesktopCheckClick,
  onDesktopSavedClick,
  onMobileFiltersClick,
  onMobileResultsClick,
  onMobileCheckClick,
  onMobileSavedClick,
  onToggleTheme,
}: AppTabBarsProps) {
  if (isDesktop) {
    return (
      <DesktopTabBar
        leftTab={leftTab}
        isLeftPanelOpen={isLeftPanelOpen}
        isSavedPanelOpen={isSavedPanelOpen}
        shortlistCount={shortlistCount}
        theme={theme}
        t={t}
        onFiltersClick={onDesktopFiltersClick}
        onResultsClick={onDesktopResultsClick}
        onCheckClick={onDesktopCheckClick}
        onSavedClick={onDesktopSavedClick}
        onToggleTheme={onToggleTheme}
      />
    );
  }

  return (
    <MobileTabBar
      mobileTab={mobileTab}
      shortlistCount={shortlistCount}
      theme={theme}
      t={t}
      onFiltersClick={onMobileFiltersClick}
      onResultsClick={onMobileResultsClick}
      onCheckClick={onMobileCheckClick}
      onSavedClick={onMobileSavedClick}
      onToggleTheme={onToggleTheme}
    />
  );
}
