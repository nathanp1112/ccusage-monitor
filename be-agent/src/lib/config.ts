import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { globSync } from 'tinyglobby';

/**
 * Agent configuration directory
 */
export const AGENT_CONFIG_DIR = join(homedir(), '.ccusage-agent');
export const CONFIG_FILE = join(AGENT_CONFIG_DIR, 'config.json');
export const STATE_FILE = join(AGENT_CONFIG_DIR, 'state.json');
export const PID_FILE = join(AGENT_CONFIG_DIR, 'agent.pid');
export const LOG_FILE = join(AGENT_CONFIG_DIR, 'agent.log');

/**
 * Discover all Claude Code data directories dynamically.
 *
 * Claude Code stores usage data in JSONL files. Users may have:
 * 1. Native Claude installation: ~/.claude/projects or ~/.config/claude/projects
 * 2. CCS (Claude Code Spaces) multi-instance setup: ~/.ccs/instances/<name>/projects
 *
 * This function discovers all available paths automatically so users
 * don't need to manually configure them.
 */
export function discoverClaudePaths(): string[] {
  const home = homedir();
  const paths: string[] = [];

  // 1. Native Claude paths (standard installations)
  const nativePaths = [
    join(home, '.config', 'claude', 'projects'),
    join(home, '.claude', 'projects'),
  ];

  for (const p of nativePaths) {
    if (existsSync(p)) {
      paths.push(p);
    }
  }

  // 2. CCS (Claude Code Spaces) instances
  // Users with multiple Claude accounts use CCS which creates separate
  // instances under ~/.ccs/instances/<instance-name>/projects
  const ccsDir = join(home, '.ccs', 'instances');

  if (existsSync(ccsDir)) {
    try {
      const instances = readdirSync(ccsDir, { withFileTypes: true });
      for (const instance of instances) {
        if (instance.isDirectory()) {
          const projectsPath = join(ccsDir, instance.name, 'projects');
          if (existsSync(projectsPath)) {
            paths.push(projectsPath);
          }
        }
      }
    } catch {
      // Ignore errors scanning CCS directory
    }
  }

  return paths;
}

/**
 * Agent configuration (persisted to config.json)
 */
export interface AgentConfig {
  server_url: string;
  email: string;
  /** Password for server authentication (stored locally for auto-login) */
  password?: string;
  sync_interval_minutes: number;
  max_batch_size: number;
  retry_attempts: number;
  /** Additional custom paths to scan (optional, merged with auto-discovered paths) */
  extra_claude_paths?: string[];
  /** Hours between prompt syncs (default: 24). Entries sync every cycle, prompts less often. */
  prompt_sync_interval_hours?: number;
}

/**
 * Runtime configuration with resolved paths
 */
export interface RuntimeConfig extends AgentConfig {
  /** All Claude paths to scan (auto-discovered + extra) */
  claude_paths: string[];
}

/**
 * Per-file byte offset tracking (replaces seen_request_ids ring buffer)
 */
export interface FileOffset {
  byteOffset: number;
  lastModified: string; // ISO timestamp of file mtime when last read
  /** SHA-256 of first 512 bytes — detects file replacement at same path */
  fingerprint?: string;
}

/**
 * Agent state v2 (persisted between runs)
 * Replaced seen_request_ids/seen_prompt_uuids with per-file byte offsets.
 */
export interface AgentState {
  version: 2;
  last_sync_timestamp: string | null;
  last_sync_records: number;
  total_synced_records: number;
  file_offsets: Record<string, FileOffset>;
  last_prompt_sync_timestamp: string | null;
  /** JWT access token for server auth */
  access_token?: string | null;
  /** JWT refresh token for server auth */
  refresh_token?: string | null;
}

/**
 * Build-time server URL injected by publish-agent.sh via SERVER_URL env var.
 * Falls back to empty string if not set (e.g. local dev).
 */
export const BUILT_IN_SERVER_URL: string = process.env.SERVER_URL || '';

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: AgentConfig = {
  server_url: BUILT_IN_SERVER_URL || 'http://localhost:3003',
  email: '',
  sync_interval_minutes: 5,
  max_batch_size: 1000,
  retry_attempts: 3,
};

/**
 * Default state
 */
