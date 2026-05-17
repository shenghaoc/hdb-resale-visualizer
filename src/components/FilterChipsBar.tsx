import { SlidersHorizontal, X } from "lucide-react";
import type { Translator } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
};

export function FilterChipsBar({ chips, isDesktop, t, onOpenFilters }: FilterChipsBarProps) {
  if (chips.length === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label={t("filters.title")}
      className={cn(
        "pointer-events-auto absolute z-25 flex gap-2 overflow-x-auto pb-1 transition-all",
        isDesktop ? "left-6 right-[8rem] top-[5rem]" : "left-0 right-0 top-[3.6rem] px-3",
      )}
      style={{ scrollbarWidth: "none" }}
    >
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          aria-label={t("filters.removeChip", { label: chip.label })}
          onClick={chip.onRemove}
          className="filter-chip flex shrink-0 items-center gap-1 rounded-full border border-foreground/80 bg-foreground px-3 py-1.5 text-[0.65rem] font-semibold leading-none text-background shadow-sm backdrop-blur-[16px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        >
          {chip.label} <X aria-hidden="true" className="size-3 opacity-70" />
        </button>
      ))}
      <button
        type="button"
        onClick={onOpenFilters}
        className="filter-chip flex shrink-0 items-center gap-1 rounded-full border border-border/30 bg-background/90 px-3 py-1.5 text-[0.65rem] font-semibold leading-none text-foreground shadow-sm backdrop-blur-[16px] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
      >
        <SlidersHorizontal className="size-3" aria-hidden="true" /> {t("tab.filters")}
      </button>
    </div>
  );
}
