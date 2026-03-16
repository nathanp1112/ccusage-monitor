import { createInterface } from 'node:readline';
import {
  loadConfig,
  saveConfig,
  upsertTarget,
  BUILT_IN_SERVER_URL,
  CONFIG_FILE,
} from '../lib/config.js';

/**
 * Prompt user for input
 */
function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const displayQuestion = defaultValue
    ? `${question} [${defaultValue}]: `
    : `${question}: `;

  return new Promise((resolve) => {
    rl.question(displayQuestion, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Initialize agent configuration
 */
export async function initCommand(options: {
  serverUrl?: string;
  email?: string;
  interactive?: boolean;
}): Promise<void> {
  console.log('Initializing CCUsage Agent...\n');

  const existingConfig = loadConfig();
  const firstTarget = existingConfig.targets[0];

  let serverUrl = options.serverUrl || firstTarget?.server_url || BUILT_IN_SERVER_URL || 'http://localhost:3003';
  let email = options.email || firstTarget?.email || '';

  // Interactive mode
  if (options.interactive !== false && !email) {
    serverUrl = await prompt('Server URL', serverUrl);
    email = await prompt('Your email', email);

    if (!email) {
      console.error('\nError: Email is required.');
      process.exit(1);
    }
  }

  // Validate email
  if (!email || !isValidEmail(email)) {
    console.error('\nError: Invalid email format.');
    process.exit(1);
  }

  // Save configuration
  const config = upsertTarget(existingConfig, {
    server_url: serverUrl,
    email: email,
  });

  saveConfig(config);

  console.log('\nConfiguration saved!');
  console.log(`  Config file: ${CONFIG_FILE}`);
  console.log(`  Targets: ${config.targets.length}`);
  for (const t of config.targets) {
    console.log(`    - ${t.email} → ${t.server_url}`);
  }
  console.log(`  Sync interval: ${config.sync_interval_minutes} minutes`);
  console.log(`  Claude paths:`);
  for (const p of existingConfig.claude_paths) {
    console.log(`    - ${p}`);
  }

  console.log('\nNext steps:');
  console.log('  1. Run "ccusage-agent push" to sync data manually');
  console.log('  2. Run "ccusage-agent start" to start the daemon');
}
