'use client'

import { useState, useMemo } from 'react'
import { LayoutGrid, BarChart3, List } from 'lucide-react'
import { ViewToggle, type ViewOption } from '@/components/shared/view-toggle'
import { MemberCard } from '@/components/members/member-card'
import { MemberRankingList } from '@/components/members/member-ranking-list'
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
  const { data: members, isLoading, error } = useMembers()

  const [view, setView] = useState<MembersViewType>('ranking')
  const [sortField, setSortField] = useState<MemberSortField>('costUsd')

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

  const handleMemberClick = (memberId: string) => {
    // Use window.location for static export compatibility
    window.location.href = `/members/view/?id=${memberId}`
  }

  if (isLoading) {
    return <PageLoader />
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Failed to load members</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Members</h2>
        <p className="text-muted-foreground">
          View usage details for team members
        </p>
      </div>

      {/* Compact Summary Bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-2.5 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Team Cost:</span>
          <span className="font-mono font-semibold">{formatCurrency(teamTotals.totalCost)}</span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-muted-foreground">Tokens:</span>
          <span className="font-mono font-semibold">{formatTokens(teamTotals.totalInputTokens + teamTotals.totalOutputTokens)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Members:</span>
          <span className="font-semibold">{teamTotals.activeCount}/{teamTotals.totalCount}</span>
        </div>
        <div className="hidden md:flex items-center gap-2">
          <span className="text-muted-foreground">Avg:</span>
          <span className="font-mono font-semibold">{formatCurrency(teamTotals.avgCostPerMember)}</span>
        </div>
      </div>

      {/* View Toggle + Sort */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ViewToggle
          options={viewOptions}
          value={view}
          onChange={setView}
        />
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
      </div>

      {/* Content based on view */}
      {view === 'ranking' && (
        <MemberRankingList
          members={rankedMembers}
          sortField={sortField}
          onMemberClick={handleMemberClick}
        />
      )}

      {view === 'cards' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rankedMembers.map((member) => (
            <MemberCard key={member.id} member={member} />
          ))}
        </div>
      )}

      {view === 'chart' && (
        <CostTreemapChart
          data={treemapData}
          metric={treemapMetric}
          title={`Member Distribution by ${sortOptions.find(o => o.value === sortField)?.label ?? 'Cost'}`}
          onCellClick={(node) => {
            if (node.id) handleMemberClick(node.id)
          }}
        />
      )}

      {(!members || members.length === 0) && (
        <div className="flex items-center justify-center h-32">
          <p className="text-muted-foreground">No members found</p>
        </div>
      )}
    </div>
  )
}
