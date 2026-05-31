import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const ERROR_BOUNDARY_FALLBACK_TEXT = "Something went wrong — Reload";

type ErrorBoundaryProps = {
  children: ReactNode;
  /** Fill the parent box (map pane, chart card). */
  fill?: boolean;
  className?: string;
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
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          data-testid="error-boundary-fallback"
          className={cn(
            "flex flex-col items-center justify-center gap-4 bg-background p-6 text-center",
            this.props.fill && "size-full min-h-48",
            this.props.className,
          )}
        >
          <p className="text-sm font-medium text-foreground">{ERROR_BOUNDARY_FALLBACK_TEXT}</p>
          <Button type="button" variant="outline" size="sm" onClick={this.handleReload}>
            Reload
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
