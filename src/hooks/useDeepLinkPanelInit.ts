import { useEffect, useRef } from "react";
import { parseFilters } from "@/lib/queryState";
import type { BlockSummary } from "@/types/data";
import type { LeftTab, PanelTab } from "@/hooks/usePanelState";

type UseDeepLinkPanelInitOptions = {
  selectedAddressKey: string | null;
  selectedBlock: BlockSummary | null;
  isDesktop: boolean;
  setLeftTab: (tab: LeftTab) => void;
  setIsLeftPanelOpen: (next: boolean) => void;
  setMobileTab: (tab: PanelTab) => void;
};

function readInitialUrlSelectedKey(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return parseFilters(window.location.search).selectedAddressKey;
}

/**
 * On cold load only: when the URL includes `selected` and that key resolves to a
 * loaded block, open the Results panel so the detail drawer is visible.
 */
export function useDeepLinkPanelInit({
  selectedAddressKey,
  selectedBlock,
  isDesktop,
  setLeftTab,
  setIsLeftPanelOpen,
  setMobileTab,
}: UseDeepLinkPanelInitOptions) {
  const initialUrlSelectedKey = useRef(readInitialUrlSelectedKey());
  const hasAppliedDeepLinkPanel = useRef(false);

  useEffect(() => {
    if (hasAppliedDeepLinkPanel.current) {
      return;
    }

    const deepLinkKey = initialUrlSelectedKey.current;
    if (!deepLinkKey) {
      return;
    }

    if (selectedAddressKey !== deepLinkKey || !selectedBlock) {
      return;
    }

    hasAppliedDeepLinkPanel.current = true;

    if (isDesktop) {
      setLeftTab("results");
      setIsLeftPanelOpen(true);
    } else {
      setMobileTab("results");
    }
  }, [
    isDesktop,
    selectedAddressKey,
    selectedBlock,
    setIsLeftPanelOpen,
    setLeftTab,
    setMobileTab,
  ]);
}
