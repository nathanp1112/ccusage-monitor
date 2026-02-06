import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
} from 'node:fs';

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
  sync_interval_minutes: number;
  max_batch_size: number;
  retry_attempts: number;
  /** Additional custom paths to scan (optional, merged with auto-discovered paths) */
  extra_claude_paths?: string[];
}

/**
 * Runtime configuration with resolved paths
 */
export interface RuntimeConfig extends AgentConfig {
  /** All Claude paths to scan (auto-discovered + extra) */
  claude_paths: string[];
}

/**
 * Agent state (persisted between runs)
 */
export interface AgentState {
  last_sync_timestamp: string | null;
  last_sync_records: number;
  total_synced_records: number;
  seen_request_ids: string[];
}

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: AgentConfig = {
  server_url: 'http://localhost:3003',
  email: '',
  sync_interval_minutes: 5,
  max_batch_size: 1000,
  retry_attempts: 3,
};

/**
 * Default state
 */
export const DEFAULT_STATE: AgentState = {
  last_sync_timestamp: null,
  last_sync_records: 0,
  total_synced_records: 0,
  seen_request_ids: [],
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
 * Load state from file
 */
export function loadState(): AgentState {
  ensureConfigDir();

  if (!existsSync(STATE_FILE)) {
    return DEFAULT_STATE;
  }

  try {
    const content = readFileSync(STATE_FILE, 'utf-8');
    const state = JSON.parse(content) as Partial<AgentState>;
    return { ...DEFAULT_STATE, ...state };
  } catch {
    return DEFAULT_STATE;
  }
}

/**
 * Save state to file
 */
export function saveState(state: AgentState): void {
  ensureConfigDir();

  // Keep only last 10000 request IDs to prevent file from growing too large
  const trimmedState = {
    ...state,
    seen_request_ids: state.seen_request_ids.slice(-10000),
  };

  writeFileSync(STATE_FILE, JSON.stringify(trimmedState, null, 2));
}

/**
 * Check if agent is configured
 */
export function isConfigured(): boolean {
  const config = loadConfig();
  return config.email !== '' && config.server_url !== '';
}
