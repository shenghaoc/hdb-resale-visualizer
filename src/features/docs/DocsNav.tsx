import type { MouseEvent } from "react";
import { cn } from "@/shared/lib/utils";
import type { DocsSection } from "./docsManifest";
import { docsPath, navigate } from "./docsRouter";

type DocsNavProps = {
  sections: DocsSection[];
  activeSlug: string;
  navLabel: string;
};

export function DocsNav({ sections, activeSlug, navLabel }: DocsNavProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(href);
  };

  return (
    <nav aria-label={navLabel} className="min-w-0">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {sections.map((section) => {
          const isActive = section.slug === activeSlug;
          const href = docsPath(section.slug);
          return (
            <li key={section.slug} className="shrink-0">
              <a
                href={href}
                aria-current={isActive ? "page" : undefined}
                onClick={(event) => handleClick(event, href)}
                className={cn(
                  "block whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isActive
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {section.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
