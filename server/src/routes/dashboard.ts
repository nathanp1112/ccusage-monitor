import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, sql, and, gte, lte, desc } from 'drizzle-orm';
import { db, members, dailyAggregates, syncLogs } from '../db/index.js';
import { dashboardQuerySchema } from '../lib/schemas.js';

const app = new Hono();

/**
 * GET /api/dashboard - Get team overview stats
 */
app.get('/', zValidator('query', dashboardQuerySchema), async (c) => {
  const query = c.req.valid('query');

  // Default to current month
  const now = new Date();
  const startDate = query.from || new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const endDate = query.to || new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  // Get previous period for comparison
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  const periodDays = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));

  const prevEndDate = new Date(startDateObj);
  prevEndDate.setDate(prevEndDate.getDate() - 1);
  const prevStartDate = new Date(prevEndDate);
  prevStartDate.setDate(prevStartDate.getDate() - periodDays);

  // Team totals for current period
  const [currentTotals] = await db
    .select({
      totalCost: sql<string>`COALESCE(SUM(${dailyAggregates.totalCostUsd}), 0)`,
      totalInputTokens: sql<number>`COALESCE(SUM(${dailyAggregates.totalInputTokens}), 0)`,
      totalOutputTokens: sql<number>`COALESCE(SUM(${dailyAggregates.totalOutputTokens}), 0)`,
      totalCacheCreation: sql<number>`COALESCE(SUM(${dailyAggregates.totalCacheCreation}), 0)`,
      totalCacheRead: sql<number>`COALESCE(SUM(${dailyAggregates.totalCacheRead}), 0)`,
      totalRecords: sql<number>`COALESCE(SUM(${dailyAggregates.recordCount}), 0)`,
    })
    .from(dailyAggregates)
    .where(
      and(
        gte(dailyAggregates.usageDate, startDate),
        lte(dailyAggregates.usageDate, endDate)
      )
    );

  // Previous period totals
  const [prevTotals] = await db
    .select({
      totalCost: sql<string>`COALESCE(SUM(${dailyAggregates.totalCostUsd}), 0)`,
    })
    .from(dailyAggregates)
    .where(
      and(
        gte(dailyAggregates.usageDate, prevStartDate.toISOString().split('T')[0]),
        lte(dailyAggregates.usageDate, prevEndDate.toISOString().split('T')[0])
      )
    );

  // Active members (synced in last 24 hours)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [activeMembers] = await db
    .select({
      count: sql<number>`COUNT(*)`,
    })
    .from(members)
    .where(
      and(
        eq(members.isActive, true),
        gte(members.lastSyncAt, oneDayAgo)
      )
    );

  // Total members
  const [totalMembers] = await db
    .select({
      count: sql<number>`COUNT(*)`,
    })
    .from(members)
    .where(eq(members.isActive, true));

  // Daily trend for chart
  const dailyTrend = await db
    .select({
      date: dailyAggregates.usageDate,
      totalCost: sql<string>`SUM(${dailyAggregates.totalCostUsd})`,
      totalInputTokens: sql<number>`SUM(${dailyAggregates.totalInputTokens})`,
      totalOutputTokens: sql<number>`SUM(${dailyAggregates.totalOutputTokens})`,
    })
    .from(dailyAggregates)
    .where(
      and(
        gte(dailyAggregates.usageDate, startDate),
        lte(dailyAggregates.usageDate, endDate)
      )
    )
    .groupBy(dailyAggregates.usageDate)
    .orderBy(dailyAggregates.usageDate);

  // Top users by cost
  const topUsers = await db
    .select({
      memberId: dailyAggregates.memberId,
      memberName: members.name,
      totalCost: sql<string>`SUM(${dailyAggregates.totalCostUsd})`,
      totalInputTokens: sql<number>`SUM(${dailyAggregates.totalInputTokens})`,
      totalOutputTokens: sql<number>`SUM(${dailyAggregates.totalOutputTokens})`,
    })
    .from(dailyAggregates)
    .innerJoin(members, eq(dailyAggregates.memberId, members.id))
    .where(
      and(
        gte(dailyAggregates.usageDate, startDate),
        lte(dailyAggregates.usageDate, endDate)
      )
    )
    .groupBy(dailyAggregates.memberId, members.name)
    .orderBy(desc(sql`SUM(${dailyAggregates.totalCostUsd})`))
    .limit(10);

  // Recent syncs
  const recentSyncs = await db
    .select({
      id: syncLogs.id,
      memberName: members.name,
      syncedAt: syncLogs.syncedAt,
      recordsInserted: syncLogs.recordsInserted,
      recordsSkipped: syncLogs.recordsSkipped,
    })
    .from(syncLogs)
    .innerJoin(members, eq(syncLogs.memberId, members.id))
    .orderBy(desc(syncLogs.syncedAt))
    .limit(10);

  // Calculate cost change percentage
  const currentCost = parseFloat(currentTotals?.totalCost || '0');
  const prevCost = parseFloat(prevTotals?.totalCost || '0');
  const costChange = prevCost > 0 ? ((currentCost - prevCost) / prevCost) * 100 : 0;

  return c.json({
    success: true,
    data: {
      period: {
        from: startDate,
        to: endDate,
      },
      summary: {
        totalCost: currentCost,
        costChange: Math.round(costChange * 10) / 10,
        totalInputTokens: currentTotals?.totalInputTokens || 0,
        totalOutputTokens: currentTotals?.totalOutputTokens || 0,
        totalCacheCreation: currentTotals?.totalCacheCreation || 0,
        totalCacheRead: currentTotals?.totalCacheRead || 0,
        totalRecords: currentTotals?.totalRecords || 0,
        activeMembers: activeMembers?.count || 0,
        totalMembers: totalMembers?.count || 0,
        avgCostPerMember: totalMembers?.count > 0
          ? Math.round((currentCost / totalMembers.count) * 100) / 100
          : 0,
      },
      dailyTrend: dailyTrend.map((d) => ({
        date: d.date,
        costUsd: parseFloat(d.totalCost || '0'),
        inputTokens: d.totalInputTokens || 0,
        outputTokens: d.totalOutputTokens || 0,
      })),
      topUsers: topUsers.map((u) => ({
        memberId: u.memberId,
        name: u.memberName,
        costUsd: parseFloat(u.totalCost || '0'),
        inputTokens: u.totalInputTokens || 0,
        outputTokens: u.totalOutputTokens || 0,
      })),
      recentSyncs: recentSyncs.map((s) => ({
        id: s.id,
        memberName: s.memberName,
        syncedAt: s.syncedAt.toISOString(),
        recordsInserted: s.recordsInserted,
        recordsSkipped: s.recordsSkipped,
      })),
    },
  });
});

