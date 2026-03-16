import { request } from 'undici';
import { loadConfig, isConfigured } from '../lib/config.js';

interface RegisterOptions {
  data: string;
}

export async function registerCommand(options: RegisterOptions): Promise<void> {
  if (!isConfigured()) {
    console.error('Error: agent not configured. Run: ccusage-agent setup --email your@email.com');
    process.exit(1);
  }

  const config = loadConfig();

  // Register for all targets
  for (const target of config.targets) {
    console.log(`Registering data for ${target.email} @ ${target.server_url}...`);

    try {
      const res = await request(`${target.server_url}/api/register/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target.email, data: options.data }),
        headersTimeout: 5000,
        bodyTimeout: 5000,
      });

      const body = (await res.body.json()) as { success: boolean; error?: string };

      if (!body.success) {
        console.error(`  ✗ ${target.email}: ${body.error || 'Unknown error'}`);
      } else {
        console.log(`  ✓ Registered data for ${target.email}`);
      }
    } catch (err) {
      console.error(`  ✗ ${target.email}: could not reach server — ${(err as Error).message}`);
    }
  }
}
