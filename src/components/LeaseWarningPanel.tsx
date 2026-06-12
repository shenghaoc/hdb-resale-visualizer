import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { Translator } from "@/shared/lib/i18n";
import type { LeaseSignal } from "@/features/block-detail/leaseSignals";
import { DocsLink } from "@/features/docs/DocsLink";

type Props = {
  signals: LeaseSignal[];
  t: Translator;
};

export function LeaseWarningPanel({ signals, t }: Props) {
  if (signals.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-1.5" role="list" aria-label={t("lease.signals.title")}>
        {signals.map((signal) => (
          <div
            key={signal.key}
            role="listitem"
            className={cn(
              "flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium",
              signal.severity === "warn"
                ? "bg-destructive/10 text-destructive"
                : "bg-muted/40 text-muted-foreground",
            )}
          >
            {signal.severity === "warn" ? (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            )}
            <span>{t(signal.key)}</span>
          </div>
        ))}
      </div>
      <div className="px-3 text-xs text-muted-foreground">
        <DocsLink slug="understanding-price-comparisons">{t("docs.linkLease")}</DocsLink>
      </div>
    </div>
  );
}
