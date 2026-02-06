/**
 * Frontend calculation utilities for usage data
 * Server returns raw daily data, frontend calculates totals and breakdowns
 */

export interface DailyUsage {
  date: string
  inputTokens: number
  outputTokens: number
  cacheCreation: number
  cacheRead: number
  costUsd: number
  recordCount: number
  modelBreakdown: Record<string, ModelStats>
}

export interface ModelStats {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  costUsd: number
  recordCount: number
}

export interface UsageTotals {
  inputTokens: number
  outputTokens: number
  cacheCreation: number
  cacheRead: number
  costUsd: number
  recordCount: number
  modelBreakdown: Record<string, ModelStats>
}

/**
 * Calculate totals from daily usage data
 */
export function calculateTotals(dailyUsage: DailyUsage[]): UsageTotals {
  return dailyUsage.reduce(
    (acc, day) => {
      acc.inputTokens += day.inputTokens
      acc.outputTokens += day.outputTokens
      acc.cacheCreation += day.cacheCreation
      acc.cacheRead += day.cacheRead
      acc.costUsd += day.costUsd
      acc.recordCount += day.recordCount

      // Merge model breakdowns
      if (day.modelBreakdown) {
        for (const [model, stats] of Object.entries(day.modelBreakdown)) {
          if (!acc.modelBreakdown[model]) {
            acc.modelBreakdown[model] = {
              inputTokens: 0,
              outputTokens: 0,
              cacheCreationTokens: 0,
              cacheReadTokens: 0,
              costUsd: 0,
              recordCount: 0,
            }
          }
          acc.modelBreakdown[model].inputTokens += stats.inputTokens || 0
          acc.modelBreakdown[model].outputTokens += stats.outputTokens || 0
          acc.modelBreakdown[model].cacheCreationTokens += stats.cacheCreationTokens || 0
          acc.modelBreakdown[model].cacheReadTokens += stats.cacheReadTokens || 0
          acc.modelBreakdown[model].costUsd += stats.costUsd || 0
          acc.modelBreakdown[model].recordCount += stats.recordCount || 0
        }
      }

      return acc
    },
    {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreation: 0,
      cacheRead: 0,
      costUsd: 0,
      recordCount: 0,
      modelBreakdown: {} as Record<string, ModelStats>,
    }
  )
}

/**
 * Get model data for charts (sorted by cost)
 */
export function getModelChartData(totals: UsageTotals) {
  return Object.entries(totals.modelBreakdown)
    .map(([model, stats]) => ({
      model,
      costUsd: stats.costUsd,
      tokens: stats.inputTokens + stats.outputTokens,
    }))
    .sort((a, b) => b.costUsd - a.costUsd)
}

/**
 * Get list of models used
 */
export function getModelsUsed(totals: UsageTotals): string[] {
  return Object.keys(totals.modelBreakdown)
}
