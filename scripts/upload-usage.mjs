#!/usr/bin/env node
/**
 * Upload Claude usage data to Lambda API
 * Usage: node scripts/upload-usage.mjs <email> [api_url]
 */

import { createReadStream, readdirSync, statSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename, join } from 'node:path';
import { homedir, hostname } from 'node:os';

// Configuration
const EMAIL = process.argv[2];
const API_URL = process.argv[3] || 'https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com';

if (!EMAIL) {
  console.error('Usage: node scripts/upload-usage.mjs <email> [api_url]');
  process.exit(1);
}

// Claude data paths
const CLAUDE_PATHS = [
  join(homedir(), '.claude', 'projects'),
  join(homedir(), '.config', 'claude', 'projects'),
];

// Pricing per million tokens (as of 2024)
const PRICING = {
  'claude-opus-4-5-20251101': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-sonnet-4-20250514': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-3-5-sonnet-20240620': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  'claude-3-opus-20240229': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25, cacheWrite: 0.3, cacheRead: 0.03 },
  default: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
};

function calculateCost(usage, model) {
  const pricing = PRICING[model] || PRICING.default;
  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output;
  const cacheWriteCost = (usage.cache_creation_input_tokens / 1_000_000) * pricing.cacheWrite;
  const cacheReadCost = (usage.cache_read_input_tokens / 1_000_000) * pricing.cacheRead;
  return inputCost + outputCost + cacheWriteCost + cacheReadCost;
}

function extractProjectFromPath(filePath) {
  const segments = filePath.split('/');
  const projectsIndex = segments.findIndex((s) => s === 'projects');
  if (projectsIndex === -1 || projectsIndex + 1 >= segments.length) {
    return 'unknown';
  }
  return segments[projectsIndex + 1] || 'unknown';
}

function extractSessionFromPath(filePath) {
  return basename(filePath, '.jsonl') || 'unknown';
}

async function processJSONLFile(filePath) {
  const entries = [];
  const projectPath = extractProjectFromPath(filePath);
  const sessionId = extractSessionFromPath(filePath);

  return new Promise((resolve) => {
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const data = JSON.parse(line);
        if (!data.timestamp || !data.message?.usage) return;

        const usage = data.message.usage;
        const model = data.message.model || 'unknown';
        const inputTokens = usage.input_tokens || 0;
        const outputTokens = usage.output_tokens || 0;
        const cacheCreation = usage.cache_creation_input_tokens || 0;
        const cacheRead = usage.cache_read_input_tokens || 0;

        // Skip entries with no tokens
        if (inputTokens === 0 && outputTokens === 0 && cacheCreation === 0 && cacheRead === 0) {
          return;
        }

        const cost = calculateCost(
          { input_tokens: inputTokens, output_tokens: outputTokens, cache_creation_input_tokens: cacheCreation, cache_read_input_tokens: cacheRead },
          model
        );

        entries.push({
          request_id: data.requestId || `${sessionId}_${data.timestamp}`,
          timestamp: data.timestamp,
          model,
          project_path: projectPath,
          session_id: data.sessionId || sessionId,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cache_creation_tokens: cacheCreation,
          cache_read_tokens: cacheRead,
          cost_usd: cost,
          claude_version: data.version || null,
        });
      } catch {
        // Skip invalid lines
      }
    });

    rl.on('close', () => resolve(entries));
    rl.on('error', () => resolve(entries));
  });
}

function findJSONLFiles(basePath) {
  const files = [];
  if (!existsSync(basePath)) return files;

  function scan(dir) {
    try {
      const items = readdirSync(dir);
      for (const item of items) {
        const fullPath = join(dir, item);
        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            scan(fullPath);
          } else if (item.endsWith('.jsonl')) {
            files.push(fullPath);
          }
        } catch {
          // Skip inaccessible files
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  scan(basePath);
  return files;
}

async function pushToServer(entries) {
  const BATCH_SIZE = 500;
  let totalSynced = 0;
  let totalSkipped = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const payload = {
      email: EMAIL,
      entries: batch,
      agent_version: '0.1.0',
      hostname: hostname(),
    };

    try {
      const response = await fetch(`${API_URL}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (result.success) {
        const synced = result.inserted || result.data?.synced || 0;
        const skipped = result.skipped || result.data?.skipped || 0;
        totalSynced += synced;
        totalSkipped += skipped;
        console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: synced=${synced}, skipped=${skipped}`);
      } else {
        console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, result.error || result.message || 'Unknown error');
        totalSkipped += batch.length;
      }
    } catch (err) {
      console.error(`  Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, err.message);
      totalSkipped += batch.length;
    }
  }

  return { totalSynced, totalSkipped };
}

async function main() {
  console.log('========================================');
  console.log('Upload Claude Usage Data');
  console.log('========================================');
  console.log(`Email:    ${EMAIL}`);
  console.log(`API URL:  ${API_URL}`);
  console.log('========================================\n');

  // Collect all JSONL files
  console.log('[1/3] Scanning for JSONL files...');
  const allFiles = [];
  for (const claudePath of CLAUDE_PATHS) {
    const files = findJSONLFiles(claudePath);
    allFiles.push(...files);
    if (files.length > 0) {
      console.log(`  Found ${files.length} files in ${claudePath}`);
    }
  }

  if (allFiles.length === 0) {
    console.log('No JSONL files found.');
    return;
  }

  // Parse all files
  console.log(`\n[2/3] Parsing ${allFiles.length} files...`);
  const allEntries = [];
  let processed = 0;
  for (const file of allFiles) {
    const entries = await processJSONLFile(file);
    allEntries.push(...entries);
    processed++;
    if (processed % 100 === 0) {
      console.log(`  Processed ${processed}/${allFiles.length} files (${allEntries.length} entries)...`);
    }
  }

  // Sort by timestamp
  allEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  console.log(`  Total entries: ${allEntries.length}`);

  if (allEntries.length === 0) {
    console.log('No usage entries found.');
    return;
  }

  // Calculate total cost
  const totalCost = allEntries.reduce((sum, e) => sum + e.cost_usd, 0);
  console.log(`  Total estimated cost: $${totalCost.toFixed(2)}`);

  // Push to server
  console.log(`\n[3/3] Uploading to server...`);
  const { totalSynced, totalSkipped } = await pushToServer(allEntries);

  console.log('\n========================================');
  console.log('Upload Complete!');
  console.log('========================================');
  console.log(`  Synced:  ${totalSynced}`);
  console.log(`  Skipped: ${totalSkipped}`);
  console.log('========================================');
}

main().catch(console.error);
