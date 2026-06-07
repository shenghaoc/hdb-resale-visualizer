import { useCallback, useEffect, useMemo, useState } from "react";
import { loadChecklistState, saveChecklistState, toggleChecklistItem, type ChecklistState, type ChecklistItemId } from "@/features/listing-check/checklist";
import { safeStorage } from "@/shared/lib/storage";
import { CHECKLIST_STORAGE_KEY } from "@/shared/lib/constants";

export function useChecklist() {
  const [state, setState] = useState<ChecklistState>(() => loadChecklistState(safeStorage));

  useEffect(() => {
    saveChecklistState(safeStorage, state);
  }, [state]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === CHECKLIST_STORAGE_KEY) {
        setState(loadChecklistState(safeStorage));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const toggle = useCallback((addressKey: string, itemId: ChecklistItemId) => {
    setState((current) => toggleChecklistItem(current, addressKey, itemId));
  }, []);

  return useMemo(
    () => ({
      state,
      toggle,
    }),
    [state, toggle],
  );
}
