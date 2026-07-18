import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { LocationSearchInput } from "@/components/LocationSearchInput";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { fetchSuggestions } from "@/shared/lib/data";
import type { Translator } from "@/shared/lib/i18n";
import type { Suggestion, SuggestionGroup } from "@/types/data";
import { cn } from "@/shared/lib/utils";

const SUGGEST_DEBOUNCE_MS = 200;
const SUGGEST_GROUPS: SuggestionGroup[] = ["town", "street", "block", "mrt", "postal"];

type SearchComboboxProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSelectSuggestion: (suggestion: Suggestion) => void;
  t: Translator;
  className?: string;
  inputClassName?: string;
  id?: string;
  "data-testid"?: string;
  "aria-label"?: string;
  placeholder?: string;
  /** When false, skips suggest fetch (e.g. hidden duplicate header inputs on mobile). */
  suggestActive?: boolean;
  ref?: React.Ref<HTMLInputElement>;
};

function groupLabel(t: Translator, group: SuggestionGroup): string {
  switch (group) {
    case "town":
      return t("filters.suggestGroup.town");
    case "street":
      return t("filters.suggestGroup.street");
    case "block":
      return t("filters.suggestGroup.block");
    case "mrt":
      return t("filters.suggestGroup.mrt");
    case "postal":
      return t("filters.suggestGroup.postal");
  }
}

function suggestionKey(suggestion: Suggestion): string {
  switch (suggestion.group) {
    case "town":
      return `town:${suggestion.town}`;
    case "street":
      return `street:${suggestion.search}`;
    case "block":
      return `block:${suggestion.addressKey}`;
    case "mrt":
      return `mrt:${suggestion.stationName}`;
    case "postal":
      return `postal:${suggestion.search}`;
  }
}

export function SearchCombobox({
  value,
  onValueChange,
  onSelectSuggestion,
  t,
  className,
  inputClassName,
  id,
  "data-testid": dataTestId,
  "aria-label": ariaLabel,
  placeholder,
  suggestActive = true,
  ref,
}: SearchComboboxProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const isFocusedRef = useRef(false);
  const fetchSequenceRef = useRef(0);
  const blurTimeoutRef = useRef<number | null>(null);
  const debouncedQuery = useDebouncedValue(value, SUGGEST_DEBOUNCE_MS);

  // When suggest is off or the query is too short there are no results to show.
  // Clear any stale state during render (guarded so it only runs when something
  // is actually set) instead of in an effect — React re-renders before paint,
  // which avoids the extra commit/flicker a post-paint effect reset causes.
  // See react.dev "You Might Not Need an Effect" → adjusting state on prop change.
  const trimmedQuery = debouncedQuery.trim();
  if (
    (!suggestActive || trimmedQuery.length < 2) &&
    (suggestions.length > 0 || open || activeIndex !== -1 || loading)
  ) {
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
    setLoading(false);
  }

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const trimmed = debouncedQuery.trim();
    // Stale state is cleared during render above; here we only fetch.
    if (!suggestActive || trimmed.length < 2) {
      return;
    }

    const sequence = ++fetchSequenceRef.current;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pending indicator for the async fetch this effect performs
    setLoading(true);
    void fetchSuggestions(trimmed, controller.signal)
      .then((next) => {
        if (fetchSequenceRef.current !== sequence) {
          return;
        }
        setSuggestions(next);
        if (isFocusedRef.current) {
          setOpen(next.length > 0);
        }
        setActiveIndex(-1);
      })
      .catch((error: unknown) => {
        if (
          (error instanceof DOMException && error.name === "AbortError") ||
          fetchSequenceRef.current !== sequence
        ) {
          return;
        }
        console.error("Suggest fetch failed:", error);
        setSuggestions([]);
        setOpen(false);
        setActiveIndex(-1);
      })
      .finally(() => {
        if (fetchSequenceRef.current === sequence) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [debouncedQuery, suggestActive]);

  const selectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      onSelectSuggestion(suggestion);
      setOpen(false);
      setSuggestions([]);
      setActiveIndex(-1);
    },
    [onSelectSuggestion],
  );

  const grouped = useMemo(() => {
    return SUGGEST_GROUPS.map((group) => ({
      group,
      items: suggestions.filter((item) => item.group === group),
    })).filter((section) => section.items.length > 0);
  }, [suggestions]);

  const flatGroupedItems = useMemo(() => {
    return grouped.flatMap((section) => section.items);
  }, [grouped]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open || flatGroupedItems.length === 0) {
        if (event.key === "Escape") {
          setOpen(false);
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % flatGroupedItems.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => (current <= 0 ? flatGroupedItems.length - 1 : current - 1));
        return;
      }

      if (event.key === "Enter") {
        if (activeIndex >= 0) {
          event.preventDefault();
          const selected = flatGroupedItems[activeIndex];
          if (selected) {
            selectSuggestion(selected);
          }
        } else {
          setOpen(false);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    },
    [activeIndex, flatGroupedItems, open, selectSuggestion],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className={cn("relative min-w-0 flex-1", className)}>
          <LocationSearchInput
            ref={ref}
            id={id}
            data-testid={dataTestId}
            aria-label={ariaLabel}
            aria-expanded={open}
            aria-controls={open ? listboxId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
            }
            role="combobox"
            placeholder={placeholder ?? t("filters.searchPlaceholder")}
            value={value}
            onValueChange={onValueChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              isFocusedRef.current = true;
              if (blurTimeoutRef.current !== null) {
                window.clearTimeout(blurTimeoutRef.current);
              }
              if (suggestions.length > 0) {
                setOpen(true);
              }
            }}
            onBlur={() => {
              isFocusedRef.current = false;
              blurTimeoutRef.current = window.setTimeout(() => setOpen(false), 120);
            }}
            className={inputClassName}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        className="z-[70] w-[min(24rem,calc(100vw-2rem))] gap-0 border bg-popover p-0 shadow-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {loading && suggestions.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground" role="status">
            {t("filters.suggestLoading")}
          </p>
        ) : (
          <div
            id={listboxId}
            role="listbox"
            aria-label={t("filters.suggestListLabel")}
            className="max-h-64 overflow-y-auto py-1"
            data-testid="search-suggest-listbox"
          >
            {grouped.map((section) => (
              <div key={section.group} role="presentation">
                <p className="px-3 pb-1 pt-2 text-[var(--text-xs)] font-bold uppercase tracking-[var(--tracking-label)] text-muted-foreground">
                  {groupLabel(t, section.group)}
                </p>
                {section.items.map((suggestion) => {
                  const index = flatGroupedItems.indexOf(suggestion);
                  const active = index === activeIndex;
                  return (
                    <button
                      key={suggestionKey(suggestion)}
                      id={`${listboxId}-option-${index}`}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={active}
                      data-testid={`search-suggest-option-${suggestion.group}`}
                      className={cn(
                        "flex w-full items-center justify-between px-3 py-2 text-left text-[0.75rem] transition-colors hover:bg-muted/60",
                        active && "bg-primary/10 text-primary",
                      )}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectSuggestion(suggestion)}
                    >
                      <span>{suggestion.label}</span>
                      <span className="text-[var(--text-xs)] font-semibold uppercase tracking-wide text-muted-foreground">
                        {groupLabel(t, suggestion.group)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
