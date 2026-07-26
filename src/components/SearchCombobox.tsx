import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { LocationSearchInput } from "@/components/LocationSearchInput";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { fetchSuggestions } from "@/shared/lib/data";
import type { Translator } from "@/shared/lib/i18n";
import type { Suggestion, SuggestionGroup } from "@/types/data";
import { cn } from "@/shared/lib/utils";

const SUGGEST_DEBOUNCE_MS = 200;
const SUGGEST_GROUPS: readonly SuggestionGroup[] = ["town", "street", "block", "mrt", "postal"];

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
  /**
   * Suggestion groups this combobox can act on. Groups outside this list are
   * not rendered — showing a clickable suggestion whose selection handler
   * ignores it makes the control look broken.
   */
  groups?: readonly SuggestionGroup[];
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
  groups,
  placeholder,
  suggestActive = true,
  ref,
}: SearchComboboxProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsQuery, setSuggestionsQuery] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [selectionSuppressed, setSelectionSuppressed] = useState(false);
  const isFocusedRef = useRef(false);
  const selectionSuppressedRef = useRef(false);
  const fetchSequenceRef = useRef(0);
  const blurTimeoutRef = useRef<number | null>(null);
  const debouncedQuery = useDebouncedValue(value, SUGGEST_DEBOUNCE_MS);
  const allowedGroups = useMemo(() => groups ?? SUGGEST_GROUPS, [groups]);
  const allowedGroupSet = useMemo(() => new Set(allowedGroups), [allowedGroups]);

  const immediateQuery = value.trim();
  const requestQuery = debouncedQuery.trim();
  const requestMatchesValue = requestQuery === immediateQuery;
  const canUseRequest =
    suggestActive && requestQuery.length >= 2 && requestMatchesValue && !selectionSuppressed;

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!canUseRequest) {
      return;
    }

    const sequence = ++fetchSequenceRef.current;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- pending indicator for the async fetch this effect performs
    setLoading(true);
    void fetchSuggestions(requestQuery, controller.signal)
      .then((next) => {
        if (fetchSequenceRef.current !== sequence || selectionSuppressedRef.current) {
          return;
        }
        const actionableSuggestions = next.filter((suggestion) =>
          allowedGroupSet.has(suggestion.group),
        );
        setSuggestions(actionableSuggestions);
        setSuggestionsQuery(requestQuery);
        if (isFocusedRef.current) {
          setOpen(actionableSuggestions.length > 0);
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
        setSuggestionsQuery(null);
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
      if (fetchSequenceRef.current === sequence) {
        fetchSequenceRef.current += 1;
      }
    };
  }, [allowedGroupSet, canUseRequest, requestQuery]);

  const selectSuggestion = useCallback(
    (suggestion: Suggestion) => {
      selectionSuppressedRef.current = true;
      fetchSequenceRef.current += 1;
      setSelectionSuppressed(true);
      setOpen(false);
      setSuggestions([]);
      setSuggestionsQuery(null);
      setActiveIndex(-1);
      setLoading(false);
      onSelectSuggestion(suggestion);
    },
    [onSelectSuggestion],
  );

  const handleValueChange = useCallback(
    (nextValue: string) => {
      selectionSuppressedRef.current = false;
      fetchSequenceRef.current += 1;
      setSelectionSuppressed(false);
      setOpen(false);
      setSuggestions([]);
      setSuggestionsQuery(null);
      setActiveIndex(-1);
      setLoading(false);
      onValueChange(nextValue);
    },
    [onValueChange],
  );

  const suggestionsAreCurrent = canUseRequest && suggestionsQuery === requestQuery;
  const grouped = useMemo(() => {
    if (!suggestionsAreCurrent) {
      return [];
    }
    return allowedGroups
      .map((group) => ({
        group,
        items: suggestions.filter((item) => item.group === group),
      }))
      .filter((section) => section.items.length > 0);
  }, [allowedGroups, suggestions, suggestionsAreCurrent]);

  const flatGroupedItems = useMemo(() => {
    return grouped.flatMap((section) => section.items);
  }, [grouped]);
  const popoverOpen = open && flatGroupedItems.length > 0;

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!popoverOpen || flatGroupedItems.length === 0) {
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
    [activeIndex, flatGroupedItems, popoverOpen, selectSuggestion],
  );

  return (
    <Popover
      open={popoverOpen}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen && suggestionsAreCurrent && !selectionSuppressedRef.current);
      }}
    >
      <PopoverAnchor asChild>
        <div className={cn("relative min-w-0 flex-1", className)}>
          <LocationSearchInput
            ref={ref}
            id={id}
            data-testid={dataTestId}
            aria-label={ariaLabel}
            aria-expanded={popoverOpen}
            aria-controls={popoverOpen ? listboxId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={
              popoverOpen && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
            }
            role="combobox"
            placeholder={placeholder ?? t("filters.searchPlaceholder")}
            value={value}
            onValueChange={handleValueChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              isFocusedRef.current = true;
              if (blurTimeoutRef.current !== null) {
                window.clearTimeout(blurTimeoutRef.current);
              }
              if (
                suggestionsAreCurrent &&
                suggestions.length > 0 &&
                !selectionSuppressedRef.current
              ) {
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
                <p className="px-3 pb-1 pt-2 v2-section-title">{groupLabel(t, section.group)}</p>
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
                      <span className="text-[length:var(--text-xs)] font-semibold uppercase tracking-wide text-muted-foreground">
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
