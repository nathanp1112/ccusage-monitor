'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface MonthSelectorProps {
  year: number
  selectedMonth: number
  onMonthChange: (month: number) => void
  onYearChange: (year: number) => void
  className?: string
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function MonthSelector({
  year,
  selectedMonth,
  onMonthChange,
  onYearChange,
  className,
}: MonthSelectorProps) {
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth()

  const isMonthDisabled = (monthIndex: number) => {
    if (year > currentYear) return true
    if (year === currentYear && monthIndex > currentMonth) return true
    return false
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Year selector */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onYearChange(year - 1)}
          disabled={year <= 2024}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">{year}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onYearChange(year + 1)}
          disabled={year >= currentYear}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Month grid */}
      <div className="grid grid-cols-4 gap-1">
        {MONTHS.map((month, index) => {
          const isSelected = index === selectedMonth
          const isDisabled = isMonthDisabled(index)

          return (
            <Button
              key={month}
              variant={isSelected ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'h-8 text-xs',
                isDisabled && 'opacity-50 cursor-not-allowed'
              )}
              onClick={() => !isDisabled && onMonthChange(index)}
              disabled={isDisabled}
            >
              {month}
            </Button>
          )
        })}
      </div>
    </div>
  )
}
