'use client'

import { Suspense, useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SummaryCard } from '@/components/dashboard/summary-card'
import { formatCurrency, formatTokens } from '@/lib/utils'
import { calculateTotals, getModelsUsed } from '@/lib/calculations'
import { MemberDetailCharts } from './member-detail-charts'
import { useMember } from '@/hooks/use-members'
import { PageLoader } from '@/components/shared/loading-spinner'

function MemberDetailContent() {
  const [id, setId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  // Read ID from URL on client mount (works in static export)
  useEffect(() => {
    setMounted(true)
    const urlParams = new URLSearchParams(window.location.search)
    const urlId = urlParams.get('id')
    setId(urlId || '')
  }, [])

  const { data: member, isLoading, error } = useMember(id || '')

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

  // Show loading until mounted and ID is read
  if (!mounted) {
    return <PageLoader />
  }

  if (!id) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">Member ID is required</p>
      </div>
    )
  }

  if (isLoading) {
    return <PageLoader />
  }

  if (error || !member) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">
          {error ? 'Failed to load member data' : 'Member not found'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/members">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to members</span>
          </Link>
        </Button>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{member.name}</h2>
          <p className="text-muted-foreground">{member.email}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard
          title="Total Cost"
          value={formatCurrency(totals.costUsd ?? 0)}
          valueClassName="font-mono"
        />
        <SummaryCard
          title="Send Tokens"
          value={formatTokens(totals.inputTokens ?? 0)}
          valueClassName="font-mono"
        />
        <SummaryCard
          title="Receive Tokens"
          value={formatTokens(totals.outputTokens ?? 0)}
          valueClassName="font-mono"
        />
      </div>

      {/* Charts with Month Selector */}
      <MemberDetailCharts memberId={id} />

      {/* Models Used */}
      <Card>
        <CardHeader>
          <CardTitle>Models Used</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {modelsUsed.length > 0 ? (
              modelsUsed.map((model) => (
                <span
                  key={model}
                  className="rounded-full bg-secondary px-3 py-1 text-sm"
                >
                  {model}
                </span>
              ))
            ) : (
              <span className="text-muted-foreground">No models used yet</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function MemberDetailPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <MemberDetailContent />
    </Suspense>
  )
}
