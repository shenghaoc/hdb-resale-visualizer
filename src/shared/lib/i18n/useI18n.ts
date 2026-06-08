import { use } from "react";
import { I18nContext } from "./context";

export function useI18n() {
  const context = use(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return context;
}
