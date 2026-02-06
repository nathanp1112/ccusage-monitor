import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { eq, and, sql } from 'drizzle-orm';
import { db, usageRecords, members, syncLogs, dailyAggregates } from '../db/index.js';
import { usageIngestionPayloadSchema, type UsageEntry } from '../lib/schemas.js';
import { generateApiKey } from '../lib/api-key.js';

const app = new Hono();

/**
 * POST /api/usage - Ingest usage data from agents
 *
 * Authentication: by email (auto-creates member if not exists)
 */
app.post(
  '/',
  zValidator('json', usageIngestionPayloadSchema),
  async (c) => {
    const payload = c.req.valid('json');
    const email = payload.email.toLowerCase().trim();

    // Find member by email
    let member = await db.query.members.findFirst({
      where: eq(members.email, email),
    });

    // Auto-create member if not exists
    if (!member) {
      const apiKey = generateApiKey();
      const name = email.split('@')[0]; // Use email prefix as name

      const [newMember] = await db
        .insert(members)
        .values({
          name,
          email,
          role: 'member',
          apiKey,
        })
        .returning();

      member = newMember;
      console.log(`Auto-created member: ${email}`);
    }

    if (!member.isActive) {
      return c.json({ success: false, error: 'Account is deactivated' }, 403);
    }

    const clientIp = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || 'unknown';
    const userAgent = c.req.header('User-Agent') || 'unknown';

    let synced = 0;
    let skipped = 0;

    // Process entries in transaction
    await db.transaction(async (tx) => {
      for (const entry of payload.entries) {
        try {
          // Try to insert, skip if duplicate (request_id already exists)
          const result = await tx
            .insert(usageRecords)
            .values({
              memberId: member.id,
              requestId: entry.request_id,
              recordedAt: new Date(entry.timestamp),
              usageDate: entry.timestamp.split('T')[0],
              model: entry.model,
              projectPath: entry.project_path || null,
              sessionId: entry.session_id || null,
              inputTokens: entry.usage.input_tokens,
              outputTokens: entry.usage.output_tokens,
              cacheCreationTokens: entry.usage.cache_creation_input_tokens || 0,
              cacheReadTokens: entry.usage.cache_read_input_tokens || 0,
              costUsd: String(entry.cost_usd || 0),
              claudeVersion: entry.version || null,
            })
            .onConflictDoNothing({ target: usageRecords.requestId })
            .returning({ id: usageRecords.id });

          if (result.length > 0) {
            synced++;
            // Update daily aggregate
            await updateDailyAggregate(tx, member.id, entry);
          } else {
            skipped++;
          }
        } catch (error) {
          // Log but continue processing other entries
          console.error('Failed to insert usage record:', error);
          skipped++;
        }
      }

      // Update member last sync time
      await tx
        .update(members)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(members.id, member.id));

      // Create sync log
      await tx.insert(syncLogs).values({
        memberId: member.id,
        recordsReceived: payload.entries.length,
        recordsInserted: synced,
        recordsSkipped: skipped,
        clientIp,
        userAgent,
        agentVersion: payload.agent_version || null,
        hostname: payload.hostname || null,
      });
    });

    // Generate sync ID for tracking
    const syncId = `sync_${Date.now()}_${member.id.slice(0, 8)}`;

    return c.json({
      success: true,
      data: {
        synced,
        skipped,
        sync_id: syncId,
      },
    });
  }
);

/**
 * Helper to update or create daily aggregate
 */
async function updateDailyAggregate(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  memberId: string,
  entry: UsageEntry
) {
  const usageDate = entry.timestamp.split('T')[0];

  // Try to find existing aggregate
  const existing = await tx.query.dailyAggregates.findFirst({
    where: and(
      eq(dailyAggregates.memberId, memberId),
      eq(dailyAggregates.usageDate, usageDate)
    ),
  });

  if (existing) {
    // Update existing aggregate
    const modelBreakdown = (existing.modelBreakdown || {}) as Record<string, {
      inputTokens: number;
      outputTokens: number;
      cacheCreationTokens: number;
      cacheReadTokens: number;
      costUsd: number;
      recordCount: number;
    }>;

    const modelStats = modelBreakdown[entry.model] || {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
      recordCount: 0,
    };

    modelStats.inputTokens += entry.usage.input_tokens;
    modelStats.outputTokens += entry.usage.output_tokens;
    modelStats.cacheCreationTokens += entry.usage.cache_creation_input_tokens || 0;
    modelStats.cacheReadTokens += entry.usage.cache_read_input_tokens || 0;
    modelStats.costUsd += entry.cost_usd || 0;
    modelStats.recordCount += 1;

    modelBreakdown[entry.model] = modelStats;

    await tx
      .update(dailyAggregates)
      .set({
        totalInputTokens: sql`${dailyAggregates.totalInputTokens} + ${entry.usage.input_tokens}`,
        totalOutputTokens: sql`${dailyAggregates.totalOutputTokens} + ${entry.usage.output_tokens}`,
        totalCacheCreation: sql`${dailyAggregates.totalCacheCreation} + ${entry.usage.cache_creation_input_tokens || 0}`,
        totalCacheRead: sql`${dailyAggregates.totalCacheRead} + ${entry.usage.cache_read_input_tokens || 0}`,
        totalCostUsd: sql`${dailyAggregates.totalCostUsd} + ${entry.cost_usd || 0}`,
        modelBreakdown,
        recordCount: sql`${dailyAggregates.recordCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(dailyAggregates.id, existing.id));
  } else {
    // Create new aggregate
    const modelBreakdown = {
      [entry.model]: {
        inputTokens: entry.usage.input_tokens,
        outputTokens: entry.usage.output_tokens,
        cacheCreationTokens: entry.usage.cache_creation_input_tokens || 0,
        cacheReadTokens: entry.usage.cache_read_input_tokens || 0,
        costUsd: entry.cost_usd || 0,
        recordCount: 1,
      },
    };

    await tx.insert(dailyAggregates).values({
      memberId,
      usageDate,
      totalInputTokens: entry.usage.input_tokens,
      totalOutputTokens: entry.usage.output_tokens,
      totalCacheCreation: entry.usage.cache_creation_input_tokens || 0,
      totalCacheRead: entry.usage.cache_read_input_tokens || 0,
      totalCostUsd: String(entry.cost_usd || 0),
      modelBreakdown,
      recordCount: 1,
    });
  }
}

export default app;
