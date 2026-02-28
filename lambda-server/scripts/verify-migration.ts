#!/usr/bin/env npx tsx
/**
 * Migration Verification Script
 *
 * Compares PostgreSQL data with migrated S3 data to verify integrity.
 *
 * Usage:
 *   npx tsx scripts/verify-migration.ts
 *
 * Environment variables:
 *   DATABASE_URL - PostgreSQL connection string
 *   AWS_REGION - AWS region (default: ap-southeast-1)
 *   BUCKET_NAME - S3 bucket name
 */

import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import pg from 'pg';

// Configuration
const DATABASE_URL = process.env.DATABASE_URL;
const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-1';
const BUCKET_NAME = process.env.BUCKET_NAME;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

if (!BUCKET_NAME) {
  console.error('ERROR: BUCKET_NAME environment variable is required');
  process.exit(1);
}

// Initialize clients
const s3Client = new S3Client({ region: AWS_REGION });
const pgClient = new pg.Client({ connectionString: DATABASE_URL });

interface VerificationResult {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  expected: string | number;
  actual: string | number;
  details?: string;
}

const results: VerificationResult[] = [];

async function getJsonFromS3<T>(key: string): Promise<T | null> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);
    const bodyString = await response.Body?.transformToString();

    if (!bodyString) {
      return null;
    }

    return JSON.parse(bodyString) as T;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'NoSuchKey') {
      return null;
    }
    throw error;
  }
}

async function listS3Objects(prefix: string): Promise<string[]> {
  const command = new ListObjectsV2Command({
    Bucket: BUCKET_NAME,
    Prefix: prefix,
  });

  const response = await s3Client.send(command);
  return (response.Contents || []).map((obj) => obj.Key!).filter(Boolean);
}

async function verifyMemberCount(): Promise<void> {
  console.log('\n1️⃣  Verifying member count...');

  // Get PostgreSQL count
  const pgResult = await pgClient.query('SELECT COUNT(*) as count FROM members');
  const pgCount = parseInt(pgResult.rows[0].count, 10);

  // Get S3 count
  const registry = await getJsonFromS3<{ members: Record<string, unknown> }>('members/index.json');
  const s3Count = registry ? Object.keys(registry.members).length : 0;

  const status = pgCount === s3Count ? 'PASS' : 'FAIL';

  results.push({
    check: 'Member Count',
    status,
    expected: pgCount,
    actual: s3Count,
  });

  console.log(`   PostgreSQL: ${pgCount} members`);
  console.log(`   S3:         ${s3Count} members`);
  console.log(`   Status:     ${status}`);
}

async function verifyRecordCount(): Promise<void> {
  console.log('\n2️⃣  Verifying total record count...');

  // Get PostgreSQL count
  const pgResult = await pgClient.query('SELECT COUNT(*) as count FROM usage_records');
  const pgCount = parseInt(pgResult.rows[0].count, 10);

  // Count records in S3
  const rawFiles = await listS3Objects('raw/');
  let s3Count = 0;

  for (const key of rawFiles) {
    if (key.endsWith('.json')) {
      const data = await getJsonFromS3<{ records: Record<string, { entries: unknown[] }> }>(key);
      if (data && data.records) {
        for (const daily of Object.values(data.records)) {
          s3Count += daily.entries.length;
        }
      }
    }
  }

  const status = pgCount === s3Count ? 'PASS' : 'FAIL';

  results.push({
    check: 'Total Record Count',
    status,
    expected: pgCount,
    actual: s3Count,
  });

  console.log(`   PostgreSQL: ${pgCount} records`);
  console.log(`   S3:         ${s3Count} records`);
  console.log(`   Status:     ${status}`);
}

async function verifyTotalCost(): Promise<void> {
  console.log('\n3️⃣  Verifying total cost...');

  // Get PostgreSQL total
  const pgResult = await pgClient.query('SELECT COALESCE(SUM(cost_usd), 0) as total FROM usage_records');
  const pgTotal = parseFloat(pgResult.rows[0].total);

  // Calculate S3 total
  const rawFiles = await listS3Objects('raw/');
  let s3Total = 0;

  for (const key of rawFiles) {
    if (key.endsWith('.json')) {
      const data = await getJsonFromS3<{ records: Record<string, { totals: { costUsd: number } }> }>(key);
      if (data && data.records) {
        for (const daily of Object.values(data.records)) {
          s3Total += daily.totals.costUsd;
        }
      }
    }
  }

  // Allow $0.01 tolerance for floating point
  const diff = Math.abs(pgTotal - s3Total);
  const status = diff < 0.01 ? 'PASS' : diff < 1.0 ? 'WARN' : 'FAIL';

  results.push({
    check: 'Total Cost',
    status,
    expected: `$${pgTotal.toFixed(6)}`,
    actual: `$${s3Total.toFixed(6)}`,
    details: `Difference: $${diff.toFixed(6)}`,
  });

  console.log(`   PostgreSQL: $${pgTotal.toFixed(6)}`);
  console.log(`   S3:         $${s3Total.toFixed(6)}`);
  console.log(`   Difference: $${diff.toFixed(6)}`);
  console.log(`   Status:     ${status}`);
}

async function verifySyncLogCount(): Promise<void> {
  console.log('\n4️⃣  Verifying sync log count...');

  // Get PostgreSQL count
  const pgResult = await pgClient.query('SELECT COUNT(*) as count FROM sync_logs');
  const pgCount = parseInt(pgResult.rows[0].count, 10);

  // Count S3 sync logs
  const syncFiles = await listS3Objects('sync-logs/');
  let s3Count = 0;

  for (const key of syncFiles) {
    if (key.endsWith('.json')) {
      const data = await getJsonFromS3<{ entries: unknown[] }>(key);
      if (data && data.entries) {
        s3Count += data.entries.length;
      }
    }
  }

  const status = pgCount === s3Count ? 'PASS' : 'FAIL';

  results.push({
    check: 'Sync Log Count',
    status,
    expected: pgCount,
    actual: s3Count,
  });

  console.log(`   PostgreSQL: ${pgCount} sync logs`);
  console.log(`   S3:         ${s3Count} sync logs`);
  console.log(`   Status:     ${status}`);
}

