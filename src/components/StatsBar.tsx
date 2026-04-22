import { formatDateTime, formatMonth } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Manifest } from "@/types/data";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

type GlobalHeaderProps = {
  manifest: Manifest;
  testId?: string;
};

export function GlobalHeader({
  manifest,
  testId = "global-header",
}: GlobalHeaderProps) {
  const { locale, t } = useI18n();

  return (
    <header data-testid={testId}>
      <Card size="sm" className="overflow-visible border-none bg-background px-0 py-0 shadow-none">
        <CardHeader className="flex-row items-center justify-between gap-4 px-1 py-1">
          <div className="flex flex-col">
            <CardTitle className="text-lg font-bold leading-tight tracking-tight sm:text-xl">
              {t("app.title")}
            </CardTitle>
            <div className="flex items-center gap-2 text-[0.6rem] font-bold uppercase tracking-widest text-muted-foreground/60">
              {t("stats.dataThrough", { month: formatMonth(manifest.dataWindow.maxMonth, locale) })}
            </div>
          </div>

          <CardAction className="flex items-center gap-3">
            <div className="hidden items-center gap-3 sm:flex">
              <Badge variant="outline" className="h-5 border-border/50 text-[0.6rem]">
                {t("stats.txns", { count: manifest.counts.transactions.toLocaleString(locale) })}
              </Badge>
              <p className="text-[0.6rem] font-medium text-muted-foreground/50">
                {t("stats.built", { date: formatDateTime(manifest.generatedAt, locale) })}
              </p>
            </div>
            <Badge variant="ghost" className="size-8 border border-border/40 p-0 sm:hidden">
              <Info className="size-4 opacity-40" />
            </Badge>
          </CardAction>
        </CardHeader>
      </Card>
    </header>
  );
}
