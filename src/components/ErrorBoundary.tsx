import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { reportBoundaryError } from "@/lib/errorReporter";
import { cn } from "@/lib/utils";

export const ERROR_BOUNDARY_FALLBACK_TEXT = "Something went wrong";
export const ERROR_BOUNDARY_ACTION_TEXT = "Reload";

/**
 * Number of in-place recovery attempts allowed before a boundary with
 * `reloadOnRecovery={false}` gives up and falls back to a full page reload. This
 * keeps the recovery button from becoming a silent no-op when a child throws on
 * every render (a persistent, non-transient error).
 */
export const MAX_LOCAL_RECOVERY_ATTEMPTS = 3;

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Fill the parent box (map pane, chart card). */
  fill?: boolean;
  className?: string;
  /** Localized message shown in the fallback. Defaults to {@link ERROR_BOUNDARY_FALLBACK_TEXT}. */
  fallbackText?: string;
  /** Localized label for the recovery button. Defaults to {@link ERROR_BOUNDARY_ACTION_TEXT}. */
  actionText?: string;
  /** Invoked when a render error is caught, e.g. for production error reporting. */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Invoked when the user triggers recovery, before the reload/reset runs. */
  onReset?: () => void;
  /**
   * When `true` (default), recovery reloads the whole page — appropriate for the
   * root boundary. Nested boundaries should set this to `false` so recovery only
   * re-renders the failed subtree, preserving the rest of the app's state.
   */
  reloadOnRecovery?: boolean;
};

type ErrorBoundaryState = {
  hasError: boolean;
  recoveryAttempts: number;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, recoveryAttempts: 0 };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportBoundaryError(error, info);
    this.props.onError?.(error, info);
  }

  componentDidUpdate(_prevProps: ErrorBoundaryProps, prevState: ErrorBoundaryState): void {
    // The subtree recovered (errored → rendered children without re-throwing):
    // restore the full local-retry budget so a later, unrelated error isn't
    // shortchanged by attempts spent on the previous one.
    if (prevState.hasError && !this.state.hasError && this.state.recoveryAttempts > 0) {
      this.setState({ recoveryAttempts: 0 });
    }
  }

  private handleRecovery = (): void => {
    this.props.onReset?.();

    const { reloadOnRecovery = true } = this.props;
    const localRecoveryExhausted = this.state.recoveryAttempts >= MAX_LOCAL_RECOVERY_ATTEMPTS;
    if (reloadOnRecovery || localRecoveryExhausted) {
      window.location.reload();
      return;
    }

    this.setState((prev) => ({ hasError: false, recoveryAttempts: prev.recoveryAttempts + 1 }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const { fallbackText, actionText, fill, className } = this.props;
      return (
        <div
          role="alert"
          data-testid="error-boundary-fallback"
          className={cn(
            "flex flex-col items-center justify-center gap-4 bg-background p-6 text-center",
            fill && "size-full min-h-48",
            className,
          )}
        >
          <p className="text-sm font-medium text-foreground">
            {fallbackText ?? ERROR_BOUNDARY_FALLBACK_TEXT}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={this.handleRecovery}>
            {actionText ?? ERROR_BOUNDARY_ACTION_TEXT}
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
