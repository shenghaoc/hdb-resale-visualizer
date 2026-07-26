import { useEffect, useMemo, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export type LeftTab = "filters" | "results" | "check";
export type PanelTab = "filters" | "results" | "check" | "saved";

/**
 * Width expressions for the desktop left panel, keyed by the active tab.
 * Raw values (not Tailwind classes) so they can be consumed in both `className`
 * arbitrary values and inline style calculations without duplication.
 */
export const LEFT_PANEL_WIDTHS: Record<LeftTab, string> = {
  filters: "min(30rem,34vw)",
  results: "min(34rem,38vw)",
  check: "min(30rem,34vw)",
};

/**
 * Shared layout dimensions for the desktop panel system. Used for inline style
 * calculations that cannot be expressed purely with Tailwind classes.
 *
 * - `edgeInset` mirrors the Tailwind `left-6` class used on the left panel's
 *   resting position.
 * - `panelGap` is the horizontal gap between tiling panels.
 */
export const DESKTOP_PANEL_LAYOUT = {
  edgeInset: "1.5rem",
  panelGap: "0.75rem",
} as const;

export function usePanelState() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Desktop starts with the map and first-action prompt unobstructed. The
  // primary destinations are mutually exclusive through the shell controller.
  const [leftTab, setLeftTab] = useState<LeftTab>("filters");
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(false);
  const [isSavedPanelOpen, setIsSavedPanelOpen] = useState(false);

  // Mobile: single tab at a time (unchanged)
  const [mobileTab, setMobileTab] = useState<PanelTab | null>(null);

  const [isShortlistOpen, setIsShortlistOpen] = useState(true);
  const previousIsDesktop = useRef(isDesktop);

  useEffect(() => {
    if (previousIsDesktop.current === isDesktop) {
      return;
    }

    previousIsDesktop.current = isDesktop;

    if (isDesktop) {
      if (mobileTab === "saved") {
        setIsLeftPanelOpen(false);
        setIsSavedPanelOpen(true);
        return;
      }

      setIsSavedPanelOpen(false);
      if (mobileTab !== null) {
        setLeftTab(mobileTab);
        setIsLeftPanelOpen(true);
      } else {
        setIsLeftPanelOpen(false);
      }
      return;
    }

    if (isSavedPanelOpen) {
      setMobileTab("saved");
    } else if (isLeftPanelOpen) {
      setMobileTab(leftTab);
    } else {
      setMobileTab(null);
    }
  }, [isDesktop, isLeftPanelOpen, isSavedPanelOpen, leftTab, mobileTab]);

  const resultsVisible = isDesktop
    ? isLeftPanelOpen && leftTab === "results"
    : mobileTab === "results";
  const savedVisible = isDesktop ? isSavedPanelOpen : mobileTab === "saved";

  return useMemo(
    () => ({
      isDesktop,
      leftTab,
      isLeftPanelOpen,
      isSavedPanelOpen,
      setLeftTab,
      setIsLeftPanelOpen,
      setIsSavedPanelOpen,
      mobileTab,
      setMobileTab,
      isShortlistOpen,
      resultsVisible,
      savedVisible,
      setIsShortlistOpen,
    }),
    [
      isDesktop,
      leftTab,
      isLeftPanelOpen,
      isSavedPanelOpen,
      mobileTab,
      isShortlistOpen,
      resultsVisible,
      savedVisible,
    ],
  );
}
