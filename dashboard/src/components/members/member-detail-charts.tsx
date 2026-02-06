'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { UsageTrendChart } from '@/components/charts/usage-trend-chart'
import { ModelDistributionChart } from '@/components/charts/model-distribution-chart'
import { DailyModelUsageChart, type DailyModelData } from '@/components/charts/daily-model-usage-chart'
import { UsageHeatMap, type DailyUsageData } from '@/components/charts/usage-heat-map'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { formatCurrency, formatTokens } from '@/lib/utils'
import { apiClient } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

interface MemberDetailChartsProps {
  memberId: string
}

// Monthly data structure within yearly response
interface MonthlyData {
  totals: {
    costUsd: number
    inputTokens: number
    outputTokens: number
    recordCount: number
  }
  dailyUsage: Array<{
    date: string
    costUsd: number
    inputTokens: number
    outputTokens: number
    recordCount: number
  }>
  dailyModelUsage: Array<{
    date: string
    models: Array<{
      model: string
      inputTokens: number
      outputTokens: number
      costUsd: number
    }>
  }>
  modelBreakdown: Array<{
    model: string
    costUsd: number
    percentage: number
  }>
}

// Lambda API response format - yearly structure with months
interface LambdaMemberDetailResponse {
  success: boolean
  data: {
    generatedAt: string
    member: {
      id: string
      name: string
      email: string
      role: string
      isActive: boolean
    }
    year: number
    months: Record<string, MonthlyData> // "1", "2", ... "12"
    recentSyncs: Array<{
      id: string
      syncedAt: string
      recordCount: number
      hostname: string
    }>
  }
}

// Short month names for button display
const months = [
  { value: 0, label: 'Jan' },
  { value: 1, label: 'Feb' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Apr' },
  { value: 4, label: 'May' },
  { value: 5, label: 'Jun' },
  { value: 6, label: 'Jul' },
  { value: 7, label: 'Aug' },
  { value: 8, label: 'Sep' },
  { value: 9, label: 'Oct' },
  { value: 10, label: 'Nov' },
  { value: 11, label: 'Dec' },
]

// Generate years from 2024 to current year
const currentYear = new Date().getFullYear()
const years = Array.from({ length: currentYear - 2023 }, (_, i) => 2024 + i)

export function MemberDetailCharts({ memberId }: MemberDetailChartsProps) {
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.members.yearlyRaw(memberId, selectedYear),
    queryFn: async () => {
      const response = await apiClient.get<LambdaMemberDetailResponse>(
        `/api/members/${memberId}`,
        {
          params: { year: selectedYear },
        }
      )
      return response.data
    },
    enabled: !!memberId,
  })

  // Get current month's data from yearly response
  const currentMonthData = useMemo(() => {
    const monthKey = String(selectedMonth + 1) // Convert 0-indexed to 1-indexed string
    return data?.months?.[monthKey] || null
  }, [data?.months, selectedMonth])

  // Transform daily data for trend chart (from Lambda format)
  const trendData = useMemo(() => {
    if (!currentMonthData?.dailyUsage) return []
    return currentMonthData.dailyUsage.map((d) => ({
      date: d.date,
      costUsd: d.costUsd,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
    }))
  }, [currentMonthData?.dailyUsage])

  // Use pre-computed totals from Lambda (instead of calculating from daily data)
  const monthTotals = useMemo(() => {
    if (!currentMonthData?.totals) {
      return {
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        recordCount: 0,
      }
    }
    return currentMonthData.totals
  }, [currentMonthData?.totals])

  // Use pre-computed model breakdown from Lambda (sorted by cost)
  const modelData = useMemo(() => {
    if (!currentMonthData?.modelBreakdown) return []
    return currentMonthData.modelBreakdown
      .map((mb) => ({
        model: mb.model,
        costUsd: mb.costUsd,
        percentage: mb.percentage,
      }))
      .sort((a, b) => b.costUsd - a.costUsd)
  }, [currentMonthData?.modelBreakdown])

  // Daily model usage for stacked bar chart (from API)
  const dailyModelUsage = useMemo((): DailyModelData[] => {
    if (!currentMonthData?.dailyModelUsage) return []
    return currentMonthData.dailyModelUsage
  }, [currentMonthData?.dailyModelUsage])

  // Heat map data (uses dailyUsage with recordCount)
  const heatMapData = useMemo((): DailyUsageData[] => {
    if (!currentMonthData?.dailyUsage) return []
    return currentMonthData.dailyUsage.map((d) => ({
      date: d.date,
      costUsd: d.costUsd,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      recordCount: d.recordCount,
    }))
  }, [currentMonthData?.dailyUsage])

  const monthName = new Date(selectedYear, selectedMonth).toLocaleDateString(
    'en-US',
    { month: 'long', year: 'numeric' }
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Month/Year Selector with Heat Map */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Period Selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Year/Month buttons */}
          <div className="space-y-3">
            {/* Year buttons */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-12">Year:</span>
              <div className="flex flex-wrap gap-1">
                {years.map((year) => (
                  <Button
                    key={year}
                    variant={selectedYear === year ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedYear(year)}
                    className="min-w-[60px]"
                  >
                    {year}
                  </Button>
                ))}
              </div>
            </div>
            {/* Month buttons */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground w-12">Month:</span>
              <div className="flex flex-wrap gap-1">
                {months.map((m) => (
                  <Button
                    key={m.value}
                    variant={selectedMonth === m.value ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedMonth(m.value)}
                    className={cn(
                      'min-w-[44px]',
                      selectedMonth === m.value && 'font-semibold'
                    )}
                  >
                    {m.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          {/* Heat Map - compact */}
          <div className="max-w-md">
            <UsageHeatMap
              data={heatMapData}
              year={selectedYear}
              month={selectedMonth}
              title={`Usage Heat Map - ${monthName}`}
              className="border-0 shadow-none"
              compact
            />
          </div>
        </CardContent>
      </Card>

      {/* Month Summary */}
      <Card>
        <CardHeader>
          <CardTitle>{monthName} Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Cost</p>
              <p className="text-xl font-mono font-semibold">
                {formatCurrency(monthTotals.costUsd)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Send Tokens</p>
              <p className="text-xl font-mono font-semibold">
                {formatTokens(monthTotals.inputTokens)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Receive Tokens</p>
              <p className="text-xl font-mono font-semibold">
                {formatTokens(monthTotals.outputTokens)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Requests</p>
              <p className="text-xl font-mono font-semibold">
                {monthTotals.recordCount.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row 1: Daily Cost Trend + Model Distribution */}
      <div className="grid gap-4 md:grid-cols-2">
        <UsageTrendChart data={trendData} title={`Daily Cost - ${monthName}`} />
        <ModelDistributionChart
          data={modelData}
          title={`Cost by Model - ${monthName}`}
        />
      </div>

      {/* Charts Row 2: Daily Token Usage by Model */}
      <DailyModelUsageChart
        data={dailyModelUsage}
        title={`Daily Token Usage by Model - ${monthName}`}
      />
    </div>
  )
}
