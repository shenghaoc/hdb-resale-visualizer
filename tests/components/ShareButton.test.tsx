import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareButton } from "@/components/ShareButton";

const DEFAULT_PROPS = {
  url: "https://example.com/?town=BEDOK",
  title: "HDB Resale Explorer",
  ariaLabel: "Share this block",
  ariaLabelCopied: "Link copied!",
  errorLabel: "Failed to copy",
} as const;

describe("ShareButton", () => {
  beforeEach(() => {
    // Default: clipboard available, share unavailable
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "share", {
      value: undefined,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a button with the share icon", () => {
    render(<ShareButton {...DEFAULT_PROPS} />);
    const button = screen.getByRole("button", { name: "Share this block" });
    expect(button).toBeInTheDocument();
  });

  it("uses Web Share API when available", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      writable: true,
      configurable: true,
    });

    render(<ShareButton {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockShare).toHaveBeenCalledWith({
        title: "HDB Resale Explorer",
        text: undefined,
        url: "https://example.com/?town=BEDOK",
      });
    });
  });

  it("falls back to clipboard when Web Share is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<ShareButton {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://example.com/?town=BEDOK");
    });
  });

  it("shows check icon after clipboard copy and reverts", async () => {
    render(<ShareButton {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole("button"));

    // Button briefly shows "copied" state
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Link copied!" })).toBeInTheDocument();
    });

    // After 2+ seconds, reverts to original label
    await waitFor(
      () => {
        expect(screen.getByRole("button", { name: "Share this block" })).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
  });

  it("swallows AbortError from Web Share silently", async () => {
    const abortError = new DOMException("User cancelled", "AbortError");
    const mockShare = vi.fn().mockRejectedValue(abortError);
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      writable: true,
      configurable: true,
    });

    render(<ShareButton {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockShare).toHaveBeenCalled();
    });

    // No error alert shown for user cancel
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("falls back to clipboard when Web Share throws non-AbortError", async () => {
    const mockShare = vi.fn().mockRejectedValue(new Error("Network error"));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<ShareButton {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("https://example.com/?town=BEDOK");
    });
  });

  it("shows error alert when clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("Permission denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    render(<ShareButton {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Failed to copy");
    });
  });

  it("downloads CSV when export button is clicked", async () => {
    const click = vi.fn();
    const createObjectURL = vi.fn(() => "blob:test");
    const revokeObjectURL = vi.fn();
    vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeObjectURL);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
      if (tagName === "a") {
        element.click = click;
      }
      return element as HTMLAnchorElement;
    });

    render(
      <ShareButton
        {...DEFAULT_PROPS}
        csvExport={{
          filename: "test.csv",
          getContent: () => '"Notes"\n"\'=1+1"',
        }}
        exportAriaLabel="Export CSV"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));

    expect(click).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it("invokes onShareBlocked instead of sharing when shareDisabled is true", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    const onShareBlocked = vi.fn();

    render(<ShareButton {...DEFAULT_PROPS} shareDisabled onShareBlocked={onShareBlocked} />);
    fireEvent.click(screen.getByRole("button", { name: "Share this block" }));

    await waitFor(() => {
      expect(onShareBlocked).toHaveBeenCalledTimes(1);
    });
    expect(mockShare).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("accepts optional text prop for Web Share", async () => {
    const mockShare = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: mockShare,
      writable: true,
      configurable: true,
    });

    render(<ShareButton {...DEFAULT_PROPS} text="Check out this HDB block" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(mockShare).toHaveBeenCalledWith({
        title: "HDB Resale Explorer",
        text: "Check out this HDB block",
        url: "https://example.com/?town=BEDOK",
      });
    });
  });
});
