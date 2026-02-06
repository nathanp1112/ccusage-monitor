/**
 * Sync Route Handler
 * POST /api/sync - Receives usage data from be-agent
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  getJsonFromS3,
  getJsonFromS3WithETag,
  putJsonToS3,
  putJsonToS3WithETag,
  getRawDataKey,
  getMemberRegistryKey,
  getSyncLogKey,
  withRetry,
  addCost,
} from '../lib/s3.js';
import type {
  SyncRequest,
  SyncRequestEntry,
  SyncResponse,
  RawMonthlyData,
  DailyRecord,
  UsageEntry,
  MemberRegistry,
  MemberInfo,
  SyncLog,
  SyncLogEntry,
} from '../lib/types.js';

const syncRoute = new Hono();

// ============================================
// Request Validation Schema
// ============================================

const syncEntrySchema = z.object({
  request_id: z.string().min(1, 'request_id is required'),
  timestamp: z.string().min(1, 'timestamp is required'),
  model: z.string().min(1, 'model is required'),
  project_path: z.string().nullable().optional(),
  session_id: z.string().nullable().optional(),
  input_tokens: z.number().int().min(0),
  output_tokens: z.number().int().min(0),
  cache_creation_tokens: z.number().int().min(0).optional().default(0),
  cache_read_tokens: z.number().int().min(0).optional().default(0),
  cost_usd: z.number().min(0),
  claude_version: z.string().nullable().optional(),
});

const syncRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().optional(),
  entries: z.array(syncEntrySchema),
  hostname: z.string().optional(),
  agent_version: z.string().optional(),
});

// ============================================
// Helper Functions
// ============================================

function generateUUID(): string {
  return crypto.randomUUID();
}

function getDateFromTimestamp(timestamp: string): string {
  // Extract date part from ISO timestamp
  return timestamp.split('T')[0];
}

function getYearMonthFromDate(date: string): { year: number; month: number } {
  const [yearStr, monthStr] = date.split('-');
  return {
    year: parseInt(yearStr, 10),
    month: parseInt(monthStr, 10),
  };
}

/**
 * Convert API request entry to internal UsageEntry format
 */
function toUsageEntry(entry: SyncRequestEntry): UsageEntry {
  return {
    requestId: entry.request_id,
    timestamp: entry.timestamp,
    model: entry.model,
    projectPath: entry.project_path ?? null,
    sessionId: entry.session_id ?? null,
    inputTokens: entry.input_tokens,
    outputTokens: entry.output_tokens,
    cacheCreationTokens: entry.cache_creation_tokens ?? 0,
    cacheReadTokens: entry.cache_read_tokens ?? 0,
    costUsd: entry.cost_usd,
    claudeVersion: entry.claude_version ?? null,
  };
}

/**
 * Create empty daily record
 */
function createEmptyDailyRecord(date: string): DailyRecord {
  return {
    date,
    updatedAt: new Date().toISOString(),
    totals: {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
      recordCount: 0,
    },
    models: {},
    entries: [],
  };
}

/**
 * Add entry to daily record and update totals
 */
function addEntryToDailyRecord(record: DailyRecord, entry: UsageEntry): void {
  // Add to entries
  record.entries.push(entry);

  // Update totals (using addCost for proper decimal precision)
  record.totals.inputTokens += entry.inputTokens;
  record.totals.outputTokens += entry.outputTokens;
  record.totals.cacheCreationTokens += entry.cacheCreationTokens;
  record.totals.cacheReadTokens += entry.cacheReadTokens;
  record.totals.costUsd = addCost(record.totals.costUsd, entry.costUsd);
  record.totals.recordCount += 1;

  // Update model stats
  if (!record.models[entry.model]) {
    record.models[entry.model] = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      costUsd: 0,
      recordCount: 0,
    };
  }
  record.models[entry.model].inputTokens += entry.inputTokens;
  record.models[entry.model].outputTokens += entry.outputTokens;
  record.models[entry.model].cacheCreationTokens += entry.cacheCreationTokens;
  record.models[entry.model].cacheReadTokens += entry.cacheReadTokens;
  record.models[entry.model].costUsd = addCost(record.models[entry.model].costUsd, entry.costUsd);
  record.models[entry.model].recordCount += 1;

  record.updatedAt = new Date().toISOString();
}

