'use client'

import { Monitor, Globe } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatTokens, formatRelativeTime } from '@/lib/utils'

export interface MemberCardData {
  id: string
  name: string
  email: string
  costUsd?: number | null
  inputTokens?: number | null
  lastSyncAt?: string | null
  isActive?: boolean
  lastSync?: {
    hostname?: string | null
    clientIp?: string | null
    userAgent?: string | null
    agentVersion?: string | null
  } | null
}

interface MemberCardProps {
  member: MemberCardData
  onClick?: () => void
}

export function MemberCard({ member, onClick }: MemberCardProps) {
  return (
    <div onClick={onClick} className="cursor-pointer">
      <Card className="transition-colors hover:bg-accent">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{member.name}</CardTitle>
          <p className="text-sm text-muted-foreground">{member.email}</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Cost (MTD)</p>
              <p className="font-mono font-semibold">
                {formatCurrency(member.costUsd ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Tokens</p>
              <p className="font-mono font-semibold">
                {formatTokens(member.inputTokens ?? 0)}
              </p>
            </div>
          </div>

          {/* Device info */}
          {member.lastSync && (
            <div className="mt-3 space-y-1 border-t pt-3 text-xs text-muted-foreground">
              {member.lastSync.hostname && (
                <div className="flex items-center gap-1.5">
                  <Monitor className="h-3 w-3" />
                  <span className="truncate font-mono">
                    {member.lastSync.hostname}
                  </span>
                </div>
              )}
              {member.lastSync.clientIp && (
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3 w-3" />
                  <span className="font-mono">{member.lastSync.clientIp}</span>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Last sync:{' '}
              {member.lastSyncAt
                ? formatRelativeTime(new Date(member.lastSyncAt))
                : 'never'}
            </span>
            {member.isActive && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Active
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
