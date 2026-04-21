import { createContext } from "react";
import type { Locale, Translator } from "./types";

export type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translator;
};

export const I18nContext = createContext<I18nContextValue | null>(null);
