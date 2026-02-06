/**
 * Lambda Aggregator Handler
 *
 * Computes pre-calculated views from raw usage data hourly.
 * Triggered by EventBridge schedule rule.
 *
 * Output files:
 * - /views/dashboard.json - Team-wide statistics
 * - /views/members.json - Member list with current month stats
 * - /views/members/{memberId}.json - Individual member details
 * - /meta/last-processed.json - Processing metadata
 */

import type { ScheduledEvent, Context } from 'aws-lambda';
import {
  getJsonFromS3,
  putJsonToS3,
  getMemberRegistryKey,
  getRawDataKey,
  getSyncLogKey,
  getDashboardViewKey,
  getMembersViewKey,
  getMemberDetailViewKey,
  getMetaKey,
  mapWithConcurrency,
  addCost,
} from './lib/s3.js';

// ============================================
// Configuration Constants
// ============================================

const LIMITS = {
  /** Maximum concurrent S3 operations */
  S3_CONCURRENCY: 10,
  /** Number of recent syncs to include per member */
  RECENT_SYNCS_PER_MEMBER: 10,
  /** Number of top members to show in dashboard */
  TOP_MEMBERS: 10,
  /** Number of recent syncs to show in dashboard */
  RECENT_SYNCS_TEAM: 20,
  /** Number of top projects to show per member */
  TOP_PROJECTS: 20,
  /** Number of days for daily trend */
  DAILY_TREND_DAYS: 30,
} as const;
import type {
  MemberRegistry,
  MemberInfo,
  RawMonthlyData,
  SyncLog,
  SyncLogEntry,
  DashboardView,
  DashboardSummary,
  MembersView,
  MemberYearlyView,
  MonthlyData,
} from './lib/types.js';

// ============================================
// Types for Aggregator
// ============================================

interface ProcessingMeta {
  lastProcessedAt: string;
  lastProcessingDurationMs: number;
  membersProcessed: number;
  viewsGenerated: string[];
}

interface MemberAggregatedData {
  memberId: string;
  memberInfo: MemberInfo;
  year: number;
  monthlyAggregations: Record<string, MonthAggregation>; // "1", "2", ... "12"
  currentMonth: MonthAggregation;
  previousMonth: MonthAggregation;
  last30Days: DayAggregation[];
  recentSyncs: SyncLogEntry[];
}

interface DailyModelStats {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface DailyModelUsage {
  date: string;
  models: DailyModelStats[];
}

interface MonthAggregation {
  year: number;
  month: number;
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    recordCount: number;
  };
  dailyUsage: DayAggregation[];
  dailyModelUsage: DailyModelUsage[];
  modelBreakdown: Record<string, ModelBreakdown>;
  projectBreakdown: Record<string, number>;
}

interface DayAggregation {
  date: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  recordCount: number;
}

interface ModelBreakdown {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  recordCount: number;
}

// ============================================
// Helper Functions
// ============================================

function getCurrentMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function getPreviousMonth(): { year: number; month: number } {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 };
}

function getLast30DaysDates(): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = LIMITS.DAILY_TREND_DAYS - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
}

function createEmptyMonthAggregation(year: number, month: number): MonthAggregation {
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

function aggregateMonthData(rawData: RawMonthlyData | null, year: number, month: number): MonthAggregation {
  const result = createEmptyMonthAggregation(year, month);

  if (!rawData) {
    return result;
  }

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
      result.projectBreakdown[project] = addCost(result.projectBreakdown[project] || 0, entry.costUsd);
    }
  }

  // Sort daily usage by date
  result.dailyUsage = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Sort daily model usage by date
  result.dailyModelUsage = Array.from(dailyModelMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return result;
}

/**
 * Get aggregated data for a member for a specific year
 * Used for generating views for historical years (e.g., 2025)
 */
