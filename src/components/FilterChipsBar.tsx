import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, SlidersHorizontal, X } from "lucide-react";
import type { Translator } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export type FilterChip = {
  key: string;
  label: string;
  onRemove: () => void;
};

type FilterChipsBarProps = {
  chips: FilterChip[];
  isDesktop: boolean;
  t: Translator;
  onOpenFilters: () => void;
  onShare?: () => Promise<"shared" | "copied" | null>;
  hidden?: boolean;
};

const chipFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

const chipLayoutClass =
  "filter-chip flex shrink-0 items-center justify-center gap-1 rounded-full px-3 py-1.5 text-[0.65rem] font-semibold leading-none shadow-sm backdrop-blur-[16px] transition-all min-h-11 min-w-11 sm:min-h-min sm:min-w-min text-box-trim";

export function FilterChipsBar({
  chips,
  isDesktop,
  t,
  onOpenFilters,
  onShare,
  hidden,
}: FilterChipsBarProps) {
  const itemCount = chips.length + (onShare ? 2 : 1);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.min(focusedIndex, itemCount - 1);
  const [shareCopied, setShareCopied] = useState(false);
  const shareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (shareTimeoutRef.current) {
        clearTimeout(shareTimeoutRef.current);
      }
    };
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent, index: number) => {
    const items = itemRefs.current.filter((button): button is HTMLButtonElement => button !== null);
    if (items.length === 0) return;

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % items.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + items.length) % items.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      setFocusedIndex(nextIndex);
      items[nextIndex]?.focus();
    }
  }, []);

  if (chips.length === 0) return null;

  const handleShareClick = async () => {
    if (!onShare) return;
    const result = await onShare();
    if (result !== "copied") return;
    if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
    setShareCopied(true);
    shareTimeoutRef.current = setTimeout(() => setShareCopied(false), 2000);
  };

  const shareButtonIndex = chips.length;
  const filtersButtonIndex = chips.length + (onShare ? 1 : 0);

  return (
    <div
      role="toolbar"
      aria-label={t("filters.title")}
      className={cn(
        "absolute z-25 flex gap-2 overflow-x-auto pb-1 transition-all",
        hidden ? "invisible opacity-0 pointer-events-none" : "pointer-events-auto",
        isDesktop ? "left-6 right-[8rem] top-[5rem]" : "left-0 right-[4.25rem] top-[3.6rem] px-3",
      )}
      style={{ scrollbarWidth: "none" }}
    >
      {chips.map((chip, index) => (
        <button
          key={chip.key}
          ref={(node) => {
            itemRefs.current[index] = node;
          }}
          type="button"
          aria-label={t("filters.removeChip", { label: chip.label })}
          tabIndex={activeIndex === index ? 0 : -1}
          onClick={chip.onRemove}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onFocus={() => setFocusedIndex(index)}
          className={cn(
            chipLayoutClass,
            "border border-foreground/80 bg-foreground text-background",
            chipFocusClass,
          )}
        >
          {chip.label} <X aria-hidden="true" className="size-3 opacity-70" />
        </button>
      ))}
      {onShare && (
        <button
          ref={(node) => {
            itemRefs.current[shareButtonIndex] = node;
          }}
          type="button"
          aria-label={shareCopied ? t("share.linkCopied") : t("share.filterResults")}
          tabIndex={activeIndex === shareButtonIndex ? 0 : -1}
          onClick={() => void handleShareClick()}
          onKeyDown={(event) => handleKeyDown(event, shareButtonIndex)}
          onFocus={() => setFocusedIndex(shareButtonIndex)}
          className={cn(
            chipLayoutClass,
            "border border-border/30 bg-background/90 text-foreground",
            chipFocusClass,
          )}
        >
          <Link2 data-icon className="size-3.5" aria-hidden="true" />
        </button>
      )}
      <button
        ref={(node) => {
          itemRefs.current[filtersButtonIndex] = node;
        }}
        type="button"
        aria-label={t("filters.openPanel")}
        tabIndex={activeIndex === filtersButtonIndex ? 0 : -1}
        onClick={onOpenFilters}
        onKeyDown={(event) => handleKeyDown(event, filtersButtonIndex)}
        onFocus={() => setFocusedIndex(filtersButtonIndex)}
        className={cn(
          chipLayoutClass,
          "border border-border/30 bg-background/90 text-foreground",
          chipFocusClass,
        )}
      >
        <SlidersHorizontal className="size-3" aria-hidden="true" /> {t("tab.filters")}
      </button>
    </div>
  );
}
