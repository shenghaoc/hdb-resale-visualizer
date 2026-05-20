import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDeepLinkPanelInit } from "@/hooks/useDeepLinkPanelInit";
import type { BlockSummary } from "@/types/data";

const mockBlock = { addressKey: "bedok-10d-bedok-sth-ave-2" } as BlockSummary;

describe("useDeepLinkPanelInit", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("opens Results on desktop when the cold-load selected key resolves to a block", async () => {
    window.history.replaceState({}, "", "/?town=BEDOK&selected=bedok-10d-bedok-sth-ave-2");

    const setLeftTab = vi.fn();
    const setIsLeftPanelOpen = vi.fn();
    const setMobileTab = vi.fn();

    renderHook(() =>
      useDeepLinkPanelInit({
        selectedAddressKey: "bedok-10d-bedok-sth-ave-2",
        selectedBlock: mockBlock,
        isDesktop: true,
        setLeftTab,
        setIsLeftPanelOpen,
        setMobileTab,
      }),
    );

    await waitFor(() => {
      expect(setLeftTab).toHaveBeenCalledWith("results");
      expect(setIsLeftPanelOpen).toHaveBeenCalledWith(true);
    });
    expect(setMobileTab).not.toHaveBeenCalled();
  });

  it("opens Results on mobile when the cold-load selected key resolves to a block", async () => {
    window.history.replaceState({}, "", "/?selected=bedok-10d-bedok-sth-ave-2");

    const setLeftTab = vi.fn();
    const setIsLeftPanelOpen = vi.fn();
    const setMobileTab = vi.fn();

    renderHook(() =>
      useDeepLinkPanelInit({
        selectedAddressKey: "bedok-10d-bedok-sth-ave-2",
        selectedBlock: mockBlock,
        isDesktop: false,
        setLeftTab,
        setIsLeftPanelOpen,
        setMobileTab,
      }),
    );

    await waitFor(() => {
      expect(setMobileTab).toHaveBeenCalledWith("results");
    });
    expect(setLeftTab).not.toHaveBeenCalled();
  });

  it("does not switch panels when selected is absent from the initial URL", async () => {
    window.history.replaceState({}, "", "/?town=BEDOK");

    const setLeftTab = vi.fn();
    const setIsLeftPanelOpen = vi.fn();
    const setMobileTab = vi.fn();

    renderHook(() =>
      useDeepLinkPanelInit({
        selectedAddressKey: "bedok-10d-bedok-sth-ave-2",
        selectedBlock: mockBlock,
        isDesktop: true,
        setLeftTab,
        setIsLeftPanelOpen,
        setMobileTab,
      }),
    );

    await waitFor(() => {
      expect(setLeftTab).not.toHaveBeenCalled();
      expect(setIsLeftPanelOpen).not.toHaveBeenCalled();
      expect(setMobileTab).not.toHaveBeenCalled();
    });
  });

  it("does not switch panels when the deep-link key never resolves to a block", async () => {
    window.history.replaceState({}, "", "/?selected=bedok-10d-bedok-sth-ave-2");

    const setLeftTab = vi.fn();
    const setIsLeftPanelOpen = vi.fn();
    const setMobileTab = vi.fn();

    renderHook(() =>
      useDeepLinkPanelInit({
        selectedAddressKey: "bedok-10d-bedok-sth-ave-2",
        selectedBlock: null,
        isDesktop: true,
        setLeftTab,
        setIsLeftPanelOpen,
        setMobileTab,
      }),
    );

    await waitFor(() => {
      expect(setLeftTab).not.toHaveBeenCalled();
    });
  });

  it("does not override panel choice after the user changes selection", async () => {
    window.history.replaceState({}, "", "/?selected=bedok-10d-bedok-sth-ave-2");

    const setLeftTab = vi.fn();
    const setIsLeftPanelOpen = vi.fn();
    const setMobileTab = vi.fn();

    const { rerender } = renderHook<
      ReturnType<typeof useDeepLinkPanelInit>,
      { selectedAddressKey: string | null; selectedBlock: BlockSummary | null }
    >(
      (props) =>
        useDeepLinkPanelInit({
          selectedAddressKey: props.selectedAddressKey,
          selectedBlock: props.selectedBlock,
          isDesktop: true,
          setLeftTab,
          setIsLeftPanelOpen,
          setMobileTab,
        }),
      {
        initialProps: {
          selectedAddressKey: "bedok-10d-bedok-sth-ave-2",
          selectedBlock: null,
        },
      },
    );

    rerender({
      selectedAddressKey: "other-block",
      selectedBlock: { addressKey: "other-block" } as BlockSummary,
    });

    await waitFor(() => {
      expect(setLeftTab).not.toHaveBeenCalled();
    });
  });
});
