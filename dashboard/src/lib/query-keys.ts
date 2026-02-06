import type { DateRange, MemberFilters } from '@/types/api'

/**
 * Query key factory for TanStack Query
 * Provides type-safe, consistent query keys across the app
 */
export const queryKeys = {
  // Dashboard
  dashboard: {
    all: ['dashboard'] as const,
    stats: (dateRange?: DateRange) =>
      ['dashboard', 'stats', dateRange] as const,
    modelDistribution: (dateRange?: DateRange) =>
      ['dashboard', 'model-distribution', dateRange] as const,
  },

  // Members
  members: {
    all: ['members'] as const,
    list: (filters?: MemberFilters) => ['members', 'list', filters] as const,
    detail: (id: string, year?: number) =>
      year !== undefined
        ? (['members', 'detail', id, year] as const)
        : (['members', 'detail', id] as const),
    // Raw yearly data for charts (not transformed by adapter)
    yearlyRaw: (id: string, year: number) =>
      ['members', 'yearly-raw', id, year] as const,
    usage: (id: string, dateRange?: DateRange) =>
      ['members', 'detail', id, 'usage', dateRange] as const,
    charts: (id: string, year: number, month: number) =>
      ['members', 'detail', id, 'charts', year, month] as const,
  },

  // Reports
  reports: {
    all: ['reports'] as const,
    daily: (dateRange?: DateRange) => ['reports', 'daily', dateRange] as const,
    monthly: (month?: string) => ['reports', 'monthly', month] as const,
  },

  // Auth
  auth: {
    session: ['auth', 'session'] as const,
  },
} as const
