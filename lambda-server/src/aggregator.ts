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

import type { Context } from 'aws-lambda';
import {
  getJsonFromS3,
  putJsonToS3,
  getMemberRegistryKey,
  getRawDataKey,
  getAggregatedDataKey,
  getSyncLogKey,
  getDashboardViewKey,
  getMembersViewKey,
  getMemberDetailViewKey,
  getMetaKey,
  getProjectsKey,
  getPromptsKey,
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
  MonthAggregation,
  DayAggregation,
  MemberProjects,
  ProjectData,
  PromptMonthlyData,
} from './lib/types.js';
import { aggregateMonthData } from './lib/aggregation.js';

// ============================================
// Types for Aggregator
// ============================================

interface ProcessingMeta {
  lastProcessedAt: string;
  lastProcessingDurationMs: number;
  membersProcessed: number;
  viewsGenerated: string[];
}

interface AggregatorEvent {
  source?: string;
  force?: boolean;
  time?: string;
  [key: string]: unknown;
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
  projects: ProjectData[];
  promptStats: Record<string, { count: number }>;
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

/**
 * Read month aggregation with fallback strategy:
 * - Normal mode: read from aggregated/, fallback to raw/ + compute
 * - Force mode: always read from raw/ + compute, then backfill aggregated/
 */
async function readMonthAggregation(
  memberId: string,
  year: number,
  month: number,
  force: boolean
): Promise<MonthAggregation> {
  if (!force) {
    // Normal mode: try aggregated/ first
    const cached = await getJsonFromS3<MonthAggregation>(getAggregatedDataKey(memberId, year, month));
    if (cached) {
      return cached;
    }
    // Fallback to raw/ + compute + backfill
    const rawData = await getJsonFromS3<RawMonthlyData>(getRawDataKey(memberId, year, month));
    const aggregation = aggregateMonthData(rawData, year, month);
    if (rawData) {
      try {
        await putJsonToS3(getAggregatedDataKey(memberId, year, month), aggregation);
      } catch (err) {
        console.warn(`Failed to backfill aggregated/${memberId}/${year}-${month}:`, err);
      }
    }
    return aggregation;
  }

  // Force mode: read from raw/ + compute + backfill aggregated/
  const rawData = await getJsonFromS3<RawMonthlyData>(getRawDataKey(memberId, year, month));
  const aggregation = aggregateMonthData(rawData, year, month);

  // Backfill aggregated/ only if there's actual raw data
  if (rawData) {
    try {
      await putJsonToS3(getAggregatedDataKey(memberId, year, month), aggregation);
    } catch (err) {
      console.warn(`Failed to backfill aggregated/${memberId}/${year}-${month}:`, err);
    }
  }

  return aggregation;
}

/**
 * Get aggregated data for a member for a specific year
 * Used for generating views for historical years (e.g., 2025)
 */
async function getMemberAggregatedDataForYear(
  memberId: string,
  memberInfo: MemberInfo,
  year: number,
  force: boolean = false
): Promise<MemberAggregatedData> {
  // Fetch all 12 months of the specified year + projects + prompt counts in parallel
  const monthNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const [aggregationResults, memberProjects, ...promptResults] = await Promise.all([
    Promise.all(monthNumbers.map((month) => readMonthAggregation(memberId, year, month, force))),
    getJsonFromS3<MemberProjects>(getProjectsKey(memberId)),
    ...monthNumbers.map((month) => getJsonFromS3<PromptMonthlyData>(getPromptsKey(memberId, year, month))),
  ]);

  // Build monthly aggregations record
  const monthlyAggregations: Record<string, MonthAggregation> = {};
  for (let i = 0; i < 12; i++) {
    monthlyAggregations[String(i + 1)] = aggregationResults[i];
  }

  // Build prompt stats per month
  const promptStats: Record<string, { count: number }> = {};
  for (let i = 0; i < 12; i++) {
    const promptData = promptResults[i] as PromptMonthlyData | null;
    if (promptData?.prompts?.length) {
      promptStats[String(i + 1)] = { count: promptData.prompts.length };
    }
  }

  // Extract projects list
  const projects = memberProjects
    ? Object.values(memberProjects.projects)
    : [];

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
    projects,
    promptStats,
  };
}

async function getMemberAggregatedData(memberId: string, memberInfo: MemberInfo, force: boolean = false): Promise<MemberAggregatedData> {
  const { year: currentYear, month: currentMonthNum } = getCurrentMonth();
  const { year: prevYear, month: prevMonth } = getPreviousMonth();

  // Fetch all 12 months of the current year + projects + prompt counts in parallel
  const monthNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const aggregationPromises = monthNumbers.map((month) =>
    readMonthAggregation(memberId, currentYear, month, force)
  );

  // Also fetch previous month if it's from previous year (for dashboard comparison)
  const prevMonthPromise =
    prevYear !== currentYear
      ? readMonthAggregation(memberId, prevYear, prevMonth, force)
      : Promise.resolve(null);

  const [aggregationResults, prevYearMonthAgg, memberProjects, ...promptResults] = await Promise.all([
    Promise.all(aggregationPromises),
    prevMonthPromise,
    getJsonFromS3<MemberProjects>(getProjectsKey(memberId)),
    ...monthNumbers.map((month) => getJsonFromS3<PromptMonthlyData>(getPromptsKey(memberId, currentYear, month))),
  ]);

  // Build monthly aggregations record
  const monthlyAggregations: Record<string, MonthAggregation> = {};
  for (let i = 0; i < 12; i++) {
    monthlyAggregations[String(i + 1)] = aggregationResults[i];
  }

  // Get current and previous month aggregations for dashboard/members views
  const currentMonthAgg = monthlyAggregations[String(currentMonthNum)];
  const previousMonthAgg =
    prevYear === currentYear
      ? monthlyAggregations[String(prevMonth)]
      : prevYearMonthAgg!;

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

  // Build prompt stats per month
  const promptStats: Record<string, { count: number }> = {};
  for (let i = 0; i < 12; i++) {
    const promptData = promptResults[i] as PromptMonthlyData | null;
    if (promptData?.prompts?.length) {
      promptStats[String(i + 1)] = { count: promptData.prompts.length };
    }
  }

  // Extract projects list
  const projects = memberProjects
    ? Object.values(memberProjects.projects)
    : [];

  return {
    memberId,
    memberInfo,
    year: currentYear,
    monthlyAggregations,
    currentMonth: currentMonthAgg,
    previousMonth: previousMonthAgg,
    last30Days,
    recentSyncs,
    projects,
    promptStats,
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
    projects: memberData.projects,
    promptStats: memberData.promptStats,
  };
}

