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
}

export function MonthPicker({ value, onChange, minMonth, maxMonth, placeholder, id }: MonthPickerProps) {
  const { locale, t } = useI18n()
  const [open, setOpen] = React.useState(false)
  
  // Set initial viewYear to the selected year, or maxYear if none is selected
  const minYear = parseInt(minMonth.split("-")[0], 10)
  const maxYear = parseInt(maxMonth.split("-")[0], 10)
  
  const [viewYear, setViewYear] = React.useState(() => {
    if (value) return parseInt(value.split("-")[0], 10)
    return maxYear
  })

  // Sync viewYear when popover opens so it matches the value, unless value is null
  React.useEffect(() => {
    if (open && value) {
      setViewYear(parseInt(value.split("-")[0], 10))
    }
  }, [open, value])

  const handleMonthClick = (monthIndex: number) => {
    const newMonth = String(monthIndex + 1).padStart(2, '0')
    const newValue = `${viewYear}-${newMonth}`
    onChange(newValue)
    setOpen(false)
  }

  const handlePreviousYear = () => {
    setViewYear(y => Math.max(minYear, y - 1))
  }

  const handleNextYear = () => {
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
            "w-full justify-start text-left font-normal bg-background px-3",
            !value && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 size-4" data-icon="inline-start" />
          {value ? formatMonth(value, locale) : (placeholder || t("filters.selectMonth", { defaultValue: "Select month" }))}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/50">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handlePreviousYear}
            disabled={viewYear <= minYear}
            className="hover:bg-muted"
          >
            <ChevronLeft />
          </Button>
          <div className="font-semibold text-sm select-none">{viewYear}</div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleNextYear}
            disabled={viewYear >= maxYear}
            className="hover:bg-muted"
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {months.map((monthStr, index) => {
            const currentMonthStr = `${viewYear}-${String(index + 1).padStart(2, '0')}`
            const isDisabled = currentMonthStr < minMonth || currentMonthStr > maxMonth
            const isSelected = value === currentMonthStr

            return (
              <Button
                key={index}
                variant={isSelected ? "default" : "ghost"}
                size="sm"
                disabled={isDisabled}
                onClick={() => handleMonthClick(index)}
                className={cn(
                  "h-8 px-0 text-xs font-medium w-full rounded-md transition-colors",
                  isSelected ? "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground" : "hover:bg-muted"
                )}
              >
                {monthStr}
              </Button>
            )
          })}
        </div>
        {value && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground hover:text-foreground h-8"
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
