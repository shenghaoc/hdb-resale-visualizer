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
  onRestore: (item: ShortlistItem, index: number) => boolean;
};

export function useShortlistRemovalUndo({ onRemove, onRestore }: UseShortlistRemovalUndoOptions) {
  const [pendingRemoval, setPendingRemoval] = useState<PendingShortlistRemoval | null>(null);
  const [restoreError, setRestoreError] = useState(false);
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

      // Once an undo has failed at capacity, removing another item is the
      // recovery action. Keep the original removal pending so the buyer can
      // retry restoring it instead of silently replacing it with this one.
      if (restoreError && pendingRemoval !== null) {
        setRestoreError(false);
        timerRef.current = setTimeout(() => {
          setPendingRemoval(null);
          timerRef.current = null;
        }, SHORTLIST_UNDO_TIMEOUT_MS);
        return;
      }

      setPendingRemoval(removal);
      setRestoreError(false);
      timerRef.current = setTimeout(() => {
        setPendingRemoval(null);
        setRestoreError(false);
        timerRef.current = null;
      }, SHORTLIST_UNDO_TIMEOUT_MS);
    },
    [clearTimer, onRemove, pendingRemoval, restoreError],
  );

  const undo = useCallback(() => {
    if (pendingRemoval === null) return;

    clearTimer();
    if (onRestore(pendingRemoval.item, pendingRemoval.index)) {
      setPendingRemoval(null);
      setRestoreError(false);
      return;
    }

    setRestoreError(true);
    timerRef.current = setTimeout(() => {
      setPendingRemoval(null);
      setRestoreError(false);
      timerRef.current = null;
    }, SHORTLIST_UNDO_TIMEOUT_MS);
  }, [clearTimer, onRestore, pendingRemoval]);

  return { pendingRemoval, restoreError, remove, undo };
}
