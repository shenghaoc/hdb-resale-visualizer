import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  ERROR_BOUNDARY_ACTION_TEXT,
  ERROR_BOUNDARY_FALLBACK_TEXT,
  ErrorBoundary,
  MAX_LOCAL_RECOVERY_ATTEMPTS,
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
    expect(screen.getByRole("button", { name: ERROR_BOUNDARY_ACTION_TEXT })).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it("reloads the page when recovery defaults to reload (root boundary)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });

    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole("button", { name: ERROR_BOUNDARY_ACTION_TEXT }));
    expect(reload).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("recovers the failed subtree locally without reloading when reloadOnRecovery is false", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });

    // Throws on first render, succeeds once the underlying condition clears.
    let shouldThrow = true;
    function Flaky() {
      if (shouldThrow) throw new Error("render boom");
      return <p>Recovered child</p>;
    }

    const user = userEvent.setup();
    render(
      <ErrorBoundary reloadOnRecovery={false} actionText="Retry">
        <Flaky />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(screen.getByText("Recovered child")).toBeInTheDocument();
    expect(screen.queryByTestId("error-boundary-fallback")).not.toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();

    consoleError.mockRestore();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("falls back to a full reload once local recovery is exhausted", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { reload },
    });

    const user = userEvent.setup();
    render(
      <ErrorBoundary reloadOnRecovery={false} actionText="Retry">
        <ThrowingChild />
      </ErrorBoundary>,
    );

    // The child throws on every render, so each retry returns to the error state
    // without reloading — up to MAX_LOCAL_RECOVERY_ATTEMPTS times.
    for (let attempt = 0; attempt < MAX_LOCAL_RECOVERY_ATTEMPTS; attempt += 1) {
      await user.click(screen.getByRole("button", { name: "Retry" }));
      expect(reload).not.toHaveBeenCalled();
      expect(screen.getByTestId("error-boundary-fallback")).toBeInTheDocument();
    }

    // Once exhausted, the button stops being a silent no-op and reloads the page.
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(reload).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("renders custom fallback and action text", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallbackText="The map failed to load." actionText="Retry">
        <ThrowingChild />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("The map failed to load.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    consoleError.mockRestore();
  });

  it("invokes onError with the caught error", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowingChild />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0]).toHaveProperty("message", "render boom");

    consoleError.mockRestore();
  });

  it("invokes onReset when recovery is triggered", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const onReset = vi.fn();

    const user = userEvent.setup();
    render(
      <ErrorBoundary reloadOnRecovery={false} onReset={onReset} actionText="Retry">
        <ThrowingChild />
      </ErrorBoundary>,
    );

    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onReset).toHaveBeenCalledTimes(1);

    consoleError.mockRestore();
  });
});