/**
 * GET /api/dashboard/model-distribution - Get model usage breakdown
 */
app.get('/model-distribution', zValidator('query', dashboardQuerySchema), async (c) => {
  const query = c.req.valid('query');

  const now = new Date();
  const startDate = query.from || new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const endDate = query.to || new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  // Get all aggregates for the period
  const aggregates = await db
    .select({
      modelBreakdown: dailyAggregates.modelBreakdown,
    })
    .from(dailyAggregates)
    .where(
      and(
        gte(dailyAggregates.usageDate, startDate),
        lte(dailyAggregates.usageDate, endDate)
      )
    );

  // Merge model breakdowns
  const modelStats: Record<string, {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    recordCount: number;
  }> = {};

  for (const agg of aggregates) {
    if (agg.modelBreakdown) {
      for (const [model, stats] of Object.entries(agg.modelBreakdown as Record<string, any>)) {
        if (!modelStats[model]) {
          modelStats[model] = {
            costUsd: 0,
            inputTokens: 0,
            outputTokens: 0,
            recordCount: 0,
          };
        }
        modelStats[model].costUsd += stats.costUsd || 0;
        modelStats[model].inputTokens += stats.inputTokens || 0;
        modelStats[model].outputTokens += stats.outputTokens || 0;
        modelStats[model].recordCount += stats.recordCount || 0;
      }
    }
  }

  // Calculate total for percentages
  const totalCost = Object.values(modelStats).reduce((sum, s) => sum + s.costUsd, 0);

  const distribution = Object.entries(modelStats)
    .map(([model, stats]) => ({
      model,
      costUsd: Math.round(stats.costUsd * 100) / 100,
      inputTokens: stats.inputTokens,
      outputTokens: stats.outputTokens,
      recordCount: stats.recordCount,
      percentage: totalCost > 0 ? Math.round((stats.costUsd / totalCost) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  return c.json({
    success: true,
    data: distribution,
  });
});

export default app;
