import { useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export type DesktopTab = "filters" | "results" | "saved";
export type MobileTab = "filters" | "results" | "saved";

export function usePanelState() {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [desktopTab, setDesktopTab] = useState<DesktopTab>("filters");
  const [mobileTab, setMobileTab] = useState<MobileTab | null>(null);
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
