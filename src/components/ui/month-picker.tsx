import * as React from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/shared/lib/i18n";
import { formatMonth } from "@/shared/lib/format";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type MonthPickerProps = {
  value: string | null; // "YYYY-MM"
  onChange: (value: string | null) => void;
  minMonth: string; // "YYYY-MM"
  maxMonth: string; // "YYYY-MM"
  placeholder?: string;
  id?: string;
  previousYearLabel?: string;
  nextYearLabel?: string;
};

export function MonthPicker({
  value,
  onChange,
  minMonth,
  maxMonth,
  placeholder,
  id,
  previousYearLabel,
  nextYearLabel,
}: MonthPickerProps) {
  const { locale, t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const monthButtonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  // Parse range bounds
  const minYear = parseInt(minMonth.split("-")[0], 10);
  const maxYear = parseInt(maxMonth.split("-")[0], 10);

  const [viewYear, setViewYear] = React.useState(() => {
    if (value) return parseInt(value.split("-")[0], 10);
    // Default to the year of the latest available data
    return maxYear;
  });

  // Sync viewYear when popover opens so it matches the value, if set
  React.useEffect(() => {
    if (open && value) {
      const year = parseInt(value.split("-")[0], 10);
      if (viewYear !== year) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setViewYear(year);
      }
    }
  }, [open, value, viewYear]);

  const toMonthValue = React.useCallback(
    (monthIndex: number) => `${viewYear}-${String(monthIndex + 1).padStart(2, "0")}`,
    [viewYear],
  );

  const isMonthEnabled = React.useCallback(
    (monthIndex: number) => {
      const monthValue = toMonthValue(monthIndex);
      return monthValue >= minMonth && monthValue <= maxMonth;
    },
    [maxMonth, minMonth, toMonthValue],
  );

  const enabledMonthIndexes = React.useMemo(
    () => MONTHS.map((_, index) => index).filter(isMonthEnabled),
    [isMonthEnabled],
  );

  const selectedMonthIndex = React.useMemo(() => {
    if (!value?.startsWith(`${viewYear}-`)) return -1;

    const monthNumber = Number(value.slice(5));
    const monthIndex = monthNumber - 1;

    if (
      !Number.isInteger(monthNumber) ||
      monthIndex < 0 ||
      monthIndex >= MONTHS.length ||
      !isMonthEnabled(monthIndex)
    ) {
      return -1;
    }

    return monthIndex;
  }, [isMonthEnabled, value, viewYear]);

  const focusableMonthIndex =
    selectedMonthIndex >= 0 ? selectedMonthIndex : (enabledMonthIndexes[0] ?? -1);

  const selectMonth = React.useCallback(
    (monthIndex: number, closeOnSelect: boolean) => {
      const newValue = toMonthValue(monthIndex);

      // Strict enforcement: do nothing if month is outside range
      if (!isMonthEnabled(monthIndex)) {
        return;
      }

      onChange(newValue);
      if (closeOnSelect) {
        setOpen(false);
      }
    },
    [isMonthEnabled, onChange, toMonthValue],
  );

  const handleMonthClick = (monthIndex: number) => {
    selectMonth(monthIndex, true);
  };

  const handleMonthKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    monthIndex: number,
  ) => {
    if (enabledMonthIndexes.length === 0) return;

    const currentPosition = enabledMonthIndexes.indexOf(monthIndex);
    const safePosition = currentPosition >= 0 ? currentPosition : 0;
    let nextMonthIndex: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextMonthIndex = enabledMonthIndexes[(safePosition + 1) % enabledMonthIndexes.length];
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextMonthIndex =
        enabledMonthIndexes[
          (safePosition - 1 + enabledMonthIndexes.length) % enabledMonthIndexes.length
        ];
    } else if (event.key === "Home") {
      nextMonthIndex = enabledMonthIndexes[0];
    } else if (event.key === "End") {
      nextMonthIndex = enabledMonthIndexes[enabledMonthIndexes.length - 1];
    }

    if (nextMonthIndex === null) return;

    event.preventDefault();
    event.stopPropagation();
    monthButtonRefs.current[nextMonthIndex]?.focus();
    selectMonth(nextMonthIndex, false);
  };

  const handlePreviousYear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewYear((y) => Math.max(minYear, y - 1));
  };

  const handleNextYear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewYear((y) => Math.min(maxYear, y + 1));
  };

  const months = MONTHS;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn(
            "group w-full justify-start text-left font-normal bg-background px-3 hover:bg-muted transition-[color,background-color] border-border/40",
            !value && "text-muted-foreground",
          )}
        >
          <CalendarIcon
            className="mr-2 size-4 text-muted-foreground group-hover:text-primary transition-colors"
            data-icon="inline-start"
            aria-hidden="true"
          />
          <span className="truncate">
            {value
              ? formatMonth(value, locale)
              : placeholder || t("filters.selectMonth", { defaultValue: "Select month" })}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[280px] p-0 shadow-sm border-border/20 bg-popover"
        align="start"
        aria-label={t("filters.selectMonth", { defaultValue: "Select month" })}
      >
        <div className="flex items-center justify-between p-3 border-b border-border/10">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handlePreviousYear}
                disabled={viewYear <= minYear}
                className="size-8 rounded-full hover:bg-muted min-h-11 min-w-11 sm:min-h-0 sm:min-w-0"
                aria-label={
                  previousYearLabel || t("filters.previousYear", { defaultValue: "Previous year" })
                }
              >
                <ChevronLeft data-icon className="size-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {previousYearLabel || t("filters.previousYear", { defaultValue: "Previous year" })}
            </TooltipContent>
          </Tooltip>
          <div className="font-bold text-sm tracking-widest uppercase text-foreground/90 select-none">
            {viewYear}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleNextYear}
                disabled={viewYear >= maxYear}
                className="size-8 rounded-full hover:bg-muted min-h-11 min-w-11 sm:min-h-0 sm:min-w-0"
                aria-label={nextYearLabel || t("filters.nextYear", { defaultValue: "Next year" })}
              >
                <ChevronRight data-icon className="size-4" aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {nextYearLabel || t("filters.nextYear", { defaultValue: "Next year" })}
            </TooltipContent>
          </Tooltip>
        </div>
        <div
          className="p-3 grid grid-cols-3 gap-2.5"
          role="radiogroup"
          aria-label={`${t("filters.selectMonth", { defaultValue: "Select month" })} ${viewYear}`}
        >
          {months.map((monthStr, index) => {
            const currentMonthStr = toMonthValue(index);
            const isDisabled = !isMonthEnabled(index);
            const isSelected = value === currentMonthStr;

            return (
              <Button
                type="button"
                key={index}
                ref={(node) => {
                  monthButtonRefs.current[index] = node;
                }}
                variant={isSelected ? "default" : "ghost"}
                disabled={isDisabled}
                onClick={() => handleMonthClick(index)}
                onKeyDown={(event) => handleMonthKeyDown(event, index)}
                role="radio"
                aria-checked={isSelected}
                tabIndex={focusableMonthIndex === index ? 0 : -1}
                className={cn(
                  "h-10 text-[0.75rem] font-bold uppercase tracking-wider w-full rounded-none transition-[color,background-color]",
                  isSelected
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                  isDisabled && "opacity-20 grayscale cursor-not-allowed",
                )}
              >
                {monthStr}
              </Button>
            );
          })}
        </div>
        {value && (
          <div className="p-2 border-t border-border/10 bg-muted/20">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-[0.75rem] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground h-8 transition-colors"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              {t("filters.clearSelection", { defaultValue: "Clear selection" })}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
