import { useMemo, useState, type ReactNode } from "react";
import { I18nContext } from "./context";
import { dictionaries } from "./messages";
import type { Locale } from "./types";
import { safeStorage } from "@/lib/storage";

const LOCALE_STORAGE_KEY = "hdb-resale-locale";

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) {
    return template;
  }

  return Object.entries(vars).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = safeStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "zh-SG" || saved === "en-SG") {
      return saved;
    }

    if (typeof window === "undefined") {
      return "en-SG";
    }

    return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-SG" : "en-SG";
  });

  const value = useMemo(
    () => ({
      locale,
      setLocale: (nextLocale: Locale) => {
        setLocale(nextLocale);
        safeStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
      },
      t: (key: string, vars?: Record<string, string | number>) => {
        const text = dictionaries[locale][key] ?? dictionaries["en-SG"][key] ?? key;
        return interpolate(text, vars);
      },
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
