'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatsBar, type StatItem } from '@/components/shared/stats-bar'
import { TagList } from '@/components/shared/tag-list'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { MemberDetailCharts } from './member-detail-charts'
import { useMember } from '@/hooks/use-members'
import { calculateTotals, getModelsUsed } from '@/lib/calculations'
import { formatCurrency, formatTokens } from '@/lib/utils'

interface MemberDetailContentProps {
  memberId: string
}

export function MemberDetailContent({ memberId }: MemberDetailContentProps) {
  const { data: member, isLoading, error, refetch } = useMember(memberId)

  // Calculate totals from daily usage on frontend
  const totals = useMemo(() => {
    if (!member?.dailyUsage) {
      return {
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreation: 0,
        cacheRead: 0,
        recordCount: 0,
        modelBreakdown: {},
      }
    }
    return calculateTotals(member.dailyUsage)
  }, [member?.dailyUsage])

  const modelsUsed = useMemo(() => getModelsUsed(totals), [totals])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    )
  }

  if (error || !member) {
    return (
      <ErrorState
        message={error ? 'Failed to load member data' : 'Member not found'}
        onRetry={refetch}
      />
    )
  }

  const stats: StatItem[] = [
    { label: 'Cost', value: formatCurrency(totals.costUsd ?? 0) },
    { label: 'Send', value: formatTokens(totals.inputTokens ?? 0) },
    { label: 'Receive', value: formatTokens(totals.outputTokens ?? 0) },
  ]

  return (
    <div className="space-y-6">
      {/* Year-to-date Stats */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
          Year to Date
        </p>
        <StatsBar stats={stats} />
      </div>

      {/* Charts with Month Selector */}
      <MemberDetailCharts memberId={memberId} />

      {/* Models Used */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
          Models Used
        </p>
        <TagList items={modelsUsed} emptyMessage="No models used yet" />
      </div>

      {/* Projects */}
      {member.projects && member.projects.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Projects ({member.projects.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Path</th>
                    <th className="pb-2 pr-4 font-medium">Git Repo</th>
                    <th className="pb-2 pr-4 font-medium">First Seen</th>
                    <th className="pb-2 font-medium">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {member.projects
                    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
                    .map((project) => (
                      <tr
                        key={project.path}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-2 pr-4 font-mono text-xs">
                          {project.path}
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                          {project.gitRepo || '—'}
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(project.firstSeen).toLocaleDateString()}
                        </td>
                        <td className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(project.lastSeen).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