async function getMemberAggregatedDataForYear(
  memberId: string,
  memberInfo: MemberInfo,
  year: number
): Promise<MemberAggregatedData> {
  // Fetch all 12 months of the specified year in parallel
  const monthNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const rawDataResults = await Promise.all(
    monthNumbers.map((month) =>
      getJsonFromS3<RawMonthlyData>(getRawDataKey(memberId, year, month))
    )
  );

  // Aggregate all 12 months
  const monthlyAggregations: Record<string, MonthAggregation> = {};
  for (let i = 0; i < 12; i++) {
    const month = i + 1;
    monthlyAggregations[String(month)] = aggregateMonthData(rawDataResults[i], year, month);
  }

  // For historical years, use December as "current" and November as "previous"
  const currentMonthAgg = monthlyAggregations['12'];
  const previousMonthAgg = monthlyAggregations['11'];

  return {
    memberId,
    memberInfo,
    year,
    monthlyAggregations,
    currentMonth: currentMonthAgg,
    previousMonth: previousMonthAgg,
    last30Days: [], // Not needed for historical views
    recentSyncs: [], // Not needed for historical views
  };
}

async function getMemberAggregatedData(memberId: string, memberInfo: MemberInfo): Promise<MemberAggregatedData> {
  const { year: currentYear, month: currentMonthNum } = getCurrentMonth();
  const { year: prevYear, month: prevMonth } = getPreviousMonth();

  // Fetch all 12 months of the current year in parallel
  const monthNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const rawDataPromises = monthNumbers.map((month) =>
    getJsonFromS3<RawMonthlyData>(getRawDataKey(memberId, currentYear, month))
  );

  // Also fetch previous month if it's from previous year (for dashboard comparison)
  const prevMonthPromise =
    prevYear !== currentYear
      ? getJsonFromS3<RawMonthlyData>(getRawDataKey(memberId, prevYear, prevMonth))
      : Promise.resolve(null);

  const [rawDataResults, prevYearMonthRaw] = await Promise.all([
    Promise.all(rawDataPromises),
    prevMonthPromise,
  ]);

  // Aggregate all 12 months
  const monthlyAggregations: Record<string, MonthAggregation> = {};
  for (let i = 0; i < 12; i++) {
    const month = i + 1;
    monthlyAggregations[String(month)] = aggregateMonthData(rawDataResults[i], currentYear, month);
  }

  // Get current and previous month aggregations for dashboard/members views
  const currentMonthAgg = monthlyAggregations[String(currentMonthNum)];
  const previousMonthAgg =
    prevYear === currentYear
      ? monthlyAggregations[String(prevMonth)]
      : aggregateMonthData(prevYearMonthRaw, prevYear, prevMonth);

  // Get last 30 days data
  const last30DaysDates = getLast30DaysDates();
  const last30Days: DayAggregation[] = [];

  // Combine current and previous month data for last 30 days
  const allDailyData = new Map<string, DayAggregation>();
  for (const day of currentMonthAgg.dailyUsage) {
    allDailyData.set(day.date, day);
  }
  for (const day of previousMonthAgg.dailyUsage) {
    if (!allDailyData.has(day.date)) {
      allDailyData.set(day.date, day);
    }
  }

  for (const date of last30DaysDates) {
    const dayData = allDailyData.get(date);
    last30Days.push(
      dayData || {
        date,
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
        recordCount: 0,
      }
    );
  }

  // Get recent sync logs
  const syncLog = await getJsonFromS3<SyncLog>(getSyncLogKey(memberId, currentYear, currentMonthNum));
  const recentSyncs = (syncLog?.entries || []).slice(-LIMITS.RECENT_SYNCS_PER_MEMBER).reverse();

  return {
    memberId,
    memberInfo,
    year: currentYear,
    monthlyAggregations,
    currentMonth: currentMonthAgg,
    previousMonth: previousMonthAgg,
    last30Days,
    recentSyncs,
  };
}

// ============================================
// View Generation Functions
// ============================================

