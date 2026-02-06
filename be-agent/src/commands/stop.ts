import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { PID_FILE } from '../lib/config.js';

/**
 * Stop the daemon process
 */
export async function stopCommand(): Promise<void> {
  if (!existsSync(PID_FILE)) {
    console.log('Daemon is not running (no PID file found).');
    return;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);

    // Check if process is running
    try {
      process.kill(pid, 0);
    } catch {
      console.log(`Daemon is not running (stale PID file for ${pid}).`);
      unlinkSync(PID_FILE);
      console.log('Cleaned up stale PID file.');
      return;
    }

    // Send SIGTERM
    console.log(`Stopping daemon (PID: ${pid})...`);
    process.kill(pid, 'SIGTERM');

    // Wait for process to exit (max 5 seconds)
    let attempts = 0;
    while (attempts < 50) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      try {
        process.kill(pid, 0);
        attempts++;
      } catch {
        // Process exited
        break;
      }
    }

    // Force kill if still running
    try {
      process.kill(pid, 0);
      console.log('Process did not exit gracefully, sending SIGKILL...');
      process.kill(pid, 'SIGKILL');
    } catch {
      // Process already exited
    }

    // Clean up PID file
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE);
    }

    console.log('Daemon stopped.');
  } catch (err) {
    console.error('Error stopping daemon:', (err as Error).message);
    process.exit(1);
  }
}
