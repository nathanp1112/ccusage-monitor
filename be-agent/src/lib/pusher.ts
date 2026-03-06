import { request } from 'undici';
import { hostname, networkInterfaces } from 'node:os';
import type { AgentConfig } from './config.js';
import type { UsageEntry, ProjectInfo, PromptEntry } from './collector.js';

/**
 * Get the first non-internal IPv4 address (LAN IP).
 * Returns null on any error — IP fields are best-effort, never block sync.
 */
function getLocalIp(): string | null {
  try {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch public IP from external API (3s timeout, returns null on failure)
 */
async function getPublicIp(): Promise<string | null> {
  try {
    const res = await request('https://checkip.amazonaws.com', {
      method: 'GET',
      headersTimeout: 3000,
      bodyTimeout: 3000,
    });
    const text = await res.body.text();
    return text.trim() || null;
  } catch {
    return null;
  }
}

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
  projects: ProjectInfo[],
  prompts: PromptEntry[],
  publicIp: string | null,
  accessToken: string | null,
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
      file_extensions: e.file_extensions,
    })),
    projects: projects.map((p) => ({
      path: p.path,
      git_repo: p.gitRepo,
    })),
    prompts: prompts.map((p) => ({
      uuid: p.uuid,
      session_id: p.session_id,
      timestamp: p.timestamp,
      project_path: p.project_path,
      cwd: p.cwd,
      content: p.content,
    })),
    agent_version: '0.5.1',
    hostname: hostname(),
    local_ip: getLocalIp(),
    public_ip: publicIp,
  };

  const jsonBody = JSON.stringify(payload);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  try {
    const response = await request(url, {
      method: 'POST',
      headers,
      body: jsonBody,
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
      const backoffMs = Math.pow(2, attempt) * 1000;
      await sleep(backoffMs);
      return pushBatch(entries, config, projects, prompts, publicIp, accessToken, attempt + 1);
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
      await sleep(backoffMs);
      return pushBatch(entries, config, projects, prompts, publicIp, accessToken, attempt + 1);
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
  options?: {
    projects?: ProjectInfo[];
    prompts?: PromptEntry[];
    accessToken?: string | null;
    onProgress?: (batch: number, total: number) => void;
  }
): Promise<{
  totalSynced: number;
  totalSkipped: number;
  errors: string[];
}> {
  const projects = options?.projects || [];
  const prompts = options?.prompts || [];
  const accessToken = options?.accessToken ?? null;
  const onProgress = options?.onProgress;

  if (entries.length === 0 && prompts.length === 0 && projects.length === 0) {
    return { totalSynced: 0, totalSkipped: 0, errors: [] };
  }

  // Fetch public IP once for all batches (best-effort, never block sync)
  let publicIp: string | null = null;
  try {
    publicIp = await getPublicIp();
  } catch {
    // Ignore — IP is optional metadata
  }

  const batchSize = config.max_batch_size;
  const promptBatchSize = 500; // Prompts contain full text, batch smaller

  // Calculate total batches needed for both entries and prompts
  const entryBatches = Math.ceil(entries.length / batchSize);
  const promptBatches = Math.ceil(prompts.length / promptBatchSize);
  const totalBatches = Math.max(1, Math.max(entryBatches, promptBatches));

  let totalSynced = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < totalBatches; i++) {
    // Slice entries for this batch
    const entryStart = i * batchSize;
    const entryEnd = Math.min(entryStart + batchSize, entries.length);
    const batch = entryStart < entries.length ? entries.slice(entryStart, entryEnd) : [];

    // Slice prompts for this batch
    const promptStart = i * promptBatchSize;
    const promptEnd = Math.min(promptStart + promptBatchSize, prompts.length);
    const batchPrompts = promptStart < prompts.length ? prompts.slice(promptStart, promptEnd) : [];

    // Send projects only on the first batch (small payload)
    const batchProjects = i === 0 ? projects : [];

    onProgress?.(i + 1, totalBatches);

    const result = await pushBatch(batch, config, batchProjects, batchPrompts, publicIp, accessToken);

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
