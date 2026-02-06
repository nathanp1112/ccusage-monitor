#!/usr/bin/env node
import { Command } from 'commander';
import { setupCommand } from './commands/setup.js';
import { uninstallCommand } from './commands/uninstall.js';
import { pushCommand } from './commands/push.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('ccusage-agent')
  .description('CCUsage Agent - Sync Claude Code usage data to team server')
  .version('0.1.0');

// Setup - full installation with auto-start
program
  .command('setup')
  .description('Full setup: configure agent and install auto-start service')
  .requiredOption('-s, --server <url>', 'Server URL (e.g., http://192.168.0.193:3003)')
  .requiredOption('-e, --email <email>', 'Your email address')
  .option('-i, --interval <minutes>', 'Sync interval in minutes', '60')
  .action(async (options) => {
    await setupCommand({
      serverUrl: options.server,
      email: options.email,
      interval: parseInt(options.interval, 10),
    });
  });

// Sync - manual push (renamed from push for clarity)
program
  .command('sync')
  .description('Sync usage data to server now (manual trigger)')
  .option('-f, --force', 'Force full sync (ignore last sync timestamp)')
  .option('-d, --dry-run', 'Show what would be synced without pushing')
  .action(async (options) => {
    await pushCommand({
      force: options.force,
      dryRun: options.dryRun,
    });
  });

// Status - show current state
program
  .command('status')
  .description('Show agent status and configuration')
  .action(async () => {
    await statusCommand();
  });

// Uninstall - remove auto-start service
program
  .command('uninstall')
  .description('Remove auto-start service (keeps configuration)')
  .action(async () => {
    await uninstallCommand();
  });

program.parse();
