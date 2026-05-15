import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Translator } from "@/lib/i18n";
import type { LeaseSignal } from "@/lib/leaseSignals";

type Props = {
  signals: LeaseSignal[];
  t: Translator;
};

export function LeaseWarningPanel({ signals, t }: Props) {
  if (signals.length === 0) return null;

  return (
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
  );
}
