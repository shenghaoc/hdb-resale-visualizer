import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { usePanelState } from "@/hooks/usePanelState";

type MatchMediaController = {
  setDesktop: (matches: boolean) => void;
};

function installMatchMedia(initialMatches: boolean): MatchMediaController {
  let matches = initialMatches;
  const listeners = new Set<() => void>();

  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation(() => ({
      get matches() {
        return matches;
      },
      media: "(min-width: 1024px)",
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      addListener: (listener: () => void) => listeners.add(listener),
      removeListener: (listener: () => void) => listeners.delete(listener),
      dispatchEvent: vi.fn(),
    })),
  );

  return {
    setDesktop(nextMatches) {
      matches = nextMatches;
      listeners.forEach((listener) => listener());
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("usePanelState breakpoint reconciliation", () => {
  it("carries an open mobile destination into the desktop panel", () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => usePanelState());

    act(() => result.current.setMobileTab("results"));
    act(() => media.setDesktop(true));

    expect(result.current.isDesktop).toBe(true);
    expect(result.current.leftTab).toBe("results");
    expect(result.current.isLeftPanelOpen).toBe(true);
    expect(result.current.isSavedPanelOpen).toBe(false);
  });

  it("carries the active desktop destination back to mobile", () => {
    const media = installMatchMedia(true);
    const { result } = renderHook(() => usePanelState());

    act(() => {
      result.current.setLeftTab("check");
      result.current.setIsLeftPanelOpen(true);
    });
    act(() => media.setDesktop(false));

    expect(result.current.isDesktop).toBe(false);
    expect(result.current.mobileTab).toBe("check");
  });

  it("preserves Saved across both breakpoint directions", () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => usePanelState());

    act(() => result.current.setMobileTab("saved"));
    act(() => media.setDesktop(true));

    expect(result.current.isSavedPanelOpen).toBe(true);
    expect(result.current.isLeftPanelOpen).toBe(false);

    act(() => media.setDesktop(false));
    expect(result.current.mobileTab).toBe("saved");
  });
});
