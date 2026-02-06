import { appendFileSync } from 'node:fs';
import { loadConfig, loadState, saveState, LOG_FILE } from './lib/config.js';
import { collectUsageData } from './lib/collector.js';
import { pushToServer } from './lib/pusher.js';

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

  log('Starting sync cycle...');
  log(`Last sync: ${state.last_sync_timestamp || 'never'}`);

  try {
    // Collect data
    const result = await collectUsageData(config, state);
    log(`Collected ${result.entries.length} new entries from ${result.filesScanned} files`);

    if (result.errors.length > 0) {
      log(`Collection errors: ${result.errors.join(', ')}`);
    }

    if (result.entries.length === 0) {
      log('No new data to sync');
      return;
    }

    // Push to server
    const pushResult = await pushToServer(result.entries, config);
    log(`Pushed: ${pushResult.totalSynced} synced, ${pushResult.totalSkipped} skipped`);

    if (pushResult.errors.length > 0) {
      log(`Push errors: ${pushResult.errors.join(', ')}`);
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
    };

    saveState(newState);
    log(`Sync complete. Total synced: ${newState.total_synced_records}`);
  } catch (err) {
    log(`Sync error: ${(err as Error).message}`);
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
