import { formatDateTime, formatMonth } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { Manifest } from "@/types/data";
import type { Locale } from "@/lib/i18n/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Info, Languages, X } from "lucide-react";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type GlobalHeaderProps = {
  manifest: Manifest;
  testId?: string;
  isVisible?: boolean;
  onDismiss?: () => void;
};

export function GlobalHeader({
  manifest,
  testId = "global-header",
  isVisible = true,
  onDismiss,
}: GlobalHeaderProps) {
  const { locale, setLocale, t } = useI18n();
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);

  if (!isVisible) {
    return null;
  }


  return (
    <header data-testid={testId}>
      <Card
        size="sm"
        className="overflow-visible border border-border/70 bg-card/95 px-0 py-0 shadow-sm backdrop-blur-md"
      >
        <CardHeader className="flex-row items-center justify-between gap-4 px-3 py-2">
          <div className="flex flex-col">
            <CardTitle className="text-lg font-bold leading-tight tracking-tight sm:text-xl">
              {t("app.title")}
            </CardTitle>
            <div className="flex items-center gap-2 text-[0.62rem] font-bold uppercase tracking-widest text-muted-foreground/70">
              {t("stats.dataThrough", { month: formatMonth(manifest.dataWindow.maxMonth, locale) })}
            </div>
          </div>

          <CardAction className="flex items-center gap-3">
            <div className="hidden items-center gap-3 md:flex">
              <Badge variant="outline" className="h-5 border-border/60 bg-background/80 text-[0.62rem]">
                {t("stats.txns", { count: manifest.counts.transactions.toLocaleString(locale) })}
              </Badge>
              <p className="text-[0.62rem] font-medium text-muted-foreground/65">
                {t("stats.built", { date: formatDateTime(manifest.generatedAt, locale) })}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                <SelectTrigger className="h-8 min-w-24 border-border/50 bg-background/80 px-2 py-0 text-xs shadow-sm">
                  <div className="flex items-center gap-2">
                    <Languages data-icon className="opacity-60" />
                    <SelectValue placeholder={t("language.label")} />
                  </div>
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="en-SG" className="text-xs">
                    {t("language.en")}
                  </SelectItem>
                  <SelectItem value="zh-SG" className="text-xs">
                    {t("language.zh")}
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 border border-border/40 p-0 sm:hidden"
                onClick={() => setMobileInfoOpen((current) => !current)}
                aria-label="Toggle metadata"
              >
                <Info data-icon />
              </Button>
              {onDismiss ? (
                <Button type="button" size="icon" variant="ghost" className="size-8 p-0" onClick={onDismiss} aria-label="Dismiss header">
                  <X data-icon />
                </Button>
              ) : null}
            </div>
          </CardAction>
        </CardHeader>
        {mobileInfoOpen ? (
          <div className="flex flex-col gap-2 px-2 pb-2 sm:hidden">
            <Badge variant="outline" className="h-5 w-fit border-border/50 text-[0.6rem]">
              {t("stats.txns", { count: manifest.counts.transactions.toLocaleString(locale) })}
            </Badge>
            <p className="text-[0.65rem] font-medium text-muted-foreground/70">
              {t("stats.built", { date: formatDateTime(manifest.generatedAt, locale) })}
            </p>
          </div>
        ) : null}
      </Card>
    </header>
  );
}
