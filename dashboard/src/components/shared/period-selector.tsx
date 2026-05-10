'use client'

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface PeriodSelectorProps {
  /** 4-digit year, e.g. 2026 */
  year: number
  /** 1-indexed month, 1-12 */
  month: number
  onYearChange: (year: number) => void
  onMonthChange: (month: number) => void
  /** Earliest year to show (default 2024 — matches BE floor). */
  minYear?: number
  className?: string
}

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * Year + month picker (button rows). Disables future months in the current year
 * to match the BE validation `year === currentYear && month > currentMonth → 400`.
 */
export function PeriodSelector({
  year,
  month,
  onYearChange,
  onMonthChange,
  minYear = 2024,
  className,
}: PeriodSelectorProps) {
  const now = useMemo(() => new Date(), [])
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const years = useMemo(() => {
    const out: number[] = []
    for (let y = minYear; y <= currentYear; y++) out.push(y)
    return out
  }, [minYear, currentYear])

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <span className="w-12 text-sm text-muted-foreground">Year:</span>
        <div className="flex flex-wrap gap-1">
          {years.map((y) => (
            <Button
              key={y}
              variant={year === y ? 'default' : 'outline'}
              size="sm"
              onClick={() => onYearChange(y)}
              className="min-w-[60px]"
            >
              {y}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-12 text-sm text-muted-foreground">Month:</span>
        <div className="flex flex-wrap gap-1">
          {SHORT_MONTHS.map((label, idx) => {
            const m = idx + 1
            const isFuture = year === currentYear && m > currentMonth
            return (
              <Button
                key={m}
                variant={month === m ? 'default' : 'outline'}
                size="sm"
                onClick={() => onMonthChange(m)}
                disabled={isFuture}
                className={cn(
                  'min-w-[44px]',
                  month === m && 'font-semibold'
                )}
              >
                {label}
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
