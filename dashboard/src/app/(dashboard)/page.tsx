'use client'

import { DollarSign, Coins, Users, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { StatsGrid, type StatCardItem } from '@/components/shared/stats-grid'
import { ErrorState } from '@/components/shared/error-state'
import { PageLoader } from '@/components/shared/loading-spinner'
import { DashboardCharts } from './dashboard-charts'
import { useDashboard } from '@/hooks/use-dashboard'
import { formatCurrency, formatTokens } from '@/lib/utils'

export default function DashboardPage() {
  const { data, isLoading, error, refetch } = useDashboard()

  if (isLoading) {
    return <PageLoader />
  }

  if (error) {
    return <ErrorState message="Failed to load dashboard data" onRetry={refetch} />
  }

  const summary = data?.summary
  const costChange = summary?.costChange ?? 0

  const stats: StatCardItem[] = [
    {
      title: 'Total Cost',
      value: formatCurrency(summary?.totalCost ?? 0),
      icon: <DollarSign className="h-4 w-4" />,
      valueClassName: 'font-mono',
      change: costChange !== 0
        ? { value: Math.abs(costChange), trend: costChange > 0 ? 'up' : 'down' }
        : undefined,
    },
    {
      title: 'Total Tokens',
      value: formatTokens((summary?.totalInputTokens ?? 0) + (summary?.totalOutputTokens ?? 0)),
      icon: <Coins className="h-4 w-4" />,
      valueClassName: 'font-mono',
    },
    {
      title: 'Active Members',
      value: String(summary?.activeMembers ?? 0),
      description: `of ${summary?.totalMembers ?? 0} total`,
      icon: <Users className="h-4 w-4" />,
    },
    {
      title: 'Avg Cost/Member',
      value: formatCurrency(summary?.avgCostPerMember ?? 0),
      icon: <TrendingUp className="h-4 w-4" />,
      valueClassName: 'font-mono',
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Team usage overview for the current period"
      />
      <StatsGrid stats={stats} columns={4} />
      <DashboardCharts />
    </div>
  )
}