function generateDashboardView(
  memberDataList: MemberAggregatedData[],
  registry: MemberRegistry
): DashboardView {
  const now = new Date().toISOString();
  const totalMembers = Object.keys(registry.members).length;
  const activeMembers = memberDataList.filter((m) => m.currentMonth.totals.recordCount > 0).length;

  // Calculate team totals
  let totalCost = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let prevTotalCost = 0;

  const modelTotals: Record<string, number> = {};
  const memberCosts: Array<{ memberId: string; name: string; costUsd: number }> = [];

  for (const memberData of memberDataList) {
    totalCost = addCost(totalCost, memberData.currentMonth.totals.costUsd);
    totalInputTokens += memberData.currentMonth.totals.inputTokens;
    totalOutputTokens += memberData.currentMonth.totals.outputTokens;
    prevTotalCost = addCost(prevTotalCost, memberData.previousMonth.totals.costUsd);

    memberCosts.push({
      memberId: memberData.memberId,
      name: memberData.memberInfo.name,
      costUsd: memberData.currentMonth.totals.costUsd,
    });

    // Aggregate model distribution
    for (const [model, stats] of Object.entries(memberData.currentMonth.modelBreakdown)) {
      modelTotals[model] = addCost(modelTotals[model] || 0, stats.costUsd);
    }
  }

  // Calculate cost change percent
  const costChangePercent = prevTotalCost > 0 ? ((totalCost - prevTotalCost) / prevTotalCost) * 100 : 0;

  // Calculate avg cost per member
  const avgCostPerMember = activeMembers > 0 ? totalCost / activeMembers : 0;

  // Build daily trend (last 30 days, aggregated across all members)
  const dailyTrendMap = new Map<string, { costUsd: number; inputTokens: number; outputTokens: number }>();
  const last30DaysDates = getLast30DaysDates();
  for (const date of last30DaysDates) {
    dailyTrendMap.set(date, { costUsd: 0, inputTokens: 0, outputTokens: 0 });
  }
  for (const memberData of memberDataList) {
    for (const day of memberData.last30Days) {
      const existing = dailyTrendMap.get(day.date);
      if (existing) {
        existing.costUsd = addCost(existing.costUsd, day.costUsd);
        existing.inputTokens += day.inputTokens;
        existing.outputTokens += day.outputTokens;
      }
    }
  }
  const dailyTrend = Array.from(dailyTrendMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Top members by cost
  const topMembers = memberCosts
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, LIMITS.TOP_MEMBERS)
    .map((m) => ({
      memberId: m.memberId,
      name: m.name,
      costUsd: m.costUsd,
      percentage: totalCost > 0 ? (m.costUsd / totalCost) * 100 : 0,
    }));

  // Model distribution
  const modelDistribution = Object.entries(modelTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([model, costUsd]) => ({
      model,
      costUsd,
      percentage: totalCost > 0 ? (costUsd / totalCost) * 100 : 0,
    }));

  // Recent syncs (last 20 across all members)
  const allRecentSyncs: Array<{
    memberId: string;
    memberName: string;
    syncedAt: string;
    recordsInserted: number;
  }> = [];
  for (const memberData of memberDataList) {
    for (const sync of memberData.recentSyncs) {
      allRecentSyncs.push({
        memberId: memberData.memberId,
        memberName: memberData.memberInfo.name,
        syncedAt: sync.syncedAt,
        recordsInserted: sync.recordsInserted,
      });
    }
  }
  const recentSyncs = allRecentSyncs.sort((a, b) => b.syncedAt.localeCompare(a.syncedAt)).slice(0, LIMITS.RECENT_SYNCS_TEAM);

  const summary: DashboardSummary = {
    totalCost,
    totalInputTokens,
    totalOutputTokens,
    totalMembers,
    activeMembers,
    avgCostPerMember,
  };

  return {
    generatedAt: now,
    summary,
    costChangePercent,
    dailyTrend,
    topMembers,
    modelDistribution,
    recentSyncs,
  };
}

