'use client'

import { useState, useMemo, useEffect } from 'react'
import { LayoutGrid, BarChart3, List } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { StatsBar, type StatItem } from '@/components/shared/stats-bar'
import { ControlsBar } from '@/components/shared/controls-bar'
import { EmptyState } from '@/components/shared/empty-state'
import { ErrorState } from '@/components/shared/error-state'
import { DataSheet } from '@/components/shared/data-sheet'
import { ViewToggle, type ViewOption } from '@/components/shared/view-toggle'
import { MemberCard } from '@/components/members/member-card'
import { MemberRankingList } from '@/components/members/member-ranking-list'
import { MemberDetailContent } from '@/components/members/member-detail-content'
import { CostTreemapChart } from '@/components/charts/cost-treemap-chart'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency, formatTokens } from '@/lib/utils'
import { useMembers } from '@/hooks/use-members'
import { calculateRankings, calculateTeamTotals } from '@/lib/member-utils'
import { transformToTreemap, type TreemapMetric } from '@/lib/treemap-utils'
import { PageLoader } from '@/components/shared/loading-spinner'
import type { MembersViewType, MemberSortField } from '@/types/members'

const viewOptions: ViewOption<MembersViewType>[] = [
  { value: 'ranking', label: 'Ranking', icon: <List className="h-3.5 w-3.5" /> },
  { value: 'cards', label: 'Cards', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { value: 'chart', label: 'Chart', icon: <BarChart3 className="h-3.5 w-3.5" /> },
]

const sortOptions: { value: MemberSortField; label: string }[] = [
  { value: 'costUsd', label: 'Cost' },
  { value: 'inputTokens', label: 'Send Tokens' },
  { value: 'outputTokens', label: 'Receive Tokens' },
]

export default function MembersPage() {
  const { data: members, isLoading, error, refetch } = useMembers()

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

  if (isLoading) {
    return <PageLoader />
  }

  if (error) {
    return <ErrorState message="Failed to load members" onRetry={refetch} />
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Members" description="View usage details for team members" />

      <StatsBar stats={stats} />

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

      {/* Content based on view */}
      {view === 'ranking' && (
        <MemberRankingList
          members={rankedMembers}
          sortField={sortField}
          onMemberClick={openMemberDetail}
        />
      )}

      {view === 'cards' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rankedMembers.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              onClick={() => openMemberDetail(member.id)}
            />
          ))}
        </div>
      )}

      {view === 'chart' && (
        <CostTreemapChart
          data={treemapData}
          metric={treemapMetric}
          title={`Member Distribution by ${sortOptions.find(o => o.value === sortField)?.label ?? 'Cost'}`}
          onCellClick={(node) => {
            if (node.id) openMemberDetail(node.id)
          }}
        />
      )}

      {(!members || members.length === 0) && (
        <EmptyState message="No members found" />
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
