'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useMembers } from '@/hooks/use-members'
import { useDashboard } from '@/hooks/use-dashboard'
import { apiClient } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'
import { sortMembers, calculateRankings } from '@/lib/member-utils'
import { formatCurrency } from '@/lib/utils'
import { LoadingSpinner } from '@/components/shared/loading-spinner'
import { TokenRainScene } from '@/components/playground/token-rain-scene'
import { UsageMeterScene } from '@/components/playground/usage-meter-scene'
import { PodiumScene } from '@/components/playground/podium-scene'
import { PlanetsScene } from '@/components/playground/planets-scene'
import { CityScene } from '@/components/playground/city-scene'
import { MascotScene, type ReactionState } from '@/components/playground/mascot-scene'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DemoTab = 'tokens' | 'meter' | 'podium' | 'planets' | 'city' | 'mascot'

interface ModelDistributionItem {
  model: string
  costUsd: number
  percentage: number
}

const TABS: { id: DemoTab; label: string; emoji: string }[] = [
  { id: 'tokens', label: 'Token Coins', emoji: '\u{1FA99}' },
  { id: 'meter', label: 'Usage Meter', emoji: '\u{1F3AF}' },
  { id: 'podium', label: 'Podium', emoji: '\u{1F3C6}' },
  { id: 'planets', label: 'Planets', emoji: '\u{1FA90}' },
  { id: 'city', label: 'City', emoji: '\u{1F3D9}\u{FE0F}' },
  { id: 'mascot', label: 'Mascot', emoji: '\u{1F916}' },
]

// ---------------------------------------------------------------------------
// Data derivation helpers
// ---------------------------------------------------------------------------

function deriveMascotState(costChange: number): ReactionState {
  if (costChange < -5) return 'idle'
  if (costChange < 10) return 'typing'
  if (costChange < 30) return 'overloaded'
  return 'celebrating'
}

function deriveBurnRate(totalCost: number, avgCostPerMember: number, totalMembers: number): number {
  // Estimate monthly budget as avgCostPerMember * totalMembers * daysRatio
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()
  const expectedCost = avgCostPerMember * totalMembers
  if (expectedCost <= 0) return 0
  // Burn rate: actual spend as fraction of expected full-month spend
  const burnRate = totalCost / expectedCost
  // Normalize by progress through month
  const monthProgress = dayOfMonth / daysInMonth
  const normalizedRate = monthProgress > 0 ? burnRate / (1 / monthProgress) : burnRate
  return Math.max(0, Math.min(1, normalizedRate))
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PlaygroundV2Page() {
  const [activeTab, setActiveTab] = useState<DemoTab>('tokens')

  // Fetch data
  const { data: members, isLoading: membersLoading } = useMembers()
  const { data: dashboard, isLoading: dashboardLoading } = useDashboard()
  const { data: modelData, isLoading: modelLoading } = useQuery({
    queryKey: queryKeys.dashboard.modelDistribution(),
    queryFn: async () => {
      const response = await apiClient.get<{
        success: boolean
        data: ModelDistributionItem[]
      }>('/api/dashboard/model-distribution')
      return response.data
    },
    staleTime: 1000 * 60 * 5,
  })

  // Derived data for each scene
  const tokenData = useMemo(() => {
    if (!dashboard) return { totalCost: 0, totalTokens: 0 }
    return {
      totalCost: dashboard.summary.totalCost,
      totalTokens: dashboard.summary.totalInputTokens + dashboard.summary.totalOutputTokens,
    }
  }, [dashboard])

  const burnRate = useMemo(() => {
    if (!dashboard) return 0
    return deriveBurnRate(
      dashboard.summary.totalCost,
      dashboard.summary.avgCostPerMember,
      dashboard.summary.totalMembers
    )
  }, [dashboard])

  const podiumLeaders = useMemo(() => {
    if (!members || members.length === 0) return []
    const ranked = calculateRankings(members, 'costUsd')
    return ranked.slice(0, 3).map((m) => ({
      rank: m.rank,
      name: m.name,
      cost: formatCurrency(m.costUsd),
    }))
  }, [members])

  const planetModels = useMemo(() => {
    if (!modelData || modelData.length === 0) return []
    return modelData.map((m) => ({
      name: m.model,
      cost: formatCurrency(m.costUsd),
      percentage: m.percentage,
    }))
  }, [modelData])

  const cityMembers = useMemo(() => {
    if (!members || members.length === 0) return []
    const sorted = sortMembers(members, 'costUsd', 'desc')
    return sorted.slice(0, 12).map((m) => ({
      name: m.name,
      cost: m.costUsd,
    }))
  }, [members])

  const mascotState = useMemo<ReactionState>(() => {
    if (!dashboard) return 'idle'
    return deriveMascotState(dashboard.summary.costChange)
  }, [dashboard])

  const isLoading = membersLoading || dashboardLoading || modelLoading

  // ---------------------------------------------------------------------------
  // Render active scene
  // ---------------------------------------------------------------------------

  function renderScene() {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center bg-gray-950">
          <div className="flex flex-col items-center gap-3">
            <LoadingSpinner />
            <span className="text-sm text-white/50">Loading data...</span>
          </div>
        </div>
      )
    }

    switch (activeTab) {
      case 'tokens':
        return <TokenRainScene totalCost={tokenData.totalCost} totalTokens={tokenData.totalTokens} />
      case 'meter':
        return <UsageMeterScene burnRate={burnRate} />
      case 'podium':
        return podiumLeaders.length >= 3 ? (
          <PodiumScene leaders={podiumLeaders} />
        ) : (
          <div className="flex h-full items-center justify-center bg-gray-950 text-white/50">
            Need at least 3 members for the podium
          </div>
        )
      case 'planets':
        return planetModels.length > 0 ? (
          <PlanetsScene models={planetModels} />
        ) : (
          <div className="flex h-full items-center justify-center bg-gray-950 text-white/50">
            No model distribution data available
          </div>
        )
      case 'city':
        return cityMembers.length > 0 ? (
          <CityScene members={cityMembers} />
        ) : (
          <div className="flex h-full items-center justify-center bg-gray-950 text-white/50">
            No member data available
          </div>
        )
      case 'mascot':
        return <MascotScene reactionState={mascotState} />
    }
  }

  return (
    <div className="flex h-[calc(100vh-48px)] flex-col bg-gray-950">
      {/* Tab navigation */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-white/10 bg-black/60 px-4 py-2 backdrop-blur-md">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-white/50 hover:bg-white/5 hover:text-white/80'
            }`}
          >
            <span role="img" className="text-base">
              {tab.emoji}
            </span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Scene container */}
      <div className="flex-1 overflow-hidden">{renderScene()}</div>
    </div>
  )
}
