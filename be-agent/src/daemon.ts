import { appendFileSync } from 'node:fs';
import { loadConfig, loadState, saveState, LOG_FILE } from './lib/config.js';
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
 * Run a single sync cycle
 */
async function syncCycle(): Promise<void> {
  const config = loadConfig();
  const state = loadState();

  // Determine if prompts should be synced this cycle
  const promptIntervalHours = config.prompt_sync_interval_hours ?? 24;
  let skipPrompts = false;

  if (state.last_prompt_sync_timestamp) {
    const lastPromptSync = new Date(state.last_prompt_sync_timestamp);
    const hoursSince = (Date.now() - lastPromptSync.getTime()) / (1000 * 60 * 60);
    skipPrompts = hoursSince < promptIntervalHours;
  }

  log(`Starting sync cycle... (prompts: ${skipPrompts ? 'skipped' : 'included'})`);
  log(`Last sync: ${state.last_sync_timestamp || 'never'}`);
  log(`Tracked files: ${Object.keys(state.file_offsets).length}`);

  try {
    // Collect data using byte offsets (only reads new bytes)
    const result = await collectUsageData(config, state, { skipPrompts });
    log(`Collected ${result.entries.length} new entries from ${result.filesScanned} files (${result.linesProcessed} lines)`);

    if (result.errors.length > 0) {
      log(`Collection errors: ${result.errors.join(', ')}`);
    }

    if (result.entries.length === 0 && result.prompts.length === 0 && result.projects.length === 0) {
      log('No new data to sync');
      // Still save updated file offsets
      saveState({ ...state, file_offsets: result.updatedFileOffsets });
      return;
    }

    // Push to server
    const pushResult = await pushToServer(result.entries, config, {
      projects: result.projects,
      prompts: result.prompts,
    });
    log(`Pushed: ${pushResult.totalSynced} synced, ${pushResult.totalSkipped} skipped`);
    log(`Projects discovered: ${result.projects.length}, Prompts collected: ${result.prompts.length}`);

    if (pushResult.errors.length > 0) {
      log(`Push errors: ${pushResult.errors.join(', ')}`);
    }

    // Update state with new file offsets
    const newState = {
      ...state,
      last_sync_timestamp: new Date().toISOString(),
      last_sync_records: pushResult.totalSynced,
      total_synced_records: state.total_synced_records + pushResult.totalSynced,
      file_offsets: result.updatedFileOffsets,
      last_prompt_sync_timestamp: skipPrompts
        ? state.last_prompt_sync_timestamp
        : new Date().toISOString(),
    };

    saveState(newState);
    log(`Sync complete. Total synced: ${newState.total_synced_records}`);
  } catch (err) {
    log(`Sync error: ${(err as Error).message}`);
  }

  // Poll for admin commands (non-fatal)
  try {
    await pollAndExecuteCommands(config, null);
  } catch (err) {
    log(`Command poll error: ${(err as Error).message}`);
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
  log(`Server URL: ${config.server_url}`);

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
