import {
  loadConfig,
  loadState,
  saveState,
  isConfigured,
  targetId,
  getTargetState,
  setTargetState,
  toAgentConfig,
} from '../lib/config.js';
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
  const state = loadState();

  // Force mode - reset file offsets to re-read all files from scratch
  if (options.force) {
    if (verbose) console.log('Force mode: collecting all historical data...\n');
    state.file_offsets = {};
  }

  // Current-month mode - re-read all files but only push entries from current month
  if (options.currentMonth) {
    if (verbose) console.log('Current-month mode: re-parsing all files, filtering to current month only...\n');
    state.file_offsets = {};
  }

  if (verbose) {
    console.log('Scanning:');
    for (const p of config.claude_paths) {
      console.log(`  ${p}`);
    }
    console.log(`Tracked files: ${Object.keys(state.file_offsets).length}`);
  }

  // Collect data ONCE (shared across all targets)
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
    const curMonth = now.getMonth() + 1;
    const before = result.entries.length;
    result.entries = result.entries.filter((e) => {
      const d = new Date(e.timestamp);
      return d.getFullYear() === curYear && d.getMonth() + 1 === curMonth;
    });
    if (verbose) {
      console.log(`Current-month filter: kept ${result.entries.length}/${before} entries for ${curYear}-${String(curMonth).padStart(2, '0')}`);
    }
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
    console.log(`\nTargets (${config.targets.length}):`);
    for (const target of config.targets) {
      console.log(`  - ${target.email} → ${target.server_url}`);
    }
    return;
  }

  // Push to each target independently
  for (const target of config.targets) {
    const tid = targetId(target);
    const ts = getTargetState(state, tid);
    const agentConfig = toAgentConfig(config, target);

    if (verbose) {
      console.log(`\nPushing ${result.entries.length} entries to ${target.email} @ ${target.server_url}...`);
    }

    const pushResult = await pushToServer(result.entries, agentConfig, {
      projects: result.projects,
      prompts: result.prompts,
      onProgress: verbose
        ? (batch, total) => { process.stdout.write(`\r  Batch ${batch}/${total}...`); }
        : undefined,
    });

    if (verbose) console.log('');

    if (pushResult.errors.length > 0) {
      console.error(`Sync errors (${target.email}): ${pushResult.errors.length}`);
      for (const err of pushResult.errors) {
        console.error(`  - ${err}`);
      }
    }

    // Update per-target state
    setTargetState(state, tid, {
      ...ts,
      last_sync_timestamp: new Date().toISOString(),
      last_sync_records: pushResult.totalSynced,
      total_synced_records: ts.total_synced_records + pushResult.totalSynced,
      last_prompt_sync_timestamp: options.noPrompts
        ? ts.last_prompt_sync_timestamp
        : new Date().toISOString(),
    });

    console.log(`[${target.email}] Synced ${pushResult.totalSynced} entries, ${pushResult.totalSkipped} skipped. Total: ${state.targets[tid].total_synced_records}`);
  }

  // Save state once (shared file_offsets + all target states)
  state.file_offsets = result.updatedFileOffsets;
  saveState(state);
}
