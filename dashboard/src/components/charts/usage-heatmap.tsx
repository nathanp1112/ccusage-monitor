'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatCurrency } from '@/lib/utils'

interface DailyData {
  date: string
  costUsd: number
  inputTokens?: number
  outputTokens?: number
}

interface UsageHeatmapProps {
  data: DailyData[]
  title?: string
  months?: number // Number of months to show (default 12)
}

interface DayCell {
  date: Date
  dateStr: string
  value: number
  level: 0 | 1 | 2 | 3 | 4
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function getLevel(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value === 0) return 0
  if (max === 0) return 0
  const ratio = value / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

const levelColors = {
  0: 'bg-muted',
  1: 'bg-emerald-200 dark:bg-emerald-900',
  2: 'bg-emerald-300 dark:bg-emerald-700',
  3: 'bg-emerald-500 dark:bg-emerald-500',
  4: 'bg-emerald-700 dark:bg-emerald-300',
}

export function UsageHeatmap({ data, title = 'Usage Activity', months = 12 }: UsageHeatmapProps) {
  const { weeks, monthLabels, totalCost } = useMemo(() => {
    // Create a map of date -> value
    const valueMap = new Map<string, number>()
    let total = 0
    let max = 0

    data.forEach((d) => {
      valueMap.set(d.date, d.costUsd)
      total += d.costUsd
      if (d.costUsd > max) max = d.costUsd
    })

    // Generate weeks for the last N months
    const today = new Date()
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + (6 - endDate.getDay())) // End on Saturday

    const startDate = new Date(today)
    startDate.setMonth(startDate.getMonth() - months)
    startDate.setDate(startDate.getDate() - startDate.getDay()) // Start on Sunday

    const weeks: DayCell[][] = []
    const monthLabels: { month: string; weekIndex: number }[] = []
    let currentWeek: DayCell[] = []
    let lastMonth = -1

    const current = new Date(startDate)
    let weekIndex = 0

    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0]
      const value = valueMap.get(dateStr) || 0

      // Track month labels
      if (current.getMonth() !== lastMonth) {
        monthLabels.push({ month: MONTHS[current.getMonth()], weekIndex })
        lastMonth = current.getMonth()
      }

      currentWeek.push({
        date: new Date(current),
        dateStr,
        value,
        level: getLevel(value, max),
      })

      if (current.getDay() === 6) {
        weeks.push(currentWeek)
        currentWeek = []
        weekIndex++
      }

      current.setDate(current.getDate() + 1)
    }

    if (currentWeek.length > 0) {
      weeks.push(currentWeek)
    }

    return { weeks, monthLabels, totalCost: total, maxValue: max }
  }, [data, months])

  const activeDays = data.filter((d) => d.costUsd > 0).length

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <span className="text-sm text-muted-foreground">
            {formatCurrency(totalCost)} total · {activeDays} active days
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          {/* Month labels */}
          <div className="flex text-xs text-muted-foreground mb-1 ml-8">
            {monthLabels.map((label, i) => {
              const nextLabel = monthLabels[i + 1]
              const width = nextLabel
                ? (nextLabel.weekIndex - label.weekIndex) * 12
                : (weeks.length - label.weekIndex) * 12
              return (
                <div
                  key={`${label.month}-${label.weekIndex}`}
                  style={{ width: `${width}px`, minWidth: `${width}px` }}
                >
                  {label.month}
                </div>
              )
            })}
          </div>

          {/* Heatmap grid */}
          <div className="flex">
            {/* Day labels */}
            <div className="flex flex-col text-xs text-muted-foreground mr-1 gap-[2px]">
              {DAYS.map((day, i) => (
                <div
                  key={day}
                  className="h-[10px] flex items-center"
                  style={{ visibility: i % 2 === 1 ? 'visible' : 'hidden' }}
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Weeks grid */}
            <div className="flex gap-[2px]">
              <TooltipProvider delayDuration={100}>
                {weeks.map((week, weekIdx) => (
                  <div key={weekIdx} className="flex flex-col gap-[2px]">
                    {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
                      const cell = week.find((c) => c.date.getDay() === dayIdx)
                      if (!cell) {
                        return (
                          <div
                            key={dayIdx}
                            className="w-[10px] h-[10px] rounded-sm bg-transparent"
                          />
                        )
                      }
                      return (
                        <Tooltip key={dayIdx}>
                          <TooltipTrigger asChild>
                            <div
                              className={`w-[10px] h-[10px] rounded-sm cursor-pointer transition-colors hover:ring-1 hover:ring-foreground/20 ${levelColors[cell.level]}`}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs">
                            <p className="font-medium">
                              {formatCurrency(cell.value)}
                            </p>
                            <p className="text-muted-foreground">
                              {cell.date.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}
                  </div>
                ))}
              </TooltipProvider>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-end mt-2 gap-1 text-xs text-muted-foreground">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className={`w-[10px] h-[10px] rounded-sm ${levelColors[level as 0 | 1 | 2 | 3 | 4]}`}
              />
            ))}
            <span>More</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
