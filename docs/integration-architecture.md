# CCUsage Monitor - Integration Architecture

How the three components (be-agent, lambda-server, dashboard) communicate, including data flows, authentication, error handling, and operational patterns.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Integration Point 1: Agent to Server (Sync)](#integration-point-1-agent-to-server-sync)
3. [Integration Point 2: Agent to Server (Version Check)](#integration-point-2-agent-to-server-version-check)
4. [Integration Point 3: Agent to Server (Command Polling)](#integration-point-3-agent-to-server-command-polling)
5. [Integration Point 4: Server to S3 (Data Storage)](#integration-point-4-server-to-s3-data-storage)
6. [Integration Point 5: Dashboard to Server (API Calls)](#integration-point-5-dashboard-to-server-api-calls)
7. [Integration Point 6: Admin to Agent (Remote Commands)](#integration-point-6-admin-to-agent-remote-commands)
8. [Integration Point 7: EventBridge to Aggregator Lambda](#integration-point-7-eventbridge-to-aggregator-lambda)
9. [Authentication Architecture](#authentication-architecture)
10. [Error Handling and Resilience](#error-handling-and-resilience)
11. [Concurrency and Consistency](#concurrency-and-consistency)

---

## System Overview

```
Developer Machines                    AWS Cloud                          Browser
+-------------------+     HTTPS      +-------------------------+        +------------------+
|                   |  POST /api/sync |                         |        |                  |
|    be-agent       |--------------->|     Lambda (API)         |        |    dashboard     |
|  (Node.js CLI)    |                |     (Hono + Lambda)      |        |  (Next.js SPA)   |
|                   |  GET /api/agent|                         |<-------|                  |
|  Parse JSONL logs |<---------------|  Routes:                 | GET    |  Fetches views/  |
|  Push to server   |                |   /api/sync             | /api/* |  Renders charts  |
|  Execute commands |                |   /api/dashboard        |        |                  |
|  Auto-update      |                |   /api/members          |        +------------------+
|                   |                |   /api/agent            |              |
+-------------------+                |   /api/admin            |              |
     |                               |   /api/auth             |              v
     v                               +----------+--------------+        CloudFront CDN
~/.claude/projects/                              |                      (S3 static site)
~/.config/claude/projects/                       v
~/.ccs/instances/*/projects/             +-------+--------+
                                         |                |
                                  +------v---+    +-------v------+
                                  |   S3     |    |  EventBridge |
                                  | (single  |    |  (hourly     |
                                  |  bucket) |    |   schedule)  |
                                  +------+---+    +-------+------+
                                         ^                |
                                         |                v
                                         |        +-------+--------+
                                         +--------|  Lambda        |
                                                  |  (Aggregator)  |
                                                  +----------------+
```

---

## Integration Point 1: Agent to Server (Sync)

**Endpoint:** `POST /api/sync`
**Source:** `be-agent/src/lib/pusher.ts` --> `lambda-server/src/routes/sync.ts`

### Flow

```
Agent                                     Server
  |                                         |
  |  1. collectUsageData()                  |
  |     - Scan JSONL files                  |
  |     - Read from byte offset             |
  |     - Parse entries + prompts           |
  |     - Resolve git remotes               |
  |                                         |
  |  2. Batch entries (max 1000/batch)      |
  |     Batch prompts (max 500/batch)       |
  |                                         |
  |  3. POST /api/sync  ------------------->|
  |     {email, entries[], projects[],      |  4. Validate with Zod schema
  |      prompts[], agent_version,          |  5. Resolve member (create if new)
  |      hostname, local_ip, public_ip}     |     - Read registry with ETag
  |                                         |     - Update lastSync info
  |                                         |     - Write with conditional put
  |                                         |  6. Group entries by year-month
  |                                         |  7. For each month (in parallel):
  |                                         |     - Load raw/{memberId}/{Y}-{M}.json
  |                                         |     - Dedup by request_id
  |                                         |     - Append new entries
  |                                         |     - Update daily totals
  |                                         |     - Write raw/ + aggregated/
  |                                         |  8. Save projects, prompts, sync log
  |  <------------------------------------  |
  |  {success, inserted, skipped, memberId} |
  |                                         |
  |  9. Update state.file_offsets           |
  |     Save state to disk                  |
```

### Request Payload

```typescript
{
  email: "user@example.com",
  name: "User Name",               // Optional, derived from email if absent
  entries: [{                       // Up to 1000 per batch
    request_id: "abc123",
    timestamp: "2026-02-25T10:30:00Z",
    model: "claude-sonnet-4-20250514",
    project_path: "my-project",
    session_id: "sess_xyz",
    input_tokens: 5000,
    output_tokens: 1200,
    cache_creation_tokens: 0,
    cache_read_tokens: 3000,
    cost_usd: 0.045,
    claude_version: "1.0.30"
  }],
  projects: [{                      // Sent only on first batch
    path: "/home/user/projects/my-project",
    git_repo: "https://github.com/org/my-project.git"
  }],
  prompts: [{                       // Up to 500 per batch
    uuid: "msg_abc123",
    session_id: "sess_xyz",
    timestamp: "2026-02-25T10:29:55Z",
    project_path: "my-project",
    cwd: "/home/user/projects/my-project",
    content: "Help me refactor the auth module"
  }],
  agent_version: "0.5.0",
  hostname: "dev-macbook",
  local_ip: "192.168.1.100",
  public_ip: "203.0.113.42"
}
```

### Response

```typescript
// Success
{ success: true, inserted: 47, skipped: 3, memberId: "uuid-here" }

// Validation error (400)
{ success: false, error: "request_id is required", code: "VALIDATION_ERROR" }

// Server error (500)
{ success: false, error: "Internal server error", code: "INTERNAL_ERROR" }
```

### Batching Strategy

The agent splits large syncs across multiple HTTP requests:

- **Entries:** 1000 per batch (`config.max_batch_size`)
- **Prompts:** 500 per batch (prompts contain full text, larger payload)
- **Projects:** Sent only with the first batch
- **Total batches:** `max(ceil(entries/1000), ceil(prompts/500))`

Each batch is an independent HTTP request. If one fails, subsequent batches still attempt.

### Deduplication

Deduplication happens at two levels:

1. **Agent side:** Byte offset tracking ensures the same file region is never read twice
2. **Server side:** `request_id` dedup within each month's `RawMonthlyData` - duplicate entries are counted as `skipped`

This makes sync **idempotent** -- safe to re-run without creating duplicate records.

---

## Integration Point 2: Agent to Server (Version Check)

**Endpoint:** `GET /api/agent/version`
**Source:** `be-agent/src/commands/update.ts` --> `lambda-server/src/routes/agent.ts`

### Flow

```
Agent                                     Server
  |                                         |
  |  GET /api/agent/version  ------------->|
  |                                         |  1. Read releases/version.json from S3
  |                                         |  2. Generate presigned download URL
  |                                         |     (10 min expiry)
  |  <------------------------------------  |
  |  {version, filename, downloadUrl}       |
  |                                         |
  |  Compare with current version           |
  |  If newer:                              |
  |    Download tgz from presigned URL      |
  |    npm install -g <tgz>                 |
  |    Re-run setup                         |
  |    Force sync                           |
```

### Key Design Decisions

- **No auth required:** Version checks are public to simplify agent bootstrap
- **Presigned URLs:** Agents download directly from S3 without going through Lambda
- **10-minute expiry:** Short enough for security, long enough for download
- **Auto-update flow:** `check version --> download --> install globally --> re-setup --> force sync`

---

## Integration Point 3: Agent to Server (Command Polling)

**Endpoint:** `GET /api/agent/commands?email=...`
**Source:** `be-agent/src/lib/commander.ts` --> `lambda-server/src/routes/agent.ts`

### Flow

```
Agent                                     Server
  |                                         |
  |  GET /api/agent/commands?email=x  ---->|
  |                                         |  1. Look up member by email
  |                                         |  2. Read commands/{memberId}/queue.json
  |                                         |  3. Filter status == 'pending'
  |  <------------------------------------  |
  |  {success, commands: [{id, type,        |
  |   payload}]}                            |
  |                                         |
  |  For each command:                      |
  |    Execute locally                      |
  |                                         |
  |  POST /api/agent/commands/{id}/ack ---->|
  |  {email, status, result}                |  4. Update command status in queue
  |  <------------------------------------  |
  |  {success}                              |
```

### Supported Commands

| Command Type | Agent Action | Payload |
|---|---|---|
| `revoke-token` | Delete Claude credential files from disk | `{}` |
| `force-sync` | Flag for next sync cycle to do full re-sync | `{}` |
| `update-config` | Merge payload into `~/.ccusage-agent/config.json` | `{sync_interval_minutes: 10}` |
| `custom` | Log unknown command, return message | Any |

### revoke-token Implementation

The agent searches and deletes credential files from:

```
~/.claude/.credentials.json
~/.claude/credentials.json
~/.config/claude/credentials.json
~/.config/claude/.credentials.json
~/.ccs/instances/*/.credentials.json
~/.ccs/instances/*/credentials.json
```

This forces the developer to re-authenticate with Claude Code on next use.

---

## Integration Point 4: Server to S3 (Data Storage)

**Source:** `lambda-server/src/lib/s3.ts`, `lambda-server/src/routes/sync.ts`, `lambda-server/src/aggregator.ts`

### Write Paths (Sync Endpoint)

When `POST /api/sync` is called, the server writes to S3 in parallel:

```
POST /api/sync
    |
    +---> members/index.json        (ETag conditional write)
    |
    +---> raw/{id}/{Y}-{M}.json     (one per affected month)
    |     aggregated/{id}/{Y}-{M}.json  (pre-aggregated, in parallel with raw)
    |
    +---> projects/{id}.json         (if projects provided)
    |
    +---> prompts/{id}/{Y}-{M}.json  (if prompts provided, per month)
    |
    +---> sync-logs/{Y}-{M}/{id}.json  (audit trail)
```

### Write Paths (Aggregator)

When the aggregator runs, it reads from `aggregated/` and writes to `views/`:

```
EventBridge (hourly) or POST /api/admin/aggregate
    |
    v
Aggregator Lambda
    |
    +--- READ:  members/index.json
    +--- READ:  aggregated/{id}/{Y}-{M}.json   (12 months x N members)
    +--- READ:  projects/{id}.json              (per member)
    +--- READ:  prompts/{id}/{Y}-{M}.json       (for prompt counts)
    +--- READ:  sync-logs/{Y}-{M}/{id}.json     (recent syncs)
    |
    +--- WRITE: views/dashboard.json
    +--- WRITE: views/members.json
    +--- WRITE: views/members/{id}/{year}.json  (per member, current + previous year)
    +--- WRITE: meta/last-processed.json
```

### Read Paths (Dashboard API)

Dashboard endpoints read pre-computed views:

```
GET /api/dashboard          --> views/dashboard.json
GET /api/members            --> views/members.json
GET /api/members/:id?year=Y --> views/members/{id}/{Y}.json
GET /api/members/:id/raw    --> raw/{id}/{Y}-{M}.json  (direct raw access)
GET /api/dashboard/meta     --> meta/last-processed.json
```

### S3 Key Helper Functions

All key patterns are centralized in `lambda-server/src/lib/s3.ts`:

```typescript
getRawDataKey("abc", 2026, 2)      // "raw/abc/2026-02.json"
getAggregatedDataKey("abc", 2026, 2)// "aggregated/abc/2026-02.json"
getMemberRegistryKey()              // "members/index.json"
getSyncLogKey("abc", 2026, 2)      // "sync-logs/2026-02/abc.json"
getProjectsKey("abc")              // "projects/abc.json"
getPromptsKey("abc", 2026, 2)      // "prompts/abc/2026-02.json"
getCommandQueueKey("abc")          // "commands/abc/queue.json"
getDashboardViewKey()              // "views/dashboard.json"
getMembersViewKey()                 // "views/members.json"
getMemberDetailViewKey("abc", 2026) // "views/members/abc/2026.json"
getMetaKey()                        // "meta/last-processed.json"
```

---

## Integration Point 5: Dashboard to Server (API Calls)

**Source:** `dashboard/src/lib/api-client.ts`, `dashboard/src/lib/api-adapters.ts`

### Architecture

```
Browser (Next.js SPA)
    |
    |  In development: Next.js rewrites /api/* --> API_SERVER_URL/api/*
    |  In production:  Direct HTTPS to Lambda via NEXT_PUBLIC_API_URL
    |
    v
ApiClient (singleton)
    |  - Adds Authorization: Bearer <token>
    |  - Auto-refreshes expired tokens
    |  - Redirects to /login on auth failure
    |
    v
Lambda API Gateway --> Hono App --> Route handlers --> S3
```

### Token Management Flow

```
Dashboard                                  Server
  |                                         |
  |  POST /api/auth/login  --------------->|
  |  {email, password}                      |  Verify credentials
  |  <------------------------------------  |
  |  {accessToken, refreshToken, user}      |
  |                                         |
  |  Store tokens in localStorage           |
  |                                         |
  |  GET /api/dashboard (Bearer token) --->|
  |  <------------------------------------  |
  |  {success, data: DashboardView}         |
  |                                         |
  |  ... token expires (60 min) ...         |
  |                                         |
  |  GET /api/members (expired token) ---->|
  |  <------------------------------------  |
  |  401 Unauthorized                       |
  |                                         |
  |  POST /api/auth/refresh  ------------->|
  |  {refreshToken}                         |
  |  <------------------------------------  |
  |  {accessToken, refreshToken}            |
  |                                         |
  |  Retry GET /api/members (new token) -->|
  |  <------------------------------------  |
  |  {success, data: MembersView}           |
```

### Adapter Layer

The dashboard has an adapter layer that transforms Lambda API responses into frontend types. This allows the frontend to work with both the Lambda API and a legacy PostgreSQL backend.

```
Lambda response                  Adapter function            Frontend type
DashboardView       -->  adaptDashboardResponse()  -->  FrontendDashboardData
MembersView         -->  adaptMembersResponse()    -->  FrontendMemberListItem[]
MemberYearlyView    -->  adaptMemberDetailResponse()--> FrontendMemberDetailData
```

Detection is automatic via `isLambdaResponse()` which checks for the `generatedAt` field.

### API Endpoints Used by Dashboard

| Endpoint | Hook | Data Source (S3) |
|---|---|---|
| `GET /api/dashboard` | `useDashboard()` | `views/dashboard.json` |
| `GET /api/dashboard/model-distribution` | Direct fetch | Subset of `views/dashboard.json` |
| `GET /api/dashboard/meta` | Direct fetch | `meta/last-processed.json` |
| `GET /api/members` | `useMembers()` | `views/members.json` |
| `GET /api/members/:id?year=YYYY` | `useMember()` | `views/members/{id}/{year}.json` |
| `GET /api/members/:id/raw?year=&month=` | `useMemberUsage()` | `raw/{id}/{year}-{month}.json` |
| `POST /api/auth/login` | `useLogin()` | In-memory user registry |
| `POST /api/auth/refresh` | Auto (401 handler) | JWT verification |

---

## Integration Point 6: Admin to Agent (Remote Commands)

**Source:** `lambda-server/src/routes/admin.ts` --> `lambda-server/src/routes/agent.ts` --> `be-agent/src/lib/commander.ts`

### End-to-End Flow

```
Admin                    Server                     Agent
  |                        |                          |
  | POST /api/admin/       |                          |
  | commands               |                          |
  | {memberId, type,       | 1. Write to              |
  |  payload}              |    commands/{id}/queue.json
  |                        |                          |
  |                        |          (on next cycle)  |
  |                        |                          |
  |                        | <--- GET /api/agent/     |
  |                        |      commands?email=x     |
  |                        |                          |
  |                        | 2. Read queue.json       |
  |                        |    Filter pending         |
  |                        |                          |
  |                        | ---> {commands: [...]}   |
  |                        |                          |
  |                        |    3. Execute command     |
  |                        |       locally             |
  |                        |                          |
  |                        | <--- POST /api/agent/    |
  |                        |      commands/{id}/ack    |
  |                        |      {status, result}     |
  |                        |                          |
  |                        | 4. Update command status  |
  |                        |    in queue.json          |
```

### Command Lifecycle

```
pending  -->  acked     (successful execution)
pending  -->  failed    (execution error)
```

Commands remain in the queue file indefinitely for audit purposes. The agent only processes commands with `status: 'pending'`.

---

## Integration Point 7: EventBridge to Aggregator Lambda

**Source:** `lambda-server/src/aggregator.ts`

### Trigger Mechanisms

The aggregator Lambda can be triggered in two ways:

1. **Scheduled (EventBridge):** Runs hourly via CloudWatch Events rule
2. **Manual (Admin API):** `POST /api/admin/aggregate?force=true`

### Aggregation Flow

```
Trigger (EventBridge or Admin API)
    |
    v
1. Read members/index.json
2. Read meta/last-processed.json (for change detection)
    |
    v
3. For each member (bounded concurrency = 10):
    |
    +--- Read aggregated/{id}/{Y}-{M}.json for all 12 months
    |    (fallback: read raw/ + compute + backfill aggregated/)
    |
    +--- Read projects/{id}.json
    +--- Read prompts/{id}/{Y}-{M}.json (for counts)
    +--- Read sync-logs/{Y}-{M}/{id}.json
    |
    v
4. Generate views:
    +--- views/dashboard.json     (team-wide stats, last 30 days trend)
    +--- views/members.json       (member list with current/prev month)
    +--- views/members/{id}/{Y}.json  (per member, current year)
    +--- views/members/{id}/{Y-1}.json (per member, previous year if data exists)
    |
    v
5. Write meta/last-processed.json
```

### Force vs Normal Mode

| Behavior | Normal Mode | Force Mode (`?force=true`) |
|---|---|---|
| Read source | `aggregated/` (cached) | `raw/` (recompute from source of truth) |
| Backfill | Only if `aggregated/` missing | Always rewrite `aggregated/` |
| Use case | Hourly routine | After data fixes, initial setup |

### Change Detection

The aggregator uses `lastUpdated` timestamps to detect which months have changed since the last run:

```typescript
function isMonthChanged(agg: MonthAggregation): boolean {
  if (agg.totals.recordCount === 0) return false;
  if (!lastProcessedAt) return true;        // First run
  if (!agg.lastUpdated) return true;        // No timestamp
  return agg.lastUpdated > lastProcessedAt; // Data is newer
}
```

### Concurrency Control

The aggregator uses bounded concurrency to avoid overwhelming S3:

```typescript
const LIMITS = {
  S3_CONCURRENCY: 10,           // Max parallel S3 operations
  RECENT_SYNCS_PER_MEMBER: 10,  // Syncs to include per member
  TOP_MEMBERS: 10,              // Top members in dashboard
  RECENT_SYNCS_TEAM: 20,        // Team-wide recent syncs
  TOP_PROJECTS: 20,             // Projects per member
  DAILY_TREND_DAYS: 30,         // Days in daily trend chart
};
```

---

## Authentication Architecture

### Three Auth Contexts

The system has three distinct authentication flows:

```
1. Agent --> Server    JWT (auto-login with stored password)
2. Dashboard --> Server JWT (manual login, auto-refresh)
3. Server --> S3       IAM Role (Lambda execution role)
```

### JWT Token Flow

```
                     +-------------------+
                     |   users.json      |
                     |   (build-time)    |
                     +--------+----------+
                              |
                              v
POST /api/auth/login  --> findUser(email)
                          verifyPassword(password, hash)
                          generateAccessToken(user)   --> HS256, 60min expiry
                          generateRefreshToken(user)  --> HS256, 20day expiry

POST /api/auth/refresh --> verifyToken(refreshToken)
                           Must be type: 'refresh'
                           generateAccessToken(user)
                           generateRefreshToken(user) --> Token rotation
```

### Public vs Protected Endpoints

The JWT middleware in `lambda-server/src/app.ts` defines which endpoints require authentication:

**Public (no auth):**
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/sync` (agent sync is unauthenticated for bootstrap simplicity)
- `GET /api/agent/*` (version check, command polling)
- `/api/admin/*` (admin endpoints -- separate auth mechanism)
- `/api/register/*` (registration)

**Protected (Bearer JWT required):**
- `GET /api/dashboard`
- `GET /api/dashboard/model-distribution`
- `GET /api/dashboard/meta`
- `GET /api/members`
- `GET /api/members/:id`
- `GET /api/members/:id/raw`

### Agent Auth Flow

The agent in `be-agent/src/lib/auth.ts` implements a three-tier token strategy:

```
1. Check existing access_token  --> if valid (not expired), use it
2. Try refresh_token            --> if valid, refresh and save new tokens
3. Re-login with stored password --> if no valid tokens, do full login
```

Token expiry is checked client-side with a 60-second buffer:

```typescript
function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  return Date.now() / 1000 > payload.exp - 60;  // 60s buffer
}
```

### Dashboard Auth Flow

The `ApiClient` in `dashboard/src/lib/api-client.ts` handles auth transparently:

```
Request with Bearer token
    |
    v
401 response?
    |
    +--- Yes --> tryRefreshToken()
    |               |
    |               +--- Success --> Retry original request with new token
    |               +--- Failure --> Redirect to /login
    |
    +--- No  --> Return response
```

Concurrent refresh requests are deduplicated:

```typescript
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;  // Reuse in-flight refresh
  refreshPromise = (async () => { /* ... */ })();
  return refreshPromise;
}
```

---

## Error Handling and Resilience

### Agent Retry Strategy

The agent uses exponential backoff for server communication:

```
Attempt 1: immediate
Attempt 2: 2^1 * 1000 = 2 seconds
Attempt 3: 2^2 * 1000 = 4 seconds
(configured via config.retry_attempts, default: 3)
```

| Error Type | Retry? | Action |
|---|---|---|
| 4xx (client error) | No | Return error immediately |
| 5xx (server error) | Yes | Exponential backoff |
| Network error | Yes | Exponential backoff |
| Validation error | No | Return error immediately |

### Server Retry Strategy (S3 Operations)

The server uses `withRetry()` from `lambda-server/src/lib/s3.ts`:

```
Attempt 0: immediate
Attempt 1: ~100-150ms  (100 * 2^0 * jitter)
Attempt 2: ~200-300ms  (100 * 2^1 * jitter)
Attempt 3: ~400-600ms  (100 * 2^2 * jitter)
```

Retryable errors:
- `ThrottlingException`, `SlowDown` (S3 rate limiting)
- `ServiceUnavailable`, `InternalError`, `RequestTimeout`
- `ConditionalCheckFailed` (ETag mismatch from concurrent writes)
- Socket hang up, `ECONNRESET`

Non-retryable errors (fail immediately):
- `NoSuchKey` (handled as null/empty)
- Validation errors
- Permission errors

### Lazy Route Loading

To minimize Lambda cold start time, routes are loaded lazily in `lambda-server/src/app.ts`:

```typescript
app.all('/api/*', async (c, next) => {
  if (path === '/api/sync' && c.req.method === 'POST') {
    const { default: syncRoute } = await import('./routes/sync.js');
    // ...
  }
  if (path.startsWith('/api/dashboard')) {
    const { default: dashboardRoute } = await import('./routes/dashboard.js');
    // ...
  }
  // Only the matched route module is loaded
});
```

### Gzip Decompression

The server handles gzip-compressed request bodies via middleware:

```
Agent sends Content-Encoding: gzip
    |
    v
Middleware detects gzip header on POST
    |
    v
gunzipSync(body) --> replace request body
    |
    v
Route handler receives decompressed JSON
```

This is primarily a safety net -- AWS API Gateway typically decompresses automatically in production.

---

## Concurrency and Consistency

### Member Registry (Optimistic Concurrency)

The member registry uses S3 conditional writes to prevent lost updates when multiple agents sync simultaneously:

```
Agent A sync                          Agent B sync
    |                                     |
    v                                     v
Read registry (ETag: "abc")        Read registry (ETag: "abc")
    |                                     |
    v                                     v
Update member A info               Update member B info
    |                                     |
    v                                     v
PUT with IfMatch: "abc"            PUT with IfMatch: "abc"
    |                                     |
    v                                     v
SUCCESS (new ETag: "def")          412 PreconditionFailed
                                          |
                                          v
                                   RETRY: Read (ETag: "def")
                                          |
                                          v
                                   PUT with IfMatch: "def"
                                          |
                                          v
                                   SUCCESS
```

### Raw Data Processing (Deduplication)

Within `processMonthEntries()`, deduplication prevents data corruption from concurrent syncs:

```typescript
// Build set of existing request IDs
const existingRequestIds = new Set<string>();
for (const dailyRecord of Object.values(monthData.records)) {
  for (const entry of dailyRecord.entries) {
    existingRequestIds.add(entry.requestId);
  }
}

// Skip duplicates
if (existingRequestIds.has(entry.request_id)) {
  skipped++;
  continue;
}
```

### Aggregator Concurrency

The aggregator processes members with bounded parallelism to avoid S3 throttling:

```typescript
const memberDataList = await mapWithConcurrency(
  memberIds,
  (memberId) => getMemberAggregatedData(memberId, ...),
  10  // LIMITS.S3_CONCURRENCY
);
```

The `mapWithConcurrency()` function maintains a worker pool of up to N concurrent promises:

```
Worker 1: member-A --> member-D --> member-G --> ...
Worker 2: member-B --> member-E --> member-H --> ...
Worker 3: member-C --> member-F --> member-I --> ...
...
Worker 10: ...
```

### Sync Operations Parallelism

Within a single sync request, independent S3 writes run in parallel:

```typescript
// Month entries processed in parallel
await Promise.all(
  Array.from(entriesByMonth.entries()).map(([monthKey, monthEntries]) =>
    processMonthEntries(memberId, year, month, monthEntries)
  )
);

// Side effects in parallel (after entries)
await Promise.all([
  saveProjectData(memberId, projects),
  savePrompts(memberId, prompts),
  logSyncOperation(memberId, now, inserted, skipped, metadata),
]);
```

### Cost Precision

All cost accumulation uses `addCost()` to avoid floating-point errors:

```typescript
function addCost(a: number, b: number): number {
  const PRECISION = 1000000;  // 6 decimal places
  return Math.round((a * PRECISION + b * PRECISION)) / PRECISION;
}
```

This prevents issues like `0.1 + 0.2 = 0.30000000000000004` from accumulating across thousands of entries.
