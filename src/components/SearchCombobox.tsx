import { forwardRef, useCallback, useEffect, useId, useRef, useState } from "react";
import { LocationSearchInput } from "@/components/LocationSearchInput";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { fetchSuggestions } from "@/lib/data";
import type { Translator } from "@/lib/i18n";
import type { Suggestion, SuggestionGroup } from "@/types/data";
import { cn } from "@/lib/utils";

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

export const SearchCombobox = forwardRef<HTMLInputElement, SearchComboboxProps>(function SearchCombobox(
  {
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
  },
  ref,
) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const fetchSequenceRef = useRef(0);
  const debouncedQuery = useDebouncedValue(value, SUGGEST_DEBOUNCE_MS);

  useEffect(() => {
    if (!suggestActive) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      setLoading(false);
      return;
    }

    const trimmed = debouncedQuery.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      setLoading(false);
      return;
    }

    const sequence = ++fetchSequenceRef.current;
    setLoading(true);
    void fetchSuggestions(trimmed)
      .then((next) => {
        if (fetchSequenceRef.current !== sequence) {
          return;
        }
        setSuggestions(next);
        setOpen(next.length > 0);
        setActiveIndex(-1);
      })
      .catch(() => {
        if (fetchSequenceRef.current !== sequence) {
          return;
        }
        setSuggestions([]);
        setOpen(false);
        setActiveIndex(-1);
      })
      .finally(() => {
        if (fetchSequenceRef.current === sequence) {
          setLoading(false);
        }
      });
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

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (!open || suggestions.length === 0) {
        if (event.key === "Escape") {
          setOpen(false);
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => (current + 1) % suggestions.length);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) =>
          current <= 0 ? suggestions.length - 1 : current - 1,
        );
        return;
      }

      if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        const selected = suggestions[activeIndex];
        if (selected) {
          selectSuggestion(selected);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    },
    [activeIndex, suggestions, open, selectSuggestion],
  );

  const grouped = SUGGEST_GROUPS.map((group) => ({
    group,
    items: suggestions.filter((item) => item.group === group),
  })).filter((section) => section.items.length > 0);

  let optionOffset = 0;

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
              if (suggestions.length > 0) {
                setOpen(true);
              }
            }}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
            className={inputClassName}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        className="z-[70] w-[min(24rem,calc(100vw-2rem))] gap-0 rounded-[0.75rem] border border-border/70 bg-popover/98 p-0 shadow-[0_12px_40px_rgba(23,28,31,0.12)] backdrop-blur-xl dark:border-primary/15"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div
          id={listboxId}
          role="listbox"
          aria-label={t("filters.suggestListLabel")}
          className="max-h-64 overflow-y-auto py-1"
          data-testid="search-suggest-listbox"
        >
          {loading && suggestions.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground" role="status">
              {t("filters.suggestLoading")}
            </p>
          ) : null}
          {grouped.map((section) => (
            <div key={section.group} role="presentation">
              <p className="px-3 pb-1 pt-2 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {groupLabel(t, section.group)}
              </p>
              {section.items.map((suggestion) => {
                const index = optionOffset;
                optionOffset += 1;
                const active = index === activeIndex;
                return (
                  <button
                    key={suggestionKey(suggestion)}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-testid={`search-suggest-option-${suggestion.group}`}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-[0.72rem] transition-colors hover:bg-muted/60",
                      active && "bg-primary/10 text-primary",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSuggestion(suggestion)}
                  >
                    <span>{suggestion.label}</span>
                    <span className="text-[0.58rem] font-semibold uppercase tracking-wide text-muted-foreground">
                      {groupLabel(t, suggestion.group)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
});
