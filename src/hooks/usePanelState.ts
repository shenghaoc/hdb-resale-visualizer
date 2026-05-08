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

  return {
    isDesktop,
    leftTab,
    isLeftPanelOpen,
    isRightPanelOpen,
    setLeftTab,
    setIsLeftPanelOpen,
    setIsRightPanelOpen,
    mobileTab,
    setMobileTab,
    isShortlistOpen,
    resultsVisible,
    savedVisible,
    setIsShortlistOpen,
  };
}
