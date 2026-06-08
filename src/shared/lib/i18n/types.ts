export const SUPPORTED_LOCALES = ["en-SG", "zh-SG"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export type LocaleOption = {
  value: Locale;
  labelKey: string;
};

export const LOCALE_OPTIONS: ReadonlyArray<LocaleOption> = [
  { value: "en-SG", labelKey: "language.en" },
  { value: "zh-SG", labelKey: "language.zh" },
];

export type Translator = (key: string, vars?: Record<string, string | number>) => string;
