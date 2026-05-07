import { useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export type PanelTab = "filters" | "results" | "saved";

export function usePanelState() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [desktopTab, setDesktopTab] = useState<PanelTab>("filters");
  const [mobileTab, setMobileTab] = useState<PanelTab | null>(null);
  const [isDesktopPanelOpen, setIsDesktopPanelOpen] = useState(true);
  const [isShortlistOpen, setIsShortlistOpen] = useState(true);

  const resultsVisible = isDesktop
    ? isDesktopPanelOpen && desktopTab === "results"
    : mobileTab === "results";
  const savedVisible = isDesktop
    ? isDesktopPanelOpen && desktopTab === "saved"
    : mobileTab === "saved";

  return {
    isDesktop,
    desktopTab,
    mobileTab,
    isDesktopPanelOpen,
    isShortlistOpen,
    resultsVisible,
    savedVisible,
    setDesktopTab,
    setMobileTab,
    setIsDesktopPanelOpen,
    setIsShortlistOpen,
  };
}
