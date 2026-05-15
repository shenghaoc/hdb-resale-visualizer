import { useCallback, useEffect, useMemo, useState } from "react";
import { loadChecklistState, saveChecklistState, toggleChecklistItem, type ChecklistState, type ChecklistItemId } from "@/lib/checklist";
import { safeStorage } from "@/lib/storage";

export function useChecklist() {
  const [state, setState] = useState<ChecklistState>(() => loadChecklistState(safeStorage));

  useEffect(() => {
    saveChecklistState(safeStorage, state);
  }, [state]);

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