function generateMembersView(memberDataList: MemberAggregatedData[]): MembersView {
  const now = new Date().toISOString();

  // Team totals for current month
  let teamCostUsd = 0;
  let teamInputTokens = 0;
  let teamOutputTokens = 0;

  const members = memberDataList.map((memberData) => {
    const currentMonth = memberData.currentMonth.totals;
    const previousMonth = memberData.previousMonth.totals;

    teamCostUsd = addCost(teamCostUsd, currentMonth.costUsd);
    teamInputTokens += currentMonth.inputTokens;
    teamOutputTokens += currentMonth.outputTokens;

    const costChangePercent =
      previousMonth.costUsd > 0
        ? ((currentMonth.costUsd - previousMonth.costUsd) / previousMonth.costUsd) * 100
        : 0;

    return {
      id: memberData.memberId,
      name: memberData.memberInfo.name,
      email: memberData.memberInfo.email,
      role: memberData.memberInfo.role,
      isActive: memberData.memberInfo.isActive,
      lastSyncAt: memberData.memberInfo.lastSyncAt,
      currentMonth: {
        costUsd: currentMonth.costUsd,
        inputTokens: currentMonth.inputTokens,
        outputTokens: currentMonth.outputTokens,
      },
      previousMonth: {
        costUsd: previousMonth.costUsd,
        inputTokens: previousMonth.inputTokens,
        outputTokens: previousMonth.outputTokens,
      },
      costChangePercent,
    };
  });

  // Sort by cost descending
  members.sort((a, b) => b.currentMonth.costUsd - a.currentMonth.costUsd);

  return {
    generatedAt: now,
    teamTotals: {
      costUsd: teamCostUsd,
      inputTokens: teamInputTokens,
      outputTokens: teamOutputTokens,
    },
    members,
  };
}

function generateMemberYearlyView(memberData: MemberAggregatedData): MemberYearlyView {
  const now = new Date().toISOString();

  // Build monthly data record
  const months: Record<string, MonthlyData> = {};

  for (const [monthKey, monthAgg] of Object.entries(memberData.monthlyAggregations)) {
    // Model breakdown for this month
    const modelBreakdown = Object.entries(monthAgg.modelBreakdown)
      .sort((a, b) => b[1].costUsd - a[1].costUsd)
      .map(([model, stats]) => ({
        model,
        costUsd: stats.costUsd,
        percentage: monthAgg.totals.costUsd > 0 ? (stats.costUsd / monthAgg.totals.costUsd) * 100 : 0,
      }));

    // Project breakdown for this month
    const projectBreakdown = Object.entries(monthAgg.projectBreakdown)
      .sort((a, b) => b[1] - a[1])
      .slice(0, LIMITS.TOP_PROJECTS)
      .map(([project, costUsd]) => ({
        project,
        costUsd,
        percentage: monthAgg.totals.costUsd > 0 ? (costUsd / monthAgg.totals.costUsd) * 100 : 0,
      }));

    months[monthKey] = {
      totals: {
        costUsd: monthAgg.totals.costUsd,
        inputTokens: monthAgg.totals.inputTokens,
        outputTokens: monthAgg.totals.outputTokens,
        recordCount: monthAgg.totals.recordCount,
      },
      dailyUsage: monthAgg.dailyUsage,
      dailyModelUsage: monthAgg.dailyModelUsage,
      modelBreakdown,
      projectBreakdown,
    };
  }

  return {
    generatedAt: now,
    member: {
      id: memberData.memberId,
      name: memberData.memberInfo.name,
      email: memberData.memberInfo.email,
      role: memberData.memberInfo.role,
      isActive: memberData.memberInfo.isActive,
    },
    year: memberData.year,
    months,
    recentSyncs: memberData.recentSyncs,
  };
}

// ============================================
// Main Handler
// ============================================

