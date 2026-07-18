import { useCallback, useId, useState } from "react";
import { Check, Cloud, Copy } from "lucide-react";
import { useI18n } from "@/shared/lib/i18n";
import { SyncCodeNotFoundError } from "@/features/shortlist/cloudSync";
import type { ShortlistSync, SyncStatus } from "@/features/shortlist/useShortlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const STATUS_KEY: Record<SyncStatus, string> = {
  local: "sync.status.local",
  syncing: "sync.status.syncing",
  synced: "sync.status.synced",
  error: "sync.status.error",
};

/**
 * Opt-in "Sync across devices" UI for the shortlist drawer. Cloud sync never
 * blocks local use — every failure degrades to a non-fatal status line.
 */
export function ShortlistSyncSection({ sync }: { sync: ShortlistSync }) {
  const { t } = useI18n();
  const codeInputId = useId();
  const [codeInput, setCodeInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    (action: () => Promise<void>, notFoundKey: string) => {
      setError(null);
      setBusy(true);
      void action()
        .catch((err: unknown) => {
          setError(err instanceof SyncCodeNotFoundError ? t(notFoundKey) : t("sync.error.generic"));
        })
        .finally(() => setBusy(false));
    },
    [t],
  );

  const handleCopy = useCallback(() => {
    if (!sync.code || !navigator.clipboard) return;
    void navigator.clipboard
      .writeText(sync.code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard unavailable — non-fatal; the code is shown for manual copy.
      });
  }, [sync.code]);

  return (
    <section
      data-testid="shortlist-sync"
      className="rounded-none border border-border/40 bg-muted/20 p-3"
    >
      <div className="flex items-center gap-1.5">
        <Cloud data-icon className="size-3.5 text-primary" aria-hidden="true" />
        <h3 className="v2-section-title">{t("sync.title")}</h3>
      </div>

      {sync.code ? (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[0.75rem] text-muted-foreground">{t("sync.linkHint")}</p>
          <div className="flex items-center gap-2">
            <code
              data-testid="sync-code"
              className="flex-1 truncate rounded-none border border-border/50 bg-card px-2.5 py-1.5 text-sm font-bold tracking-wide"
            >
              {sync.code}
            </code>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon-xs"
                  variant="outline"
                  onClick={handleCopy}
                  className={copied ? "text-primary" : undefined}
                  aria-label={copied ? t("sync.codeCopied") : t("sync.copyCode")}
                >
                  {copied ? (
                    <Check data-icon className="size-4" aria-hidden="true" />
                  ) : (
                    <Copy data-icon className="size-4" aria-hidden="true" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{copied ? t("sync.codeCopied") : t("sync.copyCode")}</TooltipContent>
            </Tooltip>
          </div>
          <Button
            type="button"
            size="xs"
            variant="outline"
            className="w-fit"
            onClick={sync.disable}
          >
            {t("sync.stop")}
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex flex-col gap-3">
          <p className="text-[0.75rem] text-muted-foreground">{t("sync.intro")}</p>
          <Button
            type="button"
            size="sm"
            className="w-fit"
            data-testid="sync-enable"
            disabled={busy}
            onClick={() => run(sync.enable, "sync.error.generic")}
          >
            {t("sync.enable")}
          </Button>

          <form
            className="flex flex-col gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = codeInput.trim();
              if (trimmed) run(() => sync.link(trimmed), "sync.error.notFound");
            }}
          >
            <Label htmlFor={codeInputId} className="v2-section-title">
              {t("sync.linkExisting")}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={codeInputId}
                value={codeInput}
                onChange={(event) => setCodeInput(event.target.value)}
                placeholder={t("sync.codePlaceholder")}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                className="flex-1"
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={busy || codeInput.trim() === ""}
              >
                {t("sync.link")}
              </Button>
            </div>
          </form>
        </div>
      )}

      <p
        data-testid="sync-status"
        className="mt-2 text-[0.75rem] font-bold uppercase tracking-[0.1em] text-muted-foreground"
      >
        {t(STATUS_KEY[sync.status])}
      </p>

      {error ? (
        <p
          role="alert"
          data-testid="sync-error"
          className="mt-1.5 rounded-none bg-destructive/10 px-2 py-1.5 text-[0.75rem] font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
