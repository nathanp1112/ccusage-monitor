import { spawn } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { isConfigured, PID_FILE, LOG_FILE } from '../lib/config.js';

/**
 * Check if daemon is already running
 */
function isDaemonRunning(): boolean {
  if (!existsSync(PID_FILE)) {
    return false;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
    process.kill(pid, 0); // Signal 0 just checks if process exists
    return true;
  } catch {
    return false;
  }
}

/**
 * Start the daemon process
 */
export async function startCommand(options: {
  foreground?: boolean;
}): Promise<void> {
  // Check configuration
  if (!isConfigured()) {
    console.error('Error: Agent not configured. Run "ccusage-agent init" first.');
    process.exit(1);
  }

  // Check if already running
  if (isDaemonRunning()) {
    console.error('Error: Daemon is already running.');
    console.log('Use "ccusage-agent status" to check status or "ccusage-agent stop" to stop it.');
    process.exit(1);
  }

  if (options.foreground) {
    // Run in foreground (for debugging)
    console.log('Starting agent in foreground mode...');
    console.log('Press Ctrl+C to stop.\n');

    // Import and run daemon directly
    const { runDaemon } = await import('../daemon.js');
    await runDaemon();
  } else {
    // Start as background daemon
    console.log('Starting agent daemon...');

    const child = spawn(process.execPath, [process.argv[1], 'daemon'], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CCUSAGE_DAEMON: '1' },
    });

    // Write PID file
    if (child.pid) {
      writeFileSync(PID_FILE, child.pid.toString());
    }

    // Detach from parent
    child.unref();

    console.log(`Daemon started with PID: ${child.pid}`);
    console.log(`Log file: ${LOG_FILE}`);
    console.log('\nUse "ccusage-agent status" to check status.');
    console.log('Use "ccusage-agent stop" to stop the daemon.');
  }
}
