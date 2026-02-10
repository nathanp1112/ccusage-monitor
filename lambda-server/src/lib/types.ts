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
    clientIp: string | null;
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

export interface SyncRequest {
  email: string;
  name?: string;
  entries: SyncRequestEntry[];
  hostname?: string;
  agent_version?: string;
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
