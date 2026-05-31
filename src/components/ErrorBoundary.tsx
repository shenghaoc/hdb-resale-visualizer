import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const ERROR_BOUNDARY_FALLBACK_TEXT = "Something went wrong";
export const ERROR_BOUNDARY_ACTION_TEXT = "Reload";

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
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  private handleRecovery = (): void => {
    this.props.onReset?.();

    const { reloadOnRecovery = true } = this.props;
    if (reloadOnRecovery) {
      window.location.reload();
    } else {
      this.setState({ hasError: false });
    }
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