export const DEFAULT_STATE: AgentState = {
  version: 2,
  last_sync_timestamp: null,
  last_sync_records: 0,
  total_synced_records: 0,
  file_offsets: {},
  last_prompt_sync_timestamp: null,
};

/**
 * Ensure config directory exists
 */
export function ensureConfigDir(): void {
  if (!existsSync(AGENT_CONFIG_DIR)) {
    mkdirSync(AGENT_CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load configuration from file and resolve runtime paths.
 * Claude paths are discovered automatically at runtime.
 * Users can add extra_claude_paths in config for additional custom locations.
 */
export function loadConfig(): RuntimeConfig {
  ensureConfigDir();

  let config: AgentConfig = DEFAULT_CONFIG;

  if (existsSync(CONFIG_FILE)) {
    try {
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      const saved = JSON.parse(content) as Partial<AgentConfig>;
      config = { ...DEFAULT_CONFIG, ...saved };
    } catch {
      // Use defaults on parse error
    }
  }

  // Discover all Claude paths dynamically
  const discoveredPaths = discoverClaudePaths();

  // Merge with any extra custom paths from config
  const extraPaths = config.extra_claude_paths || [];
  const allPaths = [...new Set([...discoveredPaths, ...extraPaths])];

  return {
    ...config,
    claude_paths: allPaths,
  };
}

/**
 * Save configuration to file
 */
export function saveConfig(config: AgentConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Build file_offsets from current file sizes for all known JSONL files.
 * Used during v1→v2 migration: existing data was already synced,
 * so set offsets to current EOF to avoid re-reading everything.
 */
function buildOffsetsFromCurrentFiles(): Record<string, FileOffset> {
  const offsets: Record<string, FileOffset> = {};
  const paths = discoverClaudePaths();

  for (const claudePath of paths) {
    if (!existsSync(claudePath)) continue;
    try {
      // Synchronous glob to keep migration simple
      const files = globSync('**/*.jsonl', { cwd: claudePath, absolute: true });
      for (const file of files) {
        try {
          const stats = statSync(file);
          offsets[file] = {
            byteOffset: stats.size,
            lastModified: stats.mtime.toISOString(),
          };
        } catch { /* skip unreadable files */ }
      }
    } catch { /* skip unreadable dirs */ }
  }

  return offsets;
}

/**
 * Migrate v1 state (seen_request_ids/seen_prompt_uuids) to v2 (file_offsets).
 * Sets file offsets to current file sizes so next sync only picks up NEW data.
 * All existing data was already synced via v1, server dedup handles any overlap.
 */
function migrateState(raw: Record<string, unknown>): AgentState {
  if (raw.version === 2) {
    return { ...DEFAULT_STATE, ...raw } as AgentState;
  }

  // V1 → V2: drop seen_request_ids/seen_prompt_uuids, init offsets to current EOF
  const migrated: AgentState = {
    version: 2,
    last_sync_timestamp: (raw.last_sync_timestamp as string) || null,
    last_sync_records: (raw.last_sync_records as number) || 0,
    total_synced_records: (raw.total_synced_records as number) || 0,
    file_offsets: buildOffsetsFromCurrentFiles(),
    last_prompt_sync_timestamp: null,
  };

  // Persist migrated state immediately so we don't re-migrate
  ensureConfigDir();
  writeFileSync(STATE_FILE, JSON.stringify(migrated, null, 2));

  return migrated;
}

/**
 * Load state from file (auto-migrates v1 → v2)
 */
export function loadState(): AgentState {
  ensureConfigDir();

  if (!existsSync(STATE_FILE)) {
    return DEFAULT_STATE;
  }

  try {
    const content = readFileSync(STATE_FILE, 'utf-8');
    const raw = JSON.parse(content) as Record<string, unknown>;
    return migrateState(raw);
  } catch {
    return DEFAULT_STATE;
  }
}

/**
 * Save state to file
 */
export function saveState(state: AgentState): void {
  ensureConfigDir();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Remove file_offsets entries for files that no longer exist.
 */
export function pruneStaleOffsets(state: AgentState): void {
  for (const filePath of Object.keys(state.file_offsets)) {
    if (!existsSync(filePath)) {
      delete state.file_offsets[filePath];
    }
  }
}

/**
 * Check if agent is configured
 */
export function isConfigured(): boolean {
  const config = loadConfig();
  return config.email !== '' && config.server_url !== '';
}
