import { appendFileSync } from 'node:fs';
import {
  loadConfig,
  loadState,
  saveState,
  targetId,
  getTargetState,
  setTargetState,
  toAgentConfig,
  LOG_FILE,
} from './lib/config.js';
import { collectUsageData } from './lib/collector.js';
import { pushToServer } from './lib/pusher.js';
import { pollAndExecuteCommands } from './lib/commander.js';

/**
 * Log message to file
 */
function log(message: string): void {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  appendFileSync(LOG_FILE, line);
}

/**
 * Run a single sync cycle (collect once, push to all targets)
 */
async function syncCycle(): Promise<void> {
  const config = loadConfig();
  const state = loadState();

  if (config.targets.length === 0) {
    log('No targets configured, skipping sync');
    return;
  }

  log(`Starting sync cycle... (${config.targets.length} target(s))`);
  log(`Tracked files: ${Object.keys(state.file_offsets).length}`);

  // Determine if prompts should be synced (use the earliest last_prompt_sync across all targets)
  const promptIntervalHours = config.prompt_sync_interval_hours ?? 24;
  let skipPrompts = false;

  const allPromptTimestamps = config.targets
    .map((t) => getTargetState(state, targetId(t)).last_prompt_sync_timestamp)
    .filter(Boolean) as string[];

  if (allPromptTimestamps.length === config.targets.length && allPromptTimestamps.length > 0) {
    // All targets have synced prompts before — check the most recent one
    const newest = allPromptTimestamps.sort().pop()!;
    const hoursSince = (Date.now() - new Date(newest).getTime()) / (1000 * 60 * 60);
    skipPrompts = hoursSince < promptIntervalHours;
  }

  log(`Prompts: ${skipPrompts ? 'skipped' : 'included'}`);

  try {
    // Collect data ONCE
    const result = await collectUsageData(config, state, { skipPrompts });
    log(`Collected ${result.entries.length} new entries from ${result.filesScanned} files (${result.linesProcessed} lines)`);

    if (result.errors.length > 0) {
      log(`Collection errors: ${result.errors.join(', ')}`);
    }

    if (result.entries.length === 0 && result.prompts.length === 0 && result.projects.length === 0) {
      log('No new data to sync');
      saveState({ ...state, file_offsets: result.updatedFileOffsets });
      return;
    }

    // Push to each target
    for (const target of config.targets) {
      const tid = targetId(target);
      const ts = getTargetState(state, tid);
      const agentConfig = toAgentConfig(config, target);

      try {
        const pushResult = await pushToServer(result.entries, agentConfig, {
          projects: result.projects,
          prompts: result.prompts,
        });

        log(`[${target.email}] Pushed: ${pushResult.totalSynced} synced, ${pushResult.totalSkipped} skipped`);

        if (pushResult.errors.length > 0) {
          log(`[${target.email}] Push errors: ${pushResult.errors.join(', ')}`);
        }

        setTargetState(state, tid, {
          ...ts,
          last_sync_timestamp: new Date().toISOString(),
          last_sync_records: pushResult.totalSynced,
          total_synced_records: ts.total_synced_records + pushResult.totalSynced,
          last_prompt_sync_timestamp: skipPrompts
            ? ts.last_prompt_sync_timestamp
            : new Date().toISOString(),
        });
      } catch (err) {
        log(`[${target.email}] Push error: ${(err as Error).message}`);
      }
    }

    // Save state once (shared file_offsets + all target states)
    state.file_offsets = result.updatedFileOffsets;
    saveState(state);
    log('Sync complete');
  } catch (err) {
    log(`Sync error: ${(err as Error).message}`);
  }

  // Poll for admin commands per target (non-fatal)
  for (const target of config.targets) {
    try {
      const agentConfig = toAgentConfig(config, target);
      await pollAndExecuteCommands(agentConfig, null);
    } catch (err) {
      log(`[${target.email}] Command poll error: ${(err as Error).message}`);
    }
  }
}

/**
 * Run daemon loop
 */
export async function runDaemon(): Promise<void> {
  const config = loadConfig();
  const intervalMs = config.sync_interval_minutes * 60 * 1000;

  log('Daemon started');
  log(`Sync interval: ${config.sync_interval_minutes} minutes`);
  log(`Prompt sync interval: ${config.prompt_sync_interval_hours ?? 24} hours`);
  log(`Targets: ${config.targets.map((t) => t.email).join(', ')}`);

  // Run initial sync
  await syncCycle();

  // Set up interval
  const intervalId = setInterval(syncCycle, intervalMs);

  // Handle shutdown signals
  const shutdown = () => {
    log('Received shutdown signal');
    clearInterval(intervalId);
    log('Daemon stopped');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Keep process running
  await new Promise(() => {});
}
