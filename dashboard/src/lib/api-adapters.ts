/**
 * API Response Adapters
 *
 * Transforms Lambda API responses to the format expected by frontend hooks.
 * This adapter layer allows the frontend to work with both the old PostgreSQL
 * server and the new S3-based Lambda API without changing component code.
 */

// ============================================
// Lambda API Response Types (from backend)
// ============================================

interface LambdaDashboardSummary {
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  totalMembers: number
  activeMembers: number
  avgCostPerMember: number
}

interface LambdaDashboardView {
  generatedAt: string
  summary: LambdaDashboardSummary
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

interface LambdaMembersView {
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

// Monthly data structure within yearly response
interface LambdaMonthlyData {
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
}

// New yearly API response format
interface LambdaMemberYearlyView {
  generatedAt: string
  member: {
    id: string
    name: string
    email: string
    role: string
    isActive: boolean
  }
  year: number
  months: Record<string, LambdaMonthlyData> // "1", "2", ... "12"
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
}

// ============================================
// Frontend Expected Types
// ============================================

export interface FrontendDashboardData {
  period: {
    from: string
    to: string
  }
  summary: {
    totalCost: number
    costChange: number
    totalInputTokens: number
    totalOutputTokens: number
    totalCacheCreation: number
    totalCacheRead: number
    totalRecords: number
    activeMembers: number
    totalMembers: number
    avgCostPerMember: number
  }
  dailyTrend: Array<{
    date: string
    costUsd: number
    inputTokens: number
    outputTokens: number
  }>
  topUsers: Array<{
    memberId: string
    name: string
    costUsd: number
    inputTokens: number
    outputTokens: number
  }>
  recentSyncs: Array<{
    id: string
    memberName: string
    syncedAt: string
    recordsInserted: number
    recordsSkipped: number
  }>
}

export interface FrontendMemberListItem {
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
  lastSync: {
    hostname: string | null
    clientIp: string | null
    userAgent: string | null
    agentVersion: string | null
  } | null
}

export interface FrontendDailyUsageData {
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

export interface FrontendMemberDetailData {
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
  dailyUsage: FrontendDailyUsageData[]
}

// ============================================
// Adapter Functions
// ============================================

/**
 * Get date range for current month
 */
function getCurrentMonthRange(): { from: string; to: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  const from = new Date(year, month, 1).toISOString().split('T')[0]
  const to = new Date(year, month + 1, 0).toISOString().split('T')[0]

  return { from, to }
}

/**
 * Adapt Lambda dashboard response to frontend format
 */
export function adaptDashboardResponse(
  response: { success: boolean; data: LambdaDashboardView; message?: string }
): FrontendDashboardData {
  const data = response.data
  const { from, to } = getCurrentMonthRange()

  // Calculate total records from daily trend
  const totalRecords = data.dailyTrend.length

  return {
    period: { from, to },
    summary: {
      totalCost: data.summary.totalCost,
      costChange: data.costChangePercent,
      totalInputTokens: data.summary.totalInputTokens,
      totalOutputTokens: data.summary.totalOutputTokens,
      totalCacheCreation: 0, // Not tracked in new backend
      totalCacheRead: 0, // Not tracked in new backend
      totalRecords: totalRecords,
      activeMembers: data.summary.activeMembers,
      totalMembers: data.summary.totalMembers,
      avgCostPerMember: data.summary.avgCostPerMember,
    },
    dailyTrend: data.dailyTrend.map((d) => ({
      date: d.date,
      costUsd: d.costUsd,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
    })),
    topUsers: data.topMembers.map((m) => ({
      memberId: m.memberId,
      name: m.name,
      costUsd: m.costUsd,
      inputTokens: 0, // Not in summary view
      outputTokens: 0, // Not in summary view
    })),
    recentSyncs: data.recentSyncs.map((s, index) => ({
      id: `sync-${index}`,
      memberName: s.memberName,
      syncedAt: s.syncedAt,
      recordsInserted: s.recordsInserted,
      recordsSkipped: 0, // Not in summary view
    })),
  }
}

/**
 * Adapt Lambda members list response to frontend format
 */
export function adaptMembersResponse(
  response: { success: boolean; data: LambdaMembersView; message?: string }
): FrontendMemberListItem[] {
  const data = response.data

  return data.members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: m.role as 'admin' | 'member',
    isActive: m.isActive,
    lastSyncAt: m.lastSyncAt,
    createdAt: data.generatedAt, // Use generatedAt as placeholder
    costUsd: m.currentMonth.costUsd,
    inputTokens: m.currentMonth.inputTokens,
    outputTokens: m.currentMonth.outputTokens,
    lastSync: null, // Not in members view, would need separate fetch
  }))
}

/**
 * Adapt Lambda member detail response (yearly format) to frontend format
 */
export function adaptMemberDetailResponse(
  response: { success: boolean; data: LambdaMemberYearlyView; message?: string }
): FrontendMemberDetailData {
  const data = response.data
  const now = new Date()
  const year = data.year || now.getFullYear()
  const month = now.getMonth() + 1
  const monthKey = String(month)

  const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
  const endDate = new Date(year, month, 0).toISOString().split('T')[0]

  // Get current month data from yearly response
  const currentMonthData = data.months?.[monthKey]

  // Build model breakdown map from the array
  const modelBreakdownMap: Record<string, {
    inputTokens: number
    outputTokens: number
    cacheCreationTokens: number
    cacheReadTokens: number
    costUsd: number
    recordCount: number
  }> = {}

  if (currentMonthData?.modelBreakdown) {
    for (const mb of currentMonthData.modelBreakdown) {
      modelBreakdownMap[mb.model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsd: mb.costUsd,
        recordCount: 0,
      }
    }
  }

  return {
    id: data.member.id,
    name: data.member.name,
    email: data.member.email,
    role: data.member.role as 'admin' | 'member',
    isActive: data.member.isActive,
    lastSyncAt: data.recentSyncs?.[0]?.syncedAt || null,
    createdAt: data.generatedAt,
    period: {
      year,
      month,
      startDate,
      endDate,
    },
    dailyUsage: currentMonthData?.dailyUsage?.map((d) => ({
      date: d.date,
      inputTokens: d.inputTokens,
      outputTokens: d.outputTokens,
      cacheCreation: 0,
      cacheRead: 0,
      costUsd: d.costUsd,
      recordCount: d.recordCount || 1,
      modelBreakdown: modelBreakdownMap,
    })) || [],
  }
}

/**
 * Check if response is from Lambda API (has new structure)
 */
export function isLambdaResponse(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const obj = data as Record<string, unknown>

  // Lambda responses have generatedAt field
  if ('generatedAt' in obj) return true

  // Or they wrap data with generatedAt
  if ('data' in obj && typeof obj.data === 'object' && obj.data !== null) {
    return 'generatedAt' in (obj.data as Record<string, unknown>)
  }

  return false
}
