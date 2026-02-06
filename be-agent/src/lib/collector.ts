import { createReadStream, statSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename, sep } from 'node:path';
import { glob } from 'tinyglobby';
import type { RuntimeConfig, AgentState } from './config.js';
import { calculateCost } from './pricing.js';

/**
 * Usage entry to be sent to server
 */
export interface UsageEntry {
  request_id: string;
  timestamp: string;
  model: string;
  project_path: string;
  session_id: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  cost_usd: number;
  version: string | null;
}

/**
 * Raw JSONL line structure from Claude Code
 */
interface RawUsageData {
  timestamp?: string;
  requestId?: string;
  sessionId?: string;
  version?: string;
  message?: {
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  costUSD?: number;
}

/**
 * Collection result
 */
export interface CollectionResult {
  entries: UsageEntry[];
  filesScanned: number;
  linesProcessed: number;
  errors: string[];
}

/**
 * Extract project name from file path
 * Path structure: .../projects/{project_name}/{session_id}.jsonl
 */
export function extractProjectFromPath(filePath: string): string {
  const segments = filePath.split(sep);
  const projectsIndex = segments.findIndex((s) => s === 'projects');

  if (projectsIndex === -1 || projectsIndex + 1 >= segments.length) {
    return 'unknown';
  }

  const projectName = segments[projectsIndex + 1];
  return projectName && projectName.trim() !== '' ? projectName : 'unknown';
}

/**
 * Extract session ID from filename
 */
export function extractSessionFromPath(filePath: string): string {
  const filename = basename(filePath, '.jsonl');
  return filename || 'unknown';
}

/**
 * Parse a single JSONL line
 */
function parseJSONLLine(
  line: string,
  projectPath: string,
  sessionId: string
): UsageEntry | null {
  try {
    const data = JSON.parse(line) as RawUsageData;

    // Skip if missing required fields
    if (!data.timestamp || !data.message?.usage) {
      return null;
    }

    // Generate request_id if not present (fallback to timestamp + session)
    const requestId = data.requestId || `${sessionId}_${data.timestamp}`;

    // Extract model from message
    const model = data.message.model || 'unknown';

    // Extract usage
    const usage = data.message.usage;

    return {
      request_id: requestId,
      timestamp: data.timestamp,
      model,
      project_path: projectPath,
      session_id: data.sessionId || sessionId,
      usage: {
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cache_creation_input_tokens: usage.cache_creation_input_tokens || 0,
        cache_read_input_tokens: usage.cache_read_input_tokens || 0,
      },
      cost_usd: data.costUSD || 0,
      version: data.version || null,
    };
  } catch {
    return null;
  }
}

/**
 * Process a single JSONL file
 */
async function processJSONLFile(
  filePath: string,
  lastSyncTimestamp: string | null,
  seenRequestIds: Set<string>
): Promise<{ entries: UsageEntry[]; linesProcessed: number; errors: string[] }> {
  const entries: UsageEntry[] = [];
  const errors: string[] = [];
  let linesProcessed = 0;

  const projectPath = extractProjectFromPath(filePath);
  const sessionId = extractSessionFromPath(filePath);

  return new Promise((resolve) => {
    const stream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });

    rl.on('line', (line) => {
      if (!line.trim()) return;

      linesProcessed++;

      const entry = parseJSONLLine(line, projectPath, sessionId);
      if (!entry) return;

      // Skip if before last sync timestamp
      if (lastSyncTimestamp && entry.timestamp <= lastSyncTimestamp) {
        return;
      }

      // Skip if already seen (dedup)
      if (seenRequestIds.has(entry.request_id)) {
        return;
      }

      entries.push(entry);
      seenRequestIds.add(entry.request_id);
    });

    rl.on('error', (err) => {
      errors.push(`Error reading ${filePath}: ${err.message}`);
    });

    rl.on('close', () => {
      resolve({ entries, linesProcessed, errors });
    });
  });
}

/**
 * Collect usage data from Claude Code directories
 */
export async function collectUsageData(
  config: RuntimeConfig,
  state: AgentState
): Promise<CollectionResult> {
  const allEntries: UsageEntry[] = [];
  const allErrors: string[] = [];
  let totalFilesScanned = 0;
  let totalLinesProcessed = 0;

  // Track seen request IDs (start with existing from state)
  const seenRequestIds = new Set(state.seen_request_ids);

  // Find all JSONL files in configured paths
  const jsonlFiles: string[] = [];

  for (const claudePath of config.claude_paths) {
    if (!existsSync(claudePath)) {
      continue;
    }

    try {
      const files = await glob('**/*.jsonl', {
        cwd: claudePath,
        absolute: true,
      });

      // Filter by modification time if we have a last sync timestamp
      for (const file of files) {
        if (state.last_sync_timestamp) {
          try {
            const stats = statSync(file);
            const lastSyncDate = new Date(state.last_sync_timestamp);
            if (stats.mtime <= lastSyncDate) {
              continue; // Skip files not modified since last sync
            }
          } catch {
            // If we can't stat, include the file anyway
          }
        }
        jsonlFiles.push(file);
      }
    } catch (err) {
      allErrors.push(`Error scanning ${claudePath}: ${(err as Error).message}`);
    }
  }

  // Process each file
  for (const file of jsonlFiles) {
    totalFilesScanned++;

    const result = await processJSONLFile(
      file,
      state.last_sync_timestamp,
      seenRequestIds
    );

    allEntries.push(...result.entries);
    totalLinesProcessed += result.linesProcessed;
    allErrors.push(...result.errors);
  }

  // Sort by timestamp (oldest first)
  allEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Calculate costs for entries that don't have pre-calculated costs
  await calculateEntryCosts(allEntries);

  return {
    entries: allEntries,
    filesScanned: totalFilesScanned,
    linesProcessed: totalLinesProcessed,
    errors: allErrors,
  };
}

/**
 * Calculate costs for entries that don't have pre-calculated costs
 */
async function calculateEntryCosts(entries: UsageEntry[]): Promise<void> {
  for (const entry of entries) {
    // Skip if already has a cost
    if (entry.cost_usd > 0) {
      continue;
    }

    // Calculate cost from token usage
    const cost = await calculateCost(
      {
        input_tokens: entry.usage.input_tokens,
        output_tokens: entry.usage.output_tokens,
        cache_creation_input_tokens: entry.usage.cache_creation_input_tokens,
        cache_read_input_tokens: entry.usage.cache_read_input_tokens,
      },
      entry.model
    );

    entry.cost_usd = cost;
  }
}
