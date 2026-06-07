import { useEffect, useRef } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/lib/utils";
import type { Translator } from "@/shared/lib/i18n";
import guideContent from "../../docs/guide/user-guide.md?raw";

type GuideDialogProps = {
  open: boolean;
  onClose: () => void;
  t: Translator;
};

export function GuideDialog({ open, onClose, t }: GuideDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="guide-dialog-title"
      className={cn(
        "fixed inset-0 z-50 m-0 h-full w-full max-w-none border-0 bg-transparent p-0",
        "backdrop:bg-background/60 backdrop:backdrop-blur-sm",
        "open:flex open:items-center open:justify-center",
      )}
    >
      {open && (
        <div className="relative mx-auto flex h-[min(90vh,56rem)] w-[min(90vw,48rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-2xl">
          <header className="flex shrink-0 items-center justify-between border-b px-6 py-4">
            <h2 id="guide-dialog-title" className="text-sm font-bold uppercase tracking-widest">
              {t("guide.title")}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label={t("guide.close")}
            >
              <X className="size-4" />
            </Button>
          </header>
          <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6 sm:px-8">
            <article className="guide-prose prose prose-sm max-w-none text-foreground">
              <Markdown remarkPlugins={[remarkGfm]}>{guideContent}</Markdown>
            </article>
          </div>
        </div>
      )}
    </dialog>
  );
}
