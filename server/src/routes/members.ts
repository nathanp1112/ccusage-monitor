import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, desc, asc, sql, and, gte, lte, ilike, or } from 'drizzle-orm';
import { db, members, dailyAggregates, usageRecords, syncLogs } from '../db/index.js';
import {
  memberListQuerySchema,
  memberDetailQuerySchema,
  createMemberSchema,
} from '../lib/schemas.js';
import { generateApiKey } from '../lib/api-key.js';

const app = new Hono();

/**
 * GET /api/members - List all members with aggregated stats
 */
app.get('/', zValidator('query', memberListQuerySchema), async (c) => {
  const query = c.req.valid('query');

  // Build where conditions
  const conditions = [];
  if (query.active !== undefined) {
    conditions.push(eq(members.isActive, query.active));
  }
  if (query.search) {
    conditions.push(
      or(
        ilike(members.name, `%${query.search}%`),
        ilike(members.email, `%${query.search}%`)
      )
    );
  }

  // Get current month for stats
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .split('T')[0];

  // Query members with aggregated monthly stats
  const memberList = await db
    .select({
      id: members.id,
      name: members.name,
      email: members.email,
      role: members.role,
      isActive: members.isActive,
      lastSyncAt: members.lastSyncAt,
      createdAt: members.createdAt,
      // Monthly aggregates
      costUsd: sql<string>`COALESCE(SUM(${dailyAggregates.totalCostUsd}), 0)`.as('cost_usd'),
      inputTokens: sql<number>`COALESCE(SUM(${dailyAggregates.totalInputTokens}), 0)`.as(
        'input_tokens'
      ),
      outputTokens: sql<number>`COALESCE(SUM(${dailyAggregates.totalOutputTokens}), 0)`.as(
        'output_tokens'
      ),
    })
    .from(members)
    .leftJoin(
      dailyAggregates,
      and(
        eq(members.id, dailyAggregates.memberId),
        gte(dailyAggregates.usageDate, startOfMonth),
        lte(dailyAggregates.usageDate, endOfMonth)
      )
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(members.id)
    .orderBy(
      query.order === 'desc'
        ? desc(
            query.sort === 'costUsd'
              ? sql`cost_usd`
              : query.sort === 'lastSyncAt'
              ? members.lastSyncAt
              : members[query.sort]
          )
        : asc(
            query.sort === 'costUsd'
              ? sql`cost_usd`
              : query.sort === 'lastSyncAt'
              ? members.lastSyncAt
              : members[query.sort]
          )
    );

  // Get latest sync logs for all members
  const latestSyncLogs = await db
    .select({
      memberId: syncLogs.memberId,
      hostname: syncLogs.hostname,
      clientIp: syncLogs.clientIp,
      userAgent: syncLogs.userAgent,
      agentVersion: syncLogs.agentVersion,
    })
    .from(syncLogs)
    .where(
      sql`(${syncLogs.memberId}, ${syncLogs.syncedAt}) IN (
        SELECT member_id, MAX(synced_at)
        FROM sync_logs
        GROUP BY member_id
      )`
    );

  // Create a map for quick lookup
  const syncLogMap = new Map(
    latestSyncLogs.map((log) => [log.memberId, log])
  );

  return c.json({
    success: true,
    data: memberList.map((m) => {
      const latestSync = syncLogMap.get(m.id);
      return {
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        isActive: m.isActive,
        lastSyncAt: m.lastSyncAt?.toISOString() || null,
        createdAt: m.createdAt.toISOString(),
        costUsd: parseFloat(m.costUsd) || 0,
        inputTokens: m.inputTokens || 0,
        outputTokens: m.outputTokens || 0,
        // Latest sync info
        lastSync: latestSync
          ? {
              hostname: latestSync.hostname,
              clientIp: latestSync.clientIp,
              userAgent: latestSync.userAgent,
              agentVersion: latestSync.agentVersion,
            }
          : null,
      };
    }),
  });
});

/**
 * GET /api/members/:id - Get member with daily usage data
 * Frontend calculates totals and model breakdowns
 */
app.get('/:id', zValidator('query', memberDetailQuerySchema), async (c) => {
  const memberId = c.req.param('id');
  const query = c.req.valid('query');

  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
  });

  if (!member) {
    return c.json({ success: false, error: 'Member not found' }, 404);
  }

  // Determine date range
  const now = new Date();
  const year = query.year || now.getFullYear();
  const month = query.month || now.getMonth() + 1;

  const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  // Get daily aggregates for the period - no processing, just return raw data
  const aggregates = await db
    .select()
    .from(dailyAggregates)
    .where(
      and(
        eq(dailyAggregates.memberId, memberId),
        gte(dailyAggregates.usageDate, startDate),
        lte(dailyAggregates.usageDate, endDate)
      )
    )
    .orderBy(asc(dailyAggregates.usageDate));

  // Return raw daily data - frontend will calculate totals
  return c.json({
    success: true,
    data: {
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      isActive: member.isActive,
      lastSyncAt: member.lastSyncAt?.toISOString() || null,
      createdAt: member.createdAt.toISOString(),
      period: {
        year,
        month,
        startDate,
        endDate,
      },
      // Raw daily data - frontend calculates totals and model breakdowns
      dailyUsage: aggregates.map((agg) => ({
        date: agg.usageDate,
        inputTokens: agg.totalInputTokens,
        outputTokens: agg.totalOutputTokens,
        cacheCreation: agg.totalCacheCreation,
        cacheRead: agg.totalCacheRead,
        costUsd: parseFloat(String(agg.totalCostUsd)),
        recordCount: agg.recordCount,
        modelBreakdown: agg.modelBreakdown || {},
      })),
    },
  });
});

