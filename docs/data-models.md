# Data Models

Complete data model documentation for the CCUsage Monitor serverless team monitoring system.

---

## Table of Contents

- [S3 Bucket Layout](#s3-bucket-layout)
- [S3 Key Patterns](#s3-key-patterns)
- [JSONL Entry Format (Agent Input)](#jsonl-entry-format-agent-input)
- [Sync Payload Structure](#sync-payload-structure)
- [Raw Data Layer](#raw-data-layer)
- [Aggregated Data Layer](#aggregated-data-layer)
- [View Data Layer](#view-data-layer)
- [Member Registry](#member-registry)
- [Sync Logs](#sync-logs)
- [Project Tracking](#project-tracking)
- [Prompt Audit](#prompt-audit)
- [Admin Command Queue](#admin-command-queue)
- [Auth Types](#auth-types)
- [Release Management](#release-management)
- [Agent Config and State](#agent-config-and-state)
- [Dashboard Frontend Types](#dashboard-frontend-types)
- [Type Mapping Between Components](#type-mapping-between-components)

---

## S3 Bucket Layout

All data is stored in a single S3 bucket (`ccusage-data-dev`). The three-layer architecture allows each layer to be rebuilt from the one above: `raw/ -> aggregated/ -> views/`.

```
INPUT LAYER (written by POST /api/sync):
raw/           = "What happened"    (source of truth, individual entries)
aggregated/    = "What it means"    (pre-computed per-month summaries)

raw/{memberId}/{year}-{month}.json          All usage entries (source of truth)
aggregated/{memberId}/{year}-{month}.json   Pre-computed monthly summaries
members/index.json                          Member registry (email->id mapping)
sync-logs/{year}-{month}/{memberId}.json    Sync audit trail
projects/{memberId}.json                    Project list with git remotes
prompts/{memberId}/{year}-{month}.json      Prompt text archive (ISMS audit)
commands/{memberId}/queue.json              Admin command queue for agents

OUTPUT LAYER (written by aggregator Lambda):
views/         = "What to show"     (dashboard-ready JSON)

views/dashboard.json                        Team-wide summary stats
views/members.json                          Member list with current/prev month
views/members/{memberId}/{year}.json        Per-member yearly detail

METADATA:
meta/last-processed.json                    Aggregation timestamp

RELEASES:
releases/version.json                       Latest agent version manifest
releases/ccusage-agent-*.tgz               Agent binaries for auto-update
```

Each layer can be rebuilt from the one above: `raw/ -> aggregated/ -> views/`

---

## S3 Key Patterns

The following functions in `lambda-server/src/lib/s3.ts` generate S3 keys:

| Function | Pattern | Example |
|----------|---------|---------|
| `getRawDataKey(memberId, year, month)` | `raw/{memberId}/{year}-{month}.json` | `raw/abc-123/2026-02.json` |
| `getAggregatedDataKey(memberId, year, month)` | `aggregated/{memberId}/{year}-{month}.json` | `aggregated/abc-123/2026-02.json` |
| `getMemberRegistryKey()` | `members/index.json` | `members/index.json` |
| `getSyncLogKey(memberId, year, month)` | `sync-logs/{year}-{month}/{memberId}.json` | `sync-logs/2026-02/abc-123.json` |
| `getProjectsKey(memberId)` | `projects/{memberId}.json` | `projects/abc-123.json` |
| `getPromptsKey(memberId, year, month)` | `prompts/{memberId}/{year}-{month}.json` | `prompts/abc-123/2026-02.json` |
| `getCommandQueueKey(memberId)` | `commands/{memberId}/queue.json` | `commands/abc-123/queue.json` |
| `getDashboardViewKey()` | `views/dashboard.json` | `views/dashboard.json` |
| `getMembersViewKey()` | `views/members.json` | `views/members.json` |
| `getMemberDetailViewKey(memberId, year)` | `views/members/{memberId}/{year}.json` | `views/members/abc-123/2026.json` |
| `getMetaKey()` | `meta/last-processed.json` | `meta/last-processed.json` |
| `getReleasesVersionKey()` | `releases/version.json` | `releases/version.json` |
| `getReleasesFileKey(filename)` | `releases/{filename}` | `releases/ccusage-agent-0.5.0.tgz` |

All month values are zero-padded to two digits (e.g., `01`, `02`, ..., `12`).

---

## JSONL Entry Format (Agent Input)

The agent parses `.jsonl` files from Claude Code data directories. Each line is a JSON object representing a single event in a Claude Code session.

### File Locations

```
~/.claude/projects/{project-name}/{session-id}.jsonl
~/.config/claude/projects/{project-name}/{session-id}.jsonl
~/.ccs/instances/{instance-name}/projects/{project-name}/{session-id}.jsonl
```

### Raw JSONL Line Structure

```typescript
// From be-agent/src/lib/collector.ts
interface RawUsageData {
  timestamp?: string;       // ISO 8601 timestamp
  requestId?: string;       // Unique request identifier
  sessionId?: string;       // Session identifier
  version?: string;         // Claude Code version
  type?: string;            // "user" | "assistant" | "summary" | "system"
  uuid?: string;            // Unique message ID
  cwd?: string;             // Working directory at time of message
  message?: {
    role?: string;          // "user" | "assistant"
    model?: string;         // e.g., "claude-sonnet-4-20250514"
    content?: string | unknown[];  // Message text or structured content
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
  costUSD?: number;         // Pre-calculated cost from Claude Code
}
```

### What Gets Extracted

**Usage entries** are extracted from lines that have both `timestamp` and `message.usage`. The agent generates a `request_id` from `requestId` or falls back to `{sessionId}_{timestamp}`.

**Prompts** are extracted from lines where `type === "user"` and `message.content` is a non-empty string with a valid `uuid` and `timestamp`.

**Projects** are discovered from the `cwd` field across all parsed lines. Each unique `cwd` is resolved to a git remote URL (if available).

### Example JSONL Lines

```json
{"timestamp":"2026-02-25T09:00:00Z","requestId":"req_abc123","sessionId":"sess_xyz","version":"1.0.0","type":"assistant","message":{"model":"claude-sonnet-4-20250514","usage":{"input_tokens":5000,"output_tokens":1200,"cache_creation_input_tokens":0,"cache_read_input_tokens":3000}},"costUSD":0.0234,"cwd":"/home/user/project"}
{"timestamp":"2026-02-25T09:01:00Z","type":"user","uuid":"msg_001","sessionId":"sess_xyz","message":{"role":"user","content":"Explain this function"},"cwd":"/home/user/project"}
```

### Byte-Offset Incremental Reading

JSONL files are append-only. The agent tracks per-file byte offsets to read only new data since the last sync:

```typescript
interface FileOffset {
  byteOffset: number;     // Position to resume reading from
  lastModified: string;   // ISO timestamp of file mtime when last read
}
```

If a file shrinks (truncated/rewritten), the agent re-reads from the beginning. If the file size equals the stored offset, the file is skipped entirely.

---

## Sync Payload Structure

The `be-agent` sends data to `POST /api/sync` in the following format. The agent maps its internal `UsageEntry` to the API's snake_case format:

```typescript
// Request payload constructed by be-agent/src/lib/pusher.ts
{
  email: "user@example.com",
  entries: [
    {
      request_id: "req_abc123",
      timestamp: "2026-02-25T09:00:00Z",
      model: "claude-sonnet-4-20250514",
      project_path: "my-project",         // Extracted from JSONL directory structure
      session_id: "sess_xyz",
      input_tokens: 5000,
      output_tokens: 1200,
      cache_creation_tokens: 0,
      cache_read_tokens: 3000,
      cost_usd: 0.0234,
      claude_version: "1.0.0"
    }
  ],
  projects: [
    {
      path: "/home/user/project",
      git_repo: "https://github.com/org/repo.git"
    }
  ],
  prompts: [
    {
      uuid: "msg_001",
      session_id: "sess_xyz",
      timestamp: "2026-02-25T09:01:00Z",
      project_path: "my-project",
      cwd: "/home/user/project",
      content: "Explain this function"
    }
  ],
  agent_version: "0.5.0",
  hostname: "dev-laptop",
  local_ip: "192.168.1.100",
  public_ip: "203.0.113.50"
}
```

---

## Raw Data Layer

**S3 Key:** `raw/{memberId}/{year}-{month}.json`

Source of truth for all usage data. Contains every individual entry organized by day within a month.

```typescript
// From lambda-server/src/lib/types.ts
interface RawMonthlyData {
  memberId: string;
  year: number;
  month: number;
  lastUpdated: string;                          // ISO timestamp
  records: Record<string, DailyRecord>;         // Keyed by date "YYYY-MM-DD"
}

interface DailyRecord {
  date: string;                                 // "2026-02-25"
  updatedAt: string;                            // ISO timestamp
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    recordCount: number;
  };
  models: Record<string, ModelStats>;           // Keyed by model name
  entries: UsageEntry[];                        // Individual entries
}

interface ModelStats {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  recordCount: number;
}

interface UsageEntry {
  requestId: string;             // Deduplication key
  timestamp: string;             // ISO timestamp
  model: string;                 // e.g., "claude-sonnet-4-20250514"
  projectPath: string | null;
  sessionId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  claudeVersion: string | null;
}
```

**Cost precision:** Cost values use 6 decimal places (microdollars) to avoid floating-point precision loss. The `addCost()` helper in `s3.ts` handles arithmetic: `Math.round((a * 1000000 + b * 1000000)) / 1000000`.

---

## Aggregated Data Layer

**S3 Key:** `aggregated/{memberId}/{year}-{month}.json`

Pre-computed monthly summaries written at sync time. This eliminates the need to re-read raw data during aggregation.

```typescript
// From lambda-server/src/lib/types.ts
interface MonthAggregation {
  year: number;
  month: number;
  lastUpdated?: string;          // ISO timestamp from underlying raw data
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    recordCount: number;
  };
  dailyUsage: DayAggregation[];              // Sorted by date ascending
  dailyModelUsage: DailyModelUsage[];        // Sorted by date ascending
  modelBreakdown: Record<string, ModelBreakdown>;  // Keyed by model name
  projectBreakdown: Record<string, number>;  // project path -> total costUsd
}

interface DayAggregation {
  date: string;          // "YYYY-MM-DD"
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  recordCount: number;
}

interface DailyModelUsage {
  date: string;
  models: DailyModelStats[];     // Sorted by cost descending within each day
}

interface DailyModelStats {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface ModelBreakdown {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  recordCount: number;
}
```

**Rebuild:** The aggregation can be recomputed from raw data using `aggregateMonthData()` in `lambda-server/src/lib/aggregation.ts`. The aggregator Lambda does this when `force=true`.

---

## View Data Layer

Pre-computed dashboard-ready JSON files written by the aggregator Lambda. The dashboard reads these directly without any computation.

### views/dashboard.json

**S3 Key:** `views/dashboard.json`

Team-wide summary for the current month.

```typescript
interface DashboardView {
  generatedAt: string;           // ISO timestamp
  summary: DashboardSummary;
  costChangePercent: number;     // Month-over-month change
  dailyTrend: Array<{           // Last 30 days across all members
    date: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  topMembers: Array<{           // Top 10 by cost
    memberId: string;
    name: string;
    costUsd: number;
    percentage: number;
  }>;
  modelDistribution: Array<{    // All models sorted by cost desc
    model: string;
    costUsd: number;
    percentage: number;
  }>;
  recentSyncs: Array<{          // Last 20 syncs
    memberId: string;
    memberName: string;
    syncedAt: string;
    recordsInserted: number;
  }>;
}

interface DashboardSummary {
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalMembers: number;
  activeMembers: number;
  avgCostPerMember: number;
}
```

### views/members.json

**S3 Key:** `views/members.json`

Member list with current and previous month stats.

```typescript
interface MembersView {
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
  }>;                            // Sorted by currentMonth.costUsd descending
}
```

### views/members/{memberId}/{year}.json

**S3 Key:** `views/members/{memberId}/{year}.json`

Per-member yearly detail with all 12 months of data.

```typescript
interface MemberYearlyView {
  generatedAt: string;
  member: {
    id: string;
    name: string;
    email: string;
    role: string;
    isActive: boolean;
  };
  year: number;
  months: Record<string, MonthlyData>;       // Keys: "1" through "12"
  recentSyncs: SyncLogEntry[];               // Last 10 sync entries
  projects: ProjectData[];                   // All known projects
  promptStats: Record<string, { count: number }>;  // "1": { count: 42 }
}

interface MonthlyData {
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
  }>;                            // Top 20 projects by cost
}
```

### meta/last-processed.json

**S3 Key:** `meta/last-processed.json`

Aggregator processing metadata. Used for change detection (skip months not updated since last run).

```typescript
interface ProcessingMeta {
  lastProcessedAt: string;           // ISO timestamp
  lastProcessingDurationMs: number;
  membersProcessed: number;
  viewsGenerated: string[];          // S3 keys written
}
```

---

## Member Registry

**S3 Key:** `members/index.json`

Central registry mapping emails to member IDs. Uses ETag-based optimistic concurrency control to handle concurrent writes from multiple agent syncs.

```typescript
interface MemberRegistry {
  version: number;                              // Schema version (currently 1)
  lastUpdated: string;                          // ISO timestamp
  members: Record<string, MemberInfo>;          // Keyed by memberId (UUID)
}

interface MemberInfo {
  id: string;                // UUID v4
  name: string;              // Display name (from sync or email prefix)
  email: string;             // Lowercase email
  role: "admin" | "member";
  isActive: boolean;
  createdAt: string;         // ISO timestamp
  updatedAt: string;         // ISO timestamp
  lastSyncAt: string | null; // ISO timestamp of most recent sync
  lastSync?: {               // Metadata from most recent sync
    hostname: string | null;
    localIp: string | null;
    publicIp: string | null;
    userAgent: string | null;
    agentVersion: string | null;
  };
}
```

**Concurrency handling:** The sync endpoint uses `getJsonFromS3WithETag()` and `putJsonToS3WithETag()` with `IfMatch`/`IfNoneMatch` headers. On ETag conflict (`ConditionalCheckFailed`), the operation is retried up to 3 times with exponential backoff.

**Member creation:** New members are created automatically on first sync. The name defaults to the email prefix (part before `@`). The `role` defaults to `"member"`.

---

## Sync Logs

**S3 Key:** `sync-logs/{year}-{month}/{memberId}.json`

Audit trail of all sync operations for a member within a month.

```typescript
interface SyncLog {
  memberId: string;
  year: number;
  month: number;
  entries: SyncLogEntry[];
}

interface SyncLogEntry {
  syncId: string;            // UUID
  syncedAt: string;          // ISO timestamp
  recordsInserted: number;
  recordsSkipped: number;
  hostname: string | null;
  clientIp: string | null;   // Public IP from x-forwarded-for or agent
  localIp: string | null;    // LAN IP from agent
  userAgent: string | null;
  agentVersion: string | null;
}
```

---

## Project Tracking

**S3 Key:** `projects/{memberId}.json`

Projects discovered from `cwd` fields in JSONL files. Updated on each sync.

```typescript
interface MemberProjects {
  memberId: string;
  lastUpdated: string;                         // ISO timestamp
  projects: Record<string, ProjectData>;       // Keyed by absolute path
}

interface ProjectData {
  path: string;              // Absolute filesystem path (e.g., "/home/user/my-app")
  gitRepo: string | null;    // Git remote URL or null
  firstSeen: string;         // ISO timestamp when first discovered
  lastSeen: string;          // ISO timestamp when last seen in sync
}
```

---

## Prompt Audit

**S3 Key:** `prompts/{memberId}/{year}-{month}.json`

Archive of user prompt text for ISMS compliance auditing. Prompts are deduplicated by `uuid`.

```typescript
interface PromptMonthlyData {
  memberId: string;
  year: number;
  month: number;
  lastUpdated: string;       // ISO timestamp
  prompts: PromptRecord[];
}

interface PromptRecord {
  uuid: string;              // Unique message ID from JSONL
  sessionId: string;
  timestamp: string;         // ISO timestamp
  projectPath: string;
  cwd: string;               // Working directory
  content: string;           // Full prompt text
  syncedAt: string;          // ISO timestamp when received by server
}
```

---

## Admin Command Queue

**S3 Key:** `commands/{memberId}/queue.json`

Command queue for remote agent management. Admins create commands; agents poll and acknowledge them.

```typescript
interface CommandQueue {
  memberId: string;
  lastUpdated: string;
  commands: AgentCommand[];
}

interface AgentCommand {
  id: string;                                  // UUID
  type: CommandType;
  payload: Record<string, unknown>;            // Command-specific data
  createdAt: string;                           // ISO timestamp
  createdBy: string;                           // Admin email or "system"
  status: "pending" | "acked" | "failed";
  ackedAt?: string;                            // ISO timestamp when agent acknowledged
  result?: string;                             // Agent execution result
}

type CommandType = "revoke-token" | "force-sync" | "update-config" | "custom";
```

**Command lifecycle:**
1. Admin creates command via `POST /api/admin/commands` (status: `pending`)
2. Agent polls `GET /api/agent/commands?email=...` (returns only `pending`)
3. Agent executes command and calls `POST /api/agent/commands/:id/ack` (status: `acked` or `failed`)

---

## Auth Types

### Server-Side User Record

Users are stored in a JSON file loaded at build time (`lambda-server/src/data/users.json`).

```typescript
// From lambda-server/src/lib/auth.ts
interface UserRecord {
  email: string;
  passwordHash: string;      // SHA-256 hex digest
  name: string;
  role: "admin" | "agent" | "member";
}
```

### JWT Payload

```typescript
interface JwtPayload {
  email: string;
  name: string;
  role: string;
  type: "access" | "refresh";
  iat: number;               // Issued at (Unix timestamp)
  exp: number;               // Expiration (Unix timestamp)
}
```

Token expiry:
- Access token: 60 minutes
- Refresh token: 20 days
- Algorithm: HS256
- Secret: `JWT_SECRET` environment variable (required in production)

### API Auth Types

```typescript
// From lambda-server/src/lib/types.ts
interface AuthUser {
  email: string;
  name: string;
  role: "admin" | "agent" | "member";
}

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  success: true;
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface RefreshRequest {
  refreshToken: string;
}

interface RefreshResponse {
  success: true;
  accessToken: string;
  refreshToken: string;
}
```

---

## Release Management

**S3 Key:** `releases/version.json`

```typescript
{
  version: string;       // e.g., "0.5.0"
  filename: string;      // e.g., "ccusage-agent-0.5.0.tgz"
}
```

The actual tgz binary is stored at `releases/{filename}`. Download URLs are generated as presigned S3 URLs with 10-minute expiry.

---

## Agent Config and State

### Config File

**Location:** `~/.ccusage-agent/config.json`

```typescript
// From be-agent/src/lib/config.ts
interface AgentConfig {
  server_url: string;                  // Lambda API base URL
  email: string;                       // Team member email
  password?: string;                   // Password for JWT auth (stored locally)
  sync_interval_minutes: number;       // How often to sync (default: 5)
  max_batch_size: number;              // Entries per batch (default: 1000)
  retry_attempts: number;              // Max retries on failure (default: 3)
  extra_claude_paths?: string[];       // Additional custom scan paths
  prompt_sync_interval_hours?: number; // Hours between prompt syncs (default: 24)
}
```

**Default values:**

```typescript
const DEFAULT_CONFIG: AgentConfig = {
  server_url: "http://localhost:3003",
  email: "",
  sync_interval_minutes: 5,
  max_batch_size: 1000,
  retry_attempts: 3,
};
```

### State File

**Location:** `~/.ccusage-agent/state.json`

```typescript
interface AgentState {
  version: 2;                                    // Schema version
  last_sync_timestamp: string | null;            // ISO timestamp of last sync
  last_sync_records: number;                     // Records synced in last run
  total_synced_records: number;                  // Lifetime total
  file_offsets: Record<string, FileOffset>;      // Per-file byte tracking
  last_prompt_sync_timestamp: string | null;     // ISO timestamp of last prompt sync
  access_token?: string | null;                  // JWT access token
  refresh_token?: string | null;                 // JWT refresh token
}

interface FileOffset {
  byteOffset: number;       // Byte position to resume from
  lastModified: string;     // ISO timestamp of file mtime when last read
}
```

**State v1 to v2 migration:** Version 1 used `seen_request_ids` (a ring buffer of recent IDs) and `seen_prompt_uuids`. Version 2 replaced these with `file_offsets` for more efficient incremental reading. Migration sets all file offsets to current EOF (since existing data was already synced via v1, and server-side dedup handles any overlap).

### Runtime Config

The runtime config merges the persisted config with auto-discovered Claude paths:

```typescript
interface RuntimeConfig extends AgentConfig {
  claude_paths: string[];    // Auto-discovered + extra_claude_paths (deduplicated)
}
```

**Auto-discovered paths:**
1. `~/.config/claude/projects` -- Alternative Claude Code location
2. `~/.claude/projects` -- Standard Claude Code location
3. `~/.ccs/instances/*/projects` -- CCS multi-instance setups

### Other Agent Files

| File | Path | Purpose |
|------|------|---------|
| Config | `~/.ccusage-agent/config.json` | Agent configuration |
| State | `~/.ccusage-agent/state.json` | Sync state and byte offsets |
| PID | `~/.ccusage-agent/agent.pid` | Daemon process ID |
| Log | `~/.ccusage-agent/agent.log` | Daemon output log |

---

## Dashboard Frontend Types

Types used by the Next.js dashboard to consume the Lambda API.

### From `dashboard/src/types/api.ts`

```typescript
// Member in list view
interface Member {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

// Member with usage details
interface MemberDetail extends Member {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  modelsUsed: string[];
}

// Individual usage record
interface MemberUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;
  model: string;
}

// Dashboard overview stats
interface DashboardStats {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  activeMembers: number;
  totalMembers: number;
  costChange: number;        // Percentage change
  tokensChange: number;      // Percentage change
}

// Daily trend data point
interface DashboardTrend {
  date: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

// Top member by cost
interface TopMember {
  id: string;
  name: string;
  costUsd: number;
  inputTokens: number;
  lastSyncAt: string | null;
}

// Model distribution item
interface ModelDistribution {
  model: string;
  costUsd: number;
  tokens: number;
  percentage: number;
}

// Composite dashboard data
interface DashboardData {
  stats: DashboardStats;
  trends: DashboardTrend[];
  topMembers: TopMember[];
  modelDistribution: ModelDistribution[];
}

// Report types
interface DailyReport {
  date: string;
  members: Array<{
    id: string;
    name: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  }>;
  totals: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  };
}

interface MonthlyReport {
  month: string;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  memberBreakdown: Array<{
    id: string;
    name: string;
    costUsd: number;
    percentage: number;
  }>;
}

// Auth types
interface User {
  name: string;
  email: string;
  role: "admin" | "agent" | "member";
}

interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  success: true;
  accessToken: string;
  refreshToken: string;
  user: User;
}

// API response wrappers
interface ApiResponse<T> {
  data: T;
}

interface ApiError {
  error: string;
  message?: string;
  details?: Record<string, string[]>;
}

// Common utility types
interface DateRange {
  from: string;
  to: string;
}

interface MemberFilters {
  search?: string;
  sort?: "name" | "cost" | "last_sync";
  order?: "asc" | "desc";
}
```

---

## Type Mapping Between Components

This table shows how the same conceptual data is represented differently across the agent, wire format, and server.

### Usage Entry Field Mapping

| Agent (`snake_case`) | Wire Format (POST /api/sync) | Server (`camelCase`) |
|---|---|---|
| `request_id` | `request_id` | `requestId` |
| `timestamp` | `timestamp` | `timestamp` |
| `model` | `model` | `model` |
| `project_path` | `project_path` | `projectPath` |
| `session_id` | `session_id` | `sessionId` |
| `usage.input_tokens` | `input_tokens` | `inputTokens` |
| `usage.output_tokens` | `output_tokens` | `outputTokens` |
| `usage.cache_creation_input_tokens` | `cache_creation_tokens` | `cacheCreationTokens` |
| `usage.cache_read_input_tokens` | `cache_read_tokens` | `cacheReadTokens` |
| `cost_usd` | `cost_usd` | `costUsd` |
| `version` | `claude_version` | `claudeVersion` |

Note: The agent's `UsageEntry` has a nested `usage` object. When constructing the sync payload, `pusher.ts` flattens this into top-level fields for the wire format. On the server, `sync.ts` converts snake_case to camelCase via `toUsageEntry()`.

### Data Flow Through Layers

```
JSONL File (raw lines on disk)
    |
    v  parseJSONLLine() in collector.ts
UsageEntry (agent, snake_case, nested usage)
    |
    v  pushBatch() in pusher.ts flattens usage sub-object
SyncRequestEntry (wire format, snake_case, flat)
    |
    v  toUsageEntry() in sync.ts converts to camelCase
UsageEntry (server, camelCase)
    |
    v  addEntryToDailyRecord() in sync.ts
DailyRecord -> RawMonthlyData (S3 raw/)
    |
    v  aggregateMonthData() in aggregation.ts
MonthAggregation (S3 aggregated/)
    |
    v  generateDashboardView() / generateMemberYearlyView() in aggregator.ts
DashboardView / MemberYearlyView (S3 views/)
    |
    v  adaptDashboardResponse() / adaptMemberDetailResponse() in api-adapters.ts
Frontend display types (React components)
```

### Cost Precision

All cost calculations use `addCost()` from `lambda-server/src/lib/s3.ts` to avoid floating-point precision errors:

```typescript
function addCost(a: number, b: number): number {
  const PRECISION = 1000000;  // 6 decimal places (microdollars)
  return Math.round((a * PRECISION + b * PRECISION)) / PRECISION;
}
```