// ============================================
// Sync Endpoint Handler
// ============================================

syncRoute.post(
  '/',
  zValidator('json', syncRequestSchema, (result, c) => {
    if (!result.success) {
      const errors = result.error.errors.map((e) => e.message).join(', ');
      return c.json(
        {
          success: false,
          error: errors,
          code: 'VALIDATION_ERROR',
        },
        400
      );
    }
  }),
  async (c) => {
    const startTime = Date.now();
    const body = c.req.valid('json') as SyncRequest;
    const { email, name, entries, hostname, agent_version } = body;

    // Handle empty entries - success with 0 inserted
    if (entries.length === 0) {
      return c.json<SyncResponse>({
        success: true,
        inserted: 0,
        skipped: 0,
      });
    }

    try {
      // Get or create member
      const { memberId, isNewMember } = await getOrCreateMember(email, name);

      // Group entries by year-month
      const entriesByMonth = new Map<string, SyncRequestEntry[]>();
      for (const entry of entries) {
        const date = getDateFromTimestamp(entry.timestamp);
        const { year, month } = getYearMonthFromDate(date);
        const key = `${year}-${month.toString().padStart(2, '0')}`;

        if (!entriesByMonth.has(key)) {
          entriesByMonth.set(key, []);
        }
        entriesByMonth.get(key)!.push(entry);
      }

      // Process each month's entries
      let totalInserted = 0;
      let totalSkipped = 0;

      for (const [monthKey, monthEntries] of entriesByMonth) {
        const [yearStr, monthStr] = monthKey.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);

        const { inserted, skipped } = await processMonthEntries(
          memberId,
          year,
          month,
          monthEntries
        );

        totalInserted += inserted;
        totalSkipped += skipped;
      }

      // Update member lastSyncAt
      await updateMemberLastSync(memberId, hostname, agent_version, c.req.header('user-agent'));

      // Log sync operation
      const now = new Date();
      await logSyncOperation(memberId, now, totalInserted, totalSkipped, {
        hostname: hostname ?? null,
        agentVersion: agent_version ?? null,
        userAgent: c.req.header('user-agent') ?? null,
        clientIp: c.req.header('x-forwarded-for') ?? null,
      });

      const duration = Date.now() - startTime;
      console.log(`Sync completed for ${email}: ${totalInserted} inserted, ${totalSkipped} skipped in ${duration}ms`);

      return c.json<SyncResponse>({
        success: true,
        inserted: totalInserted,
        skipped: totalSkipped,
        memberId,
      });
    } catch (error) {
      console.error('Sync error:', error);

      // Check for S3 availability errors
      if (error instanceof Error && error.name === 'ServiceUnavailable') {
        return c.json(
          {
            success: false,
            error: 'Storage service temporarily unavailable',
            code: 'SERVICE_UNAVAILABLE',
          },
          503
        );
      }

      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          code: 'INTERNAL_ERROR',
        },
        500
      );
    }
  }
);

// ============================================
// Member Registry Functions
// ============================================

async function getOrCreateMember(
  email: string,
  name?: string
): Promise<{ memberId: string; isNewMember: boolean }> {
  // Use withRetry to handle concurrent modifications via ETag
  return withRetry(async () => {
    const registryKey = getMemberRegistryKey();
    const registryWithETag = await getJsonFromS3WithETag<MemberRegistry>(registryKey);

    let registry: MemberRegistry;
    let etag: string | null;

    if (!registryWithETag) {
      // Initialize registry if doesn't exist
      registry = {
        version: 1,
        lastUpdated: new Date().toISOString(),
        members: {},
      };
      etag = null;
    } else {
      registry = registryWithETag.data;
      etag = registryWithETag.etag;
    }

    // Find existing member by email
    const existingMember = Object.values(registry.members).find(
      (m) => m.email.toLowerCase() === email.toLowerCase()
    );

    if (existingMember) {
      return { memberId: existingMember.id, isNewMember: false };
    }

    // Create new member
    const memberId = generateUUID();
    const now = new Date().toISOString();

    const newMember: MemberInfo = {
      id: memberId,
      name: name || email.split('@')[0],
      email: email.toLowerCase(),
      role: 'member',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastSyncAt: null,
    };

    registry.members[memberId] = newMember;
    registry.lastUpdated = now;

    // Conditional write - fails if registry was modified since we read it
    await putJsonToS3WithETag(registryKey, registry, etag);

    return { memberId, isNewMember: true };
  }, { retryConditionalFailed: true });
}

