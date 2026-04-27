import * as React from "react"
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useI18n } from "@/lib/i18n"
import { formatMonth } from "@/lib/format"

interface MonthPickerProps {
  value: string | null // "YYYY-MM"
  onChange: (value: string | null) => void
  minMonth: string // "YYYY-MM"
  maxMonth: string // "YYYY-MM"
  placeholder?: string
  id?: string
  previousYearLabel?: string
  nextYearLabel?: string
}

export function MonthPicker({ value, onChange, minMonth, maxMonth, placeholder, id, previousYearLabel, nextYearLabel }: MonthPickerProps) {
  const { locale, t } = useI18n()
  const [open, setOpen] = React.useState(false)
  
  // Parse range bounds
  const minYear = parseInt(minMonth.split("-")[0], 10)
  const maxYear = parseInt(maxMonth.split("-")[0], 10)
  
  const [viewYear, setViewYear] = React.useState(() => {
    if (value) return parseInt(value.split("-")[0], 10)
    // Default to the year of the latest available data
    return maxYear
  })

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

  const handleMonthClick = (monthIndex: number) => {
    const monthStr = String(monthIndex + 1).padStart(2, '0')
    const newValue = `${viewYear}-${monthStr}`
    
    // Strict enforcement: do nothing if month is outside range
    if (newValue < minMonth || newValue > maxMonth) {
      return
    }
    
    onChange(newValue)
    setOpen(false)
  }

  const handlePreviousYear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setViewYear(y => Math.max(minYear, y - 1))
  }

  const handleNextYear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setViewYear(y => Math.min(maxYear, y + 1))
  }

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className={cn(
            "group w-full justify-start text-left font-normal bg-background/50 px-3 hover:bg-background transition-all border-border/40",
            !value && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 size-4 text-muted-foreground group-hover:text-primary transition-colors" data-icon="inline-start" />
          <span className="truncate">
            {value ? formatMonth(value, locale) : (placeholder || t("filters.selectMonth", { defaultValue: "Select month" }))}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0 shadow-xl border-border/20 backdrop-blur-xl bg-popover/95" align="start">
        <div className="flex items-center justify-between p-3 border-b border-border/10">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePreviousYear}
            disabled={viewYear <= minYear}
            className="size-8 rounded-full hover:bg-muted"
            aria-label={previousYearLabel || t("filters.previousYear", { defaultValue: "Previous year" })}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <div className="font-bold text-sm tracking-widest uppercase text-foreground/90 select-none">
            {viewYear}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNextYear}
            disabled={viewYear >= maxYear}
            className="size-8 rounded-full hover:bg-muted"
            aria-label={nextYearLabel || t("filters.nextYear", { defaultValue: "Next year" })}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="p-3 grid grid-cols-3 gap-2.5">
          {months.map((monthStr, index) => {
            const currentMonthStr = `${viewYear}-${String(index + 1).padStart(2, '0')}`
            const isDisabled = currentMonthStr < minMonth || currentMonthStr > maxMonth
            const isSelected = value === currentMonthStr

            return (
              <Button
                key={index}
                variant={isSelected ? "default" : "ghost"}
                disabled={isDisabled}
                onClick={() => handleMonthClick(index)}
                className={cn(
                  "h-10 text-[0.7rem] font-bold uppercase tracking-wider w-full rounded-lg transition-all",
                  isSelected 
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90" 
                    : "hover:bg-accent hover:text-accent-foreground text-muted-foreground",
                  isDisabled && "opacity-20 grayscale cursor-not-allowed"
                )}
              >
                {monthStr}
              </Button>
            )
          })}
        </div>
        {value && (
          <div className="p-2 border-t border-border/10 bg-muted/20">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-[0.65rem] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground h-8 transition-colors"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              {t("filters.clearSelection", { defaultValue: "Clear selection" })}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
