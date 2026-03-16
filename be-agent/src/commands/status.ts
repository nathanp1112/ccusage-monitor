import { existsSync, readFileSync } from 'node:fs';
import {
  loadConfig,
  loadState,
  isConfigured,
  targetId,
  getTargetState,
  CONFIG_FILE,
  STATE_FILE,
  PID_FILE,
} from '../lib/config.js';

/**
 * Check if daemon is running
 */
function isDaemonRunning(): { running: boolean; pid: number | null } {
  if (!existsSync(PID_FILE)) {
    return { running: false, pid: null };
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);

    try {
      process.kill(pid, 0);
      return { running: true, pid };
    } catch {
      return { running: false, pid };
    }
  } catch {
    return { running: false, pid: null };
  }
}

/**
 * Format relative time
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}

/**
 * Show agent status
 */
export async function statusCommand(): Promise<void> {
  console.log('CCUsage Agent Status\n');

  // Configuration status
  console.log('Configuration:');
  console.log(`  Config file: ${CONFIG_FILE}`);

  if (!isConfigured()) {
    console.log('  Status: NOT CONFIGURED');
    console.log('\n  Run "ccusage-agent setup --server <url> --email <email>" to configure.');
    return;
  }

  const config = loadConfig();
  console.log(`  Sync interval: ${config.sync_interval_minutes} minutes`);

  // Targets
  console.log(`\nTargets (${config.targets.length}):`);
  const state = loadState();

  for (const target of config.targets) {
    const tid = targetId(target);
    const ts = getTargetState(state, tid);

    console.log(`\n  [${target.email}]`);
    console.log(`    Server: ${target.server_url}`);
    console.log(`    Password: ${target.password ? 'configured' : 'not set'}`);

    if (ts.last_sync_timestamp) {
      console.log(`    Last sync: ${ts.last_sync_timestamp}`);
      console.log(`               (${formatRelativeTime(ts.last_sync_timestamp)})`);
      console.log(`    Last sync records: ${ts.last_sync_records}`);
    } else {
      console.log('    Last sync: never');
    }

    console.log(`    Total synced records: ${ts.total_synced_records}`);
    console.log(`    Auth token: ${ts.access_token ? 'stored' : 'none'}`);
  }

  // Daemon status
  console.log('\nDaemon:');
  const daemon = isDaemonRunning();
  if (daemon.running) {
    console.log(`  Status: RUNNING (PID: ${daemon.pid})`);
  } else if (daemon.pid) {
    console.log(`  Status: STOPPED (stale PID file: ${daemon.pid})`);
  } else {
    console.log('  Status: STOPPED');
  }

  // Shared state
  console.log('\nShared State:');
  console.log(`  State file: ${STATE_FILE}`);
  console.log(`  Tracked file offsets: ${Object.keys(state.file_offsets).length}`);

  // Claude paths
  console.log('\nClaude Data Paths:');
  for (const p of config.claude_paths) {
    const exists = existsSync(p);
    console.log(`  ${exists ? '✓' : '✗'} ${p}`);
  }
}
