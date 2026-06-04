import type { ReactNode } from "react";
import { LEFT_PANEL_WIDTHS, DESKTOP_PANEL_LAYOUT, type LeftTab, type PanelTab } from "@/hooks/usePanelState";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AppPanelShellProps = {
  isDesktop: boolean;
  isHeaderVisible: boolean;
  leftTab: LeftTab;
  isLeftPanelOpen: boolean;
  isSavedPanelOpen: boolean;
  mobileTab: PanelTab | null;
  activeFilterChipCount: number;
  detailVisible: boolean;
  detailLoading: boolean;
  filterContent: ReactNode;
  resultsPaneContent: ReactNode;
  selectedDetailContent: ReactNode;
  savedContent: ReactNode;
  onShowHeader: () => void;
  showHeaderLabel: string;
};

export function AppPanelShell({
  isDesktop,
  isHeaderVisible,
  leftTab,
  isLeftPanelOpen,
  isSavedPanelOpen,
  mobileTab,
  activeFilterChipCount,
  detailVisible,
  detailLoading,
  filterContent,
  resultsPaneContent,
  selectedDetailContent,
  savedContent,
  onShowHeader,
  showHeaderLabel,
}: AppPanelShellProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex h-full flex-col gap-3 overflow-hidden p-3 pb-[calc(var(--mobile-tab-bar-height)+env(safe-area-inset-bottom,0px)+0.5rem)] sm:p-4 lg:gap-4 lg:p-6 lg:pb-6">
      {isDesktop && !isHeaderVisible ? (
        <div className="pointer-events-auto absolute left-6 top-6 z-30">
          <Button
            variant="outline"
            size="xs"
            className="h-8 rounded-xl bg-popover/90 px-3 text-[0.62rem] font-bold uppercase tracking-[0.16em] text-muted-foreground backdrop-blur-[20px] transition-colors hover:text-foreground shadow-lg"
            onClick={onShowHeader}
          >
            {showHeaderLabel}
          </Button>
        </div>
      ) : null}

      {isDesktop ? (
        <section className="pointer-events-none relative min-h-0 flex-1">
          <aside
            id="desktop-left-panel"
            aria-hidden={!isLeftPanelOpen}
            {...(!isLeftPanelOpen && { inert: true })}
            data-open={isLeftPanelOpen ? "true" : "false"}
            data-mode={leftTab}
            className={cn(
              "pointer-events-auto absolute bottom-20 left-6 flex max-w-[calc(100vw-3rem)] flex-col overflow-hidden overscroll-contain rounded-2xl border bg-popover/95 backdrop-blur-[20px] transition-[transform,opacity] duration-200 ease-out shadow-xl",
              detailVisible || detailLoading
                ? "max-h-[min(calc(100vh-8rem),52rem)]"
                : "max-h-[min(44rem,calc(100vh-12rem))]",
              "min-h-[24rem]",
              isLeftPanelOpen
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-6 opacity-0",
            )}
            style={{ width: LEFT_PANEL_WIDTHS[leftTab] }}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div
                id="desktop-filters-content"
                aria-hidden={leftTab !== "filters"}
                className={cn("h-full overflow-y-auto p-3 pb-8", leftTab === "filters" ? "block" : "hidden")}
              >
                {filterContent}
              </div>
              <div
                id="desktop-results-content"
                aria-hidden={leftTab !== "results"}
                className={cn(
                  "h-full min-h-0 flex-col gap-3 overflow-hidden p-3 pb-8",
                  leftTab === "results" ? "flex" : "hidden",
                )}
              >
                <div
                  className={cn(
                    "min-h-0 flex-1 flex-col",
                    detailVisible || detailLoading ? "hidden" : "flex",
                  )}
                >
                  {resultsPaneContent}
                </div>
                <div
                  className={cn(
                    "min-h-0 flex-1 flex-col",
                    detailVisible || detailLoading ? "flex" : "hidden",
                  )}
                >
                  {selectedDetailContent}
                </div>
              </div>
            </div>
          </aside>

          <aside
            id="desktop-saved-panel"
            aria-hidden={!isSavedPanelOpen}
            {...(!isSavedPanelOpen && { inert: true })}
            data-open={isSavedPanelOpen ? "true" : "false"}
            data-mode="saved"
            className={cn(
              "pointer-events-auto absolute bottom-20 flex max-w-[calc(100vw-3rem)] flex-col overflow-hidden overscroll-contain rounded-2xl border bg-popover/95 backdrop-blur-[20px] transition-[transform,opacity,left] duration-200 ease-out shadow-xl",
              "max-h-[min(44rem,calc(100vh-12rem))] min-h-[24rem] w-[min(28rem,32vw)]",
              isSavedPanelOpen
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-6 opacity-0",
            )}
            style={{
              left: isLeftPanelOpen
                ? `calc(${DESKTOP_PANEL_LAYOUT.edgeInset} + ${LEFT_PANEL_WIDTHS[leftTab]} + ${DESKTOP_PANEL_LAYOUT.panelGap})`
                : DESKTOP_PANEL_LAYOUT.edgeInset,
            }}
          >
            <div className="flex h-full min-h-0 flex-col">
              <div
                id="desktop-saved-content"
                className="flex h-full min-h-0 flex-col overflow-hidden p-3 pb-8"
              >
                {savedContent}
              </div>
            </div>
          </aside>
        </section>
      ) : (
        <section className="pointer-events-none relative min-h-0 flex-1">
          {mobileTab && (
            <div
              id="mobile-panel"
              className={cn(
                "pointer-events-auto absolute inset-x-0 bottom-0 overflow-hidden overscroll-contain rounded-t-2xl border bg-popover/95 backdrop-blur-[20px] transition-[transform,opacity] shadow-xl",
                activeFilterChipCount > 0 ? "top-[4.5rem]" : "top-0",
              )}
            >
              <div
                id="mobile-filters-content"
                className={cn(
                  "h-full overflow-y-auto p-3 pb-12",
                  mobileTab === "filters" ? "block" : "hidden",
                )}
              >
                {filterContent}
              </div>
              <div
                id="mobile-results-content"
                className={cn(
                  "h-full min-h-0 flex-col gap-3 p-3 pb-12",
                  mobileTab === "results" ? "flex" : "hidden",
                  detailVisible || detailLoading ? "overflow-hidden" : "overflow-y-auto",
                )}
              >
                <div
                  className={cn(
                    "min-h-0 flex-1 flex-col",
                    detailVisible || detailLoading ? "hidden" : "flex",
                  )}
                >
                  {resultsPaneContent}
                </div>
                <div
                  className={cn(
                    "min-h-0 flex-1 flex-col",
                    detailVisible || detailLoading ? "flex" : "hidden",
                  )}
                >
                  {selectedDetailContent}
                </div>
              </div>
              <div
                id="mobile-saved-content"
                className={cn(
                  "h-full min-h-0 flex-col overflow-hidden p-3 pb-12",
                  mobileTab === "saved" ? "flex" : "hidden",
                )}
              >
                {savedContent}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
