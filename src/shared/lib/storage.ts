/**
 * Safe wrapper for localStorage access that handles restricted environments
 * (e.g. Private/Incognito modes) where storage might be disabled.
 */
export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore errors in restricted environments
    }
  },

  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }
};
