import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { shareViaNavigator } from "@/lib/shareUrls";

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
};

/**
 * Reusable share button. Uses the Web Share API when available (mobile);
 * falls back to `navigator.clipboard.writeText` on desktop. User-cancelled
 * shares (AbortError) are silently swallowed; only real failures show an
 * error alert.
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
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
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
  }, [url, title, text, errorLabel, cleanup]);

  return (
    <span className="relative inline-flex">
      <Button
        onClick={() => void handleShare()}
        size={size}
        variant={variant}
        type="button"
        className={cn(className, copied && "text-primary")}
        aria-label={copied ? ariaLabelCopied : ariaLabel}
        title={copied ? ariaLabelCopied : ariaLabel}
      >
        {copied ? (
          <Check data-icon className="size-4" aria-hidden="true" />
        ) : (
          <Link2 data-icon className="size-4" aria-hidden="true" />
        )}
      </Button>
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
