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
  getAggregatedDataKey,
  getMemberRegistryKey,
  getSyncLogKey,
  getProjectsKey,
  getPromptsKey,
  withRetry,
  addCost,
} from '../lib/s3.js';
import { aggregateMonthData } from '../lib/aggregation.js';
import type {
  SyncRequest,
  SyncRequestEntry,
  SyncRequestProject,
  SyncRequestPrompt,
  SyncResponse,
  RawMonthlyData,
  DailyRecord,
  UsageEntry,
  MemberRegistry,
  MemberProjects,
  PromptMonthlyData,
  PromptRecord,
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
  file_extensions: z.record(z.string(), z.number().int().min(0)).optional(),
});

const syncProjectSchema = z.object({
  path: z.string().min(1),
  git_repo: z.string().nullable(),
});

const syncPromptSchema = z.object({
  uuid: z.string().min(1),
  session_id: z.string(),
  timestamp: z.string().min(1),
  project_path: z.string(),
  cwd: z.string(),
  content: z.string(),
});

const syncRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  name: z.string().optional(),
  entries: z.array(syncEntrySchema),
  projects: z.array(syncProjectSchema).optional(),
  prompts: z.array(syncPromptSchema).optional(),
  hostname: z.string().optional(),
  agent_version: z.string().optional(),
  local_ip: z.string().nullable().optional(),
  public_ip: z.string().nullable().optional(),
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
    fileExtensions: entry.file_extensions,
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
    const { email, name, entries, projects, prompts, hostname, agent_version, local_ip, public_ip } = body;

    // Handle empty entries - success with 0 inserted
    if (entries.length === 0) {
      return c.json<SyncResponse>({
        success: true,
        inserted: 0,
        skipped: 0,
      });
    }

    try {
      // Resolve member + update lastSync in a single registry read/write
      const publicIp = public_ip ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
      const { memberId } = await resolveAndUpdateMember(email, name, {
        hostname: hostname ?? null,
        agentVersion: agent_version ?? null,
        userAgent: c.req.header('user-agent') ?? null,
        localIp: local_ip ?? null,
        publicIp,
      });

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

      // Process all months in parallel
      const monthResults = await Promise.all(
        Array.from(entriesByMonth.entries()).map(([monthKey, monthEntries]) => {
          const [yearStr, monthStr] = monthKey.split('-');
          return processMonthEntries(
            memberId,
            parseInt(yearStr, 10),
            parseInt(monthStr, 10),
            monthEntries
          );
        })
      );

      let totalInserted = 0;
      let totalSkipped = 0;
      for (const { inserted, skipped } of monthResults) {
        totalInserted += inserted;
        totalSkipped += skipped;
      }

      // Run independent operations in parallel:
      // - projects, prompts, sync log
      // (member registry already updated in resolveAndUpdateMember above)
      const now = new Date();

      await Promise.all([
        // Save project data
        projects && projects.length > 0
          ? saveProjectData(memberId, projects).catch((e) =>
              console.warn(`Failed to save project data for ${memberId}:`, e))
          : undefined,

        // Save prompts
        prompts && prompts.length > 0
          ? savePrompts(memberId, prompts).catch((e) =>
              console.warn(`Failed to save prompts for ${memberId}:`, e))
          : undefined,

        // Log sync operation
        logSyncOperation(memberId, now, totalInserted, totalSkipped, {
          hostname: hostname ?? null,
          agentVersion: agent_version ?? null,
          userAgent: c.req.header('user-agent') ?? null,
          clientIp: publicIp,
          localIp: local_ip ?? null,
        }),
      ]);

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

/**
 * Single-pass member lookup + lastSync update.
 * Reads registry once, creates member if needed, updates lastSync, writes once.
 * Replaces separate getOrCreateMember + updateMemberLastSync (was 2 GETs + 2 PUTs → now 1 GET + 1 PUT).
 */
async function resolveAndUpdateMember(
  email: string,
  name: string | undefined,
  syncMeta: {
    hostname: string | null;
    agentVersion: string | null;
    userAgent: string | null;
    localIp: string | null;
    publicIp: string | null;
  }
): Promise<{ memberId: string; isNewMember: boolean }> {
  return withRetry(async () => {
    const registryKey = getMemberRegistryKey();
    const registryWithETag = await getJsonFromS3WithETag<MemberRegistry>(registryKey);

    let registry: MemberRegistry;
    let etag: string | null;

    if (!registryWithETag) {
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

    const now = new Date().toISOString();
    let memberId: string;
    let isNewMember = false;

    // Find existing member by email
    const existingMember = Object.values(registry.members).find(
      (m) => m.email.toLowerCase() === email.toLowerCase()
    );

    if (existingMember) {
      memberId = existingMember.id;
      existingMember.lastSyncAt = now;
      existingMember.updatedAt = now;
      existingMember.lastSync = {
        hostname: syncMeta.hostname,
        localIp: syncMeta.localIp,
        publicIp: syncMeta.publicIp,
        userAgent: syncMeta.userAgent,
        agentVersion: syncMeta.agentVersion,
      };
    } else {
      memberId = generateUUID();
      isNewMember = true;
      registry.members[memberId] = {
        id: memberId,
        name: name || email.split('@')[0],
        email: email.toLowerCase(),
        role: 'member',
        isActive: true,
        createdAt: now,
        updatedAt: now,
        lastSyncAt: now,
        lastSync: {
          hostname: syncMeta.hostname,
          localIp: syncMeta.localIp,
          publicIp: syncMeta.publicIp,
          userAgent: syncMeta.userAgent,
          agentVersion: syncMeta.agentVersion,
        },
      };
    }

    registry.lastUpdated = now;
    await putJsonToS3WithETag(registryKey, registry, etag);

    return { memberId, isNewMember };
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

    // Skip writes entirely when no new entries (already processed month)
    if (inserted === 0) {
      return { inserted, skipped };
    }

    monthData.lastUpdated = new Date().toISOString();

    // Save raw data and pre-aggregated summary in parallel
    const aggKey = getAggregatedDataKey(memberId, year, month);
    const aggregation = aggregateMonthData(monthData, year, month);

    await Promise.all([
      putJsonToS3(key, monthData),
      putJsonToS3(aggKey, aggregation).catch((aggError) => {
        console.warn(`Failed to write aggregated data for ${memberId}/${year}-${month}:`, aggError);
      }),
    ]);

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
    localIp: string | null;
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
      localIp: metadata.localIp,
      userAgent: metadata.userAgent,
      agentVersion: metadata.agentVersion,
    };

    syncLog.entries.push(logEntry);

    await putJsonToS3(key, syncLog);
  });
}

// ============================================
// Project Data Functions
// ============================================

async function saveProjectData(
  memberId: string,
  projects: SyncRequestProject[]
): Promise<void> {
  const key = getProjectsKey(memberId);
  let memberProjects = await getJsonFromS3<MemberProjects>(key);

  if (!memberProjects) {
    memberProjects = {
      memberId,
      lastUpdated: new Date().toISOString(),
      projects: {},
    };
  }

  const now = new Date().toISOString();
  let hasChanges = false;

  for (const project of projects) {
    const existing = memberProjects.projects[project.path];
    if (existing) {
      existing.lastSeen = now;
      existing.gitRepo = project.git_repo;
      hasChanges = true; // lastSeen updated
    } else {
      memberProjects.projects[project.path] = {
        path: project.path,
        gitRepo: project.git_repo,
        firstSeen: now,
        lastSeen: now,
      };
      hasChanges = true;
    }
  }

  if (hasChanges) {
    memberProjects.lastUpdated = now;
    await putJsonToS3(key, memberProjects);
  }
}

// ============================================
// Prompt Logging Functions
// ============================================

async function savePrompts(
  memberId: string,
  prompts: SyncRequestPrompt[]
): Promise<number> {
  // Group prompts by year-month
  const promptsByMonth = new Map<string, SyncRequestPrompt[]>();
  for (const prompt of prompts) {
    const date = prompt.timestamp.split('T')[0];
    const [yearStr, monthStr] = date.split('-');
    const key = `${yearStr}-${monthStr}`;

    if (!promptsByMonth.has(key)) {
      promptsByMonth.set(key, []);
    }
    promptsByMonth.get(key)!.push(prompt);
  }

  // Process all prompt months in parallel
  const monthResults = await Promise.all(
    Array.from(promptsByMonth.entries()).map(async ([monthKey, monthPrompts]) => {
      const [yearStr, monthStr] = monthKey.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const key = getPromptsKey(memberId, year, month);

      let promptData = await getJsonFromS3<PromptMonthlyData>(key);

      if (!promptData) {
        promptData = {
          memberId,
          year,
          month,
          lastUpdated: new Date().toISOString(),
          prompts: [],
        };
      }

      // Dedup by uuid
      const existingUuids = new Set(promptData.prompts.map((p) => p.uuid));
      const now = new Date().toISOString();
      let monthInserted = 0;

      for (const prompt of monthPrompts) {
        if (existingUuids.has(prompt.uuid)) continue;

        promptData.prompts.push({
          uuid: prompt.uuid,
          sessionId: prompt.session_id,
          timestamp: prompt.timestamp,
          projectPath: prompt.project_path,
          cwd: prompt.cwd,
          content: prompt.content,
          syncedAt: now,
        });
        monthInserted++;
      }

      // Skip write if all prompts for this month were duplicates
      if (monthInserted > 0) {
        promptData.lastUpdated = now;
        await putJsonToS3(key, promptData);
      }

      return monthInserted;
    })
  );

  return monthResults.reduce((sum, n) => sum + n, 0);
}

export default syncRoute;
