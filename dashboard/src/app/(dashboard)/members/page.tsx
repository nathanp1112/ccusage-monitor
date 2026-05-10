'use client'

import { useState, useMemo, useEffect } from 'react'
import { BarChart3, List } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { StatsBar, type StatItem } from '@/components/shared/stats-bar'
import { ControlsBar } from '@/components/shared/controls-bar'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { DataSheet } from '@/components/shared/data-sheet'
import { ViewToggle, type ViewOption } from '@/components/shared/view-toggle'
import { PeriodSelector } from '@/components/shared/period-selector'
import { MemberRankingList } from '@/components/members/member-ranking-list'
import { MemberDetailContent } from '@/components/members/member-detail-content'
import { CostTreemapChart } from '@/components/charts/cost-treemap-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency, formatTokens } from '@/lib/utils'
import { ApiError } from '@/lib/api-client'
import { useMembers } from '@/hooks/use-members'
import { calculateRankings, calculateTeamTotals } from '@/lib/member-utils'
import { transformToTreemap, type TreemapMetric } from '@/lib/treemap-utils'
import { PageLoader } from '@/components/shared/loading-spinner'
import type { MembersViewType, MemberSortField } from '@/types/members'

const viewOptions: ViewOption<MembersViewType>[] = [
  { value: 'ranking', label: 'Ranking', icon: <List className="h-3.5 w-3.5" /> },
  { value: 'chart', label: 'Chart', icon: <BarChart3 className="h-3.5 w-3.5" /> },
]

const sortOptions: { value: MemberSortField; label: string }[] = [
  { value: 'costUsd', label: 'Cost' },
  { value: 'inputTokens', label: 'Send Tokens' },
  { value: 'outputTokens', label: 'Receive Tokens' },
]

export default function MembersPage() {
  const now = useMemo(() => new Date(), [])
  // Period for the leaderboard. Default = current month. Undefined means
  // "current month" (legacy path); we always send a period for clarity.
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)

  // When the user picks a new year, snap the month back to the current month
  // if the existing selection would be in the future for that year (BE rejects
  // future months with 400). Without this, switching from e.g. (2025, Jun) to
  // 2026 leaves (2026, Jun) — invalid until the user manually picks again.
  const handleYearChange = (year: number) => {
    setSelectedYear(year)
    if (year === now.getFullYear() && selectedMonth > now.getMonth() + 1) {
      setSelectedMonth(now.getMonth() + 1)
    }
  }

  const period = useMemo(
    () => ({ year: selectedYear, month: selectedMonth }),
    [selectedYear, selectedMonth]
  )

  const isCurrentPeriod =
    selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1

  const { data: members, isLoading, error, refetch } = useMembers(undefined, period)

  // Treat 404 (no data for that month) as a friendly empty state, not an error.
  const isNoDataMonth = error instanceof ApiError && error.isNotFound

  const [view, setView] = useState<MembersViewType>('ranking')
  const [sortField, setSortField] = useState<MemberSortField>('costUsd')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)

  // Read ?detail=X from URL on mount for shareable links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const detailId = params.get('detail')
    if (detailId) {
      setSelectedMemberId(detailId)
    }
  }, [])

  // Get selected member info for modal title
  const selectedMember = useMemo(
    () => members?.find((m) => m.id === selectedMemberId),
    [members, selectedMemberId]
  )

  // Calculate team totals
  const teamTotals = useMemo(
    () => calculateTeamTotals(members ?? []),
    [members]
  )

  // Calculate rankings based on sort field
  const rankedMembers = useMemo(
    () => calculateRankings(members ?? [], sortField),
    [members, sortField]
  )

  // Map sort field to valid treemap metric
  const treemapMetric: TreemapMetric = useMemo(() => {
    if (sortField === 'name') return 'costUsd'
    return sortField
  }, [sortField])

  // Treemap data
  const treemapData = useMemo(
    () => transformToTreemap(members ?? [], treemapMetric),
    [members, treemapMetric]
  )

  // Open member detail modal
  const openMemberDetail = (memberId: string) => {
    setSelectedMemberId(memberId)
    // Update URL for shareable link (without page reload)
    window.history.pushState({}, '', `/members?detail=${memberId}`)
  }

  // Close member detail modal
  const closeMemberDetail = () => {
    setSelectedMemberId(null)
    // Reset URL
    window.history.pushState({}, '', '/members')
  }

  // Stats for compact bar
  const stats: StatItem[] = [
    { label: 'Team Cost', value: formatCurrency(teamTotals.totalCost) },
    { label: 'Tokens', value: formatTokens(teamTotals.totalInputTokens + teamTotals.totalOutputTokens), hideOnMobile: true },
    { label: 'Members', value: `${teamTotals.activeCount}/${teamTotals.totalCount}` },
    { label: 'Avg', value: formatCurrency(teamTotals.avgCostPerMember), hideOnTablet: true },
  ]

  const periodLabel = new Date(selectedYear, selectedMonth - 1).toLocaleDateString(
    'en-US',
    { year: 'numeric', month: 'long' }
  )

  const hasError = !!error && !isNoDataMonth

  return (
    <div className="space-y-4">
      <PageHeader
        title="Members"
        description={`Leaderboard for ${periodLabel}${isCurrentPeriod ? ' (current month)' : ''}`}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Period Selection</CardTitle>
        </CardHeader>
        <CardContent>
          <PeriodSelector
            year={selectedYear}
            month={selectedMonth}
            onYearChange={handleYearChange}
            onMonthChange={setSelectedMonth}
          />
        </CardContent>
      </Card>

      {!hasError && <StatsBar stats={stats} />}

      {!hasError && (
        <ControlsBar
          left={
            <ViewToggle options={viewOptions} value={view} onChange={setView} />
          }
          right={
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sort by:</span>
              <Select value={sortField} onValueChange={(v) => setSortField(v as MemberSortField)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sortOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />
      )}

      {hasError && (
        <ErrorState message="Failed to load members" onRetry={refetch} />
      )}

      {!hasError && isLoading && <PageLoader />}

      {!hasError && !isLoading && !isNoDataMonth && view === 'ranking' && (
        <MemberRankingList
          members={rankedMembers}
          sortField={sortField}
          onMemberClick={openMemberDetail}
        />
      )}

      {!hasError && !isLoading && !isNoDataMonth && view === 'chart' && (
        <CostTreemapChart
          data={treemapData}
          metric={treemapMetric}
          title={`Member Distribution by ${sortOptions.find(o => o.value === sortField)?.label ?? 'Cost'}`}
          onCellClick={(node) => {
            if (node.id) openMemberDetail(node.id)
          }}
        />
      )}

      {!hasError && !isLoading && (isNoDataMonth || !members || members.length === 0) && (
        <EmptyState
          message={
            isNoDataMonth
              ? `No usage data for ${periodLabel}`
              : 'No members found'
          }
        />
      )}

      {/* Member Detail Modal */}
      <DataSheet
        open={!!selectedMemberId}
        onClose={closeMemberDetail}
        title={selectedMember?.name ?? 'Member Details'}
        description={selectedMember?.email}
        size="xl"
      >
        {selectedMemberId && <MemberDetailContent memberId={selectedMemberId} />}
      </DataSheet>
    </div>
  )
}