async function verifyRecordsByMember(): Promise<void> {
  console.log('\n5️⃣  Verifying record counts per member...');

  // Get PostgreSQL counts per member
  const pgResult = await pgClient.query(`
    SELECT m.id, m.name, COUNT(u.id) as count
    FROM members m
    LEFT JOIN usage_records u ON u.member_id = m.id
    GROUP BY m.id, m.name
    ORDER BY m.name
  `);

  const registry = await getJsonFromS3<{ members: Record<string, { name: string }> }>('members/index.json');

  let allMatch = true;

  for (const row of pgResult.rows) {
    const memberId = row.id;
    const memberName = row.name;
    const pgCount = parseInt(row.count, 10);

    // Count S3 records for this member
    const memberFiles = await listS3Objects(`raw/${memberId}/`);
    let s3Count = 0;

    for (const key of memberFiles) {
      const data = await getJsonFromS3<{ records: Record<string, { entries: unknown[] }> }>(key);
      if (data && data.records) {
        for (const daily of Object.values(data.records)) {
          s3Count += daily.entries.length;
        }
      }
    }

    const match = pgCount === s3Count;
    if (!match) {
      allMatch = false;
      console.log(`   ❌ ${memberName}: PG=${pgCount}, S3=${s3Count}`);
    } else {
      console.log(`   ✅ ${memberName}: ${pgCount} records`);
    }
  }

  results.push({
    check: 'Records per Member',
    status: allMatch ? 'PASS' : 'FAIL',
    expected: 'All match',
    actual: allMatch ? 'All match' : 'Mismatch found',
  });
}

async function verifySampleRecords(): Promise<void> {
  console.log('\n6️⃣  Verifying sample records (spot check)...');

  // Get 10 random records from PostgreSQL
  const pgResult = await pgClient.query(`
    SELECT
      u.request_id, u.member_id, u.usage_date, u.model,
      u.input_tokens, u.output_tokens, u.cost_usd
    FROM usage_records u
    ORDER BY RANDOM()
    LIMIT 10
  `);

  let matchCount = 0;
  let mismatchCount = 0;

  for (const row of pgResult.rows) {
    const memberId = row.member_id;
    const usageDate = row.usage_date;
    const [yearStr, monthStr] = usageDate.split('-');
    const key = `raw/${memberId}/${yearStr}-${monthStr}.json`;

    const data = await getJsonFromS3<{ records: Record<string, { entries: Array<{ requestId: string; inputTokens: number; outputTokens: number; costUsd: number }> }> }>(key);

    if (!data || !data.records[usageDate]) {
      console.log(`   ❌ Record ${row.request_id}: S3 file or date not found`);
      mismatchCount++;
      continue;
    }

    const s3Entry = data.records[usageDate].entries.find((e) => e.requestId === row.request_id);

    if (!s3Entry) {
      console.log(`   ❌ Record ${row.request_id}: Not found in S3`);
      mismatchCount++;
      continue;
    }

    // Compare key fields
    const inputMatch = s3Entry.inputTokens === row.input_tokens;
    const outputMatch = s3Entry.outputTokens === row.output_tokens;
    const costMatch = Math.abs(s3Entry.costUsd - parseFloat(row.cost_usd)) < 0.000001;

    if (inputMatch && outputMatch && costMatch) {
      console.log(`   ✅ Record ${row.request_id.substring(0, 8)}...`);
      matchCount++;
    } else {
      console.log(`   ❌ Record ${row.request_id}: Data mismatch`);
      mismatchCount++;
    }
  }

  results.push({
    check: 'Sample Records',
    status: mismatchCount === 0 ? 'PASS' : 'FAIL',
    expected: '10/10 match',
    actual: `${matchCount}/10 match`,
  });
}

async function runVerification(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Migration Verification');
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    // Connect to PostgreSQL
    console.log('\n🔌 Connecting to PostgreSQL...');
    await pgClient.connect();
    console.log('   Connected successfully');

    // Run verification checks
    await verifyMemberCount();
    await verifyRecordCount();
    await verifyTotalCost();
    await verifySyncLogCount();
    await verifyRecordsByMember();
    await verifySampleRecords();

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  Verification Summary');
    console.log('═══════════════════════════════════════════════════════════════');

    const passCount = results.filter((r) => r.status === 'PASS').length;
    const warnCount = results.filter((r) => r.status === 'WARN').length;
    const failCount = results.filter((r) => r.status === 'FAIL').length;

    console.log('');
    for (const result of results) {
      const icon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️' : '❌';
      console.log(`  ${icon} ${result.check}`);
      console.log(`     Expected: ${result.expected}`);
      console.log(`     Actual:   ${result.actual}`);
      if (result.details) {
        console.log(`     Details:  ${result.details}`);
      }
    }

    console.log('');
    console.log(`  Total: ${results.length} checks`);
    console.log(`  ✅ Pass: ${passCount}`);
    console.log(`  ⚠️  Warn: ${warnCount}`);
    console.log(`  ❌ Fail: ${failCount}`);

    if (failCount === 0) {
      console.log('\n✅ All verification checks passed!');
      process.exit(0);
    } else {
      console.log('\n❌ Some verification checks failed.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await pgClient.end();
  }
}

runVerification();
