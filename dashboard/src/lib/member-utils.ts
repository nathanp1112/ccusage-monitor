/**
 * Member sorting, ranking, and calculation utilities
 */

import type {
  RankedMember,
  TeamTotals,
  MemberSortField,
  SortOrder,
} from '@/types/members'

// Member data from API (minimal interface for reuse)
interface MemberData {
  id: string
  name: string
  email: string
  costUsd?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  lastSyncAt?: string | null
  isActive?: boolean
  lastSync?: {
    hostname?: string | null
    clientIp?: string | null
    userAgent?: string | null
    agentVersion?: string | null
  } | null
}

/**
 * Sort members by specified field and order
 */
export function sortMembers<T extends MemberData>(
  members: T[],
  sortField: MemberSortField,
  sortOrder: SortOrder = 'desc'
): T[] {
  const sorted = [...members].sort((a, b) => {
    let aVal: number | string
    let bVal: number | string

    switch (sortField) {
      case 'costUsd':
        aVal = a.costUsd ?? 0
        bVal = b.costUsd ?? 0
        break
      case 'inputTokens':
        aVal = a.inputTokens ?? 0
        bVal = b.inputTokens ?? 0
        break
      case 'outputTokens':
        aVal = a.outputTokens ?? 0
        bVal = b.outputTokens ?? 0
        break
      case 'name':
        aVal = a.name.toLowerCase()
        bVal = b.name.toLowerCase()
        break
      default:
        aVal = a.costUsd ?? 0
        bVal = b.costUsd ?? 0
    }

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortOrder === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal)
    }

    return sortOrder === 'asc'
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number)
  })

  return sorted
}

/**
 * Calculate rankings with percentage for progress bar
 */
export function calculateRankings(
  members: MemberData[],
  sortField: MemberSortField = 'costUsd'
): RankedMember[] {
  // Sort members by field (descending for ranking)
  const sorted = sortMembers(members, sortField, 'desc')

  // Find max value for percentage calculation
  const maxValue = sorted.reduce((max, m) => {
    const value = getFieldValue(m, sortField)
    return Math.max(max, value)
  }, 0)

  // Map to ranked members with percentage
  return sorted.map((m, index) => {
    const value = getFieldValue(m, sortField)
    const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0

    return {
      id: m.id,
      name: m.name,
      email: m.email,
      costUsd: m.costUsd ?? 0,
      inputTokens: m.inputTokens ?? 0,
      outputTokens: m.outputTokens ?? 0,
      lastSyncAt: m.lastSyncAt ?? null,
      isActive: m.isActive ?? false,
      lastSync: m.lastSync,
      rank: index + 1,
      percentage,
    }
  })
}

/**
 * Calculate team aggregate totals
 */
export function calculateTeamTotals(members: MemberData[]): TeamTotals {
  const activeMembers = members.filter((m) => m.isActive)

  const totalCost = members.reduce((sum, m) => sum + (m.costUsd ?? 0), 0)
  const totalInputTokens = members.reduce(
    (sum, m) => sum + (m.inputTokens ?? 0),
    0
  )
  const totalOutputTokens = members.reduce(
    (sum, m) => sum + (m.outputTokens ?? 0),
    0
  )

  return {
    totalCost,
    totalInputTokens,
    totalOutputTokens,
    activeCount: activeMembers.length,
    totalCount: members.length,
    avgCostPerMember: members.length > 0 ? totalCost / members.length : 0,
  }
}

/**
 * Helper to get numeric field value from member
 */
function getFieldValue(member: MemberData, field: MemberSortField): number {
  switch (field) {
    case 'costUsd':
      return member.costUsd ?? 0
    case 'inputTokens':
      return member.inputTokens ?? 0
    case 'outputTokens':
      return member.outputTokens ?? 0
    case 'name':
      return 0 // Name sorting uses string comparison
    default:
      return 0
  }
}

/**
 * Get rank medal/badge for top 3
 */
export function getRankDisplay(rank: number): {
  medal: string | null
  className: string
} {
  switch (rank) {
    case 1:
      return { medal: '🥇', className: 'text-yellow-500' }
    case 2:
      return { medal: '🥈', className: 'text-gray-400' }
    case 3:
      return { medal: '🥉', className: 'text-amber-600' }
    default:
      return { medal: null, className: 'text-muted-foreground' }
  }
}
