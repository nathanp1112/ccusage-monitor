import { unlinkSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

const LAUNCHD_LABEL = 'com.ccusage.agent';
const LAUNCHD_PLIST_PATH = join(
  homedir(),
  'Library',
  'LaunchAgents',
  `${LAUNCHD_LABEL}.plist`
);

const SYSTEMD_SERVICE_PATH = join(
  homedir(),
  '.config',
  'systemd',
  'user',
  'ccusage-agent.service'
);

const SYSTEMD_TIMER_PATH = join(
  homedir(),
  '.config',
  'systemd',
  'user',
  'ccusage-agent.timer'
);

/**
 * Uninstall launchd service on macOS
 */
function uninstallLaunchdService(): void {
  if (!existsSync(LAUNCHD_PLIST_PATH)) {
    console.log('  No launchd service found');
    return;
  }

  try {
    execSync(`launchctl unload ${LAUNCHD_PLIST_PATH}`, { stdio: 'ignore' });
  } catch {
    // Ignore if not loaded
  }

  unlinkSync(LAUNCHD_PLIST_PATH);
  console.log('  ✓ Removed launchd service');
}

/**
 * Uninstall systemd service on Linux
 */
function uninstallSystemdService(): void {
  try {
    execSync('systemctl --user stop ccusage-agent.timer', { stdio: 'ignore' });
    execSync('systemctl --user disable ccusage-agent.timer', { stdio: 'ignore' });
  } catch {
    // Ignore if not running
  }

  if (existsSync(SYSTEMD_SERVICE_PATH)) {
    unlinkSync(SYSTEMD_SERVICE_PATH);
  }
  if (existsSync(SYSTEMD_TIMER_PATH)) {
    unlinkSync(SYSTEMD_TIMER_PATH);
  }

  try {
    execSync('systemctl --user daemon-reload', { stdio: 'ignore' });
  } catch {
    // Ignore
  }

  console.log('  ✓ Removed systemd service and timer');
}

/**
 * Uninstall command - remove auto-start service
 */
export async function uninstallCommand(): Promise<void> {
  const os = platform();

  console.log('CCUsage Agent Uninstall\n');
  console.log('Removing auto-start service...');

  if (os === 'darwin') {
    uninstallLaunchdService();
  } else if (os === 'linux') {
    uninstallSystemdService();
  } else {
    console.log(`  No service to remove on ${os}`);
  }

  console.log('\nDone. The agent will no longer auto-start.');
  console.log('Note: Configuration files are preserved in ~/.ccusage-agent/');
  console.log('      Delete that folder manually if you want to remove all data.');
}
