import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { request } from 'undici';
import {
  saveConfig,
  loadConfig,
  discoverClaudePaths,
  AGENT_CONFIG_DIR,
  DEFAULT_CONFIG,
} from '../lib/config.js';

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

interface SetupOptions {
  serverUrl: string;
  email: string;
  interval?: number;
}

/**
 * Get the path to the built agent executable
 */
function getAgentExecutable(): string {
  const scriptPath = process.argv[1];

  // If running via tsx (development), convert to dist path
  if (scriptPath.endsWith('.ts')) {
    // Convert src/index.ts -> dist/index.js
    return scriptPath
      .replace('/src/', '/dist/')
      .replace('.ts', '.js');
  }

  // If already running the built file or global install
  return scriptPath;
}

/**
 * Create macOS launchd plist for auto-start
 */
function createLaunchdPlist(intervalMinutes: number): string {
  const agentPath = getAgentExecutable();
  const nodeExec = process.execPath;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCHD_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${nodeExec}</string>
        <string>${agentPath}</string>
        <string>sync</string>
    </array>
    <key>StartInterval</key>
    <integer>${intervalMinutes * 60}</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${AGENT_CONFIG_DIR}/launchd.log</string>
    <key>StandardErrorPath</key>
    <string>${AGENT_CONFIG_DIR}/launchd.error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
</dict>
</plist>`;
}

/**
 * Create Linux systemd service for auto-start
 */
function createSystemdService(intervalMinutes: number): string {
  const agentPath = getAgentExecutable();
  const nodeExec = process.execPath;

  return `[Unit]
Description=CCUsage Agent - Claude Code usage sync
After=network.target

[Service]
Type=oneshot
ExecStart=${nodeExec} ${agentPath} sync
StandardOutput=append:${AGENT_CONFIG_DIR}/systemd.log
StandardError=append:${AGENT_CONFIG_DIR}/systemd.error.log

[Install]
WantedBy=default.target
`;
}

/**
 * Create systemd timer for scheduling
 */
function createSystemdTimer(intervalMinutes: number): string {
  return `[Unit]
Description=CCUsage Agent Timer

[Timer]
OnBootSec=1min
OnUnitActiveSec=${intervalMinutes}min
Persistent=true

[Install]
WantedBy=timers.target
`;
}

/**
 * Install launchd service on macOS
 */
function installLaunchdService(intervalMinutes: number): void {
  const plistContent = createLaunchdPlist(intervalMinutes);

  // Ensure LaunchAgents directory exists
  const launchAgentsDir = join(homedir(), 'Library', 'LaunchAgents');
  if (!existsSync(launchAgentsDir)) {
    mkdirSync(launchAgentsDir, { recursive: true });
  }

  // Unload existing service if present
  try {
    execSync(`launchctl unload ${LAUNCHD_PLIST_PATH} 2>/dev/null`, { stdio: 'ignore' });
  } catch {
    // Ignore if not loaded
  }

  // Write plist file
  writeFileSync(LAUNCHD_PLIST_PATH, plistContent);

  // Load the service
  execSync(`launchctl load ${LAUNCHD_PLIST_PATH}`);

  console.log(`  ✓ Installed launchd service: ${LAUNCHD_LABEL}`);
  console.log(`  ✓ Plist location: ${LAUNCHD_PLIST_PATH}`);
}

/**
 * Install systemd service on Linux
 */
function installSystemdService(intervalMinutes: number): void {
  const serviceContent = createSystemdService(intervalMinutes);
  const timerContent = createSystemdTimer(intervalMinutes);

  // Ensure systemd user directory exists
  const systemdDir = join(homedir(), '.config', 'systemd', 'user');
  if (!existsSync(systemdDir)) {
    mkdirSync(systemdDir, { recursive: true });
  }

  // Write service and timer files
  writeFileSync(SYSTEMD_SERVICE_PATH, serviceContent);
  writeFileSync(SYSTEMD_SERVICE_PATH.replace('.service', '.timer'), timerContent);

  // Reload systemd and enable timer
  try {
    execSync('systemctl --user daemon-reload');
    execSync('systemctl --user enable ccusage-agent.timer');
    execSync('systemctl --user start ccusage-agent.timer');

    console.log('  ✓ Installed systemd service and timer');
    console.log(`  ✓ Service location: ${SYSTEMD_SERVICE_PATH}`);
  } catch (err) {
    console.error('  ✗ Failed to enable systemd service:', (err as Error).message);
  }
}

/**
 * Setup command - full installation
 */
export async function setupCommand(options: SetupOptions): Promise<void> {
  const intervalMinutes = options.interval || 60;
  const os = platform();

  console.log('CCUsage Agent Setup\n');
  console.log('Configuration:');
  console.log(`  Server URL: ${options.serverUrl}`);
  console.log(`  Email: ${options.email}`);
  console.log(`  Sync interval: ${intervalMinutes} minutes`);
  console.log(`  Platform: ${os}`);
  console.log('');

  // 1. Save configuration
  console.log('Step 1: Saving configuration...');
  const existingConfig = loadConfig();
  const config = {
    ...DEFAULT_CONFIG,
    server_url: options.serverUrl,
    email: options.email,
    sync_interval_minutes: intervalMinutes,
  };
  saveConfig(config);
  console.log(`  ✓ Config saved to: ${AGENT_CONFIG_DIR}/config.json`);

  // 2. Show discovered paths
  console.log('\nStep 2: Discovering Claude data paths...');
  const paths = discoverClaudePaths();
  if (paths.length === 0) {
    console.log('  ⚠ No Claude data paths found');
    console.log('  The agent will scan for paths when Claude Code creates data');
  } else {
    console.log(`  ✓ Found ${paths.length} path(s):`);
    for (const p of paths) {
      console.log(`    - ${p}`);
    }
  }

  // 3. Install OS service for auto-start
  console.log('\nStep 3: Installing auto-start service...');

  if (os === 'darwin') {
    installLaunchdService(intervalMinutes);
  } else if (os === 'linux') {
    installSystemdService(intervalMinutes);
  } else {
    console.log(`  ⚠ Auto-start not supported on ${os}`);
    console.log('  You can manually run: ccusage-agent sync');
  }

  // 4. Fetch register link from server
  console.log('\nStep 4: Checking registration...');
  try {
    const res = await request(
      `${options.serverUrl}/api/register/link?email=${encodeURIComponent(options.email)}`,
      { method: 'GET', headersTimeout: 5000, bodyTimeout: 5000 }
    );
    const data = (await res.body.json()) as { success: boolean; link?: string };
    if (data.success && data.link) {
      console.log(`  ✓ Dashboard link: ${data.link}`);
    } else {
      console.log('  ⚠ No registration link found for this email');
    }
  } catch {
    console.log('  ⚠ Could not reach server (will retry on first sync)');
  }

  // 5. Summary
  console.log('\n' + '─'.repeat(50));
  console.log('Setup complete!\n');
  console.log('The agent will:');
  console.log(`  • Sync every ${intervalMinutes} minutes automatically`);
  console.log('  • Start automatically when you log in');
  console.log('');
  console.log('Commands:');
  console.log('  ccusage-agent sync     - Sync now (manual)');
  console.log('  ccusage-agent status   - Check status');
  console.log('  ccusage-agent uninstall - Remove auto-start service');
  console.log('');
  console.log('Run "ccusage-agent sync" now to do the initial sync.');
}
