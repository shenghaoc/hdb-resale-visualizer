import { useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export type LeftTab = "filters" | "results";
export type PanelTab = "filters" | "results" | "saved";

/**
 * Width expressions for the desktop left panel, keyed by the active tab.
 * Raw values (not Tailwind classes) so they can be consumed in both `className`
 * arbitrary values and inline style calculations without duplication.
 */
export const LEFT_PANEL_WIDTHS: Record<LeftTab, string> = {
  filters: "min(30rem,34vw)",
  results: "min(34rem,38vw)",
};

export function usePanelState() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Desktop: left panel (filters/results) is mutually exclusive;
  // saved panel is independent and tiles alongside the left panel.
  const [leftTab, setLeftTab] = useState<LeftTab>("filters");
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isSavedPanelOpen, setIsSavedPanelOpen] = useState(false);

  // Mobile: single tab at a time (unchanged)
  const [mobileTab, setMobileTab] = useState<PanelTab | null>(null);

  const [isShortlistOpen, setIsShortlistOpen] = useState(true);

  const resultsVisible = isDesktop
    ? isLeftPanelOpen && leftTab === "results"
    : mobileTab === "results";
  const savedVisible = isDesktop ? isSavedPanelOpen : mobileTab === "saved";

  return {
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
  };
}
