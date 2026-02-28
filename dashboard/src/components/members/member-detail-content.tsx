'use client'

import { useMemo } from 'react'
import { StatsBar, type StatItem } from '@/components/shared/stats-bar'
import { TagList } from '@/components/shared/tag-list'
import { ErrorState } from '@/components/shared/error-state'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { MemberDetailCharts } from './member-detail-charts'
import { useMember } from '@/hooks/use-members'
import { useSession } from '@/hooks/use-auth'
import { calculateTotals, getModelsUsed } from '@/lib/calculations'
import { formatCurrency, formatTokens } from '@/lib/utils'

interface MemberDetailContentProps {
  memberId: string
}

export function MemberDetailContent({ memberId }: MemberDetailContentProps) {
  const { data: member, isLoading, error, refetch } = useMember(memberId)
  const { data: currentUser } = useSession()
  const isAdmin = currentUser?.role === 'admin'

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

      {/* Projects (admin only) */}
      {isAdmin && member.projects && member.projects.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
            Projects ({member.projects.length})
          </p>
          <div className="rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Path</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Git Repo</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">First Seen</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {member.projects.map((project) => (
                  <tr key={project.path} className="border-b last:border-b-0">
                    <td className="px-3 py-2 font-mono text-xs" title={project.path}>
                      {project.path.split('/').slice(-2).join('/')}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                      {project.gitRepo || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(project.firstSeen).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(project.lastSeen).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
