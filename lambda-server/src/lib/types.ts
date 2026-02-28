/**
 * CCUsage Monitor - Type Definitions
 * Based on architecture-s3-serverless.md
 */

// ============================================
// Raw Data Types (S3 /raw/{memberId}/{year}-{month}.json)
// ============================================

export interface UsageEntry {
  requestId: string;
  timestamp: string; // ISO timestamp
  model: string;
  projectPath: string | null;
  sessionId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  claudeVersion: string | null;
}

export interface ModelStats {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  recordCount: number;
}

export interface DailyRecord {
  date: string; // "2026-01-27"
  updatedAt: string; // ISO timestamp
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    recordCount: number;
  };
  models: Record<string, ModelStats>;
  entries: UsageEntry[];
}

export interface RawMonthlyData {
  memberId: string;
  year: number;
  month: number;
  lastUpdated: string; // ISO timestamp
  records: Record<string, DailyRecord>; // keyed by date "2026-01-27"
}

// ============================================
// Member Registry Types (S3 /members/index.json)
// ============================================

export interface MemberInfo {
  id: string; // UUID
  name: string;
  email: string;
  role: 'admin' | 'member';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string | null;
  lastSync?: {
    hostname: string | null;
    localIp: string | null;
    publicIp: string | null;
    userAgent: string | null;
    agentVersion: string | null;
  };
}

export interface MemberRegistry {
  version: number;
  lastUpdated: string;
  members: Record<string, MemberInfo>; // keyed by memberId
}

// ============================================
// Sync Log Types (S3 /sync-logs/{year}-{month}/{memberId}.json)
// ============================================

export interface SyncLogEntry {
  syncId: string;
  syncedAt: string;
  recordsInserted: number;
  recordsSkipped: number;
  hostname: string | null;
  clientIp: string | null;
  localIp: string | null;
  userAgent: string | null;
  agentVersion: string | null;
}

export interface SyncLog {
  memberId: string;
  year: number;
  month: number;
  entries: SyncLogEntry[];
}

// ============================================
// API Request/Response Types
// ============================================

export interface SyncRequestEntry {
  request_id: string;
  timestamp: string;
  model: string;
  project_path?: string | null;
  session_id?: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens?: number;
  cache_read_tokens?: number;
  cost_usd: number;
  claude_version?: string | null;
}

export interface SyncRequestProject {
  path: string;
  git_repo: string | null;
}

export interface SyncRequestPrompt {
  uuid: string;
  session_id: string;
  timestamp: string;
  project_path: string;
  cwd: string;
  content: string;
}

export interface SyncRequest {
  email: string;
  name?: string;
  entries: SyncRequestEntry[];
  projects?: SyncRequestProject[];
  prompts?: SyncRequestPrompt[];
  hostname?: string;
  agent_version?: string;
  local_ip?: string | null;
  public_ip?: string | null;
}

export interface SyncResponse {
  success: boolean;
  inserted: number;
  skipped: number;
  memberId?: string;
  error?: string;
  code?: string;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
}

// ============================================
// Pre-computed View Types (S3 /views/)
// ============================================

export interface DashboardSummary {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalMembers: number;
  activeMembers: number;
  avgCostPerMember: number;
}

export interface DashboardView {
  generatedAt: string;
  summary: DashboardSummary;
  costChangePercent: number;
  dailyTrend: Array<{
    date: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  topMembers: Array<{
    memberId: string;
    name: string;
    costUsd: number;
    percentage: number;
  }>;
  modelDistribution: Array<{
    model: string;
    costUsd: number;
    percentage: number;
  }>;
  recentSyncs: Array<{
    memberId: string;
    memberName: string;
    syncedAt: string;
    recordsInserted: number;
  }>;
}

export interface MembersView {
  generatedAt: string;
  teamTotals: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  };
  members: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
    lastSyncAt: string | null;
    currentMonth: {
      costUsd: number;
      inputTokens: number;
      outputTokens: number;
    };
    previousMonth: {
      costUsd: number;
      inputTokens: number;
      outputTokens: number;
    };
    costChangePercent: number;
  }>;
}

export interface MonthlyData {
  totals: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    recordCount: number;
  };
  dailyUsage: Array<{
    date: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    recordCount: number;
  }>;
  dailyModelUsage: Array<{
    date: string;
    models: Array<{
      model: string;
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
    }>;
  }>;
  modelBreakdown: Array<{
    model: string;
    costUsd: number;
    percentage: number;
  }>;
  projectBreakdown: Array<{
    project: string;
    costUsd: number;
    percentage: number;
  }>;
}

export interface MemberYearlyView {
  generatedAt: string;
  member: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
  };
  year: number;
  months: Record<string, MonthlyData>; // "1", "2", ... "12"
  recentSyncs: SyncLogEntry[];
  projects: ProjectData[];
  promptStats: Record<string, { count: number }>; // "1": { count: 42 }, etc.
}

// ============================================
// Project Tracking Types (S3 /projects/{memberId}.json)
// ============================================

export interface ProjectData {
  path: string;
  gitRepo: string | null;
  firstSeen: string; // ISO timestamp
  lastSeen: string; // ISO timestamp
}

export interface MemberProjects {
  memberId: string;
  lastUpdated: string;
  projects: Record<string, ProjectData>; // keyed by path
}

// ============================================
// Prompt Audit Types (S3 /prompts/{memberId}/{year}-{month}.json)
// ============================================

export interface PromptRecord {
  uuid: string;
  sessionId: string;
  timestamp: string;
  projectPath: string;
  cwd: string;
  content: string;
  syncedAt: string;
}

export interface PromptMonthlyData {
  memberId: string;
  year: number;
  month: number;
  lastUpdated: string;
  prompts: PromptRecord[];
}

// ============================================
// Admin Command Types (S3 /commands/{memberId}/queue.json)
// ============================================

export type CommandType = 'revoke-token' | 'force-sync' | 'update-config' | 'custom';

export interface AgentCommand {
  id: string; // UUID
  type: CommandType;
  payload: Record<string, unknown>;
  createdAt: string;
  createdBy: string; // Admin email or "system"
  status: 'pending' | 'acked' | 'failed';
  ackedAt?: string;
  result?: string;
}

export interface CommandQueue {
  memberId: string;
  lastUpdated: string;
  commands: AgentCommand[];
}

// ============================================
// Auth Types
// ============================================

export interface AuthUser {
  email: string;
  name: string;
  role: 'admin' | 'agent' | 'member';
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: true;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface RefreshResponse {
  success: true;
  accessToken: string;
  refreshToken: string;
}

// ============================================
// Aggregation Types (S3 /aggregated/{memberId}/{year}-{month}.json)
// ============================================

export interface DailyModelStats {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface DailyModelUsage {
  date: string;
  models: DailyModelStats[];
}

export interface DayAggregation {
  date: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  recordCount: number;
}

export interface ModelBreakdown {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  recordCount: number;
}

export interface MonthAggregation {
  year: number;
  month: number;
  lastUpdated?: string; // ISO timestamp — when the underlying raw data was last modified
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    recordCount: number;
  };
  dailyUsage: DayAggregation[];
  dailyModelUsage: DailyModelUsage[];
  modelBreakdown: Record<string, ModelBreakdown>;
  projectBreakdown: Record<string, number>;
}
