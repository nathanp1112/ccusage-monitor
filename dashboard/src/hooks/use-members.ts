import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import {
  adaptMembersResponse,
  adaptMemberDetailResponse,
  isLambdaResponse,
  type ProjectDataItem,
} from '@/lib/api-adapters'
import type { MemberFilters, DateRange } from '@/types/api'

/**
 * Latest sync info from agent
 */
interface LastSyncInfo {
  hostname: string | null
  clientIp: string | null
  userAgent: string | null
  agentVersion: string | null
}

/**
 * Member list item from API
 */
export interface MemberListItem {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
  isActive: boolean
  lastSyncAt: string | null
  createdAt: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  lastSync: LastSyncInfo | null
}

/**
 * Daily usage data from API (includes model breakdown for FE calculations)
 */
export interface DailyUsageData {
  date: string
  inputTokens: number
  outputTokens: number
  cacheCreation: number
  cacheRead: number
  costUsd: number
  recordCount: number
  modelBreakdown: Record<
    string,
    {
      inputTokens: number
      outputTokens: number
      cacheCreationTokens: number
      cacheReadTokens: number
      costUsd: number
      recordCount: number
    }
  >
}

/**
 * Member detail from API - raw daily data, FE calculates totals
 */
export interface MemberDetailData {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
  isActive: boolean
  lastSyncAt: string | null
  createdAt: string
  period: {
    year: number
    month: number
    startDate: string
    endDate: string
  }
  dailyUsage: DailyUsageData[]
  projects: ProjectDataItem[]
  promptStats: Record<string, { count: number }>
}

export type { ProjectDataItem }

/**
 * Member usage record from API
 */
interface MemberUsageRecord {
  id: string
  requestId: string
  recordedAt: string
  usageDate: string
  model: string
  projectPath: string
  sessionId: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  costUsd: number
  claudeVersion: string | null
}

/**
 * Hook for fetching members list
 */
/**
 * Convert MemberFilters to API params
 */
function filtersToParams(
  filters?: MemberFilters
): Record<string, string | undefined> | undefined {
  if (!filters) return undefined
  return {
    search: filters.search,
    sort: filters.sort,
    order: filters.order,
  }
}

/**
 * Lambda API members response format
 */
interface LambdaMembersResponse {
  success: boolean
  message?: string
  data: {
    generatedAt: string
    teamTotals: {
      costUsd: number
      inputTokens: number
      outputTokens: number
    }
    members: Array<{
      id: string
      name: string
      email: string
      role: string
      isActive: boolean
      lastSyncAt: string | null
      currentMonth: {
        costUsd: number
        inputTokens: number
        outputTokens: number
      }
      previousMonth: {
        costUsd: number
        inputTokens: number
        outputTokens: number
      }
      costChangePercent: number
    }>
  }
}

/**
 * Period for the per-month leaderboard. `month` is 1-indexed (1-12).
 */
export interface MembersListPeriod {
  year: number
  month: number
}

/**
 * Hook for fetching members list
 * Supports both legacy PostgreSQL API and new Lambda API formats.
 * When `period` is provided, calls /api/members?year=&month= for a per-month
 * leaderboard. The Lambda returns 404 for months with no data — apiClient
 * throws, and the caller renders an empty state.
 */
export function useMembers(
  filters?: MemberFilters,
  period?: MembersListPeriod
) {
  return useQuery({
    queryKey: queryKeys.members.list(filters, period),
    queryFn: async () => {
      const periodParams = period
        ? { year: String(period.year), month: String(period.month) }
        : undefined
      const response = await apiClient.get<
        { success: boolean; data: MemberListItem[] } | LambdaMembersResponse
      >('/api/members', {
        params: { ...filtersToParams(filters), ...periodParams },
      })

      // Check if this is Lambda API response (has generatedAt in data)
      if (isLambdaResponse(response.data)) {
        return adaptMembersResponse(response as LambdaMembersResponse)
      }

      // Legacy PostgreSQL API format - data is already an array
      return (response as { success: boolean; data: MemberListItem[] }).data
    },
  })
}

