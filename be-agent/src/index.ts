#!/usr/bin/env node
import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { uninstallCommand } from './commands/uninstall.js';
import { pushCommand } from './commands/push.js';
import { statusCommand } from './commands/status.js';
import { updateCommand } from './commands/update.js';
import { BUILT_IN_SERVER_URL } from './lib/config.js';

const program = new Command();

program
  .name('ccusage-agent')
  .description('CCUsage Agent - Sync Claude Code usage data to team server')
  .version('0.5.0');

// Setup - full installation with auto-start
program
  .command('setup')
  .description('Full setup: configure agent and install auto-start service')
  .option('-s, --server <url>', 'Server URL (overrides built-in default)')
  .requiredOption('-e, --email <email>', 'Your email address')
  .option('-i, --interval <minutes>', 'Sync interval in minutes', '60')
  .action(async (options) => {
    const serverUrl = options.server || BUILT_IN_SERVER_URL;
    if (!serverUrl) {
      console.error('Error: --server is required (no built-in server URL in this build)');
      process.exit(1);
    }
    await setupCommand({
      serverUrl,
      email: options.email,
      interval: parseInt(options.interval, 10),
    });
  });

// Sync - manual push (renamed from push for clarity)
program
  .command('sync')
  .description('Sync usage data to server now (manual trigger)')
  .option('-f, --force', 'Force full sync (re-read all files from scratch)')
  .option('-d, --dry-run', 'Show what would be synced without pushing')
  .option('-v, --verbose', 'Show detailed progress output')
  .option('--no-prompts', 'Skip syncing prompt text (entries only)')
  .action(async (options) => {
    await pushCommand({
      force: options.force,
      dryRun: options.dryRun,
      noPrompts: options.prompts === false,
      verbose: options.verbose,
    });
  });

// Status - show current state
program
  .command('status')
  .description('Show agent status and configuration')
  .action(async () => {
    await statusCommand();
  });

// Update - auto-download and install latest version
program
  .command('update')
  .description('Check for updates and install latest version')
  .option('-f, --force', 'Force update even if already on latest version')
  .action(async (options) => {
    await updateCommand({ force: options.force });
  });

// Uninstall - remove auto-start service
program
  .command('uninstall')
  .description('Remove auto-start service (keeps configuration)')
  .action(async () => {
    await uninstallCommand();
  });

program.parse();
