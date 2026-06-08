import { Languages } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LOCALE_OPTIONS, useI18n } from "@/shared/lib/i18n";
import type { Locale } from "@/shared/lib/i18n";

/**
 * Language dropdown for the floating map locale control.
 */
export function LocaleSelector() {
  const { locale, setLocale, t } = useI18n();
  const label = t("language.label");

  return (
    <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <SelectTrigger aria-label={label} className="map-locale-trigger">
            <Languages data-icon className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("language.short_name")}</span>
          </SelectTrigger>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      <SelectContent position="popper" side="bottom" align="end" sideOffset={8}>
        {LOCALE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-xs">
            {t(option.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
