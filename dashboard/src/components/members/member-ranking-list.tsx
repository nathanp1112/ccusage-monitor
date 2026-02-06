'use client'

import { cn, formatCurrency, formatTokens } from '@/lib/utils'
import { getRankDisplay } from '@/lib/member-utils'
import { RankingBar } from './ranking-bar'
import type { RankedMember, MemberSortField } from '@/types/members'

interface MemberRankingListProps {
  members: RankedMember[]
  sortField: MemberSortField
  onMemberClick?: (memberId: string) => void
  className?: string
}

export function MemberRankingList({
  members,
  sortField,
  onMemberClick,
  className,
}: MemberRankingListProps) {
  const formatValue = (member: RankedMember) => {
    switch (sortField) {
      case 'costUsd':
        return formatCurrency(member.costUsd)
      case 'inputTokens':
        return formatTokens(member.inputTokens)
      case 'outputTokens':
        return formatTokens(member.outputTokens)
      default:
        return formatCurrency(member.costUsd)
    }
  }

  const getBarColor = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-yellow-500'
      case 2:
        return 'bg-gray-400'
      case 3:
        return 'bg-amber-600'
      default:
        return 'bg-primary/60'
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      {members.map((member) => {
        const { medal } = getRankDisplay(member.rank)

        return (
          <div
            key={member.id}
            onClick={() => onMemberClick?.(member.id)}
            className={cn(
              'group flex items-center gap-3 rounded-md border bg-card px-3 py-2 transition-colors',
              onMemberClick && 'cursor-pointer hover:bg-accent'
            )}
          >
            {/* Rank badge */}
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center">
              {medal ? (
                <span className="text-base">{medal}</span>
              ) : (
                <span className="text-xs font-medium text-muted-foreground">
                  #{member.rank}
                </span>
              )}
            </div>

            {/* Member info + bar */}
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{member.name}</span>
                <span className="flex-shrink-0 font-mono text-xs font-semibold">
                  {formatValue(member)}
                </span>
              </div>
              <RankingBar
                percentage={member.percentage}
                barClassName={getBarColor(member.rank)}
                className="h-1.5"
              />
            </div>
          </div>
        )
      })}

      {members.length === 0 && (
        <div className="flex h-32 items-center justify-center text-muted-foreground">
          No members found
        </div>
      )}
    </div>
  )
}
