#!/usr/bin/env npx tsx
/**
 * PostgreSQL to S3 Migration Script
 *
 * Exports existing PostgreSQL data to S3 in the new JSON format.
 *
 * Usage:
 *   npx tsx scripts/migrate-pg-to-s3.ts --dry-run
 *   npx tsx scripts/migrate-pg-to-s3.ts --execute
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string
 *   AWS_REGION - AWS region (default: ap-southeast-1)
 *   BUCKET_NAME - S3 bucket name
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import pg from 'pg';

// Types matching S3 format
interface MemberInfo {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string | null;
}

interface MemberRegistry {
  version: number;
  lastUpdated: string;
  members: Record<string, MemberInfo>;
}

interface UsageEntry {
  requestId: string;
  timestamp: string;
  model: string;
  projectPath: string | null;
  sessionId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  claudeVersion: string | null;
}

interface ModelStats {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  recordCount: number;
}

interface DailyRecord {
  date: string;
  updatedAt: string;
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    recordCount: number;
  };
  models: Record<string, ModelStats>;
  entries: UsageEntry[];
}

interface RawMonthlyData {
  memberId: string;
  year: number;
  month: number;
  lastUpdated: string;
  records: Record<string, DailyRecord>;
}

interface SyncLogEntry {
  syncId: string;
  syncedAt: string;
  recordsInserted: number;
  recordsSkipped: number;
  hostname: string | null;
  clientIp: string | null;
  userAgent: string | null;
  agentVersion: string | null;
}

interface SyncLog {
  memberId: string;
  year: number;
  month: number;
  entries: SyncLogEntry[];
}

interface MigrationStats {
  membersExported: number;
  recordsExported: number;
  monthFilesCreated: number;
  syncLogsExported: number;
  errors: string[];
}

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isExecute = args.includes('--execute');

if (!isDryRun && !isExecute) {
  console.log('Usage:');
  console.log('  npx tsx scripts/migrate-pg-to-s3.ts --dry-run    Preview migration without writing');
  console.log('  npx tsx scripts/migrate-pg-to-s3.ts --execute    Execute migration');
  process.exit(1);
}

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;
const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-1';
const BUCKET_NAME = process.env.BUCKET_NAME;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

if (!BUCKET_NAME && !isDryRun) {
  console.error('ERROR: BUCKET_NAME environment variable is required for execution');
  process.exit(1);
}

// Initialize clients
const s3Client = new S3Client({ region: AWS_REGION });
const pgClient = new pg.Client({ connectionString: DATABASE_URL });

async function putJsonToS3(key: string, data: unknown): Promise<void> {
  if (isDryRun) {
    console.log(`  [DRY RUN] Would write to s3://${BUCKET_NAME}/${key}`);
    return;
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json',
  });

  await s3Client.send(command);
  console.log(`  Wrote s3://${BUCKET_NAME}/${key}`);
}

async function exportMembers(): Promise<{ registry: MemberRegistry; stats: MigrationStats }> {
  console.log('\n📋 Exporting members...');

  const result = await pgClient.query(`
    SELECT id, name, email, role, is_active, last_sync_at, created_at, updated_at
    FROM members
    ORDER BY created_at
  `);

  const registry: MemberRegistry = {
    version: 1,
    lastUpdated: new Date().toISOString(),
    members: {},
  };

  const stats: MigrationStats = {
    membersExported: 0,
    recordsExported: 0,
    monthFilesCreated: 0,
    syncLogsExported: 0,
    errors: [],
  };

  for (const row of result.rows) {
    const memberInfo: MemberInfo = {
      id: row.id,
      name: row.name,
      email: row.email.toLowerCase(),
      role: row.role,
      isActive: row.is_active,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
    };

    registry.members[row.id] = memberInfo;
    stats.membersExported++;
  }

  console.log(`  Found ${stats.membersExported} members`);

  await putJsonToS3('members/index.json', registry);

  return { registry, stats };
}

async function exportUsageRecords(
  memberId: string,
  memberName: string,
  stats: MigrationStats
): Promise<void> {
  console.log(`\n📊 Exporting usage records for ${memberName} (${memberId})...`);

  const result = await pgClient.query(
    `
    SELECT
      request_id, recorded_at, usage_date, model, project_path, session_id,
      input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
      cost_usd, claude_version
    FROM usage_records
    WHERE member_id = $1
    ORDER BY recorded_at
  `,
    [memberId]
  );

  if (result.rows.length === 0) {
    console.log(`  No records found for ${memberName}`);
    return;
  }

  console.log(`  Found ${result.rows.length} records`);

  // Group records by year-month
  const monthlyData = new Map<string, RawMonthlyData>();

  for (const row of result.rows) {
    const usageDate = row.usage_date;
    const [yearStr, monthStr] = usageDate.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const monthKey = `${year}-${monthStr}`;

    // Initialize monthly data if needed
    if (!monthlyData.has(monthKey)) {
      monthlyData.set(monthKey, {
        memberId,
        year,
        month,
        lastUpdated: new Date().toISOString(),
        records: {},
      });
    }

    const monthly = monthlyData.get(monthKey)!;

    // Initialize daily record if needed
    if (!monthly.records[usageDate]) {
      monthly.records[usageDate] = {
        date: usageDate,
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

    const daily = monthly.records[usageDate];

    // Create usage entry
    const entry: UsageEntry = {
      requestId: row.request_id,
      timestamp: new Date(row.recorded_at).toISOString(),
      model: row.model,
      projectPath: row.project_path || null,
      sessionId: row.session_id || null,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheCreationTokens: row.cache_creation_tokens,
      cacheReadTokens: row.cache_read_tokens,
      costUsd: parseFloat(row.cost_usd),
      claudeVersion: row.claude_version || null,
    };

    // Add to entries
    daily.entries.push(entry);

    // Update totals
    daily.totals.inputTokens += entry.inputTokens;
    daily.totals.outputTokens += entry.outputTokens;
    daily.totals.cacheCreationTokens += entry.cacheCreationTokens;
    daily.totals.cacheReadTokens += entry.cacheReadTokens;
    daily.totals.costUsd += entry.costUsd;
    daily.totals.recordCount += 1;

    // Update model stats
    if (!daily.models[entry.model]) {
      daily.models[entry.model] = {
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0,
        recordCount: 0,
      };
    }
    daily.models[entry.model].inputTokens += entry.inputTokens;
    daily.models[entry.model].outputTokens += entry.outputTokens;
    daily.models[entry.model].cacheCreationTokens += entry.cacheCreationTokens;
    daily.models[entry.model].cacheReadTokens += entry.cacheReadTokens;
    daily.models[entry.model].costUsd += entry.costUsd;
    daily.models[entry.model].recordCount += 1;

    stats.recordsExported++;
  }

  // Write monthly files to S3
  for (const [monthKey, monthly] of monthlyData) {
    const key = `raw/${memberId}/${monthKey}.json`;
    await putJsonToS3(key, monthly);
    stats.monthFilesCreated++;
  }
}

async function exportSyncLogs(
  memberId: string,
  memberName: string,
  stats: MigrationStats
): Promise<void> {
  console.log(`\n📝 Exporting sync logs for ${memberName}...`);

  const result = await pgClient.query(
    `
    SELECT
      id, synced_at, records_inserted, records_skipped,
      hostname, client_ip, user_agent, agent_version
    FROM sync_logs
    WHERE member_id = $1
    ORDER BY synced_at
  `,
    [memberId]
  );

  if (result.rows.length === 0) {
    console.log(`  No sync logs found for ${memberName}`);
    return;
  }

  console.log(`  Found ${result.rows.length} sync logs`);

  // Group by year-month
  const monthlyLogs = new Map<string, SyncLog>();

  for (const row of result.rows) {
    const syncedAt = new Date(row.synced_at);
    const year = syncedAt.getFullYear();
    const month = syncedAt.getMonth() + 1;
    const monthKey = `${year}-${month.toString().padStart(2, '0')}`;

    if (!monthlyLogs.has(monthKey)) {
      monthlyLogs.set(monthKey, {
        memberId,
        year,
        month,
        entries: [],
      });
    }

    const entry: SyncLogEntry = {
      syncId: row.id,
      syncedAt: syncedAt.toISOString(),
      recordsInserted: row.records_inserted,
      recordsSkipped: row.records_skipped,
      hostname: row.hostname || null,
      clientIp: row.client_ip || null,
      userAgent: row.user_agent || null,
      agentVersion: row.agent_version || null,
    };

    monthlyLogs.get(monthKey)!.entries.push(entry);
    stats.syncLogsExported++;
  }

  // Write sync log files
  for (const [monthKey, log] of monthlyLogs) {
    const key = `sync-logs/${monthKey}/${memberId}.json`;
    await putJsonToS3(key, log);
  }
}

async function runMigration(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PostgreSQL to S3 Migration');
  console.log(`  Mode: ${isDryRun ? 'DRY RUN (preview only)' : 'EXECUTE'}`);
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    // Connect to PostgreSQL
    console.log('\n🔌 Connecting to PostgreSQL...');
    await pgClient.connect();
    console.log('  Connected successfully');

    // Export members
    const { registry, stats } = await exportMembers();

    // Export usage records and sync logs for each member
    for (const [memberId, member] of Object.entries(registry.members)) {
      await exportUsageRecords(memberId, member.name, stats);
      await exportSyncLogs(memberId, member.name, stats);
    }

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  Migration Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Members exported:     ${stats.membersExported}`);
    console.log(`  Records exported:     ${stats.recordsExported}`);
    console.log(`  Month files created:  ${stats.monthFilesCreated}`);
    console.log(`  Sync logs exported:   ${stats.syncLogsExported}`);

    if (stats.errors.length > 0) {
      console.log('\n⚠️  Errors encountered:');
      for (const error of stats.errors) {
        console.log(`    - ${error}`);
      }
    }

    if (isDryRun) {
      console.log('\n✨ Dry run complete. No data was written to S3.');
      console.log('   Run with --execute to perform the actual migration.');
    } else {
      console.log('\n✅ Migration complete!');
    }
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

runMigration();
