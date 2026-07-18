import { useCallback, useEffect, useRef, useState } from "react";
import type { ShortlistItem } from "@/types/data";

const SHORTLIST_UNDO_TIMEOUT_MS = 5000;

export type PendingShortlistRemoval = {
  item: ShortlistItem;
  index: number;
  label: string;
};

type UseShortlistRemovalUndoOptions = {
  onRemove: (addressKey: string) => void;
  onRestore: (item: ShortlistItem, index: number) => void;
};

export function useShortlistRemovalUndo({ onRemove, onRestore }: UseShortlistRemovalUndoOptions) {
  const [pendingRemoval, setPendingRemoval] = useState<PendingShortlistRemoval | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const remove = useCallback(
    (removal: PendingShortlistRemoval) => {
      clearTimer();
      onRemove(removal.item.addressKey);
      setPendingRemoval(removal);
      timerRef.current = setTimeout(() => {
        setPendingRemoval(null);
        timerRef.current = null;
      }, SHORTLIST_UNDO_TIMEOUT_MS);
    },
    [clearTimer, onRemove],
  );

  const undo = useCallback(() => {
    if (pendingRemoval === null) return;

    clearTimer();
    onRestore(pendingRemoval.item, pendingRemoval.index);
    setPendingRemoval(null);
  }, [clearTimer, onRestore, pendingRemoval]);

  return { pendingRemoval, remove, undo };
}
