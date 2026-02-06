import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import {
  adaptDashboardResponse,
  isLambdaResponse,
  type FrontendDashboardData,
} from '@/lib/api-adapters'
import type { DateRange } from '@/types/api'

/**
 * Raw dashboard API response (may have string numbers) - legacy format
 */
interface RawDashboardResponse {
  success: boolean
  data: {
    period: {
      from: string
      to: string
    }
    summary: {
      totalCost: number
      costChange: number
      totalInputTokens: number | string
      totalOutputTokens: number | string
      totalCacheCreation: number | string
      totalCacheRead: number | string
      totalRecords: number | string
      activeMembers: number | string
      totalMembers: number | string
      avgCostPerMember: number
    }
    dailyTrend: {
      date: string
      costUsd: number
      inputTokens: number | string
      outputTokens: number | string
    }[]
    topUsers: {
      memberId: string
      name: string
      costUsd: number
      inputTokens: number
      outputTokens: number
    }[]
    recentSyncs: {
      id: string
      memberName: string
      syncedAt: string
      recordsInserted: number
      recordsSkipped: number
    }[]
  }
}

/**
 * Lambda API dashboard response format
 */
interface LambdaDashboardResponse {
  success: boolean
  message?: string
  data: {
    generatedAt: string
    summary: {
      totalCost: number
      totalInputTokens: number
      totalOutputTokens: number
      totalMembers: number
      activeMembers: number
      avgCostPerMember: number
    }
    costChangePercent: number
    dailyTrend: Array<{
      date: string
      costUsd: number
      inputTokens: number
      outputTokens: number
    }>
    topMembers: Array<{
      memberId: string
      name: string
      costUsd: number
      percentage: number
    }>
    modelDistribution: Array<{
      model: string
      costUsd: number
      percentage: number
    }>
    recentSyncs: Array<{
      memberId: string
      memberName: string
      syncedAt: string
      recordsInserted: number
    }>
  }
}

/**
 * Normalized dashboard data (all numbers)
 * Using FrontendDashboardData from adapters for consistency
 */
type DashboardData = FrontendDashboardData

/**
 * Normalize legacy API response to ensure all values are numbers
 */
function normalizeLegacyResponse(raw: RawDashboardResponse['data']): DashboardData {
  return {
    period: raw.period,
    summary: {
      totalCost: Number(raw.summary.totalCost) || 0,
      costChange: Number(raw.summary.costChange) || 0,
      totalInputTokens: Number(raw.summary.totalInputTokens) || 0,
      totalOutputTokens: Number(raw.summary.totalOutputTokens) || 0,
      totalCacheCreation: Number(raw.summary.totalCacheCreation) || 0,
      totalCacheRead: Number(raw.summary.totalCacheRead) || 0,
      totalRecords: Number(raw.summary.totalRecords) || 0,
      activeMembers: Number(raw.summary.activeMembers) || 0,
      totalMembers: Number(raw.summary.totalMembers) || 0,
      avgCostPerMember: Number(raw.summary.avgCostPerMember) || 0,
    },
    dailyTrend: raw.dailyTrend.map((d) => ({
      date: d.date,
      costUsd: Number(d.costUsd) || 0,
      inputTokens: Number(d.inputTokens) || 0,
      outputTokens: Number(d.outputTokens) || 0,
    })),
    topUsers: raw.topUsers,
    recentSyncs: raw.recentSyncs,
  }
}

/**
 * Hook for fetching dashboard data
 * Supports both legacy PostgreSQL API and new Lambda API formats
 */
export function useDashboard(dateRange?: DateRange) {
  return useQuery({
    queryKey: queryKeys.dashboard.stats(dateRange),
    queryFn: async () => {
      const response = await apiClient.get<RawDashboardResponse | LambdaDashboardResponse>(
        '/api/dashboard',
        {
          params: dateRange
            ? {
                from: dateRange.from,
                to: dateRange.to,
              }
            : undefined,
        }
      )

      // Check if this is Lambda API response (has generatedAt in data)
      if (isLambdaResponse(response.data)) {
        return adaptDashboardResponse(response as LambdaDashboardResponse)
      }

      // Legacy PostgreSQL API format
      return normalizeLegacyResponse((response as RawDashboardResponse).data)
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}
