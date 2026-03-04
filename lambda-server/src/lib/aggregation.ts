/**
 * Shared Aggregation Logic
 * Used by both sync.ts (write-time aggregation) and aggregator.ts (view generation)
 */

import { addCost } from './s3.js';
import type {
  RawMonthlyData,
  MonthAggregation,
  DayAggregation,
  DailyModelUsage,
  DailyModelStats,
  ModelBreakdown,
} from './types.js';

export function createEmptyMonthAggregation(year: number, month: number): MonthAggregation {
  return {
    year,
    month,
    totals: {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
      recordCount: 0,
    },
    dailyUsage: [],
    dailyModelUsage: [],
    modelBreakdown: {},
    projectBreakdown: {},
  };
}

export function aggregateMonthData(rawData: RawMonthlyData | null, year: number, month: number): MonthAggregation {
  const result = createEmptyMonthAggregation(year, month);

  if (!rawData) {
    return result;
  }

  // Carry forward the raw data's lastUpdated timestamp
  result.lastUpdated = rawData.lastUpdated;

  const dailyMap = new Map<string, DayAggregation>();
  const dailyModelMap = new Map<string, DailyModelUsage>();

  for (const [date, dailyRecord] of Object.entries(rawData.records)) {
    // Aggregate totals (using addCost for proper decimal precision)
    result.totals.inputTokens += dailyRecord.totals.inputTokens;
    result.totals.outputTokens += dailyRecord.totals.outputTokens;
    result.totals.cacheCreationTokens += dailyRecord.totals.cacheCreationTokens;
    result.totals.cacheReadTokens += dailyRecord.totals.cacheReadTokens;
    result.totals.costUsd = addCost(result.totals.costUsd, dailyRecord.totals.costUsd);
    result.totals.recordCount += dailyRecord.totals.recordCount;

    // Aggregate daily usage
    dailyMap.set(date, {
      date,
      costUsd: dailyRecord.totals.costUsd,
      inputTokens: dailyRecord.totals.inputTokens,
      outputTokens: dailyRecord.totals.outputTokens,
      recordCount: dailyRecord.totals.recordCount,
    });

    // Capture per-day per-model breakdown
    const dailyModels: DailyModelStats[] = [];
    for (const [model, stats] of Object.entries(dailyRecord.models)) {
      dailyModels.push({
        model,
        inputTokens: stats.inputTokens,
        outputTokens: stats.outputTokens,
        costUsd: stats.costUsd,
      });
    }
    // Sort models by cost descending within each day
    dailyModels.sort((a, b) => b.costUsd - a.costUsd);
    dailyModelMap.set(date, { date, models: dailyModels });

    // Aggregate model breakdown (monthly totals)
    for (const [model, stats] of Object.entries(dailyRecord.models)) {
      if (!result.modelBreakdown[model]) {
        result.modelBreakdown[model] = {
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          recordCount: 0,
        };
      }
      result.modelBreakdown[model].inputTokens += stats.inputTokens;
      result.modelBreakdown[model].outputTokens += stats.outputTokens;
      result.modelBreakdown[model].costUsd = addCost(result.modelBreakdown[model].costUsd, stats.costUsd);
      result.modelBreakdown[model].recordCount += stats.recordCount;
    }

    // Aggregate project breakdown
    for (const entry of dailyRecord.entries) {
      const project = entry.projectPath || 'Unknown';
      if (!result.projectBreakdown[project]) {
        result.projectBreakdown[project] = { costUsd: 0, requestCount: 0 };
      }
      result.projectBreakdown[project].costUsd = addCost(result.projectBreakdown[project].costUsd, entry.costUsd);
      result.projectBreakdown[project].requestCount += 1;
    }
  }

  // Sort daily usage by date
  result.dailyUsage = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Sort daily model usage by date
  result.dailyModelUsage = Array.from(dailyModelMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return result;
}
