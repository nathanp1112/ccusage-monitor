'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export interface DailyUsageData {
  date: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  recordCount: number
}

interface UsageHeatMapProps {
  data: DailyUsageData[]
  year: number
  month: number // 0-indexed
  title?: string
  className?: string
  compact?: boolean
}

type MetricType = 'cost' | 'tokens' | 'requests'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Heat map color intensity levels (5 levels)
// Requests: white (0), very light green (1-39), light green (40-100), medium green (100-300), bold green (300-1000), purple (>1000)
const HEAT_COLORS = [
  'bg-muted',
  'bg-emerald-100 dark:bg-emerald-950',
  'bg-emerald-200 dark:bg-emerald-900',
  'bg-emerald-400 dark:bg-emerald-700',
  'bg-emerald-600 dark:bg-emerald-500',
  'bg-purple-600 dark:bg-purple-400',
]

function getHeatLevel(value: number, max: number, metric: MetricType): number {
  if (value === 0) return 0
  if (metric === 'requests') {
    if (value < 40) return 1
    if (value < 100) return 2
    if (value <= 300) return 3
    if (value <= 1000) return 4
    return 5
  }
  // For cost and tokens, use relative scaling
  if (max === 0) return 0
  const ratio = value / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

function formatMetricValue(value: number, metric: MetricType): string {
  switch (metric) {
    case 'cost':
      return `$${value.toFixed(2)}`
    case 'tokens':
      if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
      if (value >= 1000) return `${(value / 1000).toFixed(0)}K`
      return value.toString()
    case 'requests':
      return value.toLocaleString()
  }
}

export function UsageHeatMap({
  data,
  year,
  month,
  title = 'Usage Heat Map',
  className,
  compact = false,
}: UsageHeatMapProps) {
  const [metric, setMetric] = useState<MetricType>('requests')

  // Build calendar grid for the month
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay()

    // Create a map of date -> data
    const dataMap = new Map<string, DailyUsageData>()
    data.forEach((d) => {
      dataMap.set(d.date, d)
    })

    // Calculate max value for heat level scaling
    let maxValue = 0
    data.forEach((d) => {
      const value =
        metric === 'cost'
          ? d.costUsd
          : metric === 'tokens'
            ? d.inputTokens + d.outputTokens
            : d.recordCount
      if (value > maxValue) maxValue = value
    })

    // Build weeks array
    const weeks: Array<Array<{ day: number | null; date: string | null; value: number; heatLevel: number }>> = []
    let currentWeek: Array<{ day: number | null; date: string | null; value: number; heatLevel: number }> = []

    // Fill empty days at start of first week
    for (let i = 0; i < startDayOfWeek; i++) {
      currentWeek.push({ day: null, date: null, value: 0, heatLevel: -1 })
    }

    // Fill in days of month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dayData = dataMap.get(dateStr)

      const value = dayData
        ? metric === 'cost'
          ? dayData.costUsd
          : metric === 'tokens'
            ? dayData.inputTokens + dayData.outputTokens
            : dayData.recordCount
        : 0

      const heatLevel = getHeatLevel(value, maxValue, metric)

      currentWeek.push({ day, date: dateStr, value, heatLevel })

      if (currentWeek.length === 7) {
        weeks.push(currentWeek)
        currentWeek = []
      }
    }

    // Fill empty days at end of last week
    while (currentWeek.length > 0 && currentWeek.length < 7) {
      currentWeek.push({ day: null, date: null, value: 0, heatLevel: -1 })
    }
    if (currentWeek.length > 0) {
      weeks.push(currentWeek)
    }

    return { weeks, maxValue }
  }, [data, year, month, metric])

  const getMetricLabel = () => {
    switch (metric) {
      case 'cost':
        return 'Cost ($)'
      case 'tokens':
        return 'Total Tokens'
      case 'requests':
        return 'Requests'
    }
  }

  return (
    <Card className={className}>
      <CardHeader className={cn(
        'flex flex-row items-center justify-between space-y-0',
        compact ? 'pb-2 pt-0 px-0' : 'pb-2'
      )}>
        <CardTitle className={compact ? 'text-sm' : ''}>{title}</CardTitle>
        <Select value={metric} onValueChange={(v) => setMetric(v as MetricType)}>
          <SelectTrigger className={compact ? 'w-[100px] h-7 text-xs' : 'w-[130px]'}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cost">Cost ($)</SelectItem>
            <SelectItem value="tokens">Tokens</SelectItem>
            <SelectItem value="requests">Requests</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className={compact ? 'p-0' : ''}>
        <TooltipProvider>
          <div className="space-y-2">
            {/* Day labels */}
            <div className={cn(
              'grid grid-cols-7 text-muted-foreground',
              compact ? 'gap-0.5 text-[10px] mb-1' : 'gap-1 text-xs mb-2'
            )}>
              {DAYS_OF_WEEK.map((day) => (
                <div key={day} className={cn('text-center font-medium', compact && 'w-8')}>
                  {compact ? day.charAt(0) : day}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
              {calendarGrid.weeks.map((week, weekIndex) => (
                <div key={weekIndex} className={cn('grid grid-cols-7', compact ? 'gap-0.5' : 'gap-1')}>
                  {week.map((cell, dayIndex) => (
                    <Tooltip key={dayIndex}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            'rounded-sm flex items-center justify-center font-medium transition-colors',
                            compact ? 'w-8 h-8 text-[10px]' : 'aspect-square text-xs',
                            cell.day === null
                              ? 'bg-transparent'
                              : cell.heatLevel === -1
                                ? 'bg-muted'
                                : HEAT_COLORS[cell.heatLevel],
                            cell.heatLevel >= 4 && 'text-white dark:text-black',
                            cell.day !== null && 'cursor-pointer hover:ring-2 hover:ring-ring'
                          )}
                        >
                          {cell.day}
                        </div>
                      </TooltipTrigger>
                      {cell.day !== null && (
                        <TooltipContent>
                          <div className="text-sm">
                            <p className="font-medium">
                              {new Date(cell.date!).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </p>
                            <p className="text-muted-foreground">
                              {getMetricLabel()}: {formatMetricValue(cell.value, metric)}
                            </p>
                          </div>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  ))}
                </div>
              ))}
            </div>

            {/* Legend */}
            {metric === 'requests' ? (
              <div className={cn(
                'flex items-center justify-end gap-1 mt-3 text-muted-foreground',
                compact ? 'text-[10px]' : 'text-xs'
              )}>
                {[
                  { color: HEAT_COLORS[1], label: '<40' },
                  { color: HEAT_COLORS[2], label: '40-100' },
                  { color: HEAT_COLORS[3], label: '100-300' },
                  { color: HEAT_COLORS[4], label: '300-1000' },
                  { color: HEAT_COLORS[5], label: '>1000' },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-0.5">
                    <div className={cn('rounded-sm', color, compact ? 'w-2 h-2' : 'w-3 h-3')} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={cn(
                'flex items-center justify-end gap-1 mt-3 text-muted-foreground',
                compact ? 'text-[10px]' : 'text-xs'
              )}>
                <span>Less</span>
                {HEAT_COLORS.map((color, index) => (
                  <div
                    key={index}
                    className={cn('rounded-sm', color, compact ? 'w-2 h-2' : 'w-3 h-3')}
                  />
                ))}
                <span>More</span>
              </div>
            )}
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  )
}
