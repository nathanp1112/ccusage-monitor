import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../lib/config.js';
import { request } from 'undici';

// Read version from package.json at build time (inlined by bundler)
const CURRENT_VERSION = '0.5.1';

interface VersionResponse {
  success: boolean;
  version: string;
  filename: string;
  downloadUrl: string;
  error?: string;
}

/**
 * Compare semver strings. Returns:
 *  -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

/**
 * Update command - auto-download and install latest agent version
 */
export async function updateCommand(options: { force?: boolean }): Promise<void> {
  const config = loadConfig();

  if (!config.server_url || !config.email) {
    console.error('Agent not configured. Run "ccusage-agent setup" first.');
    process.exit(1);
  }

  console.log('CCUsage Agent Update\n');
  console.log(`  Current version: ${CURRENT_VERSION}`);
  console.log(`  Server: ${config.server_url}`);
  console.log('');

  // 1. Check latest version
  console.log('Checking for updates...');
  let versionInfo: VersionResponse;
  try {
    const { statusCode, body } = await request(
      `${config.server_url}/api/agent/version`
    );
    versionInfo = (await body.json()) as VersionResponse;

    if (statusCode !== 200 || !versionInfo.success) {
      console.error(`  ✗ Failed to check version: ${versionInfo.error || 'Unknown error'}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`  ✗ Cannot reach server: ${(err as Error).message}`);
    process.exit(1);
  }

  console.log(`  Latest version: ${versionInfo.version}`);

  // 2. Compare versions
  if (!options.force && compareSemver(CURRENT_VERSION, versionInfo.version) >= 0) {
    console.log('\n  Already up to date!');
    return;
  }

  console.log(`  Update available: ${CURRENT_VERSION} → ${versionInfo.version}\n`);

  // 3. Download tgz
  const tmpFile = join(tmpdir(), versionInfo.filename);
  console.log('Downloading update...');
  try {
    const { statusCode, body } = await request(versionInfo.downloadUrl);
    if (statusCode !== 200) {
      console.error(`  ✗ Download failed (HTTP ${statusCode})`);
      process.exit(1);
    }
    const buffer = Buffer.from(await body.arrayBuffer());
    writeFileSync(tmpFile, buffer);
    console.log(`  ✓ Downloaded ${versionInfo.filename} (${(buffer.length / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error(`  ✗ Download failed: ${(err as Error).message}`);
    process.exit(1);
  }

  // 4. Install globally
  console.log('\nInstalling...');
  try {
    execSync(`npm install -g "${tmpFile}"`, { stdio: 'inherit' });
    console.log('  ✓ Installed successfully');
  } catch (err) {
    console.error('  ✗ Installation failed. You may need to run with sudo.');
    cleanup(tmpFile);
    process.exit(1);
  }

  // 5. Re-run setup with existing config (uses the NEW binary)
  console.log('\nRestarting service...');
  try {
    const setupCmd = `ccusage-agent setup --server ${config.server_url} --email ${config.email} --interval ${config.sync_interval_minutes}`;
    execSync(setupCmd, { stdio: 'inherit' });
  } catch (err) {
    console.error('  ✗ Setup failed:', (err as Error).message);
    cleanup(tmpFile);
    process.exit(1);
  }

  // 6. Run sync (migration sets offsets to current EOF, no --force needed)
  console.log('\nSyncing data...');
  try {
    execSync('ccusage-agent sync', { stdio: 'inherit' });
  } catch (err) {
    console.error('  ✗ Sync failed:', (err as Error).message);
  }

  // 7. Cleanup
  cleanup(tmpFile);

  console.log('\n' + '─'.repeat(50));
  console.log(`Update complete! (${CURRENT_VERSION} → ${versionInfo.version})`);
}

function cleanup(tmpFile: string): void {
  try {
    unlinkSync(tmpFile);
  } catch {
    // Ignore cleanup errors
  }
}
