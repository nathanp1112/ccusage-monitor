import { createHash } from 'node:crypto';
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
 */
export function discoverClaudePaths(): string[] {
  const home = homedir();
  const paths: string[] = [];

  const nativePaths = [
    join(home, '.config', 'claude', 'projects'),
    join(home, '.claude', 'projects'),
  ];

  for (const p of nativePaths) {
    if (existsSync(p)) {
      paths.push(p);
    }
  }

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

// ─── Types ───────────────────────────────────────────────────────────

/**
 * A single server target configuration
 */
export interface TargetConfig {
  server_url: string;
  email: string;
  password?: string;
}

/**
 * Top-level config file (v2: multi-target)
 */
export interface AgentConfigV2 {
  version: 2;
  targets: TargetConfig[];
  sync_interval_minutes: number;
  max_batch_size: number;
  retry_attempts: number;
  extra_claude_paths?: string[];
  prompt_sync_interval_hours?: number;
}

/**
 * Runtime config with resolved Claude paths
 */
export interface RuntimeConfig extends AgentConfigV2 {
  claude_paths: string[];
}

/**
 * Legacy single-target AgentConfig (used by pusher/commander as a flat interface)
 */
export interface AgentConfig {
  server_url: string;
  email: string;
  password?: string;
  sync_interval_minutes: number;
  max_batch_size: number;
  retry_attempts: number;
  extra_claude_paths?: string[];
  prompt_sync_interval_hours?: number;
}

/**
 * Build a flat AgentConfig from shared config + a single target.
 * Used by pusher, commander, and other code that expects the old flat interface.
 */
export function toAgentConfig(config: AgentConfigV2, target: TargetConfig): AgentConfig {
  return {
    server_url: target.server_url,
    email: target.email,
    password: target.password,
    sync_interval_minutes: config.sync_interval_minutes,
    max_batch_size: config.max_batch_size,
    retry_attempts: config.retry_attempts,
    extra_claude_paths: config.extra_claude_paths,
    prompt_sync_interval_hours: config.prompt_sync_interval_hours,
  };
}

/**
 * Per-file byte offset tracking
 */
export interface FileOffset {
  byteOffset: number;
  lastModified: string;
  fingerprint?: string;
}

/**
 * Per-target sync state
 */
export interface TargetState {
  last_sync_timestamp: string | null;
  last_sync_records: number;
  total_synced_records: number;
  last_prompt_sync_timestamp: string | null;
  access_token?: string | null;
  refresh_token?: string | null;
}

/**
 * Agent state v3 (multi-target, shared file_offsets)
 */
export interface AgentState {
  version: 3;
  file_offsets: Record<string, FileOffset>;
  targets: Record<string, TargetState>;
}

// ─── Target ID ───────────────────────────────────────────────────────

/**
 * Compute a stable target ID from server_url + email
 */
export function targetId(target: TargetConfig): string {
  return createHash('sha256')
    .update(target.server_url + '|' + target.email)
    .digest('hex')
    .slice(0, 12);
}

// ─── Defaults ────────────────────────────────────────────────────────

/**
 * Build-time server URL injected by publish-agent.sh via SERVER_URL env var.
 */
export const BUILT_IN_SERVER_URL: string = process.env.SERVER_URL || '';

export const DEFAULT_TARGET_STATE: TargetState = {
  last_sync_timestamp: null,
  last_sync_records: 0,
  total_synced_records: 0,
  last_prompt_sync_timestamp: null,
};

export const DEFAULT_STATE: AgentState = {
  version: 3,
  file_offsets: {},
  targets: {},
};

const DEFAULT_SHARED: Omit<AgentConfigV2, 'version' | 'targets'> = {
  sync_interval_minutes: 5,
  max_batch_size: 1000,
  retry_attempts: 3,
};

// ─── Config load/save ────────────────────────────────────────────────

export function ensureConfigDir(): void {
  if (!existsSync(AGENT_CONFIG_DIR)) {
    mkdirSync(AGENT_CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load config with auto-migration from v1 (single-target) to v2 (multi-target).
 */
export function loadConfig(): RuntimeConfig {
  ensureConfigDir();

  let config: AgentConfigV2;

  if (existsSync(CONFIG_FILE)) {
    try {
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      const raw = JSON.parse(content);

      if (raw.version === 2 && Array.isArray(raw.targets)) {
        // Already v2
        config = { ...DEFAULT_SHARED, ...raw, version: 2 };
      } else if (Array.isArray(raw)) {
        // User wrote a plain array of targets
        config = {
          version: 2,
          targets: raw as TargetConfig[],
          ...DEFAULT_SHARED,
        };
        // Write back normalized format
        saveConfigRaw(config);
      } else {
        // V1 single-object format — migrate
        const target: TargetConfig = {
          server_url: raw.server_url || BUILT_IN_SERVER_URL || 'http://localhost:3003',
          email: raw.email || '',
          password: raw.password,
        };
        config = {
          version: 2,
          targets: target.email ? [target] : [],
          sync_interval_minutes: raw.sync_interval_minutes ?? DEFAULT_SHARED.sync_interval_minutes,
          max_batch_size: raw.max_batch_size ?? DEFAULT_SHARED.max_batch_size,
          retry_attempts: raw.retry_attempts ?? DEFAULT_SHARED.retry_attempts,
          extra_claude_paths: raw.extra_claude_paths,
          prompt_sync_interval_hours: raw.prompt_sync_interval_hours,
        };
        // Write back migrated format
        saveConfigRaw(config);
      }
    } catch {
      config = { version: 2, targets: [], ...DEFAULT_SHARED };
    }
  } else {
    config = { version: 2, targets: [], ...DEFAULT_SHARED };
  }

  // Discover Claude paths
  const discoveredPaths = discoverClaudePaths();
  const extraPaths = config.extra_claude_paths || [];
  const allPaths = [...new Set([...discoveredPaths, ...extraPaths])];

  return { ...config, claude_paths: allPaths };
}

/**
 * Save config (for setup command — takes the full v2 config)
 */
export function saveConfig(config: AgentConfigV2): void {
  saveConfigRaw(config);
}

function saveConfigRaw(config: AgentConfigV2): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

/**
 * Add or update a target in the config.
 * Matches by server_url + email. Returns the updated config.
 */
export function upsertTarget(config: AgentConfigV2, target: TargetConfig): AgentConfigV2 {
  const id = targetId(target);
  const existingIdx = config.targets.findIndex((t) => targetId(t) === id);

  const updated = { ...config, targets: [...config.targets] };
  if (existingIdx >= 0) {
    updated.targets[existingIdx] = target;
  } else {
    updated.targets.push(target);
  }
  return updated;
}

// ─── State load/save ─────────────────────────────────────────────────

/**
 * Build file_offsets from current file sizes for all known JSONL files.
 */
function buildOffsetsFromCurrentFiles(): Record<string, FileOffset> {
  const offsets: Record<string, FileOffset> = {};
  const paths = discoverClaudePaths();

  for (const claudePath of paths) {
    if (!existsSync(claudePath)) continue;
    try {
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
 * Load state with auto-migration from v2 (single-target) to v3 (multi-target).
 */
export function loadState(): AgentState {
  ensureConfigDir();

  if (!existsSync(STATE_FILE)) {
    return DEFAULT_STATE;
  }

  try {
    const content = readFileSync(STATE_FILE, 'utf-8');
    const raw = JSON.parse(content) as Record<string, unknown>;

    if (raw.version === 3) {
      return { ...DEFAULT_STATE, ...raw } as AgentState;
    }

    if (raw.version === 2) {
      // V2 single-target → V3 multi-target
      // Move per-target fields into a targets map entry
      const config = loadConfig();
      const firstTarget = config.targets[0];

      const perTargetState: TargetState = {
        last_sync_timestamp: (raw.last_sync_timestamp as string) || null,
        last_sync_records: (raw.last_sync_records as number) || 0,
        total_synced_records: (raw.total_synced_records as number) || 0,
        last_prompt_sync_timestamp: (raw.last_prompt_sync_timestamp as string) || null,
        access_token: (raw.access_token as string) || null,
        refresh_token: (raw.refresh_token as string) || null,
      };

      const targets: Record<string, TargetState> = {};
      if (firstTarget) {
        targets[targetId(firstTarget)] = perTargetState;
      }

      const migrated: AgentState = {
        version: 3,
        file_offsets: (raw.file_offsets as Record<string, FileOffset>) || {},
        targets,
      };

      writeFileSync(STATE_FILE, JSON.stringify(migrated, null, 2));
      return migrated;
    }

    // V1 → V3 (skip v2, build offsets from current files)
    const config = loadConfig();
    const firstTarget = config.targets[0];

    const perTargetState: TargetState = {
      last_sync_timestamp: (raw.last_sync_timestamp as string) || null,
      last_sync_records: (raw.last_sync_records as number) || 0,
      total_synced_records: (raw.total_synced_records as number) || 0,
      last_prompt_sync_timestamp: null,
      access_token: null,
      refresh_token: null,
    };

    const targets: Record<string, TargetState> = {};
    if (firstTarget) {
      targets[targetId(firstTarget)] = perTargetState;
    }

    const migrated: AgentState = {
      version: 3,
      file_offsets: buildOffsetsFromCurrentFiles(),
      targets,
    };

    writeFileSync(STATE_FILE, JSON.stringify(migrated, null, 2));
    return migrated;
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
 * Get state for a specific target (returns defaults if not found)
 */
export function getTargetState(state: AgentState, tid: string): TargetState {
  return state.targets[tid] || { ...DEFAULT_TARGET_STATE };
}

/**
 * Set state for a specific target
 */
export function setTargetState(state: AgentState, tid: string, ts: TargetState): void {
  state.targets[tid] = ts;
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
 * Check if agent is configured (has at least one target)
 */
export function isConfigured(): boolean {
  const config = loadConfig();
  return config.targets.length > 0 && config.targets.some((t) => t.email !== '' && t.server_url !== '');
}
