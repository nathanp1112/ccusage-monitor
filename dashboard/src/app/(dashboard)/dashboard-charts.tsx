'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PieChart, Grid3X3 } from 'lucide-react'
import { UsageTrendChart } from '@/components/charts/usage-trend-chart'
import { ModelDistributionChart } from '@/components/charts/model-distribution-chart'
import { CostTreemapChart } from '@/components/charts/cost-treemap-chart'
import { ViewToggle, type ViewOption } from '@/components/shared/view-toggle'
import { useDashboard } from '@/hooks/use-dashboard'
import { useMembers } from '@/hooks/use-members'
import { apiClient } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { transformToTreemap } from '@/lib/treemap-utils'
import { LoadingSpinner } from '@/components/shared/loading-spinner'

interface ModelDistributionItem {
  model: string
  costUsd: number
  percentage: number
}

type ChartViewType = 'treemap' | 'pie'

const chartViewOptions: ViewOption<ChartViewType>[] = [
  { value: 'treemap', label: 'Treemap', icon: <Grid3X3 className="h-3.5 w-3.5" /> },
  { value: 'pie', label: 'Pie', icon: <PieChart className="h-3.5 w-3.5" /> },
]

export function DashboardCharts() {
  const [chartView, setChartView] = useState<ChartViewType>('treemap')
  const { data: dashboardData, isLoading: dashboardLoading } = useDashboard()
  const { data: members } = useMembers()

  // Fetch model distribution separately
  const { data: modelData, isLoading: modelLoading } = useQuery({
    queryKey: queryKeys.dashboard.modelDistribution(),
    queryFn: async () => {
      const response = await apiClient.get<{
        success: boolean
        data: ModelDistributionItem[]
      }>('/api/dashboard/model-distribution')
      return response.data
    },
    staleTime: 1000 * 60 * 5,
  })

  // Memoize data transformations to prevent unnecessary re-renders
  const trendData = useMemo(
    () =>
      dashboardData?.dailyTrend?.map((d) => ({
        date: d.date,
        costUsd: d.costUsd,
      })) ?? [],
    [dashboardData?.dailyTrend]
  )

  const distributionData = useMemo(
    () =>
      modelData?.map((m) => ({
        model: m.model,
        costUsd: m.costUsd,
        percentage: m.percentage,
      })) ?? [],
    [modelData]
  )

  // Transform members data for treemap
  const treemapData = useMemo(
    () => transformToTreemap(members ?? [], 'costUsd'),
    [members]
  )

  if (dashboardLoading || modelLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <UsageTrendChart data={trendData} title="Daily Cost Trend" />

        {/* Distribution chart with view toggle */}
        <div className="space-y-2">
          <div className="flex justify-end">
            <ViewToggle
              options={chartViewOptions}
              value={chartView}
              onChange={setChartView}
              size="sm"
            />
          </div>
          {chartView === 'treemap' ? (
            <CostTreemapChart
              data={treemapData}
              metric="costUsd"
              title="Cost by Member"
            />
          ) : (
            <ModelDistributionChart
              data={distributionData}
              title="Cost by Model"
            />
          )}
        </div>
      </div>
    </div>
  )
}
