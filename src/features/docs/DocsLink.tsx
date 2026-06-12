import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { docsPath, navigate } from "./docsRouter";

type DocsLinkProps = {
  /** Slug of the guide section to open, e.g. "troubleshooting". */
  slug: string;
  children: ReactNode;
  className?: string;
};

/**
 * Contextual link from anywhere in the app into the in-app user guide.
 * Renders a real anchor (middle-click and copy-link work) but intercepts
 * plain left clicks to navigate client-side, preserving the current
 * query-string state for the return trip.
 */
export function DocsLink({ slug, children, className }: DocsLinkProps) {
  const href = docsPath(slug);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className={cn(
        "font-medium text-primary underline underline-offset-2 hover:opacity-80",
        className,
      )}
    >
      {children}
    </a>
  );
}