// ============================================
// Main Handler
// ============================================

export const handler = async (
  event: AggregatorEvent,
  context: Context
): Promise<{
  status: string;
  membersProcessed: number;
  processedMonths: string[];
  memberSummaries: Array<{ memberId: string; name: string; months: string[]; totalRecords: number }>;
  viewsGenerated: string[];
  durationMs: number;
  force: boolean;
}> => {
  const startTime = Date.now();
  const force = event.force === true;

  console.log('Aggregator triggered', {
    eventTime: event.time,
    requestId: context.awsRequestId,
    functionName: context.functionName,
    force,
  });

  try {
    // 1. Read member registry + previous processing meta (for change detection)
    const [registry, previousMeta] = await Promise.all([
      getJsonFromS3<MemberRegistry>(getMemberRegistryKey()),
      getJsonFromS3<ProcessingMeta>(getMetaKey()),
    ]);
    const lastProcessedAt = previousMeta?.lastProcessedAt ?? null;

    if (!registry || Object.keys(registry.members).length === 0) {
      console.log('No members found in registry, skipping aggregation');
      return {
        status: 'ok',
        membersProcessed: 0,
        processedMonths: [],
        memberSummaries: [],
        viewsGenerated: [],
        durationMs: Date.now() - startTime,
        force,
      };
    }

    const memberIds = Object.keys(registry.members);
    console.log(`Processing ${memberIds.length} members with concurrency ${LIMITS.S3_CONCURRENCY}`);

    // 2. Fetch aggregated data for all members with bounded concurrency
    const memberDataList = await mapWithConcurrency(
      memberIds,
      (memberId) => getMemberAggregatedData(memberId, registry.members[memberId], force),
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
    let prevYearMemberData: MemberAggregatedData[] = [];
    if (previousYear >= 2024) {
      prevYearMemberData = await mapWithConcurrency(
        memberIds,
        (memberId) => getMemberAggregatedDataForYear(memberId, registry.members[memberId], previousYear, force),
        LIMITS.S3_CONCURRENCY
      );

      for (const memberData of prevYearMemberData) {
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

    // 4. Collect processed months per member (only months changed since last run)
    // First run (no meta): all months with data. Subsequent runs: only months with new data.
    const allProcessedMonths = new Set<string>();
    const memberSummaries: Array<{
      memberId: string;
      name: string;
      months: string[];
      totalRecords: number;
    }> = [];

    function isMonthChanged(agg: MonthAggregation): boolean {
      if (agg.totals.recordCount === 0) return false;
      if (!lastProcessedAt) return true; // first run — include all
      if (!agg.lastUpdated) return true; // no timestamp — assume changed (safe default)
      return agg.lastUpdated > lastProcessedAt;
    }

    for (const memberData of memberDataList) {
      const memberMonths: string[] = [];
      let totalRecords = 0;

      // Current year months
      for (const [monthKey, agg] of Object.entries(memberData.monthlyAggregations)) {
        if (isMonthChanged(agg)) {
          const monthStr = `${currentYear}-${monthKey.padStart(2, '0')}`;
          memberMonths.push(monthStr);
          allProcessedMonths.add(monthStr);
          totalRecords += agg.totals.recordCount;
        }
      }

      // Previous year months
      const prevData = prevYearMemberData.find((d) => d.memberId === memberData.memberId);
      if (prevData) {
        for (const [monthKey, agg] of Object.entries(prevData.monthlyAggregations)) {
          if (isMonthChanged(agg)) {
            const monthStr = `${previousYear}-${monthKey.padStart(2, '0')}`;
            memberMonths.push(monthStr);
            allProcessedMonths.add(monthStr);
            totalRecords += agg.totals.recordCount;
          }
        }
      }

      if (memberMonths.length > 0) {
        memberSummaries.push({
          memberId: memberData.memberId,
          name: memberData.memberInfo.name,
          months: memberMonths.sort(),
          totalRecords,
        });
      }
    }

    const processedMonths = Array.from(allProcessedMonths).sort();

    // 5. Update processing metadata
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
      processedMonths,
      viewsGenerated: viewsGenerated.length,
      durationMs,
    });

    return {
      status: 'ok',
      membersProcessed: memberDataList.length,
      processedMonths,
      memberSummaries,
      viewsGenerated,
      durationMs,
      force,
    };
  } catch (error) {
    console.error('Aggregator error:', error);
    throw error;
  }
};
