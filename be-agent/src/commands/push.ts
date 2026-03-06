import { loadConfig, loadState, saveState, isConfigured } from '../lib/config.js';
import { collectUsageData } from '../lib/collector.js';
import { pushToServer } from '../lib/pusher.js';

/**
 * Push usage data to server (manual sync)
 */
export async function pushCommand(options: {
  force?: boolean;
  dryRun?: boolean;
  noPrompts?: boolean;
  verbose?: boolean;
  currentMonth?: boolean;
}): Promise<void> {
  const verbose = options.verbose ?? false;

  // Check configuration
  if (!isConfigured()) {
    console.error('Error: Agent not configured. Run "ccusage-agent setup --server <url> --email <email>" first.');
    process.exit(1);
  }

  const config = loadConfig();
  let state = loadState();

  // Force mode - reset file offsets to re-read all files from scratch
  if (options.force) {
    if (verbose) console.log('Force mode: collecting all historical data...\n');
    state = { ...state, file_offsets: {} };
  }

  // Current-month mode - re-read all files but only push entries from current month
  if (options.currentMonth) {
    if (verbose) console.log('Current-month mode: re-parsing all files, filtering to current month only...\n');
    state = { ...state, file_offsets: {} };
  }

  // Always print scanned folders so users know what's being watched — DO NOT REMOVE
  console.log('Scanning:');
  for (const p of config.claude_paths) {
    console.log(`  ${p}`);
  }

  if (verbose) {
    console.log(`Last sync: ${state.last_sync_timestamp || 'never'}`);
    console.log(`Tracked files: ${Object.keys(state.file_offsets).length}`);
  }

  // Collect data
  const startTime = Date.now();
  const result = await collectUsageData(config, state, {
    skipPrompts: options.noPrompts ?? false,
  });
  const collectTime = Date.now() - startTime;

  if (verbose) {
    console.log(`\nCollection complete in ${collectTime}ms:`);
    console.log(`  Files scanned: ${result.filesScanned}`);
    console.log(`  Lines processed: ${result.linesProcessed}`);
    console.log(`  New entries found: ${result.entries.length}`);
  }

  if (result.errors.length > 0) {
    console.error(`Collection errors: ${result.errors.length}`);
    for (const err of result.errors.slice(0, 5)) {
      console.error(`  - ${err}`);
    }
    if (result.errors.length > 5) {
      console.error(`  ... and ${result.errors.length - 5} more`);
    }
  }

  // Current-month mode: keep only entries whose timestamp falls in the current year/month
  if (options.currentMonth) {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1; // 1-indexed
    const before = result.entries.length;
    result.entries = result.entries.filter((e) => {
      const d = new Date(e.timestamp);
      return d.getFullYear() === curYear && d.getMonth() + 1 === curMonth;
    });
    if (verbose) {
      console.log(`Current-month filter: kept ${result.entries.length}/${before} entries for ${curYear}-${String(curMonth).padStart(2, '0')}`);
    }
    // Don't re-sync prompts that may span prior months — skip them in this mode
    result.prompts = [];
  }

  if (verbose) {
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
  }

  // Nothing to sync
  if (result.entries.length === 0 && result.prompts.length === 0 && result.projects.length === 0) {
    console.log('No new data to sync.');
    // Still save updated file offsets so we don't re-scan unchanged files
    saveState({ ...state, file_offsets: result.updatedFileOffsets });
    return;
  }

  // Dry run - don't actually push
  if (options.dryRun) {
    console.log(`Dry run: ${result.entries.length} entries, ${result.prompts.length} prompts, ${result.projects.length} projects`);
    if (verbose && result.entries.length > 0) {
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
  if (verbose) {
    console.log(`\nPushing ${result.entries.length} entries to server...`);
  }

  const pushResult = await pushToServer(result.entries, config, {
    projects: result.projects,
    prompts: result.prompts,
    onProgress: verbose
      ? (batch, total) => { process.stdout.write(`\r  Batch ${batch}/${total}...`); }
      : undefined,
  });

  if (verbose) console.log('');

  if (pushResult.errors.length > 0) {
    console.error(`Sync errors: ${pushResult.errors.length}`);
    for (const err of pushResult.errors) {
      console.error(`  - ${err}`);
    }
  }

  // Update state with new file offsets
  const newState = {
    ...state,
    last_sync_timestamp: new Date().toISOString(),
    last_sync_records: pushResult.totalSynced,
    total_synced_records: state.total_synced_records + pushResult.totalSynced,
    file_offsets: result.updatedFileOffsets,
    last_prompt_sync_timestamp: options.noPrompts
      ? state.last_prompt_sync_timestamp
      : new Date().toISOString(),
  };

  saveState(newState);
  console.log(`Synced ${pushResult.totalSynced} entries, ${pushResult.totalSkipped} skipped. Total: ${newState.total_synced_records}`);
}
