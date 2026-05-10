import { Languages } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { LOCALE_OPTIONS, useI18n } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

export type LocaleSelectorVariant = "desktop" | "mobile";

type LocaleSelectorProps = {
  variant: LocaleSelectorVariant;
};

/**
 * Shared language dropdown used in both the desktop tab bar and the mobile tab
 * bar. Keeps trigger styling, icon sizing, and the options list in one place.
 */
export function LocaleSelector({ variant }: LocaleSelectorProps) {
  const { locale, setLocale, t } = useI18n();
  const label = t("language.label");

  const isDesktop = variant === "desktop";
  const triggerClassName = isDesktop
    ? "desktop-tab-bar-lang-trigger"
    : "mobile-language-trigger";
  const iconClassName = isDesktop ? "size-3.5" : "size-4";
  const sideOffset = isDesktop ? 8 : 4;

  return (
    <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
      <SelectTrigger
        aria-label={label}
        title={isDesktop ? undefined : label}
        className={triggerClassName}
      >
        <Languages data-icon className={iconClassName} aria-hidden="true" />
        <span>{t("language.short_name")}</span>
      </SelectTrigger>
      <SelectContent position="popper" side="top" align="start" sideOffset={sideOffset}>
        {LOCALE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-xs">
            {t(option.labelKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
