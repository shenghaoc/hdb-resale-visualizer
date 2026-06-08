import { useEffect, useMemo, useState } from "react";
import { HEADER_DISMISSED_STORAGE_KEY } from "@/shared/lib/constants";
import { safeStorage } from "@/shared/lib/storage";

export function useHeaderState() {
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [hasInteractedWithMap, setHasInteractedWithMap] = useState(false);
  const [hasLoadedPreference, setHasLoadedPreference] = useState(false);
  const [isMobileHeaderOpen, setIsMobileHeaderOpen] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = safeStorage.getItem(HEADER_DISMISSED_STORAGE_KEY);
      if (stored === "1") {
        setIsHeaderVisible(false);
        setHasInteractedWithMap(true);
      }
      setHasLoadedPreference(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!hasLoadedPreference) return;
    safeStorage.setItem(HEADER_DISMISSED_STORAGE_KEY, isHeaderVisible ? "0" : "1");
  }, [hasLoadedPreference, isHeaderVisible]);

  return useMemo(() => ({
    isHeaderVisible,
    setIsHeaderVisible,
    hasInteractedWithMap,
    setHasInteractedWithMap,
    isMobileHeaderOpen,
    setIsMobileHeaderOpen,
  }), [isHeaderVisible, hasInteractedWithMap, isMobileHeaderOpen]);
}