/**
 * Lambda API member detail response format (yearly structure)
 */
interface LambdaMemberDetailResponse {
  success: boolean
  message?: string
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
    months: Record<string, {
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
      projectBreakdown: Array<{
        project: string
        costUsd: number
        percentage: number
      }>
    }>
    recentSyncs: Array<{
      syncId: string
      syncedAt: string
      recordsInserted: number
      recordsSkipped: number
      hostname: string | null
      clientIp: string | null
      userAgent: string | null
      agentVersion: string | null
    }>
    projects?: ProjectDataItem[]
    promptStats?: Record<string, { count: number }>
  }
}

/**
 * Hook for fetching single member details
 * Supports both legacy PostgreSQL API and new Lambda API formats (yearly structure)
 */
export function useMember(id: string, year?: number) {
  const currentYear = year || new Date().getFullYear()

  return useQuery({
    queryKey: queryKeys.members.detail(id, currentYear),
    queryFn: async () => {
      const response = await apiClient.get<
        { success: boolean; data: MemberDetailData } | LambdaMemberDetailResponse
      >(`/api/members/${id}`, {
        params: { year: currentYear },
      })

      // Check if this is Lambda API response (has generatedAt in data)
      if (isLambdaResponse(response.data)) {
        return adaptMemberDetailResponse(response as LambdaMemberDetailResponse)
      }

      // Legacy PostgreSQL API format
      return (response as { success: boolean; data: MemberDetailData }).data
    },
    enabled: !!id,
  })
}

/**
 * Prompt month summary returned by /api/admin/members/:id/prompts/months
 */
export interface PromptMonthSummary {
  year: number
  month: number
  count: number
  lastUpdated: string | null
}

interface PromptMonthsResponse {
  success: boolean
  data: {
    memberId: string
    months: PromptMonthSummary[]
  }
}

/**
 * Single prompt in the admin prompt browser
 */
export interface PromptRecord {
  uuid: string
  timestamp: string
  sessionId: string
  projectPath: string
  cwd: string
  content: string
  truncated?: boolean
  originalLength?: number
}

export interface PromptDay {
  date: string // YYYY-MM-DD
  count: number
  prompts: PromptRecord[]
}

interface PromptsMonthResponse {
  success: boolean
  data: {
    memberId: string
    year: number
    month: number
    totalPrompts: number
    totalDays: number
    page: number
    pageSize: number
    hasMore: boolean
    days: PromptDay[]
  }
}

/**
 * Admin-only: list the months for which a member has prompts in S3.
 * Caller MUST ensure the current user has admin role before enabling.
 */
export function useMemberPromptMonths(id: string, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.members.promptMonths(id),
    queryFn: async () => {
      const response = await apiClient.get<PromptMonthsResponse>(
        `/api/admin/members/${id}/prompts/months`
      )
      return response.data
    },
    enabled: !!id && enabled,
  })
}

/**
 * Admin-only: fetch prompts for a member for a given month, grouped by day.
 */
export function useMemberPrompts(
  id: string,
  year: number,
  month: number,
  page: number = 1,
  pageSize: number = 5,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: [...queryKeys.members.prompts(id, year, month), page, pageSize],
    queryFn: async () => {
      const response = await apiClient.get<PromptsMonthResponse>(
        `/api/admin/members/${id}/prompts`,
        { params: { year, month, page, pageSize } }
      )
      return response.data
    },
    enabled: !!id && enabled && !!year && !!month,
  })
}

/**
 * Hook for fetching member usage data
 */
export function useMemberUsage(id: string, dateRange?: DateRange) {
  return useQuery({
    queryKey: queryKeys.members.usage(id, dateRange),
    queryFn: async () => {
      const response = await apiClient.get<{
        success: boolean
        data: MemberUsageRecord[]
      }>(`/api/members/${id}/usage`, {
        params: dateRange
          ? {
              from: dateRange.from,
              to: dateRange.to,
            }
          : undefined,
      })
      return response.data
    },
    enabled: !!id,
  })
}
