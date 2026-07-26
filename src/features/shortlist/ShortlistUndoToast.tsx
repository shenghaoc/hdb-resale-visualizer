import { Button } from "@/components/ui/button";
import type { PendingShortlistRemoval } from "@/features/shortlist/useShortlistRemovalUndo";
import { useI18n } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

type ShortlistUndoToastProps = {
  pendingRemoval: PendingShortlistRemoval | null;
  restoreError: boolean;
  onUndo: () => void;
};

export function ShortlistUndoToast({
  pendingRemoval,
  restoreError,
  onUndo,
}: ShortlistUndoToastProps) {
  const { t } = useI18n();

  if (!pendingRemoval) return null;

  return (
    <div
      className="fixed inset-x-3 bottom-20 z-50 border border-border/60 bg-background px-3 py-2.5 shadow-lg lg:inset-x-auto lg:right-4 lg:bottom-4 lg:w-96"
      role="status"
      aria-live="polite"
      data-testid="shortlist-undo-toast"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={cn(
            "min-w-0 text-xs",
            restoreError ? "font-medium text-destructive" : "truncate text-muted-foreground",
          )}
        >
          {restoreError
            ? t("shortlist.undoFull")
            : `${t("shortlist.removed")}: ${pendingRemoval.label}`}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="shrink-0 rounded-none text-xs font-semibold text-primary hover:text-primary/80"
          onClick={onUndo}
        >
          {t("shortlist.undo")}
        </Button>
      </div>
    </div>
  );
}