/**
 * GET /api/members/:id/usage - Get usage records for a member
 */
app.get('/:id/usage', zValidator('query', memberDetailQuerySchema), async (c) => {
  const memberId = c.req.param('id');
  const query = c.req.valid('query');

  // Determine date range
  const now = new Date();
  const year = query.year || now.getFullYear();
  const month = query.month || now.getMonth() + 1;

  const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const records = await db
    .select()
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.memberId, memberId),
        gte(usageRecords.usageDate, startDate),
        lte(usageRecords.usageDate, endDate)
      )
    )
    .orderBy(desc(usageRecords.recordedAt))
    .limit(1000);

  return c.json({
    success: true,
    data: records.map((r) => ({
      id: r.id,
      requestId: r.requestId,
      recordedAt: r.recordedAt.toISOString(),
      usageDate: r.usageDate,
      model: r.model,
      projectPath: r.projectPath,
      sessionId: r.sessionId,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cacheCreationTokens: r.cacheCreationTokens,
      cacheReadTokens: r.cacheReadTokens,
      costUsd: parseFloat(String(r.costUsd)),
      claudeVersion: r.claudeVersion,
    })),
  });
});

/**
 * POST /api/members - Create new member (admin only)
 */
app.post('/', zValidator('json', createMemberSchema), async (c) => {
  const input = c.req.valid('json');

  // Check if email already exists
  const existing = await db.query.members.findFirst({
    where: eq(members.email, input.email),
  });

  if (existing) {
    return c.json({ success: false, error: 'Email already exists' }, 409);
  }

  // Generate API key for agent authentication
  const apiKey = generateApiKey();

  // TODO: Hash password if provided
  const passwordHash = input.password ? input.password : null;

  const [member] = await db
    .insert(members)
    .values({
      name: input.name,
      email: input.email,
      role: input.role,
      apiKey,
      passwordHash,
    })
    .returning();

  return c.json(
    {
      success: true,
      data: {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        apiKey, // Only returned on creation
        createdAt: member.createdAt.toISOString(),
      },
    },
    201
  );
});

/**
 * PATCH /api/members/:id - Update member
 */
app.patch('/:id', async (c) => {
  const memberId = c.req.param('id');
  const body = await c.req.json();

  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
  });

  if (!member) {
    return c.json({ success: false, error: 'Member not found' }, 404);
  }

  const updates: Partial<typeof members.$inferInsert> = {};

  if (body.name) updates.name = body.name;
  if (body.email) updates.email = body.email;
  if (body.role) updates.role = body.role;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  updates.updatedAt = new Date();

  const [updated] = await db
    .update(members)
    .set(updates)
    .where(eq(members.id, memberId))
    .returning();

  return c.json({
    success: true,
    data: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      isActive: updated.isActive,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
});

/**
 * POST /api/members/:id/rotate-key - Rotate API key for member
 */
app.post('/:id/rotate-key', async (c) => {
  const memberId = c.req.param('id');

  const member = await db.query.members.findFirst({
    where: eq(members.id, memberId),
  });

  if (!member) {
    return c.json({ success: false, error: 'Member not found' }, 404);
  }

  const newApiKey = generateApiKey();

  await db
    .update(members)
    .set({ apiKey: newApiKey, updatedAt: new Date() })
    .where(eq(members.id, memberId));

  return c.json({
    success: true,
    data: {
      apiKey: newApiKey,
    },
  });
});

export default app;
