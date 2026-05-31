import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ERROR_BOUNDARY_FALLBACK_TEXT,
  ErrorBoundary,
} from "@/components/ErrorBoundary";

function ThrowingChild(): never {
  throw new Error("render boom");
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <p>Healthy child</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("Healthy child")).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary-fallback")).not.toBeInTheDocument();
  });

  it("shows the recovery fallback when a child throws during render", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(ERROR_BOUNDARY_FALLBACK_TEXT);
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it("reloads the page when Reload is clicked", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });
});
