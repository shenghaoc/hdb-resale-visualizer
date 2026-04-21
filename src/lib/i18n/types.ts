export type Locale = "en-SG" | "zh-SG";

export type Translator = (key: string, vars?: Record<string, string | number>) => string;
