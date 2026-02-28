# CCUsage Monitor -- Architecture Documentation

Team monitoring system for Claude Code usage tracking. Serverless architecture on AWS (Lambda + S3) with three core components: a local agent, a Lambda-based API server, and a static dashboard.

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Component Architecture](#2-component-architecture)
3. [Data Architecture](#3-data-architecture)
4. [Communication Patterns](#4-communication-patterns)
5. [Authentication & Security](#5-authentication--security)
6. [Infrastructure Architecture](#6-infrastructure-architecture)
7. [Design Patterns](#7-design-patterns)
8. [Deployment Architecture](#8-deployment-architecture)
9. [Scalability & Reliability](#9-scalability--reliability)

---

## 1. System Architecture Overview

CCUsage Monitor consists of three independently deployable components connected through a single API Gateway and S3 bucket.

```mermaid
graph TB
    subgraph "Developer Machine"
        JSONL["~/.claude/projects/*.jsonl<br/>~/.config/claude/projects/*.jsonl<br/>~/.ccs/instances/*/projects/*"]
        AGENT["be-agent<br/>(Node.js CLI)"]
        JSONL -->|"Parse JSONL<br/>byte-offset reads"| AGENT
    end

    subgraph "AWS Cloud"
        subgraph "API Gateway"
            APIGW["HTTP API Gateway<br/>/api/{proxy+}"]
        end

        subgraph "Lambda Functions"
            API_LAMBDA["API Lambda<br/>(Hono + hono/aws-lambda)<br/>512 MB / 29s timeout"]
            AGG_LAMBDA["Aggregator Lambda<br/>1024 MB / 300s timeout"]
        end

        subgraph "S3 Storage"
            S3["ccusage-data-dev<br/>SSE-KMS encrypted<br/>Versioning enabled"]
        end

        subgraph "Static Site Hosting"
            CF["CloudFront CDN<br/>E1W8WZ55TBZY1P"]
            S3_SITE["S3 Bucket<br/>cc-usage-monitor-tvf"]
        end

        EVENTBRIDGE["EventBridge Rule<br/>rate(1 hour)"]
    end

    subgraph "User Browser"
        DASHBOARD["Dashboard SPA<br/>(Next.js 15 Static Export)"]
    end

    AGENT -->|"POST /api/sync<br/>(batched JSON)"| APIGW
    AGENT -->|"GET /api/agent/*<br/>(version, commands)"| APIGW

    APIGW --> API_LAMBDA
    API_LAMBDA -->|"read/write"| S3

    EVENTBRIDGE -->|"hourly trigger"| AGG_LAMBDA
    API_LAMBDA -->|"manual trigger<br/>POST /api/admin/aggregate"| AGG_LAMBDA
    AGG_LAMBDA -->|"read aggregated/<br/>write views/"| S3

    CF --> S3_SITE
    DASHBOARD --> CF
    DASHBOARD -->|"GET /api/*<br/>(fetch views)"| APIGW

    style S3 fill:#f9f,stroke:#333,stroke-width:2px
    style API_LAMBDA fill:#bbf,stroke:#333,stroke-width:2px
    style AGG_LAMBDA fill:#bbf,stroke:#333,stroke-width:2px
```

### Component Summary

| Component | Technology | Role |
|-----------|-----------|------|
| **be-agent** | Node.js CLI (Commander.js) | Parse local JSONL logs, push to server, auto-update, execute admin commands |
| **lambda-server** | Hono on AWS Lambda (Node.js 20) | Store raw data in S3, serve pre-computed views, manage members, admin operations |
| **dashboard** | Next.js 15 (static export) | Fetch pre-computed views via API, render charts with Recharts, hosted on CloudFront |

### Request Flow Summary

1. **Agent to Server**: The agent parses JSONL files on the developer's machine and pushes structured usage records, project metadata, and prompt text via `POST /api/sync`.
2. **Server to S3**: The sync endpoint stores raw data in `raw/`, computes pre-aggregated summaries in `aggregated/`, and writes sync logs, project data, and prompts.
3. **Aggregator to Views**: An EventBridge rule triggers the Aggregator Lambda hourly. It reads from `aggregated/` and generates dashboard-ready JSON files in `views/`.
4. **Dashboard to Server**: The static SPA fetches pre-computed `views/*.json` through the API Lambda and renders charts and tables.

---

## 2. Component Architecture

### 2.1 be-agent (Local CLI)

The agent runs on each developer's machine, either manually or as a background daemon (launchd on macOS, systemd on Linux). It discovers Claude Code JSONL files, parses them, and pushes structured data to the server.

```mermaid
graph TB
    subgraph "be-agent"
        INDEX["index.ts<br/>CLI Entry (Commander.js)"]

        subgraph "Commands"
            SETUP["setup.ts<br/>Initial config + daemon install"]
            PUSH["push.ts<br/>Manual sync (--force for full)"]
            STATUS["status.ts<br/>Show config and sync state"]
            UPDATE["update.ts<br/>Self-update from S3 releases"]
            UNINSTALL["uninstall.ts<br/>Remove auto-start service"]
        end

        subgraph "Core Libraries"
            COLLECTOR["collector.ts<br/>Parse JSONL, extract entries<br/>+ projects + prompts"]
            PUSHER["pusher.ts<br/>Batch + retry push<br/>entries@1000, prompts@500"]
            CONFIG["config.ts<br/>Config + state management<br/>~/.ccusage-agent/"]
            COMMANDER["commander.ts<br/>Poll + execute admin commands"]
            PRICING["pricing.ts<br/>Token cost calculation"]
            AUTH["auth.ts<br/>JWT token management"]
        end

        DAEMON["daemon.ts<br/>Sync loop + signal handling"]

        INDEX --> SETUP
        INDEX --> PUSH
        INDEX --> STATUS
        INDEX --> UPDATE
        INDEX --> UNINSTALL
        INDEX --> DAEMON

        PUSH --> COLLECTOR
        PUSH --> PUSHER
        DAEMON --> COLLECTOR
        DAEMON --> PUSHER
        DAEMON --> COMMANDER

        COLLECTOR --> CONFIG
        COLLECTOR --> PRICING
        PUSHER --> CONFIG
        PUSHER --> AUTH
    end

    subgraph "File System"
        CLAUDE_DATA["~/.claude/projects/*/*.jsonl"]
        CCS_DATA["~/.ccs/instances/*/projects/*"]
        AGENT_CONFIG["~/.ccusage-agent/config.json"]
        AGENT_STATE["~/.ccusage-agent/state.json"]
    end

    COLLECTOR --> CLAUDE_DATA
    COLLECTOR --> CCS_DATA
    CONFIG --> AGENT_CONFIG
    CONFIG --> AGENT_STATE
```

**Key modules:**

- **collector.ts** -- Scans all Claude Code directories (auto-discovered at runtime via `discoverClaudePaths()`), reads JSONL files using per-file byte offsets (append-only optimization), extracts usage entries with token counts, discovers projects from `cwd` fields, and collects user prompts for ISMS audit.

- **pusher.ts** -- Sends collected data to `POST /api/sync` in batches (1000 entries per batch, 500 prompts per batch). Implements exponential backoff retry for 5xx errors and network failures. Includes hostname, local IP, and public IP metadata with each request.

- **config.ts** -- Manages persistent configuration (`~/.ccusage-agent/config.json`) and state (`~/.ccusage-agent/state.json`). State uses version 2 format with per-file byte offsets, replacing the earlier seen-request-IDs approach. Includes v1-to-v2 migration logic.

- **daemon.ts** -- Runs the sync loop on a configurable interval (default: 5 minutes). Entries sync every cycle; prompts sync less frequently (default: every 24 hours). Each cycle: collect, push, save updated file offsets, then poll for admin commands.

- **commander.ts** -- Polls `GET /api/agent/commands` for pending admin commands (revoke-token, force-sync, update-config) and executes them locally, then ACKs back to the server.

#### JSONL Collection with Byte-Offset Tracking

The collector uses per-file byte offsets to achieve efficient incremental reads. JSONL files are append-only, so only bytes after the last-known offset need to be read.

```mermaid
sequenceDiagram
    participant D as Daemon
    participant C as Collector
    participant FS as Filesystem
    participant S as State

    D->>S: loadState()
    S-->>D: file_offsets: { "/path/file.jsonl": { byteOffset: 12345 } }
    D->>C: collectUsageData(config, state)

    loop For each JSONL file
        C->>FS: statSync(file)
        FS-->>C: size: 15000

        alt size > byteOffset
            C->>FS: createReadStream(file, { start: 12345 })
            FS-->>C: new lines (bytes 12345..15000)
            C->>C: parseJSONLLine() for each line
            C->>C: extractPrompt() for user messages
            Note over C: Update offset to 15000
        else size == byteOffset
            Note over C: Skip (no new data)
        else size < byteOffset
            Note over C: File truncated, re-read from 0
        end
    end

    C-->>D: { entries, projects, prompts, updatedFileOffsets }
    D->>S: saveState({ file_offsets: updated })
```

#### Data Path Discovery

The agent automatically discovers JSONL files from multiple locations:

| Path | Source |
|------|--------|
| `~/.claude/projects/*` | Native Claude Code |
| `~/.config/claude/projects/*` | Alternative Claude location |
| `~/.ccs/instances/*/projects/*` | CCS (Claude Code Spaces) multi-instance |
| Custom paths in `extra_claude_paths` | User-configured |

#### Auto-Start Service

After setup, the agent registers as a system service:

| Platform | Mechanism | Config Path |
|----------|-----------|-------------|
| macOS | launchd | `~/Library/LaunchAgents/com.ccusage.agent.plist` |
| Linux | systemd (user) | `~/.config/systemd/user/ccusage-agent.service` |

The daemon runs the sync cycle at a configurable interval (default: 60 minutes) and also polls for admin commands after each sync.

#### Self-Update Mechanism

```mermaid
sequenceDiagram
    participant A as Agent
    participant API as Lambda API
    participant S3 as S3 (releases/)

    A->>API: GET /api/agent/version
    API-->>A: { version: "0.5.0", filename, checksum }

    alt New version available
        A->>API: GET presigned URL
        API->>S3: getSignedUrl(releases/ccusage-agent-0.5.0.tgz)
        S3-->>API: presigned URL (10 min expiry)
        API-->>A: download URL
        A->>S3: Download .tgz via presigned URL
        A->>A: npm install -g ./ccusage-agent-0.5.0.tgz
        A->>A: Re-run setup + sync --force
    end
```

### 2.2 lambda-server (Serverless Backend)

The Lambda server is a Hono application deployed to AWS Lambda via API Gateway. It uses lazy route loading to minimize cold start time.

```mermaid
graph TB
    subgraph "lambda-server"
        LAMBDA_HANDLER["lambda.ts<br/>handle(app) via hono/aws-lambda"]
        APP["app.ts<br/>Hono app + middleware"]

        subgraph "Middleware Stack"
            LOGGER_MW["logger()<br/>Request logging"]
            CORS_MW["cors()<br/>Origin whitelist"]
            GZIP_MW["Gzip decompression<br/>Content-Encoding: gzip"]
            JWT_MW["JWT auth middleware<br/>Protects /api/* (with exemptions)"]
        end

        subgraph "Routes (lazy-loaded)"
            SYNC_ROUTE["routes/sync.ts<br/>POST /api/sync"]
            DASHBOARD_ROUTE["routes/dashboard.ts<br/>GET /api/dashboard/*"]
            MEMBERS_ROUTE["routes/members.ts<br/>GET /api/members/*"]
            AGENT_ROUTE["routes/agent.ts<br/>GET /api/agent/*"]
            AUTH_ROUTE["routes/auth.ts<br/>POST /api/auth/*"]
            ADMIN_ROUTE["routes/admin.ts<br/>POST /api/admin/*"]
            REGISTER_ROUTE["routes/register.ts<br/>/api/register/*"]
        end

        subgraph "Libraries"
            S3_LIB["lib/s3.ts<br/>S3 CRUD, ETags, retry, presigned URLs"]
            TYPES_LIB["lib/types.ts<br/>All TypeScript type definitions"]
            AUTH_LIB["lib/auth.ts<br/>JWT, password hashing, user lookup"]
            AGG_LIB["lib/aggregation.ts<br/>Shared aggregation logic"]
        end

        AGGREGATOR["aggregator.ts<br/>Separate Lambda function<br/>Reads aggregated/ -> writes views/"]
    end

    LAMBDA_HANDLER --> APP
    APP --> LOGGER_MW --> CORS_MW --> GZIP_MW --> JWT_MW

    JWT_MW -->|"dynamic import()"| SYNC_ROUTE
    JWT_MW -->|"dynamic import()"| DASHBOARD_ROUTE
    JWT_MW -->|"dynamic import()"| MEMBERS_ROUTE
    JWT_MW -->|"dynamic import()"| AGENT_ROUTE
    JWT_MW -->|"dynamic import()"| AUTH_ROUTE
    JWT_MW -->|"dynamic import()"| ADMIN_ROUTE

    SYNC_ROUTE --> S3_LIB
    SYNC_ROUTE --> AGG_LIB
    DASHBOARD_ROUTE --> S3_LIB
    MEMBERS_ROUTE --> S3_LIB
    AUTH_ROUTE --> AUTH_LIB
    AGGREGATOR --> S3_LIB
    AGGREGATOR --> AGG_LIB
```

**Lazy route loading pattern** -- Instead of importing all route modules at startup (which increases cold start time), `app.ts` uses dynamic `import()` within the catch-all `/api/*` handler. Only the route module matching the incoming request path is loaded:

```typescript
app.all('/api/*', async (c, next) => {
  const path = c.req.path;
  if (path === '/api/sync' && c.req.method === 'POST') {
    const { default: syncRoute } = await import('./routes/sync.js');
    // Only sync.ts module is loaded for sync requests
  }
  // Other routes similarly lazy-loaded
});
```

**Aggregator Lambda** -- A separate Lambda function (1024 MB, 300s timeout) that:
1. Reads all `aggregated/{memberId}/{year}-{month}.json` files
2. Generates three types of dashboard-ready views: `views/dashboard.json`, `views/members.json`, `views/members/{memberId}/{year}.json`
3. Triggered hourly by EventBridge or manually via `POST /api/admin/aggregate`
4. Supports a `force` flag to recompute from raw data instead of using cached aggregated data
5. Implements change detection by comparing `lastUpdated` timestamps against `meta/last-processed.json`

#### Sync Endpoint Data Flow

The sync endpoint (`POST /api/sync`) is the primary ingestion point:

```mermaid
sequenceDiagram
    participant Agent
    participant Sync as POST /api/sync
    participant S3

    Agent->>Sync: { email, entries[], projects[], prompts[] }

    Note over Sync: 1. Validate with Zod schema

    Sync->>S3: getJsonFromS3WithETag(members/index.json)
    S3-->>Sync: registry + ETag

    Note over Sync: 2. Find/create member (ETag-based conditional write)
    Sync->>S3: putJsonToS3WithETag(members/index.json, updated, etag)

    Note over Sync: 3. Group entries by year-month

    par For each month (parallel)
        Sync->>S3: getJsonFromS3(raw/{memberId}/{YYYY}-{MM}.json)
        S3-->>Sync: existing monthly data
        Note over Sync: Dedup by request_id
        Note over Sync: Add entries to daily records
        Sync->>S3: putJsonToS3(raw/{memberId}/{YYYY}-{MM}.json)
        Note over Sync: Compute aggregation
        Sync->>S3: putJsonToS3(aggregated/{memberId}/{YYYY}-{MM}.json)
    end

    par Independent operations (parallel)
        Sync->>S3: Save projects
        Sync->>S3: Save prompts (dedup by uuid)
        Sync->>S3: Append sync log entry
    end

    Sync-->>Agent: { success: true, inserted: N, skipped: M }
```

#### Aggregator Data Flow

```mermaid
flowchart TD
    START["Aggregator triggered<br/>(EventBridge hourly or API)"] --> READ_REGISTRY["Read members/index.json"]
    READ_REGISTRY --> READ_AGG["Read aggregated/{memberId}/{year}-{month}.json<br/>for all members x 12 months<br/>(bounded concurrency: 10)"]

    READ_AGG --> CHECK_FORCE{force=true?}

    CHECK_FORCE -->|Yes| READ_RAW["Read raw/, recompute, backfill aggregated/"]
    CHECK_FORCE -->|No| USE_CACHED["Use cached aggregated/ data"]

    READ_RAW --> GENERATE
    USE_CACHED --> GENERATE

    GENERATE["Generate views"] --> V1["views/dashboard.json<br/>Team-wide summary"]
    GENERATE --> V2["views/members.json<br/>Member list + current/prev month"]
    GENERATE --> V3["views/members/{id}/{year}.json<br/>Per-member yearly detail"]
    GENERATE --> V4["Also generates previous year views<br/>for historical data access"]

    V1 --> META["Write meta/last-processed.json"]
    V2 --> META
    V3 --> META
```

### 2.3 dashboard (Frontend SPA)

The dashboard is a Next.js 15 application exported as a static site and hosted on S3 + CloudFront.

```mermaid
graph TB
    subgraph "dashboard (Next.js 15 Static Export)"
        subgraph "Pages (App Router)"
            HOME["/ (Dashboard)"]
            MEMBERS_PAGE["/members"]
            LOGIN_PAGE["/login"]
        end

        subgraph "Data Layer"
            API_CLIENT["lib/api-client.ts<br/>HTTP client + JWT auto-refresh"]
            API_ADAPTERS["lib/api-adapters.ts<br/>Lambda/Legacy response transforms"]
            USE_DASHBOARD["hooks/use-dashboard.ts<br/>TanStack Query"]
            USE_MEMBERS["hooks/use-members.ts<br/>TanStack Query"]
            USE_AUTH["hooks/use-auth.ts<br/>Login/Logout/Session"]
        end

        subgraph "Components"
            CHARTS["charts/<br/>UsageTrendChart, ModelDistributionChart<br/>DailyModelUsageChart, UsageHeatMap<br/>CostTreemapChart"]
            MEMBERS_COMP["members/<br/>MemberCard, MemberRankingList<br/>MemberDetailContent, MemberDetailCharts"]
            SHARED["shared/<br/>PageHeader, StatsBar, StatsGrid<br/>DataSheet, EmptyState, ErrorState"]
            LAYOUT["layout/<br/>Sidebar, Navbar, AuthGuard"]
        end

        subgraph "State Management"
            TANSTACK["TanStack Query 5<br/>(server state, 5 min stale)"]
            ZUSTAND["Zustand 5<br/>(UI state: sidebar, persisted)"]
        end

        HOME --> USE_DASHBOARD
        MEMBERS_PAGE --> USE_MEMBERS
        LOGIN_PAGE --> USE_AUTH

        USE_DASHBOARD --> API_CLIENT
        USE_MEMBERS --> API_CLIENT
        USE_AUTH --> API_CLIENT
        API_CLIENT --> API_ADAPTERS
    end
```

**Key architectural decisions:**

- **Modal-based detail views** -- Member details open in a slide-over sheet (`DataSheet`) rather than navigating to a separate route, avoiding the need for CloudFront URL rewrite rules for dynamic segments.
- **Flat route structure** -- Only `/`, `/members`, `/login` to work cleanly with S3 static hosting.
- **Dual API support** -- Adapters handle both Lambda API format (current, detected by `generatedAt` field) and legacy PostgreSQL format transparently.
- **Token auto-refresh** -- The API client intercepts 401 responses, attempts a single token refresh, and retries the original request. Concurrent refresh attempts are deduplicated.

#### Component Hierarchy

```
app/(dashboard)/layout.tsx
  |-- AuthGuard (redirects to /login if no tokens)
  |-- Sidebar (collapsible, Zustand persisted)
  |-- Navbar (user info, theme toggle)
  +-- Page Content
       |-- PageHeader
       |-- StatsBar / StatsGrid
       |-- ControlsBar (ViewToggle + Sort)
       +-- Charts / DataSheet modals
```

---

## 3. Data Architecture

### 3.1 Three-Layer S3 Architecture

The data storage follows a three-layer architecture where each layer can be rebuilt from the one above it:

```
raw/           = "What happened"    (source of truth, individual entries)
aggregated/    = "What it means"    (pre-computed per-month summaries)
views/         = "What to show"     (dashboard-ready JSON)
```

```mermaid
graph LR
    subgraph "Layer 1: Raw (Source of Truth)"
        RAW["raw/{memberId}/{year}-{month}.json<br/>Individual usage entries per day<br/>Written by: sync endpoint"]
    end

    subgraph "Layer 2: Aggregated (Pre-computed Summaries)"
        AGG["aggregated/{memberId}/{year}-{month}.json<br/>Monthly totals, model breakdown<br/>daily usage, project breakdown<br/>Written by: sync endpoint"]
    end

    subgraph "Layer 3: Views (Dashboard-ready)"
        VIEWS_DASH["views/dashboard.json<br/>Team-wide summary"]
        VIEWS_MEMBERS["views/members.json<br/>Member list + current/prev month"]
        VIEWS_DETAIL["views/members/{id}/{year}.json<br/>Per-member yearly detail"]
    end

    RAW -->|"aggregateMonthData()"| AGG
    AGG -->|"Aggregator Lambda<br/>(hourly)"| VIEWS_DASH
    AGG -->|"Aggregator Lambda<br/>(hourly)"| VIEWS_MEMBERS
    AGG -->|"Aggregator Lambda<br/>(hourly)"| VIEWS_DETAIL
```

**Rebuild guarantees:**
- `aggregated/` can always be regenerated from `raw/` using `aggregateMonthData()`
- `views/` can always be regenerated from `aggregated/` using the aggregator Lambda with `?force=true`
- Full rebuild: `POST /api/admin/aggregate?force=true`

### 3.2 Complete S3 Bucket Layout

```
ccusage-data-{stage}/
|
|-- INPUT LAYER (written by sync endpoint)
|   |-- raw/{memberId}/{year}-{month}.json            All usage entries (source of truth)
|   |-- aggregated/{memberId}/{year}-{month}.json      Pre-computed monthly summaries
|   |-- members/index.json                             Member registry (email->id mapping)
|   |-- sync-logs/{year}-{month}/{memberId}.json       Sync audit trail
|   |-- projects/{memberId}.json                       Project list with git remotes
|   |-- prompts/{memberId}/{year}-{month}.json         Prompt text archive (ISMS audit)
|   +-- commands/{memberId}/queue.json                 Admin command queue for agents
|
|-- OUTPUT LAYER (written by aggregator Lambda)
|   +-- views/
|       |-- dashboard.json                             Team-wide summary stats
|       |-- members.json                               Member list with current/prev month
|       +-- members/{memberId}/{year}.json             Per-member yearly detail
|
|-- METADATA
|   +-- meta/last-processed.json                       Aggregation timestamp + duration
|
+-- RELEASES
    +-- releases/
        |-- version.json                               Latest agent version manifest
        +-- ccusage-agent-*.tgz                        Agent binaries for auto-update
```

### 3.3 Core Data Types

**RawMonthlyData** (`raw/{memberId}/{year}-{month}.json`):

```typescript
interface RawMonthlyData {
  memberId: string;
  year: number;
  month: number;
  lastUpdated: string;                     // ISO timestamp
  records: Record<string, DailyRecord>;    // keyed by date "2026-01-27"
}

interface DailyRecord {
  date: string;
  updatedAt: string;
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    recordCount: number;
  };
  models: Record<string, ModelStats>;   // per-model breakdown
  entries: UsageEntry[];                // individual API call records
}

interface UsageEntry {
  requestId: string;        // Unique ID for deduplication
  timestamp: string;        // ISO timestamp
  model: string;            // e.g., "claude-sonnet-4-20250514"
  projectPath: string | null;
  sessionId: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  costUsd: number;          // 6 decimal places
  claudeVersion: string | null;
}
```

**MonthAggregation** (`aggregated/{memberId}/{year}-{month}.json`):

```typescript
interface MonthAggregation {
  year: number;
  month: number;
  lastUpdated?: string;
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    recordCount: number;
  };
  dailyUsage: DayAggregation[];                      // daily totals sorted by date
  dailyModelUsage: DailyModelUsage[];                 // per-day per-model breakdown
  modelBreakdown: Record<string, ModelBreakdown>;     // monthly per-model totals
  projectBreakdown: Record<string, number>;           // project -> costUsd
}
```

**MemberRegistry** (`members/index.json`):

```typescript
interface MemberRegistry {
  version: number;
  lastUpdated: string;
  members: Record<string, MemberInfo>;   // keyed by memberId (UUID)
}

interface MemberInfo {
  id: string;
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
```

**View Types** (`views/`):

```typescript
// views/dashboard.json
interface DashboardView {
  generatedAt: string;
  summary: {
    totalCost: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalMembers: number;
    activeMembers: number;
    avgCostPerMember: number;
  };
  costChangePercent: number;
  dailyTrend: Array<{ date: string; costUsd: number; inputTokens: number; outputTokens: number }>;
  topMembers: Array<{ memberId: string; name: string; costUsd: number; percentage: number }>;
  modelDistribution: Array<{ model: string; costUsd: number; percentage: number }>;
  recentSyncs: Array<{ memberId: string; memberName: string; syncedAt: string; recordsInserted: number }>;
}

// views/members/{memberId}/{year}.json
interface MemberYearlyView {
  generatedAt: string;
  member: { id: string; name: string; email: string; role: string; isActive: boolean };
  year: number;
  months: Record<string, MonthlyData>;   // "1".."12"
  recentSyncs: SyncLogEntry[];
  projects: ProjectData[];
  promptStats: Record<string, { count: number }>;
}
```

### 3.4 End-to-End Data Flow

```mermaid
sequenceDiagram
    participant DEV as Developer Machine
    participant AGENT as be-agent
    participant APIGW as API Gateway
    participant SYNC as Sync Lambda
    participant S3 as S3 Bucket
    participant AGG as Aggregator Lambda
    participant DASH as Dashboard

    Note over DEV: Claude Code writes JSONL

    AGENT->>DEV: Read JSONL files (byte offset)
    AGENT->>AGENT: Parse entries, discover projects,<br/>collect prompts, calculate costs

    AGENT->>APIGW: POST /api/sync (batch of entries)
    APIGW->>SYNC: Forward request

    SYNC->>S3: Read members/index.json (with ETag)
    SYNC->>S3: Write members/index.json (conditional)
    Note over SYNC,S3: Resolve member + update lastSync

    SYNC->>S3: Read raw/{memberId}/{year}-{month}.json
    SYNC->>SYNC: Deduplicate by request_id
    SYNC->>S3: Write raw/{memberId}/{year}-{month}.json

    SYNC->>SYNC: aggregateMonthData()
    SYNC->>S3: Write aggregated/{memberId}/{year}-{month}.json

    par Parallel writes
        SYNC->>S3: Write projects/{memberId}.json
        SYNC->>S3: Write prompts/{memberId}/{year}-{month}.json
        SYNC->>S3: Write sync-logs/{year}-{month}/{memberId}.json
    end

    SYNC-->>AGENT: { success: true, inserted: N, skipped: M }

    Note over AGG: Triggered hourly by EventBridge

    AGG->>S3: Read members/index.json
    AGG->>S3: Read aggregated/{id}/{year}-{month}.json (all members, all months)
    AGG->>AGG: Generate dashboard, members, member detail views
    AGG->>S3: Write views/dashboard.json
    AGG->>S3: Write views/members.json
    AGG->>S3: Write views/members/{id}/{year}.json
    AGG->>S3: Write meta/last-processed.json

    DASH->>APIGW: GET /api/dashboard
    APIGW->>S3: Read views/dashboard.json
    S3-->>DASH: Pre-computed dashboard JSON
```

---

## 4. Communication Patterns

### 4.1 Agent-to-Server Sync Protocol

The sync protocol uses `POST /api/sync` with a JSON body containing entries, projects, and prompts.

**Request structure:**

```typescript
interface SyncRequest {
  email: string;                    // Member identifier
  name?: string;                    // Display name (for auto-registration)
  entries: SyncRequestEntry[];      // Usage records (up to 1000 per batch)
  projects?: SyncRequestProject[];  // Discovered projects (first batch only)
  prompts?: SyncRequestPrompt[];    // User prompts (up to 500 per batch)
  hostname?: string;                // Machine hostname
  agent_version?: string;           // Agent version for tracking
  local_ip?: string | null;         // LAN IP
  public_ip?: string | null;        // Public IP (via checkip.amazonaws.com)
}
```

**Batching strategy:**

| Data Type | Batch Size | Notes |
|-----------|-----------|-------|
| Entries | 1000 per request | Token usage records (~200 bytes each) |
| Prompts | 500 per request | Full prompt text (larger payload) |
| Projects | First batch only | Small metadata, sent once |

Total batches = max(ceil(entries/1000), ceil(prompts/500))

**Retry logic:**
- 4xx errors: fail immediately (client-side validation error)
- 5xx errors: exponential backoff (2^attempt seconds), up to 3 retries
- Network errors: same backoff strategy as 5xx

**Daemon sync cycle:**

```mermaid
flowchart TD
    START["Sync Cycle Start"] --> LOAD["Load config + state"]
    LOAD --> CHECK_PROMPTS{"Prompts due?<br/>(24h interval)"}
    CHECK_PROMPTS -->|Yes| COLLECT_ALL["Collect entries + prompts"]
    CHECK_PROMPTS -->|No| COLLECT_ENTRIES["Collect entries only"]
    COLLECT_ALL --> CHECK_DATA
    COLLECT_ENTRIES --> CHECK_DATA

    CHECK_DATA{"New data?"} -->|No| SAVE_OFFSETS["Save updated file offsets"]
    CHECK_DATA -->|Yes| BATCH["Push to server in batches"]
    BATCH --> UPDATE_STATE["Update state<br/>(last_sync, total_synced, file_offsets)"]
    UPDATE_STATE --> POLL["Poll admin commands"]
    SAVE_OFFSETS --> POLL
    POLL --> DONE["Wait for next interval"]
```

### 4.2 Dashboard-to-Server API

The dashboard reads pre-computed views. All dashboard endpoints are simple S3 reads -- no computation happens at request time.

| Endpoint | Source S3 Key | Purpose |
|----------|--------------|---------|
| `GET /api/dashboard` | `views/dashboard.json` | Team-wide summary (costs, trends, top members, model distribution) |
| `GET /api/dashboard/model-distribution` | `views/dashboard.json` (subset) | Model cost breakdown for pie chart |
| `GET /api/dashboard/meta` | `meta/last-processed.json` | Aggregator last run timestamp + duration |
| `GET /api/members` | `views/members.json` | Member list with current/previous month stats |
| `GET /api/members/:id?year=2026` | `views/members/{id}/{year}.json` | Full yearly detail for a member |
| `GET /api/members/:id/raw?year=&month=` | `raw/{id}/{year}-{month}.json` | Raw usage records for inspection |

### 4.3 Agent Command Protocol

Admins can issue commands to agents via the server. The agent polls for pending commands each sync cycle.

```mermaid
sequenceDiagram
    participant ADMIN as Admin
    participant SERVER as Lambda Server
    participant S3 as S3 (commands/)
    participant AGENT as be-agent

    ADMIN->>SERVER: POST /api/admin/commands<br/>{memberId, type: "revoke-token"}
    SERVER->>S3: Write commands/{memberId}/queue.json

    Note over AGENT: Next sync cycle

    AGENT->>SERVER: GET /api/agent/commands?email=...
    SERVER->>S3: Read commands/{memberId}/queue.json
    SERVER-->>AGENT: {commands: [{id, type: "revoke-token"}]}

    AGENT->>AGENT: Execute command locally<br/>(delete credential files)

    AGENT->>SERVER: POST /api/agent/commands/{id}/ack<br/>{status: "acked", result: "..."}
    SERVER->>S3: Update command status in queue
```

**Supported commands:**

| Command | Action |
|---------|--------|
| `revoke-token` | Deletes Claude Code credential files from standard and CCS paths |
| `force-sync` | Acknowledged; will run full sync on next cycle |
| `update-config` | Overwrites agent config.json fields from admin-provided payload |

### 4.4 API Reference

#### Sync (Agent to Server)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/sync` | Public | Receive entries, projects, prompts from agent |

#### Dashboard (Dashboard to Server)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/dashboard` | Bearer | Team-wide summary |
| `GET` | `/api/dashboard/model-distribution` | Bearer | Model usage breakdown |
| `GET` | `/api/dashboard/meta` | Bearer | Aggregator metadata |
| `GET` | `/api/members` | Bearer | Member list |
| `GET` | `/api/members/:id?year=YYYY` | Bearer | Member yearly detail |
| `GET` | `/api/members/:id/raw?year=&month=` | Bearer | Raw usage records |

#### Agent (Agent to Server)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/agent/version` | Public | Latest version + presigned download URL |
| `GET` | `/api/agent/commands?email=...` | Public | Poll pending admin commands |
| `POST` | `/api/agent/commands/:id/ack` | Public | Acknowledge command execution |

#### Auth

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/auth/login` | Public | Login (email + password), returns JWT tokens |
| `POST` | `/api/auth/refresh` | Public | Exchange refresh token for new token pair |
| `GET` | `/api/auth/me` | Bearer | Get current user session |
| `POST` | `/api/auth/logout` | Bearer | Logout (client clears tokens) |

#### Admin

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/admin/aggregate` | Public | Trigger aggregator (`?force=true` for full rebuild) |
| `POST` | `/api/admin/commands` | Public | Create command for agent |
| `GET` | `/api/admin/commands/:memberId` | Public | View command history |
| `GET` | `/api/admin/status` | Public | System status |

---

## 5. Authentication & Security

### 5.1 JWT-Based Authentication

The system uses JWT tokens (HS256) with two token types:

```mermaid
sequenceDiagram
    participant Client
    participant API as Lambda API
    participant Auth as auth.ts

    Client->>API: POST /api/auth/login { email, password }
    API->>Auth: findUser(email)
    Auth-->>API: UserRecord { passwordHash }
    API->>Auth: verifyPassword(password, hash)
    Note over Auth: SHA256 + timingSafeEqual

    alt Valid credentials
        API->>Auth: generateAccessToken(user)
        Note over Auth: JWT HS256, 60 min expiry
        API->>Auth: generateRefreshToken(user)
        Note over Auth: JWT HS256, 20 day expiry
        API-->>Client: { accessToken, refreshToken, user }
    else Invalid
        API-->>Client: 401 Invalid credentials
    end
```

**Token configuration:**

| Property | Access Token | Refresh Token |
|----------|-------------|---------------|
| Expiry | 60 minutes | 20 days |
| Algorithm | HS256 | HS256 |
| Payload | email, name, role, type | email, name, role, type |
| Secret | `JWT_SECRET` env var | `JWT_SECRET` env var |

### 5.2 User Management

Users are stored in a static JSON file (`src/data/users.json`) bundled at build time:

```typescript
interface UserRecord {
  email: string;
  passwordHash: string;   // SHA256 hex digest
  name: string;
  role: 'admin' | 'agent' | 'member';
}
```

Password verification uses timing-safe comparison (`crypto.timingSafeEqual`) to prevent timing attacks.

### 5.3 Endpoint Protection

| Category | Endpoints | Auth Required |
|----------|-----------|---------------|
| Public | `/api/sync`, `/api/agent/*`, `/api/admin/*`, `/api/auth/login`, `/api/auth/refresh`, `/api/register/*` | No |
| Protected | `/api/dashboard/*`, `/api/members/*`, `/api/auth/me`, `/api/auth/logout` | Bearer token |

### 5.4 Dashboard Token Handling

The dashboard stores tokens in `localStorage` and implements automatic token refresh:

1. Every API request attaches `Authorization: Bearer {accessToken}` header
2. On 401 response, the client attempts a token refresh using the stored refresh token
3. Concurrent refresh attempts are deduplicated (single in-flight refresh promise)
4. If refresh fails, tokens are cleared and the user is redirected to `/login`

### 5.5 CORS Configuration

Origins are configured per deployment stage:

| Stage | Allowed Origins |
|-------|----------------|
| dev | `http://localhost:3000`, `http://127.0.0.1:3000`, `https://d1ohuii7czj4jp.cloudfront.net` |
| prod | `https://d1ohuii7czj4jp.cloudfront.net` |

In non-production mode, any `http://localhost:*` origin is also allowed. Requests with no origin (curl, server-to-server) are allowed with `*`.

### 5.6 S3 Security

| Control | Configuration |
|---------|--------------|
| Encryption | SSE-KMS with bucket key enabled (cost-optimized) |
| Public Access | All public access blocked (BlockPublicAcls, BlockPublicPolicy, IgnorePublicAcls, RestrictPublicBuckets) |
| Versioning | Enabled for data protection and recovery |
| Lifecycle | Sync logs auto-expire after 90 days |

---

## 6. Infrastructure Architecture

### 6.1 AWS Resources Overview

```mermaid
graph TB
    subgraph "ap-southeast-1 (Singapore)"
        subgraph "API Gateway"
            HTTP_API["HTTP API<br/>/api/{proxy+} -> API Lambda<br/>/health -> API Lambda"]
        end

        subgraph "Lambda"
            API_FN["ccusage-monitor-dev-api<br/>512 MB / 29s / Node.js 20<br/>Handler: src/lambda.handler"]
            AGG_FN["ccusage-monitor-dev-aggregator<br/>1024 MB / 300s / Node.js 20<br/>Handler: src/aggregator.handler"]
        end

        subgraph "S3"
            DATA_BUCKET["ccusage-data-dev<br/>SSE-KMS + Versioning<br/>Lifecycle: 90d on sync-logs/"]
            SITE_BUCKET["cc-usage-monitor-tvf<br/>Static site hosting"]
        end

        subgraph "CloudFront"
            CDN["Distribution E1W8WZ55TBZY1P<br/>Origin: cc-usage-monitor-tvf"]
        end

        subgraph "EventBridge"
            SCHEDULE["rate(1 hour)<br/>-> Aggregator Lambda"]
        end

        subgraph "CloudWatch"
            API_LOG["Log Group<br/>/aws/lambda/...-api<br/>30 day retention"]
            AGG_LOG["Log Group<br/>/aws/lambda/...-aggregator<br/>30 day retention"]
            API_ALARM["Alarm: >5 errors/5min<br/>(API Lambda)"]
            AGG_ALARM["Alarm: >1 error/5min<br/>(Aggregator Lambda)"]
            GW_ALARM["Alarm: >10 5xx/5min<br/>(API Gateway)"]
        end

        subgraph "IAM"
            ROLE["Lambda Execution Role<br/>S3: Get/Put/Delete/List<br/>KMS: Decrypt/GenerateDataKey<br/>Lambda: InvokeFunction (aggregator)"]
        end
    end

    HTTP_API --> API_FN
    SCHEDULE --> AGG_FN
    API_FN --> DATA_BUCKET
    AGG_FN --> DATA_BUCKET
    CDN --> SITE_BUCKET
    API_FN --> API_LOG
    AGG_FN --> AGG_LOG
    API_FN --> ROLE
    AGG_FN --> ROLE
```

### 6.2 Lambda Configuration

| Property | API Lambda | Aggregator Lambda |
|----------|-----------|-------------------|
| Runtime | Node.js 20.x | Node.js 20.x |
| Architecture | x86_64 | x86_64 |
| Memory | 512 MB | 1024 MB |
| Timeout | 29 seconds | 300 seconds (5 min) |
| Trigger | API Gateway HTTP API | EventBridge (hourly) + manual |
| Bundle | esbuild (ESM format) | esbuild (ESM format) |

### 6.3 CloudWatch Alarms

| Alarm | Metric | Threshold | Period |
|-------|--------|-----------|--------|
| API Lambda Errors | Lambda Errors (Sum) | > 5 | 5 minutes |
| Aggregator Errors | Lambda Errors (Sum) | > 1 | 5 minutes |
| API Gateway 5xx | 5xx errors (Sum) | > 10 | 5 minutes |

### 6.4 IAM Permissions

The Lambda execution role has:
- **S3**: `GetObject`, `PutObject`, `DeleteObject`, `ListBucket` on the data bucket and all keys within it
- **KMS**: `Decrypt`, `GenerateDataKey` for SSE-KMS encrypted objects
- **Lambda**: `InvokeFunction` on the aggregator function (for manual trigger from API)

### 6.5 Environment Variables

| Variable | Purpose |
|----------|---------|
| `NODE_ENV` | `production` in deployed Lambda |
| `BUCKET_NAME` | S3 data bucket name (`ccusage-data-{stage}`) |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins |
| `AGGREGATOR_FUNCTION_NAME` | Aggregator Lambda function name (for manual trigger) |
| `JWT_SECRET` | HS256 secret key for JWT signing (required in production) |
| `AWS_REGION` | AWS region (default: `ap-southeast-1`) |

---

## 7. Design Patterns

### 7.1 Idempotent Sync

Every usage record has a unique `requestId` (generated from Claude Code's JSONL data or constructed as `{sessionId}_{timestamp}`). Deduplication happens at two levels:

1. **Agent side**: Per-file byte offsets ensure only new data is read. If a file shrinks (truncated/rewritten), the agent re-reads from the beginning.
2. **Server side**: The sync endpoint collects all existing `requestId` values for the target month and skips duplicates. This makes sync safe to re-run at any time.

### 7.2 ETag-Based Optimistic Locking

The member registry (`members/index.json`) uses S3 conditional writes via ETags to handle concurrent modifications from multiple agents syncing simultaneously:

```typescript
// Read with ETag
const { data: registry, etag } = await getJsonFromS3WithETag<MemberRegistry>(key);

// Modify registry...
registry.members[memberId].lastSyncAt = now;

// Write with conditional check
await putJsonToS3WithETag(key, registry, etag);
// Uses IfMatch: etag (update existing) or IfNoneMatch: * (create new)
// Throws ConditionalCheckFailed on concurrent modification
```

If a concurrent modification is detected, the entire read-modify-write cycle is retried with exponential backoff (up to 3 retries, 100ms base delay with jitter).

### 7.3 Write-Time Aggregation

When the sync endpoint writes raw data, it also immediately computes and writes the aggregated summary for the same month. This means `aggregated/` is always up-to-date after a sync, and the hourly aggregator only needs to read `aggregated/` files (not raw data) for view generation:

```typescript
// In processMonthEntries():
const aggregation = aggregateMonthData(monthData, year, month);
await Promise.all([
  putJsonToS3(rawKey, monthData),       // Write raw
  putJsonToS3(aggKey, aggregation),     // Write aggregated (derived from raw)
]);
```

Benefits:
- Aggregated data is always up to date immediately after a sync
- The hourly aggregator only combines already-computed summaries into views
- Dashboard reads are always fast (no computation needed)

### 7.4 Lazy Route Loading

The API Lambda uses dynamic `import()` to load route modules on demand, reducing cold start time:

```
Request -> Middleware chain -> Path matching -> dynamic import() -> Sub-app.fetch()
```

A `/api/dashboard` request never loads `sync.ts`, `admin.ts`, or other unrelated route modules.

### 7.5 Presigned URLs for Agent Updates

Agent binary downloads use S3 presigned URLs to avoid passing credentials through the API:

```typescript
const url = await getPresignedDownloadUrl(`releases/${filename}`, 600);
// 10-minute expiry, agent downloads directly from S3
```

### 7.6 Bounded Concurrency

S3 operations in the aggregator are processed through a worker pool pattern (`mapWithConcurrency`) with a default concurrency limit of 10 to prevent memory exhaustion when processing many members in parallel.

### 7.7 Decimal Precision for Costs

All cost arithmetic uses fixed-point math with 6 decimal places (microdollars) to avoid floating-point precision errors:

```typescript
function addCost(a: number, b: number): number {
  const PRECISION = 1000000;
  return Math.round((a * PRECISION + b * PRECISION)) / PRECISION;
}
```

### 7.8 Exponential Backoff with Jitter

Retry logic uses exponential backoff with random jitter to avoid thundering herd effects:

```
Delay = baseDelay * 2^attempt * random(1.0, 1.5)
Default: 100ms, 200ms, 400ms (with 0-50% jitter)
```

Transient S3 errors (ThrottlingException, ServiceUnavailable, SlowDown, socket hang up, ECONNRESET) and ETag conflicts are retried. Validation and permission errors fail immediately.

### 7.9 Change Detection in Aggregator

The aggregator tracks which months have changed since its last run by comparing `lastUpdated` timestamps on aggregated data against `meta/last-processed.json`:

| Condition | Behavior |
|-----------|----------|
| First run (no meta) | Process all months with data |
| `lastUpdated > lastProcessedAt` | Process (month has new data) |
| `lastUpdated <= lastProcessedAt` | Skip (no changes) |
| `force=true` | Process all months regardless |

---

## 8. Deployment Architecture

### 8.1 Lambda Server Deployment

The Lambda server is deployed using the Serverless Framework v4 with esbuild bundling:

```mermaid
flowchart LR
    SOURCE["TypeScript Source"] -->|"esbuild<br/>(ESM, Node 20)"| BUNDLE["Bundled JS"]
    BUNDLE -->|"sls deploy"| CFN["CloudFormation"]
    CFN --> APIGW["API Gateway HTTP API"]
    CFN --> LAMBDA_API["API Lambda"]
    CFN --> LAMBDA_AGG["Aggregator Lambda"]
    CFN --> S3_BUCKET["S3 Data Bucket"]
    CFN --> CW["CloudWatch Logs + Alarms"]
    CFN --> EB_RULE["EventBridge Schedule"]
```

**Deployment commands:**

```bash
cd lambda-server
pnpm build
serverless deploy --stage dev --region ap-southeast-1
```

### 8.2 Dashboard Deployment

The dashboard is built as a static export and deployed to S3 with CloudFront invalidation:

```mermaid
flowchart LR
    NEXT["Next.js Source"] -->|"STATIC_EXPORT=true<br/>pnpm build"| STATIC["Static HTML/JS/CSS<br/>/out directory"]
    STATIC -->|"aws s3 sync"| S3["S3 Bucket<br/>cc-usage-monitor-tvf"]
    S3 -->|"aws cloudfront<br/>create-invalidation"| CF["CloudFront<br/>E1W8WZ55TBZY1P"]
    CF --> USER["End Users"]
```

**Deployment command:**

```bash
./scripts/deploy-dashboard-s3.sh [API_URL]
# Default API: https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com
```

### 8.3 Agent Release Process

```mermaid
flowchart LR
    UPDATE_VER["Update version in<br/>package.json<br/>update.ts<br/>pusher.ts"] --> BUILD["pnpm build"]
    BUILD --> PACK["npm pack<br/>(ccusage-agent-X.Y.Z.tgz)"]
    PACK --> UPLOAD["Upload to S3<br/>releases/ccusage-agent-*.tgz<br/>releases/version.json"]
    UPLOAD --> AGENTS["Agents auto-update<br/>via /api/agent/version"]
```

**Release command:**

```bash
# 1. Update version in be-agent/package.json, src/commands/update.ts, src/lib/pusher.ts
# 2. Build, pack, and upload:
./scripts/publish-agent.sh
# Uploads to S3 releases/ and updates version.json
```

### 8.4 Post-Deploy Operations

```bash
# Trigger full aggregation to rebuild all views
curl -X POST "https://<api-endpoint>/api/admin/aggregate?force=true"
```

### 8.5 Local Development

```bash
# Lambda server (local via serverless-offline)
cd lambda-server && pnpm dev     # Runs on :3001

# Dashboard (local with API proxy)
cd dashboard && pnpm dev         # Runs on :3000
# Configure API_SERVER_URL=http://localhost:3001 in dashboard/.env.local

# Agent (local build + test)
cd be-agent && pnpm build
pnpm start sync --dry-run        # Preview what would be synced
```

---

## 9. Scalability & Reliability

### 9.1 Concurrent Agent Handling

Multiple agents (from the same or different team members) can sync simultaneously:

| Concern | Solution |
|---------|----------|
| Member registry writes | ETag-based conditional writes with retry (up to 3 attempts) |
| Same-member concurrent sync | Raw data deduplication by `requestId` |
| Multi-device for same email | Data merged under same member (lookup by email) |
| S3 throttling | Transient error detection + exponential backoff with jitter |
| API Gateway concurrency | Lambda auto-scaling (no explicit limit configured) |

### 9.2 Data Growth Management

| Data Type | Growth Pattern | Management |
|-----------|---------------|------------|
| Raw entries | Grows linearly with team size and usage | Partitioned by member + month |
| Aggregated summaries | One file per member per month | Overwritten on each sync (small files) |
| Views | Fixed set of files | Regenerated hourly |
| Sync logs | Grows with sync frequency | Auto-expired after 90 days (S3 lifecycle) |
| Prompts | Grows with user activity | Partitioned by member + month |

### 9.3 Cold Start Optimization

Lambda cold starts are minimized through:

1. **Lazy route loading** -- Only the requested route module is dynamically imported
2. **Minimal middleware** -- Logger, CORS, gzip decompression, and JWT are lightweight
3. **S3 client reuse** -- The S3Client is created at module level and reused across warm invocations
4. **ESM bundle format** -- Tree-shakeable bundles via esbuild reduce deployment package size
5. **No ORM or database driver** -- Pure S3 operations, no connection pool management

### 9.4 Aggregator Efficiency

The aggregator uses several strategies to minimize processing time:

1. **Change detection** -- Compares `lastUpdated` timestamp on aggregated data against `lastProcessedAt` from the previous run; only processes months with new data
2. **Force rebuild** -- The `?force=true` flag bypasses change detection and recomputes everything from raw data
3. **Bounded concurrency** -- Processes up to 10 S3 operations in parallel (`mapWithConcurrency`)
4. **Aggregated-first reads** -- In normal mode, reads from `aggregated/` (fast); only falls back to `raw/` (slow) when aggregated data is missing
5. **Previous year support** -- Generates views for the previous year when data exists, ensuring December data remains accessible in January

### 9.5 Fault Tolerance

| Failure Scenario | Behavior |
|-----------------|----------|
| Agent network error during sync | Retry with exponential backoff (up to 3 attempts) |
| S3 transient error (throttling, timeout) | Retry with jitter (ThrottlingException, SlowDown, ServiceUnavailable) |
| ETag conflict (concurrent write) | Retry read-modify-write cycle (up to 3 attempts) |
| Aggregator failure | Views remain stale until next hourly run; manual trigger available |
| Lambda timeout (29s for API) | Client receives 5xx; retry on next sync cycle |
| Agent crash/restart | Daemon restarts via launchd/systemd; file offsets preserve progress |
| Dashboard API unreachable | TanStack Query shows cached data; retry on user interaction |
| Malformed JSONL line | Skipped silently; does not block processing of remaining lines |
| Failed project write | Logged as warning; sync still succeeds for entries |
| Failed prompt write | Logged as warning; sync still succeeds for entries |

### 9.6 Data Integrity

- **S3 Versioning** -- Enabled on the data bucket; accidental overwrites can be recovered from previous versions
- **Idempotent sync** -- Re-syncing the same data produces identical results (dedup by `requestId`)
- **Rebuild capability** -- Each layer (`raw` -> `aggregated` -> `views`) can be regenerated from the layer above
- **Audit trail** -- Sync logs record every sync operation with hostname, IP, agent version, and record counts
- **Prompt archive** -- User prompts stored with UUID deduplication for ISMS compliance audit
- **Request validation** -- All sync requests validated via Zod schemas before any S3 writes

### 9.7 Multi-Device Support

When the same email runs agents on multiple devices:

1. **Member Resolution**: The sync endpoint looks up the member by email in the registry. Multiple devices with the same email are treated as the same member.
2. **Deduplication**: The `requestId` on each usage entry prevents duplicate records even if the same JSONL file is processed by agents on different machines.
3. **Audit Trail**: Sync logs record hostname, local IP, public IP, and user agent per sync, allowing visibility into which devices are syncing.
4. **Last Sync Tracking**: The member registry stores the most recent sync metadata (hostname, IP, agent version) for admin visibility.

---

## Appendix: File Reference

### be-agent

| File | Purpose |
|------|---------|
| `src/index.ts` | CLI entry point (Commander.js) |
| `src/daemon.ts` | Daemon loop with interval-based sync |
| `src/commands/setup.ts` | First-time setup (config + launchd/systemd) |
| `src/commands/push.ts` | Manual sync trigger |
| `src/commands/status.ts` | Display config and sync state |
| `src/commands/update.ts` | Self-update from S3 releases |
| `src/commands/uninstall.ts` | Remove auto-start service |
| `src/lib/config.ts` | Config + state persistence (`~/.ccusage-agent/`) |
| `src/lib/collector.ts` | JSONL parser with byte-offset tracking |
| `src/lib/pusher.ts` | Batched HTTP push with retry |
| `src/lib/commander.ts` | Admin command polling and execution |
| `src/lib/auth.ts` | JWT token management |
| `src/lib/pricing.ts` | LiteLLM pricing fetcher + cost calculator |

### lambda-server

| File | Purpose |
|------|---------|
| `src/app.ts` | Hono app with middleware + lazy route loader |
| `src/lambda.ts` | Lambda handler entry point (`hono/aws-lambda`) |
| `src/aggregator.ts` | Aggregator Lambda handler |
| `src/routes/sync.ts` | `POST /api/sync` -- data ingestion |
| `src/routes/dashboard.ts` | Dashboard view endpoints |
| `src/routes/members.ts` | Member list + detail endpoints |
| `src/routes/agent.ts` | Agent-facing endpoints (version, commands) |
| `src/routes/admin.ts` | Admin endpoints (aggregate trigger, commands) |
| `src/routes/auth.ts` | Login, refresh, logout, session |
| `src/routes/register.ts` | Registration endpoints |
| `src/lib/s3.ts` | S3 CRUD, path helpers, retry, ETag, presigned URLs |
| `src/lib/types.ts` | All TypeScript type definitions |
| `src/lib/aggregation.ts` | Shared month aggregation logic |
| `src/lib/auth.ts` | JWT signing/verification, password hashing |
| `serverless.yml` | Serverless Framework v4 configuration |

### dashboard

| File | Purpose |
|------|---------|
| `src/app/(dashboard)/layout.tsx` | Dashboard layout (AuthGuard + Sidebar + Navbar) |
| `src/app/(dashboard)/page.tsx` | Dashboard home page |
| `src/app/(dashboard)/members/page.tsx` | Members list page |
| `src/app/(auth)/login/page.tsx` | Login page |
| `src/hooks/use-dashboard.ts` | Dashboard data fetching (TanStack Query) |
| `src/hooks/use-members.ts` | Members list + detail fetching |
| `src/hooks/use-auth.ts` | Login, logout, session hooks |
| `src/lib/api-client.ts` | HTTP client with auth, retry, token refresh |
| `src/lib/api-adapters.ts` | Lambda/legacy API response adapters |
| `src/stores/ui-store.ts` | Sidebar state (Zustand, persisted) |
| `src/components/charts/` | Recharts visualizations |
| `src/components/members/` | Member cards, ranking, detail views |
| `src/components/shared/` | Reusable: PageHeader, StatsBar, DataSheet, etc. |
