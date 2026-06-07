import { useEffect, useState } from "react";
import { safeStorage } from "@/shared/lib/storage";

const THEME_STORAGE_KEY = "hdb-resale-theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  // userTheme is null if the user hasn't explicitly set a preference
  const [userTheme, setUserTheme] = useState<"light" | "dark" | null>(() => {
    const stored = safeStorage.getItem(THEME_STORAGE_KEY);
    return stored === "dark" || stored === "light" ? stored : null;
  });

  const [systemTheme, setSystemTheme] = useState<"light" | "dark">(getSystemTheme);

  // Sync system theme and listen for changes
  useEffect(() => {
    // Check if matchMedia is available (not available in some test environments)
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const activeTheme = userTheme ?? systemTheme;

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.toggle("dark", activeTheme === "dark");
  }, [activeTheme]);

  const toggleTheme = () => {
    const nextTheme = activeTheme === "light" ? "dark" : "light";
    setUserTheme(nextTheme);
    safeStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  };

  const setTheme = (theme: "light" | "dark") => {
    setUserTheme(theme);
    safeStorage.setItem(THEME_STORAGE_KEY, theme);
  };

  return {
    theme: activeTheme,
    userTheme,
    systemTheme,
    toggleTheme,
    setTheme,
    isDark: activeTheme === "dark",
    isLight: activeTheme === "light",
  };
}
