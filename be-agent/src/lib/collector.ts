import { createReadStream, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
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
 * Project info discovered from JSONL cwd + git remote
 */
export interface ProjectInfo {
  path: string; // Actual cwd from JSONL
  gitRepo: string | null; // Result of `git remote get-url origin`
}

/**
 * Prompt entry from user messages
 */
export interface PromptEntry {
  uuid: string;
  session_id: string;
  timestamp: string;
  project_path: string;
  cwd: string;
  content: string;
}

/**
 * Raw JSONL line structure from Claude Code
 */
interface RawUsageData {
  timestamp?: string;
  requestId?: string;
  sessionId?: string;
  version?: string;
  type?: string; // "user" | "assistant" | "summary" | "system"
  uuid?: string; // Unique message ID
  cwd?: string; // Actual project working directory
  message?: {
    role?: string;
    model?: string;
    content?: string | unknown[];
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
  projects: ProjectInfo[];
  prompts: PromptEntry[];
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
 * Extract a prompt from a user message JSONL line
 */
function extractPrompt(
  data: RawUsageData,
  projectPath: string,
  sessionId: string
): PromptEntry | null {
  // Only collect user messages with string content
  if (data.type !== 'user') return null;
  if (!data.message || typeof data.message.content !== 'string') return null;
  if (!data.message.content.trim()) return null;
  if (!data.uuid || !data.timestamp) return null;

  return {
    uuid: data.uuid,
    session_id: data.sessionId || sessionId,
    timestamp: data.timestamp,
    project_path: projectPath,
    cwd: data.cwd || '',
    content: data.message.content,
  };
}

/**
 * Process a single JSONL file
 */
async function processJSONLFile(
  filePath: string,
  lastSyncTimestamp: string | null,
  seenRequestIds: Set<string>,
  seenPromptUuids: Set<string>,
  cwdPaths: Set<string>
): Promise<{ entries: UsageEntry[]; prompts: PromptEntry[]; linesProcessed: number; errors: string[] }> {
  const entries: UsageEntry[] = [];
  const prompts: PromptEntry[] = [];
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

      try {
        const data = JSON.parse(line) as RawUsageData;

        // Collect cwd for project discovery
        if (data.cwd) {
          cwdPaths.add(data.cwd);
        }

        // Extract prompt from user messages
        if (data.type === 'user' && data.uuid && !seenPromptUuids.has(data.uuid)) {
          const prompt = extractPrompt(data, projectPath, sessionId);
          if (prompt) {
            // Skip if before last sync timestamp
            if (!lastSyncTimestamp || prompt.timestamp > lastSyncTimestamp) {
              prompts.push(prompt);
              seenPromptUuids.add(data.uuid);
            }
          }
        }

        // Extract usage entry (existing logic)
        const entry = parseJSONLLine(line, projectPath, sessionId);
        if (!entry) return;

        if (lastSyncTimestamp && entry.timestamp <= lastSyncTimestamp) {
          return;
        }

        if (seenRequestIds.has(entry.request_id)) {
          return;
        }

        entries.push(entry);
        seenRequestIds.add(entry.request_id);
      } catch {
        // Skip unparseable lines
      }
    });

    rl.on('error', (err) => {
      errors.push(`Error reading ${filePath}: ${err.message}`);
    });

    rl.on('close', () => {
      resolve({ entries, prompts, linesProcessed, errors });
    });
  });
}

/**
 * Resolve git remote URL for a directory path
 * Returns null if not a git repo or no remote configured
 */
function resolveGitRemote(cwdPath: string): string | null {
  if (!existsSync(cwdPath)) return null;
  try {
    return execSync('git remote get-url origin', {
      cwd: cwdPath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Discover projects from collected cwd paths
 */
function discoverProjects(cwdPaths: Set<string>): ProjectInfo[] {
  const gitCache = new Map<string, string | null>();
  const projects: ProjectInfo[] = [];

  for (const cwd of cwdPaths) {
    if (!cwd) continue;

    let gitRepo: string | null;
    if (gitCache.has(cwd)) {
      gitRepo = gitCache.get(cwd)!;
    } else {
      gitRepo = resolveGitRemote(cwd);
      gitCache.set(cwd, gitRepo);
    }

    projects.push({ path: cwd, gitRepo });
  }

  return projects;
}

/**
 * Collect usage data from Claude Code directories
 */
export async function collectUsageData(
  config: RuntimeConfig,
  state: AgentState
): Promise<CollectionResult> {
  const allEntries: UsageEntry[] = [];
  const allPrompts: PromptEntry[] = [];
  const allErrors: string[] = [];
  let totalFilesScanned = 0;
  let totalLinesProcessed = 0;

  // Track seen IDs (start with existing from state)
  const seenRequestIds = new Set(state.seen_request_ids);
  const seenPromptUuids = new Set(state.seen_prompt_uuids || []);
  const cwdPaths = new Set<string>();

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
      seenRequestIds,
      seenPromptUuids,
      cwdPaths
    );

    allEntries.push(...result.entries);
    allPrompts.push(...result.prompts);
    totalLinesProcessed += result.linesProcessed;
    allErrors.push(...result.errors);
  }

  // Sort by timestamp (oldest first)
  allEntries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  allPrompts.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Calculate costs for entries that don't have pre-calculated costs
  await calculateEntryCosts(allEntries);

  // Discover projects from cwd paths
  const projects = discoverProjects(cwdPaths);

  return {
    entries: allEntries,
    projects,
    prompts: allPrompts,
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
