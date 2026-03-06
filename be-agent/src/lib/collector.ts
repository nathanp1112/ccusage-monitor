import { createReadStream, readSync, openSync, closeSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { basename, sep } from 'node:path';
import { glob } from 'tinyglobby';
import type { RuntimeConfig, AgentState, FileOffset } from './config.js';
import { pruneStaleOffsets } from './config.js';
import { calculateCost } from './pricing.js';

/**
 * Size of the head chunk used for fingerprinting.
 * 512 bytes captures the first few JSONL lines — enough to detect file replacement.
 */
const FINGERPRINT_BYTES = 512;

/**
 * Compute a SHA-256 hash of the first N bytes of a file.
 * If the file is shorter than N bytes, hash whatever is available.
 */
function computeFingerprint(filePath: string): string {
  const fd = openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(FINGERPRINT_BYTES);
    const bytesRead = readSync(fd, buf, 0, FINGERPRINT_BYTES, 0);
    return createHash('sha256').update(buf.subarray(0, bytesRead)).digest('hex');
  } finally {
    closeSync(fd);
  }
}

/**
 * Verify that a file's head bytes still match a previously stored fingerprint.
 */
function verifyFingerprint(filePath: string, expected: string): boolean {
  try {
    return computeFingerprint(filePath) === expected;
  } catch {
    return false; // Can't read → treat as changed
  }
}

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
  file_extensions?: Record<string, number>; // ext → operation count, e.g. { ts: 3, json: 1 }
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
  updatedFileOffsets: Record<string, FileOffset>;
}

/**
 * Collection options
 */
export interface CollectOptions {
  skipPrompts?: boolean;
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

    // Extract file operation counts from tool_use blocks in message content
    const file_extensions: Record<string, number> = {};
    const FILE_TOOLS = new Set(['Read', 'Edit', 'Write', 'NotebookEdit', 'Glob']);
    if (Array.isArray(data.message.content)) {
      for (const block of data.message.content as Array<{
        type?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>) {
        if (block.type === 'tool_use' && FILE_TOOLS.has(block.name ?? '')) {
          const filePath = block.input?.file_path as string | undefined;
          if (filePath) {
            const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
            if (ext) file_extensions[ext] = (file_extensions[ext] ?? 0) + 1;
          }
        }
      }
    }

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
      file_extensions: Object.keys(file_extensions).length > 0 ? file_extensions : undefined,
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
 * Process a single JSONL file, reading only new bytes from byteOffset.
 * JSONL files are append-only, so bytes after the offset are guaranteed new.
 */
async function processJSONLFile(
  filePath: string,
  byteOffset: number,
  skipPrompts: boolean,
  cwdPaths: Set<string>
): Promise<{
  entries: UsageEntry[];
  prompts: PromptEntry[];
  linesProcessed: number;
  errors: string[];
  finalByteOffset: number;
}> {
  const entries: UsageEntry[] = [];
  const prompts: PromptEntry[] = [];
  const errors: string[] = [];
  let linesProcessed = 0;

  const fileSize = statSync(filePath).size;

  // Nothing new to read
  if (byteOffset >= fileSize) {
    return { entries, prompts, linesProcessed: 0, errors, finalByteOffset: byteOffset };
  }

  const projectPath = extractProjectFromPath(filePath);
  const sessionId = extractSessionFromPath(filePath);

  return new Promise((resolve) => {
    const stream = createReadStream(filePath, {
      encoding: 'utf-8',
      start: byteOffset,
    });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    let isFirstLine = byteOffset > 0;

    rl.on('line', (line) => {
      if (!line.trim()) return;

      // If starting mid-file, the first chunk may be a partial line.
      // Try parsing it; if it fails, skip silently (caught by catch below).
      if (isFirstLine) {
        isFirstLine = false;
      }

      linesProcessed++;

      try {
        const data = JSON.parse(line) as RawUsageData;

        // Collect cwd for project discovery
        if (data.cwd) {
          cwdPaths.add(data.cwd);
        }

        // Extract prompt from user messages
        if (!skipPrompts && data.type === 'user' && data.uuid) {
          const prompt = extractPrompt(data, projectPath, sessionId);
          if (prompt) {
            prompts.push(prompt);
          }
        }

        // Extract usage entry
        const entry = parseJSONLLine(line, projectPath, sessionId);
        if (!entry) return;

        entries.push(entry);
      } catch {
        // Skip unparseable lines (includes partial first line if mid-file start)
      }
    });

    rl.on('error', (err) => {
      errors.push(`Error reading ${filePath}: ${err.message}`);
    });

    rl.on('close', () => {
      resolve({ entries, prompts, linesProcessed, errors, finalByteOffset: fileSize });
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
 * Collect usage data from Claude Code directories.
 * Uses per-file byte offsets to read only new data appended since last sync.
 */
export async function collectUsageData(
  config: RuntimeConfig,
  state: AgentState,
  options?: CollectOptions
): Promise<CollectionResult> {
  const allEntries: UsageEntry[] = [];
  const allPrompts: PromptEntry[] = [];
  const allErrors: string[] = [];
  let totalFilesScanned = 0;
  let totalLinesProcessed = 0;
  const skipPrompts = options?.skipPrompts ?? false;

  // Prune offsets for deleted files
  pruneStaleOffsets(state);

  const updatedFileOffsets: Record<string, FileOffset> = { ...state.file_offsets };
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
      jsonlFiles.push(...files);
    } catch (err) {
      allErrors.push(`Error scanning ${claudePath}: ${(err as Error).message}`);
    }
  }

  // Process each file using byte offsets
  for (const file of jsonlFiles) {
    const knownOffset = state.file_offsets[file];
    let byteOffset = 0;

    if (knownOffset) {
      try {
        const stats = statSync(file);

        if (stats.size < knownOffset.byteOffset) {
          // File was truncated/rewritten — re-read from beginning
          byteOffset = 0;
        } else if (stats.size === knownOffset.byteOffset) {
          // Same size — check if file was replaced (different inode/birthtime)
          if (knownOffset.fingerprint && !verifyFingerprint(file, knownOffset.fingerprint)) {
            byteOffset = 0; // File replaced at same path — re-read
          } else {
            continue; // Truly unchanged — skip
          }
        } else {
          // File grew — verify it's the same file, not a replacement
          if (knownOffset.fingerprint && !verifyFingerprint(file, knownOffset.fingerprint)) {
            byteOffset = 0; // Different file at same path — re-read from beginning
          } else {
            byteOffset = knownOffset.byteOffset; // Same file, appended — read from offset
          }
        }
      } catch {
        byteOffset = 0;
      }
    }

    totalFilesScanned++;

    const result = await processJSONLFile(file, byteOffset, skipPrompts, cwdPaths);

    // Record updated offset + fingerprint
    try {
      updatedFileOffsets[file] = {
        byteOffset: result.finalByteOffset,
        lastModified: statSync(file).mtime.toISOString(),
        fingerprint: computeFingerprint(file),
      };
    } catch {
      // If stat fails after processing, still keep old offset
    }

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
    updatedFileOffsets,
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
