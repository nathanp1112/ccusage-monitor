/**
 * Hook Installer for CCUsage Agent
 *
 * Installs the quota push hook script and configures Claude Code settings.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HOOK_DEST = join(homedir(), '.ccusage-agent', 'hooks', 'push-quota.mjs');
const HOOK_COMMAND = `node ${HOOK_DEST}`;

// Settings locations in priority order
const SETTINGS_PATHS = [
  join(homedir(), '.ccs', 'shared', 'settings.json'),   // CCS shared (affects all instances)
  join(homedir(), '.claude', 'settings.json'),            // Native Claude Code
];

/**
 * Resolve path to the hook script bundled in the npm package.
 * Works from both source (src/lib/) and dist (dist/) locations.
 */
function getSourceHookPath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = dirname(thisFile);

  // Try relative to dist/ (installed package: dist/index.js → ../hooks/push-quota.mjs)
  const fromDist = join(thisDir, '..', 'hooks', 'push-quota.mjs');
  if (existsSync(fromDist)) return fromDist;

  // Try relative to src/lib/ (development: src/lib/hooks.ts → ../../hooks/push-quota.mjs)
  const fromSrc = join(thisDir, '..', '..', 'hooks', 'push-quota.mjs');
  if (existsSync(fromSrc)) return fromSrc;

  throw new Error('Hook script not found in package');
}

/**
 * Install the quota push hook:
 * 1. Copy the hook script to ~/.ccusage-agent/hooks/push-quota.mjs
 * 2. Add a Stop hook entry to Claude Code settings.json
 */
export function installQuotaHook(): void {
  // 1. Copy hook script from package to user's machine
  const sourcePath = getSourceHookPath();
  const destDir = dirname(HOOK_DEST);
  mkdirSync(destDir, { recursive: true });
  copyFileSync(sourcePath, HOOK_DEST);

  // 2. Find and update settings.json
  const settingsPath = SETTINGS_PATHS.find((p) => existsSync(p));
  if (!settingsPath) {
    console.log('  ⚠ No Claude Code settings.json found — hook script installed but not activated');
    console.log(`    Manually add a Stop hook pointing to: ${HOOK_DEST}`);
    return;
  }

  updateSettings(settingsPath);
}

interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
  async?: boolean;
}

interface HookGroup {
  matcher?: string;
  hooks?: HookEntry[];
}

function updateSettings(settingsPath: string): void {
  const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

  // Ensure hooks.Stop array exists
  if (!settings.hooks) settings.hooks = {};
  if (!Array.isArray(settings.hooks.Stop)) settings.hooks.Stop = [];

  // Check if our hook is already registered
  const alreadyInstalled = settings.hooks.Stop.some((group: HookGroup) =>
    group.hooks?.some((h: HookEntry) => h.command?.includes('push-quota.mjs'))
  );

  if (alreadyInstalled) {
    // Update the command path in case it changed
    for (const group of settings.hooks.Stop as HookGroup[]) {
      if (!group.hooks) continue;
      for (const h of group.hooks) {
        if (h.command?.includes('push-quota.mjs')) {
          h.command = HOOK_COMMAND;
        }
      }
    }
  } else {
    // Add new hook entry
    settings.hooks.Stop.push({
      hooks: [
        {
          type: 'command',
          command: HOOK_COMMAND,
          timeout: 15,
          async: true,
        },
      ],
    });
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  console.log(`  Settings updated: ${settingsPath}`);
}
