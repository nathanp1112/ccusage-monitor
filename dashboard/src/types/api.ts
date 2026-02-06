/**
 * API Response Types
 */

// Common types
export interface DateRange {
  from: string
  to: string
}

export interface MemberFilters {
  search?: string
  sort?: 'name' | 'cost' | 'last_sync'
  order?: 'asc' | 'desc'
}

// Member types
export interface Member {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
  isActive: boolean
  lastSyncAt: string | null
  createdAt: string
}

export interface MemberUsage {
  date: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  costUsd: number
  model: string
}

export interface MemberDetail extends Member {
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  modelsUsed: string[]
}

// Dashboard types
export interface DashboardStats {
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  activeMembers: number
  totalMembers: number
  costChange: number
  tokensChange: number
}

export interface DashboardTrend {
  date: string
  costUsd: number
  inputTokens: number
  outputTokens: number
}

export interface TopMember {
  id: string
  name: string
  costUsd: number
  inputTokens: number
  lastSyncAt: string | null
}

export interface ModelDistribution {
  model: string
  costUsd: number
  tokens: number
  percentage: number
}

export interface DashboardData {
  stats: DashboardStats
  trends: DashboardTrend[]
  topMembers: TopMember[]
  modelDistribution: ModelDistribution[]
}

// Report types
export interface DailyReport {
  date: string
  members: {
    id: string
    name: string
    costUsd: number
    inputTokens: number
    outputTokens: number
  }[]
  totals: {
    costUsd: number
    inputTokens: number
    outputTokens: number
  }
}

export interface MonthlyReport {
  month: string
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
  memberBreakdown: {
    id: string
    name: string
    costUsd: number
    percentage: number
  }[]
}

// Auth types
export interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  user: User
}

// API response wrappers
export interface ApiResponse<T> {
  data: T
}

export interface ApiError {
  error: string
  message?: string
  details?: Record<string, string[]>
}
