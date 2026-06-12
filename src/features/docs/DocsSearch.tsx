import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Fuse from "fuse.js";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/lib/utils";
import type { Translator } from "@/shared/lib/i18n";
import { buildDocsSearchEntries, type DocsSearchEntry } from "./docsManifest";
import { docsPath, navigate } from "./docsRouter";

const MAX_RESULTS = 8;
const SNIPPET_LENGTH = 90;

type DocsSearchProps = {
  t: Translator;
};

/** Local-only guide search: a Fuse.js index over the bundled markdown sections. */
export function DocsSearch({ t }: DocsSearchProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const fuse = useMemo(
    () =>
      new Fuse(buildDocsSearchEntries(), {
        keys: [
          { name: "heading", weight: 2 },
          { name: "sectionTitle", weight: 1.5 },
          { name: "body", weight: 1 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [],
  );

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed === "") return [];
    return fuse.search(trimmed, { limit: MAX_RESULTS }).map((match) => match.item);
  }, [fuse, query]);

  const isOpen = query.trim() !== "";

  const select = (entry: DocsSearchEntry) => {
    setQuery("");
    setActiveIndex(-1);
    navigate(docsPath(entry.slug));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (results.length === 0 ? -1 : (index + 1) % results.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        results.length === 0 ? -1 : (index - 1 + results.length) % results.length,
      );
    } else if (event.key === "Enter") {
      const entry = results[activeIndex] ?? results[0];
      if (entry) {
        event.preventDefault();
        select(entry);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setQuery("");
      setActiveIndex(-1);
    }
  };

  return (
    <div className="relative w-full max-w-xs">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        type="search"
        role="combobox"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        placeholder={t("docs.searchPlaceholder")}
        aria-label={t("docs.searchLabel")}
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        className="pl-8"
      />
      {isOpen ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={t("docs.searchLabel")}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {results.length === 0 ? (
            <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">
              {t("docs.searchNoResults")}
            </li>
          ) : (
            results.map((entry, index) => (
              <li
                key={`${entry.slug}-${entry.heading}`}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "cursor-pointer rounded-sm px-3 py-2",
                  index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted/60",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(entry);
                }}
              >
                <div className="text-sm font-medium">
                  {entry.sectionTitle}
                  {entry.heading !== entry.sectionTitle ? (
                    <span className="text-muted-foreground"> · {entry.heading}</span>
                  ) : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {entry.body.slice(0, SNIPPET_LENGTH)}
                </div>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
