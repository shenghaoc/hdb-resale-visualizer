import { useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export type LeftTab = "filters" | "results";
export type PanelTab = "filters" | "results" | "saved";

export function usePanelState() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Desktop: independent left panel (filters/results) and right panel (saved)
  const [leftTab, setLeftTab] = useState<LeftTab>("filters");
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  // Mobile: single tab at a time (unchanged)
  const [mobileTab, setMobileTab] = useState<PanelTab | null>(null);

  const [isShortlistOpen, setIsShortlistOpen] = useState(true);

  const resultsVisible = isDesktop
    ? isLeftPanelOpen && leftTab === "results"
    : mobileTab === "results";
  const savedVisible = isDesktop ? isRightPanelOpen : mobileTab === "saved";

  // Backwards-compat helpers: desktopTab and isDesktopPanelOpen are derived
  // to minimise churn in consumers that still reference them.
  const desktopTab: PanelTab = isRightPanelOpen ? "saved" : leftTab;
  const isDesktopPanelOpen = isLeftPanelOpen || isRightPanelOpen;

  return {
    isDesktop,
    // New granular API
    leftTab,
    isLeftPanelOpen,
    isRightPanelOpen,
    setLeftTab,
    setIsLeftPanelOpen,
    setIsRightPanelOpen,
    // Legacy/compat (still used by some consumers)
    desktopTab,
    isDesktopPanelOpen,
    // Mobile
    mobileTab,
    setMobileTab,
    // Shared
    isShortlistOpen,
    resultsVisible,
    savedVisible,
    setIsShortlistOpen,
  };
}