export const handler = async (
  event: ScheduledEvent,
  context: Context
): Promise<{ status: string; membersProcessed: number; viewsGenerated: string[]; durationMs: number }> => {
  const startTime = Date.now();

  console.log('Aggregator triggered', {
    eventTime: event.time,
    requestId: context.awsRequestId,
    functionName: context.functionName,
  });

  try {
    // 1. Read member registry
    const registry = await getJsonFromS3<MemberRegistry>(getMemberRegistryKey());

    if (!registry || Object.keys(registry.members).length === 0) {
      console.log('No members found in registry, skipping aggregation');
      return {
        status: 'ok',
        membersProcessed: 0,
        viewsGenerated: [],
        durationMs: Date.now() - startTime,
      };
    }

    const memberIds = Object.keys(registry.members);
    console.log(`Processing ${memberIds.length} members with concurrency ${LIMITS.S3_CONCURRENCY}`);

    // 2. Fetch aggregated data for all members with bounded concurrency
    const memberDataList = await mapWithConcurrency(
      memberIds,
      (memberId) => getMemberAggregatedData(memberId, registry.members[memberId]),
      LIMITS.S3_CONCURRENCY
    );

    // 3. Generate views
    const viewsGenerated: string[] = [];

    // Generate dashboard view
    const dashboardView = generateDashboardView(memberDataList, registry);
    await putJsonToS3(getDashboardViewKey(), dashboardView);
    viewsGenerated.push(getDashboardViewKey());
    console.log('Generated dashboard view');

    // Generate members list view
    const membersView = generateMembersView(memberDataList);
    await putJsonToS3(getMembersViewKey(), membersView);
    viewsGenerated.push(getMembersViewKey());
    console.log('Generated members view');

    // Generate individual member yearly views for current year
    const { year: currentYear } = getCurrentMonth();
    for (const memberData of memberDataList) {
      const memberYearlyView = generateMemberYearlyView(memberData);
      const key = getMemberDetailViewKey(memberData.memberId, currentYear);
      await putJsonToS3(key, memberYearlyView);
      viewsGenerated.push(key);
    }
    console.log(`Generated ${memberDataList.length} member yearly views for ${currentYear}`);

    // Also generate views for previous year (2025) if we're early in the year
    // This ensures December 2025 data is accessible
    const previousYear = currentYear - 1;
    if (previousYear >= 2024) {
      const prevYearMemberData = await mapWithConcurrency(
        memberIds,
        (memberId) => getMemberAggregatedDataForYear(memberId, registry.members[memberId], previousYear),
        LIMITS.S3_CONCURRENCY
      );

      for (const memberData of prevYearMemberData) {
        // Only generate view if there's actual data for this year
        const hasData = Object.values(memberData.monthlyAggregations).some(
          (m) => m.totals.recordCount > 0
        );
        if (hasData) {
          const memberYearlyView = generateMemberYearlyView(memberData);
          const key = getMemberDetailViewKey(memberData.memberId, previousYear);
          await putJsonToS3(key, memberYearlyView);
          viewsGenerated.push(key);
        }
      }
      console.log(`Generated member yearly views for ${previousYear}`)
    }

    // 4. Update processing metadata
    const durationMs = Date.now() - startTime;
    const processingMeta: ProcessingMeta = {
      lastProcessedAt: new Date().toISOString(),
      lastProcessingDurationMs: durationMs,
      membersProcessed: memberDataList.length,
      viewsGenerated,
    };
    await putJsonToS3(getMetaKey(), processingMeta);

    console.log('Aggregator completed', {
      membersProcessed: memberDataList.length,
      viewsGenerated: viewsGenerated.length,
      durationMs,
    });

    return {
      status: 'ok',
      membersProcessed: memberDataList.length,
      viewsGenerated,
      durationMs,
    };
  } catch (error) {
    console.error('Aggregator error:', error);
    throw error;
  }
};
