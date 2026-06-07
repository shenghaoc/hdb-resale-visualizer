import type { ReactNode } from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useI18n } from "@/shared/lib/i18n/useI18n";
import { I18nProvider } from "@/shared/lib/i18n/provider";
import { I18nContext, type I18nContextValue } from "@/shared/lib/i18n/context";

describe("useI18n", () => {
  it("should return the context value when used inside I18nProvider", () => {
    const { result } = renderHook(() => useI18n(), {
      wrapper: I18nProvider,
    });

    expect(result.current).toBeDefined();
    expect(result.current.locale).toBeDefined();
    expect(result.current.setLocale).toBeInstanceOf(Function);
    expect(result.current.t).toBeInstanceOf(Function);
  });

  it("should return custom context values when provided directly to I18nContext.Provider", () => {
    const mockContextValue: I18nContextValue = {
      locale: "zh-SG" as const,
      setLocale: vi.fn(),
      t: vi.fn(),
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nContext.Provider value={mockContextValue}>
        {children}
      </I18nContext.Provider>
    );

    const { result } = renderHook(() => useI18n(), { wrapper });

    expect(result.current.locale).toBe("zh-SG");
    expect(result.current.setLocale).toBe(mockContextValue.setLocale);
    expect(result.current.t).toBe(mockContextValue.t);
  });

  it("should throw an error when used outside of I18nProvider", () => {
    // Suppress console.error for the expected error
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      expect(() => renderHook(() => useI18n())).toThrow(
        "useI18n must be used inside I18nProvider"
      );
    } finally {
      consoleSpy.mockRestore();
    }
  });
});
