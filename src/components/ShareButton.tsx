import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Download, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { downloadCsv } from "@/lib/export";
import { cn } from "@/lib/utils";
import { shareViaNavigator } from "@/lib/shareUrls";

export type CsvExportConfig = {
  filename: string;
  getContent: () => string;
};

export type ShareButtonProps = {
  /** The full absolute URL to share. */
  url: string;
  /** Title for the Web Share API (ignored on clipboard fallback). */
  title: string;
  /** Text description for the Web Share API (ignored on clipboard fallback). */
  text?: string;
  /** Accessible label for the button when not in copied state. */
  ariaLabel: string;
  /** Accessible label for the button when in copied state. */
  ariaLabelCopied: string;
  /** Text for the copy-error toast aria-alert. */
  errorLabel: string;
  /** Optional className forwarded to the Button. */
  className?: string;
  /** Button variant; defaults to "outline". */
  variant?: "outline" | "ghost" | "secondary" | "default";
  /** Button size; defaults to "icon-xs". */
  size?: "icon-xs" | "icon-sm" | "icon" | "xs" | "sm" | "lg";
  /** When set, renders an adjacent CSV export button. */
  csvExport?: CsvExportConfig;
  /** Accessible label for the CSV export button. */
  exportAriaLabel?: string;
  /** Accessible label after CSV export completes. */
  exportAriaLabelDone?: string;
  /** When true, share is blocked and `onShareBlocked` runs instead. */
  shareDisabled?: boolean;
  /** Called when the user activates share while `shareDisabled` is true. */
  onShareBlocked?: () => void;
};

/**
 * Reusable share button. Uses the Web Share API when available (mobile);
 * falls back to `navigator.clipboard.writeText` on desktop. User-cancelled
 * shares (AbortError) are silently swallowed; only real failures show an
 * error alert.
 *
 * When `csvExport` is provided, a companion export button downloads the
 * current results/shortlist as CSV (formula-safe).
 */
export function ShareButton({
  url,
  title,
  text,
  ariaLabel,
  ariaLabelCopied,
  errorLabel,
  className,
  variant = "outline",
  size = "icon-xs",
  csvExport,
  exportAriaLabel = "Export CSV",
  exportAriaLabelDone = "CSV downloaded",
  shareDisabled = false,
  onShareBlocked,
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const handleShare = useCallback(async () => {
    setError(null);
    if (shareDisabled) {
      onShareBlocked?.();
      return;
    }

    try {
      const result = await shareViaNavigator(url, title, text);
      if (result === "copied") {
        cleanup();
        setCopied(true);
        timeoutRef.current = setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setError(errorLabel);
    }
  }, [url, title, text, errorLabel, cleanup, onShareBlocked, shareDisabled]);

  const handleExportCsv = useCallback(() => {
    if (!csvExport) return;
    downloadCsv(csvExport.filename, csvExport.getContent());
    cleanup();
    setExported(true);
    timeoutRef.current = setTimeout(() => setExported(false), 2000);
  }, [cleanup, csvExport]);

  const shareButton = (
    <Button
      onClick={() => void handleShare()}
      size={size}
      variant={variant}
      type="button"
      className={cn(className, copied && "text-primary")}
      aria-label={copied ? ariaLabelCopied : ariaLabel}
      title={copied ? ariaLabelCopied : ariaLabel}
      disabled={shareDisabled}
    >
      {copied ? (
        <Check data-icon className="size-4" aria-hidden="true" />
      ) : (
        <Link2 data-icon className="size-4" aria-hidden="true" />
      )}
    </Button>
  );

  return (
    <span className="relative inline-flex">
      {csvExport ? (
        <ButtonGroup className="gap-0">
          {shareButton}
          <Button
            onClick={handleExportCsv}
            size={size}
            variant={variant}
            type="button"
            className={cn(className, exported && "text-primary")}
            aria-label={exported ? exportAriaLabelDone : exportAriaLabel}
            title={exported ? exportAriaLabelDone : exportAriaLabel}
          >
            {exported ? (
              <Check data-icon className="size-4" aria-hidden="true" />
            ) : (
              <Download data-icon className="size-4" aria-hidden="true" />
            )}
          </Button>
        </ButtonGroup>
      ) : (
        shareButton
      )}
      {error && (
        <div
          role="alert"
          className="absolute left-0 top-full z-50 mt-1 whitespace-nowrap rounded-lg bg-destructive/10 px-2 py-1.5 text-[0.65rem] font-medium text-destructive"
        >
          {error}
        </div>
      )}
    </span>
  );
}
