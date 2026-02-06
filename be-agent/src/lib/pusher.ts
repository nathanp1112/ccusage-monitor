import { request } from 'undici';
import { hostname } from 'node:os';
import type { AgentConfig } from './config.js';
import type { UsageEntry } from './collector.js';

/**
 * Server response for usage ingestion (Lambda API format)
 */
interface UsageIngestionResponse {
  success: boolean;
  inserted?: number;
  skipped?: number;
  memberId?: string;
  error?: string;
}

/**
 * Push result
 */
export interface PushResult {
  success: boolean;
  synced: number;
  skipped: number;
  syncId: string | null;
  error: string | null;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Push a batch of entries to the server
 */
async function pushBatch(
  entries: UsageEntry[],
  config: AgentConfig,
  attempt: number = 1
): Promise<PushResult> {
  const url = `${config.server_url}/api/sync`;

  const payload = {
    email: config.email,
    entries: entries.map((e) => ({
      request_id: e.request_id,
      timestamp: e.timestamp,
      model: e.model,
      project_path: e.project_path,
      session_id: e.session_id,
      input_tokens: e.usage.input_tokens,
      output_tokens: e.usage.output_tokens,
      cache_creation_tokens: e.usage.cache_creation_input_tokens,
      cache_read_tokens: e.usage.cache_read_input_tokens,
      cost_usd: e.cost_usd,
      claude_version: e.version,
    })),
    agent_version: '0.2.0',
    hostname: hostname(),
  };

  try {
    const response = await request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const body = (await response.body.json()) as UsageIngestionResponse;

    if (response.statusCode === 200 && body.success) {
      return {
        success: true,
        synced: body.inserted ?? 0,
        skipped: body.skipped ?? 0,
        syncId: body.memberId ?? null,
        error: null,
      };
    }

    // Handle 4xx errors (don't retry)
    if (response.statusCode >= 400 && response.statusCode < 500) {
      return {
        success: false,
        synced: 0,
        skipped: entries.length,
        syncId: null,
        error: body.error || `HTTP ${response.statusCode}`,
      };
    }

    // Handle 5xx errors (retry with backoff)
    if (response.statusCode >= 500 && attempt < config.retry_attempts) {
      const backoffMs = Math.pow(2, attempt) * 1000; // Exponential backoff
      console.log(`Server error (${response.statusCode}), retrying in ${backoffMs}ms...`);
      await sleep(backoffMs);
      return pushBatch(entries, config, attempt + 1);
    }

    return {
      success: false,
      synced: 0,
      skipped: entries.length,
      syncId: null,
      error: body.error || `HTTP ${response.statusCode}`,
    };
  } catch (err) {
    // Network error - retry with backoff
    if (attempt < config.retry_attempts) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.log(`Network error, retrying in ${backoffMs}ms...`);
      await sleep(backoffMs);
      return pushBatch(entries, config, attempt + 1);
    }

    return {
      success: false,
      synced: 0,
      skipped: entries.length,
      syncId: null,
      error: (err as Error).message,
    };
  }
}

/**
 * Push all entries to server in batches
 */
export async function pushToServer(
  entries: UsageEntry[],
  config: AgentConfig,
  onProgress?: (batch: number, total: number) => void
): Promise<{
  totalSynced: number;
  totalSkipped: number;
  errors: string[];
}> {
  if (entries.length === 0) {
    return { totalSynced: 0, totalSkipped: 0, errors: [] };
  }

  const batchSize = config.max_batch_size;
  const batches = Math.ceil(entries.length / batchSize);

  let totalSynced = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < batches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, entries.length);
    const batch = entries.slice(start, end);

    onProgress?.(i + 1, batches);

    const result = await pushBatch(batch, config);

    if (result.success) {
      totalSynced += result.synced;
      totalSkipped += result.skipped;
    } else {
      errors.push(result.error || 'Unknown error');
      totalSkipped += batch.length;
    }
  }

  return { totalSynced, totalSkipped, errors };
}
