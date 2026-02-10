import { loadConfig, loadState, saveState, isConfigured } from '../lib/config.js';
import { collectUsageData } from '../lib/collector.js';
import { pushToServer } from '../lib/pusher.js';

/**
 * Push usage data to server (manual sync)
 */
export async function pushCommand(options: {
  force?: boolean;
  dryRun?: boolean;
}): Promise<void> {
  // Check configuration
  if (!isConfigured()) {
    console.error('Error: Agent not configured. Run "ccusage-agent setup --server <url> --email <email>" first.');
    process.exit(1);
  }

  const config = loadConfig();
  let state = loadState();

  // Force mode - reset last sync timestamp to collect all data
  if (options.force) {
    console.log('Force mode: collecting all historical data...\n');
    state = { ...state, last_sync_timestamp: null };
  }

  console.log('Collecting usage data...');
  console.log(`  Last sync: ${state.last_sync_timestamp || 'never'}`);
  console.log(`  Scanning paths:`);
  for (const p of config.claude_paths) {
    console.log(`    - ${p}`);
  }

  // Collect data
  const startTime = Date.now();
  const result = await collectUsageData(config, state);
  const collectTime = Date.now() - startTime;

  console.log(`\nCollection complete in ${collectTime}ms:`);
  console.log(`  Files scanned: ${result.filesScanned}`);
  console.log(`  Lines processed: ${result.linesProcessed}`);
  console.log(`  New entries found: ${result.entries.length}`);

  if (result.errors.length > 0) {
    console.log(`  Errors: ${result.errors.length}`);
    for (const err of result.errors.slice(0, 5)) {
      console.log(`    - ${err}`);
    }
    if (result.errors.length > 5) {
      console.log(`    ... and ${result.errors.length - 5} more`);
    }
  }

  // Show project and prompt info
  if (result.projects.length > 0) {
    console.log(`  Projects discovered: ${result.projects.length}`);
    for (const p of result.projects.slice(0, 5)) {
      console.log(`    - ${p.path}${p.gitRepo ? ` (${p.gitRepo})` : ''}`);
    }
    if (result.projects.length > 5) {
      console.log(`    ... and ${result.projects.length - 5} more`);
    }
  }
  if (result.prompts.length > 0) {
    console.log(`  Prompts collected: ${result.prompts.length}`);
  }

  // Nothing to sync
  if (result.entries.length === 0 && result.prompts.length === 0 && result.projects.length === 0) {
    console.log('\nNo new data to sync.');
    return;
  }

  // Dry run - don't actually push
  if (options.dryRun) {
    console.log('\nDry run - not pushing to server.');
    if (result.entries.length > 0) {
      console.log('Sample entries:');
      for (const entry of result.entries.slice(0, 3)) {
        console.log(`  - ${entry.timestamp} | ${entry.model} | ${entry.usage.input_tokens} in / ${entry.usage.output_tokens} out`);
      }
      if (result.entries.length > 3) {
        console.log(`  ... and ${result.entries.length - 3} more`);
      }
    }
    return;
  }

  // Push to server
  console.log(`\nPushing ${result.entries.length} entries to server...`);

  const pushResult = await pushToServer(result.entries, config, {
    projects: result.projects,
    prompts: result.prompts,
    onProgress: (batch, total) => {
      process.stdout.write(`\r  Batch ${batch}/${total}...`);
    },
  });

  console.log('\n');
  console.log('Sync complete:');
  console.log(`  Synced: ${pushResult.totalSynced}`);
  console.log(`  Skipped (duplicates): ${pushResult.totalSkipped}`);

  if (pushResult.errors.length > 0) {
    console.log(`  Errors: ${pushResult.errors.length}`);
    for (const err of pushResult.errors) {
      console.log(`    - ${err}`);
    }
  }

  // Update state
  const newState = {
    ...state,
    last_sync_timestamp: new Date().toISOString(),
    last_sync_records: pushResult.totalSynced,
    total_synced_records: state.total_synced_records + pushResult.totalSynced,
    seen_request_ids: [
      ...state.seen_request_ids,
      ...result.entries.map((e) => e.request_id),
    ],
    seen_prompt_uuids: [
      ...(state.seen_prompt_uuids || []),
      ...result.prompts.map((p) => p.uuid),
    ],
  };

  saveState(newState);
  console.log(`\nState updated. Total synced: ${newState.total_synced_records}`);
}