async function updateMemberLastSync(
  memberId: string,
  hostname?: string,
  agentVersion?: string,
  userAgent?: string
): Promise<void> {
  return withRetry(async () => {
    const registryKey = getMemberRegistryKey();
    const registryWithETag = await getJsonFromS3WithETag<MemberRegistry>(registryKey);

    if (!registryWithETag || !registryWithETag.data.members[memberId]) {
      return;
    }

    const registry = registryWithETag.data;
    const now = new Date().toISOString();
    registry.members[memberId].lastSyncAt = now;
    registry.members[memberId].updatedAt = now;
    registry.members[memberId].lastSync = {
      hostname: hostname ?? null,
      clientIp: null,
      userAgent: userAgent ?? null,
      agentVersion: agentVersion ?? null,
    };
    registry.lastUpdated = now;

    // Conditional write - retries on concurrent modification
    await putJsonToS3WithETag(registryKey, registry, registryWithETag.etag);
  }, { retryConditionalFailed: true });
}

// ============================================
// Raw Data Processing Functions
// ============================================

async function processMonthEntries(
  memberId: string,
  year: number,
  month: number,
  entries: SyncRequestEntry[]
): Promise<{ inserted: number; skipped: number }> {
  return withRetry(async () => {
    const key = getRawDataKey(memberId, year, month);
    let monthData = await getJsonFromS3<RawMonthlyData>(key);

    // Initialize month data if doesn't exist
    if (!monthData) {
      monthData = {
        memberId,
        year,
        month,
        lastUpdated: new Date().toISOString(),
        records: {},
      };
    }

    // Collect existing request IDs for deduplication
    const existingRequestIds = new Set<string>();
    for (const dailyRecord of Object.values(monthData.records)) {
      for (const entry of dailyRecord.entries) {
        existingRequestIds.add(entry.requestId);
      }
    }

    let inserted = 0;
    let skipped = 0;

    for (const entry of entries) {
      // Deduplicate by request_id
      if (existingRequestIds.has(entry.request_id)) {
        skipped++;
        continue;
      }

      const date = getDateFromTimestamp(entry.timestamp);

      // Get or create daily record
      if (!monthData.records[date]) {
        monthData.records[date] = createEmptyDailyRecord(date);
      }

      // Add entry to daily record
      const usageEntry = toUsageEntry(entry);
      addEntryToDailyRecord(monthData.records[date], usageEntry);
      existingRequestIds.add(entry.request_id);

      inserted++;
    }

    // Update lastUpdated
    monthData.lastUpdated = new Date().toISOString();

    // Save to S3
    await putJsonToS3(key, monthData);

    return { inserted, skipped };
  });
}

// ============================================
// Sync Logging Functions
// ============================================

async function logSyncOperation(
  memberId: string,
  syncTime: Date,
  recordsInserted: number,
  recordsSkipped: number,
  metadata: {
    hostname: string | null;
    agentVersion: string | null;
    userAgent: string | null;
    clientIp: string | null;
  }
): Promise<void> {
  const year = syncTime.getFullYear();
  const month = syncTime.getMonth() + 1;
  const key = getSyncLogKey(memberId, year, month);

  return withRetry(async () => {
    let syncLog = await getJsonFromS3<SyncLog>(key);

    if (!syncLog) {
      syncLog = {
        memberId,
        year,
        month,
        entries: [],
      };
    }

    const logEntry: SyncLogEntry = {
      syncId: generateUUID(),
      syncedAt: syncTime.toISOString(),
      recordsInserted,
      recordsSkipped,
      hostname: metadata.hostname,
      clientIp: metadata.clientIp,
      userAgent: metadata.userAgent,
      agentVersion: metadata.agentVersion,
    };

    syncLog.entries.push(logEntry);

    await putJsonToS3(key, syncLog);
  });
}

export default syncRoute;
