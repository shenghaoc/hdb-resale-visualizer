import { formatDateTime, formatMonth } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Manifest } from "@/types/data";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

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
    <header data-testid={testId} className="w-full min-w-0">
      <Card
        size="sm"
        className="w-full min-w-0 overflow-visible border border-border/70 bg-background/85 px-0 py-0 shadow-sm backdrop-blur-sm"
      >
        <CardHeader className="gap-1 px-3 py-2">
          <div className="min-w-0">
            <CardTitle className="text-base font-bold leading-tight tracking-tight sm:text-lg">
              {t("app.title")}
            </CardTitle>
          </div>
          <p className="text-[0.62rem] font-medium uppercase tracking-[0.14em] text-muted-foreground/65">
            {t("stats.dataThrough", { month: formatMonth(manifest.dataWindow.maxMonth, locale) })}
            <span className="mx-1.5 opacity-35">•</span>
            {t("stats.txns", { count: manifest.counts.transactions.toLocaleString(locale) })}
            <span className="mx-1.5 opacity-35">•</span>
            {t("stats.built", { date: formatDateTime(manifest.generatedAt, locale) })}
          </p>
        </CardHeader>
      </Card>
    </header>
  );
}
