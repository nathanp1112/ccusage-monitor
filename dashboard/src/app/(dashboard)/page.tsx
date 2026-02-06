'use client'

import { DollarSign, Coins, Users, TrendingUp } from 'lucide-react'
import { SummaryCard } from '@/components/dashboard/summary-card'
import { PageLoader } from '@/components/shared/loading-spinner'
import { DashboardCharts } from './dashboard-charts'
import { useDashboard } from '@/hooks/use-dashboard'
import { formatCurrency, formatTokens } from '@/lib/utils'

export default function DashboardPage() {
  const { data, isLoading, error } = useDashboard()

  if (isLoading) {
    return <PageLoader />
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Failed to load dashboard data</p>
      </div>
    )
  }

  const summary = data?.summary
  const costChange = summary?.costChange ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">
          Team usage overview for the current period
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Total Cost"
          value={formatCurrency(summary?.totalCost ?? 0)}
          change={
            costChange !== 0
              ? {
                  value: Math.abs(costChange),
                  trend: costChange > 0 ? 'up' : 'down',
                }
              : undefined
          }
          icon={<DollarSign className="h-4 w-4" />}
          valueClassName="font-mono"
        />
        <SummaryCard
          title="Total Tokens"
          value={formatTokens(
            (summary?.totalInputTokens ?? 0) + (summary?.totalOutputTokens ?? 0)
          )}
          icon={<Coins className="h-4 w-4" />}
          valueClassName="font-mono"
        />
        <SummaryCard
          title="Active Members"
          value={String(summary?.activeMembers ?? 0)}
          description={`of ${summary?.totalMembers ?? 0} total`}
          icon={<Users className="h-4 w-4" />}
        />
        <SummaryCard
          title="Avg Cost/Member"
          value={formatCurrency(summary?.avgCostPerMember ?? 0)}
          icon={<TrendingUp className="h-4 w-4" />}
          valueClassName="font-mono"
        />
      </div>

      {/* Charts - TanStack Query handles its own loading state */}
      <DashboardCharts />
    </div>
  )
}
