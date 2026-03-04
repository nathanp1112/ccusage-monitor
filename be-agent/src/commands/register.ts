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
  console.log(`Registering data for ${config.email}...`);

  try {
    const res = await request(`${config.server_url}/api/register/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.email, data: options.data }),
      headersTimeout: 5000,
      bodyTimeout: 5000,
    });

    const body = (await res.body.json()) as { success: boolean; error?: string };

    if (!body.success) {
      console.error(`Error: ${body.error || 'Unknown error'}`);
      process.exit(1);
    }

    console.log(`  ✓ Registered data for ${config.email}`);
  } catch (err) {
    console.error('Error: could not reach server —', (err as Error).message);
    process.exit(1);
  }
}
