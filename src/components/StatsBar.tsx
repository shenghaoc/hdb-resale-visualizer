import { formatDateTime, formatMonth } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/hooks/useTheme";
import type { Manifest } from "@/types/data";
import type { Locale } from "@/lib/i18n/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card";
import { Info, Languages, Moon, Sun, X } from "lucide-react";
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
  const { theme, toggleTheme } = useTheme();
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);

  if (!isVisible) {
    return null;
  }


  return (
    <header data-testid={testId}>
      <Card
        size="sm"
        className="overflow-visible border border-border/20 bg-background/85 px-0 py-0 shadow-[0_4px_16px_rgba(23,28,31,0.06)] backdrop-blur-[16px]"
      >
        <CardHeader className="flex-row items-center justify-between gap-4 px-3 py-2.5">
          <div className="flex flex-col gap-0.5">
            <CardTitle className="text-base font-bold leading-tight tracking-tight sm:text-lg">
              {t("app.title")}
            </CardTitle>
            <Badge variant="outline" className="h-4 w-fit border-border/40 bg-muted/30 px-1.5 text-[0.6rem] font-bold uppercase tracking-wider">
              {t("stats.dataThrough", { month: formatMonth(manifest.dataWindow.maxMonth, locale) })}
            </Badge>
          </div>

          <CardAction className="flex items-center gap-2">
            <div className="hidden items-center gap-3 md:flex">
              <Badge variant="secondary" className="h-5 text-[0.62rem] font-bold">
                {t("stats.txns", { count: manifest.counts.transactions.toLocaleString(locale) })}
              </Badge>
              <p className="text-[0.62rem] font-medium text-muted-foreground">
                {t("stats.built", { date: formatDateTime(manifest.generatedAt, locale) })}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-7 p-0 text-muted-foreground hover:text-foreground"
                onClick={toggleTheme}
                aria-label="Toggle theme"
              >
                {theme === "light" ? (
                  <Moon data-icon className="size-4" />
                ) : (
                  <Sun data-icon className="size-4" />
                )}
              </Button>

              <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                <SelectTrigger
                  aria-label={t("language.label")}
                  className="h-7 min-w-20 border-border/30 bg-background/60 px-2 py-0 text-xs shadow-sm backdrop-blur-sm"
                >
                  <div className="flex items-center gap-1.5">
                    <Languages data-icon className="size-3 opacity-60" />
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
                className="size-7 p-0 sm:hidden"
                onClick={() => setMobileInfoOpen((current) => !current)}
                aria-label="Toggle metadata"
              >
                <Info data-icon className="size-4" />
              </Button>
              {onDismiss ? (
                <Button type="button" size="icon" variant="ghost" className="size-7 p-0" onClick={onDismiss} aria-label="Dismiss header">
                  <X data-icon className="size-4" />
                </Button>
              ) : null}
            </div>
          </CardAction>
        </CardHeader>
        {mobileInfoOpen ? (
          <div className="flex flex-col gap-2 border-t border-border/20 bg-muted/20 px-3 py-2 sm:hidden">
            <Badge variant="secondary" className="h-5 w-fit text-[0.6rem] font-bold">
              {t("stats.txns", { count: manifest.counts.transactions.toLocaleString(locale) })}
            </Badge>
            <p className="text-[0.65rem] font-medium text-muted-foreground">
              {t("stats.built", { date: formatDateTime(manifest.generatedAt, locale) })}
            </p>
          </div>
        ) : null}
      </Card>
    </header>
  );
}
