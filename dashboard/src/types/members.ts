/**
 * Members page types and interfaces
 */

// View toggle options for members page
export type MembersViewType = 'ranking' | 'chart'

// Sort field options
export type MemberSortField = 'costUsd' | 'inputTokens' | 'outputTokens' | 'name'

// Sort order
export type SortOrder = 'asc' | 'desc'

// Member with ranking information
export interface RankedMember {
  id: string
  name: string
  email: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  lastSyncAt: string | null
  isActive: boolean
  lastSync?: {
    hostname?: string | null
    clientIp?: string | null
    userAgent?: string | null
    agentVersion?: string | null
  } | null
  // Ranking metadata
  rank: number
  percentage: number // Percentage of max value for progress bar
}

// Team aggregate totals
export interface TeamTotals {
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  activeCount: number
  totalCount: number
  avgCostPerMember: number
}

// Treemap node structure for Recharts
export interface TreemapNode {
  name: string
  value: number
  // Optional metadata for tooltip
  id?: string
  email?: string
  percentage?: number
}

// Treemap data with children
export interface TreemapData {
  name: string
  children: TreemapNode[]
}
