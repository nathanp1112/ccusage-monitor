# CCUsage Monitor - API Contracts

> Generated 2026-02-25. Complete endpoint documentation for the Lambda serverless backend.

Base URL: `https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com`

## Authentication

The API uses JWT Bearer tokens. Most dashboard endpoints require authentication. Agent and admin endpoints are currently public (no auth required).

**Token lifecycle:**
- Access token: 60 minutes expiry (HS256)
- Refresh token: 20 days expiry (HS256)
- JWT payload: `{ email, name, role, type, iat, exp }`

**Auth header format:**
```
Authorization: Bearer <access_token>
```

**Public endpoints (no auth required):**
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/sync`
- `GET/POST /api/agent/*`
- `GET/POST /api/admin/*`
- `GET/PUT/POST /api/register/*`

**Protected endpoints (JWT required):**
- `GET /api/dashboard/*`
- `GET /api/members/*`
- `GET /api/auth/me`
- `POST /api/auth/logout`

---

## Health Check

### GET /health

Returns server health status. No authentication required.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-25T10:00:00.000Z",
  "environment": "production",
  "bucket": "ccusage-data-dev"
}
```

---

## Sync Endpoints

### POST /api/sync

Receives usage data from the agent. Core data ingestion endpoint. Entries are deduplicated by `request_id`.

**Auth:** Not required

**Request body:**
```json
{
  "email": "user@example.com",
  "name": "User Name",
  "entries": [
    {
      "request_id": "abc123",
      "timestamp": "2026-02-25T10:00:00.000Z",
      "model": "claude-sonnet-4-20250514",
      "project_path": "my-project",
      "session_id": "sess-001",
      "input_tokens": 5000,
      "output_tokens": 1200,
      "cache_creation_tokens": 0,
      "cache_read_tokens": 3000,
      "cost_usd": 0.0234,
      "claude_version": "1.0.88"
    }
  ],
  "projects": [
    {
      "path": "/Users/dev/my-project",
      "git_repo": "git@github.com:org/my-project.git"
    }
  ],
  "prompts": [
    {
      "uuid": "prompt-uuid-001",
      "session_id": "sess-001",
      "timestamp": "2026-02-25T10:00:00.000Z",
      "project_path": "my-project",
      "cwd": "/Users/dev/my-project",
      "content": "Fix the authentication bug in login.ts"
    }
  ],
  "hostname": "dev-macbook.local",
  "agent_version": "0.5.0",
  "local_ip": "192.168.1.50",
  "public_ip": "203.0.113.42"
}
```

**Request body fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string (email) | Yes | User email address (used for member lookup/creation) |
| `name` | string | No | Display name (defaults to email prefix if omitted) |
| `entries` | array | Yes | Usage entries (can be empty array) |
| `entries[].request_id` | string | Yes | Unique identifier for deduplication |
| `entries[].timestamp` | string (ISO) | Yes | When the API call was made |
| `entries[].model` | string | Yes | Model identifier (e.g., `claude-sonnet-4-20250514`) |
| `entries[].project_path` | string or null | No | Project name extracted from file path |
| `entries[].session_id` | string or null | No | Conversation session ID |
| `entries[].input_tokens` | integer >= 0 | Yes | Input token count |
| `entries[].output_tokens` | integer >= 0 | Yes | Output token count |
| `entries[].cache_creation_tokens` | integer >= 0 | No | Cache creation tokens (default: 0) |
| `entries[].cache_read_tokens` | integer >= 0 | No | Cache read tokens (default: 0) |
| `entries[].cost_usd` | number >= 0 | Yes | Cost in USD |
| `entries[].claude_version` | string or null | No | Claude Code version |
| `projects` | array | No | Discovered project paths with git remotes |
| `projects[].path` | string | Yes | Absolute path on disk |
| `projects[].git_repo` | string or null | Yes | Git remote URL (or null) |
| `prompts` | array | No | User prompt text (for audit) |
| `prompts[].uuid` | string | Yes | Unique prompt identifier |
| `prompts[].session_id` | string | Yes | Session the prompt belongs to |
| `prompts[].timestamp` | string (ISO) | Yes | When the prompt was sent |
| `prompts[].project_path` | string | Yes | Project context |
| `prompts[].cwd` | string | Yes | Working directory |
| `prompts[].content` | string | Yes | Prompt text content |
| `hostname` | string | No | Machine hostname |
| `agent_version` | string | No | Agent version (e.g., "0.5.0") |
| `local_ip` | string or null | No | LAN IP address |
| `public_ip` | string or null | No | Public IP address |

**Success response (200):**
```json
{
  "success": true,
  "inserted": 15,
  "skipped": 3,
  "memberId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Validation error (400):**
```json
{
  "success": false,
  "error": "request_id is required, timestamp is required",
  "code": "VALIDATION_ERROR"
}
```

**Service unavailable (503):**
```json
{
  "success": false,
  "error": "Storage service temporarily unavailable",
  "code": "SERVICE_UNAVAILABLE"
}
```

**Internal error (500):**
```json
{
  "success": false,
  "error": "Error message",
  "code": "INTERNAL_ERROR"
}
```

**Processing pipeline:**
1. Validate request body (Zod schema)
2. Resolve member: find by email in registry or create new member (ETag concurrency)
3. Group entries by year-month, process each month in parallel
4. Deduplicate by `request_id` within each month's raw data
5. Write raw data + pre-aggregated summary in parallel
6. Save projects, prompts, sync log in parallel
7. Return insert/skip counts

---

## Dashboard Endpoints

### GET /api/dashboard

Returns team-wide dashboard summary. Reads pre-computed `views/dashboard.json`.

**Auth:** Required (Bearer token)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-02-25T10:00:00.000Z",
    "summary": {
      "totalCost": 1234.56,
      "totalInputTokens": 50000000,
      "totalOutputTokens": 12000000,
      "totalMembers": 10,
      "activeMembers": 8,
      "avgCostPerMember": 123.456
    },
    "costChangePercent": 5.2,
    "dailyTrend": [
      {
        "date": "2026-02-01",
        "costUsd": 45.67,
        "inputTokens": 1500000,
        "outputTokens": 350000
      }
    ],
    "topMembers": [
      {
        "memberId": "uuid-1",
        "name": "John Doe",
        "costUsd": 200.50,
        "percentage": 16.2
      }
    ],
    "modelDistribution": [
      {
        "model": "claude-sonnet-4-20250514",
        "costUsd": 800.00,
        "percentage": 64.8
      }
    ],
    "recentSyncs": [
      {
        "memberId": "uuid-1",
        "memberName": "John Doe",
        "syncedAt": "2026-02-25T09:30:00.000Z",
        "recordsInserted": 42
      }
    ]
  }
}
```

**Empty state response (200):**
When the aggregator has not run yet:
```json
{
  "success": true,
  "message": "No data available yet. Aggregator has not run.",
  "data": {
    "generatedAt": "2026-02-25T10:00:00.000Z",
    "summary": {
      "totalCost": 0,
      "totalInputTokens": 0,
      "totalOutputTokens": 0,
      "totalMembers": 0,
      "activeMembers": 0,
      "avgCostPerMember": 0
    },
    "costChangePercent": 0,
    "dailyTrend": [],
    "topMembers": [],
    "modelDistribution": [],
    "recentSyncs": []
  }
}
```

### GET /api/dashboard/model-distribution

Returns model usage breakdown. Subset of the main dashboard view.

**Auth:** Required (Bearer token)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "model": "claude-sonnet-4-20250514",
      "costUsd": 800.00,
      "percentage": 64.8
    },
    {
      "model": "claude-opus-4-20250514",
      "costUsd": 434.56,
      "percentage": 35.2
    }
  ]
}
```

**Empty response (200):**
```json
{
  "success": true,
  "data": []
}
```

### GET /api/dashboard/meta

Returns aggregator processing metadata.

**Auth:** Required (Bearer token)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "lastProcessedAt": "2026-02-25T09:00:00.000Z",
    "lastProcessingDurationMs": 4500,
    "membersProcessed": 10,
    "viewsGenerated": ["dashboard.json", "members.json", "members/uuid-1/2026.json"]
  }
}
```

**No metadata response (200):**
```json
{
  "success": true,
  "message": "No processing metadata available yet",
  "data": null
}
```

---

## Members Endpoints

### GET /api/members

Returns member list with current and previous month stats. Reads pre-computed `views/members.json`.

**Auth:** Required (Bearer token)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-02-25T10:00:00.000Z",
    "teamTotals": {
      "costUsd": 1234.56,
      "inputTokens": 50000000,
      "outputTokens": 12000000
    },
    "members": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "member",
        "isActive": true,
        "lastSyncAt": "2026-02-25T09:30:00.000Z",
        "currentMonth": {
          "costUsd": 120.50,
          "inputTokens": 5000000,
          "outputTokens": 1200000
        },
        "previousMonth": {
          "costUsd": 98.30,
          "inputTokens": 4200000,
          "outputTokens": 1000000
        },
        "costChangePercent": 22.6
      }
    ]
  }
}
```

**Pre-aggregator fallback (200):**
When the aggregator has not run but members exist in the registry:
```json
{
  "success": true,
  "message": "Aggregator has not run yet. Showing registered members without stats.",
  "data": {
    "generatedAt": "2026-02-25T10:00:00.000Z",
    "teamTotals": { "costUsd": 0, "inputTokens": 0, "outputTokens": 0 },
    "members": [
      {
        "id": "uuid-1",
        "name": "John Doe",
        "email": "john@example.com",
        "role": "member",
        "isActive": true,
        "lastSyncAt": "2026-02-25T09:30:00.000Z",
        "currentMonth": { "costUsd": 0, "inputTokens": 0, "outputTokens": 0 },
        "previousMonth": { "costUsd": 0, "inputTokens": 0, "outputTokens": 0 },
        "costChangePercent": 0
      }
    ]
  }
}
```

### GET /api/members/:id

Returns yearly detail for a specific member. Reads pre-computed `views/members/{id}/{year}.json`.

**Auth:** Required (Bearer token)

**Path params:**

| Param | Type | Description |
|-------|------|-------------|
| `id` | string (UUID v4) | Member ID |

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `year` | integer | Current year | Year to fetch (2024 - current+1) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-02-25T10:00:00.000Z",
    "member": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "member",
      "isActive": true
    },
    "year": 2026,
    "months": {
      "1": {
        "totals": {
          "costUsd": 98.30,
          "inputTokens": 4200000,
          "outputTokens": 1000000,
          "recordCount": 150
        },
        "dailyUsage": [
          {
            "date": "2026-01-15",
            "costUsd": 5.20,
            "inputTokens": 200000,
            "outputTokens": 50000,
            "recordCount": 8
          }
        ],
        "dailyModelUsage": [
          {
            "date": "2026-01-15",
            "models": [
              {
                "model": "claude-sonnet-4-20250514",
                "inputTokens": 150000,
                "outputTokens": 35000,
                "costUsd": 3.80
              }
            ]
          }
        ],
        "modelBreakdown": [
          {
            "model": "claude-sonnet-4-20250514",
            "costUsd": 75.00,
            "percentage": 76.3
          }
        ],
        "projectBreakdown": [
          {
            "project": "my-project",
            "costUsd": 60.00,
            "percentage": 61.0
          }
        ]
      },
      "2": {
        "totals": { "..." : "..." }
      }
    },
    "recentSyncs": [
      {
        "syncId": "sync-uuid-1",
        "syncedAt": "2026-02-25T09:30:00.000Z",
        "recordsInserted": 42,
        "recordsSkipped": 3,
        "hostname": "dev-macbook.local",
        "clientIp": "203.0.113.42",
        "localIp": "192.168.1.50",
        "userAgent": "undici",
        "agentVersion": "0.5.0"
      }
    ],
    "projects": [
      {
        "path": "/Users/dev/my-project",
        "gitRepo": "git@github.com:org/my-project.git",
        "firstSeen": "2026-01-10T08:00:00.000Z",
        "lastSeen": "2026-02-25T09:30:00.000Z"
      }
    ],
    "promptStats": {
      "1": { "count": 142 },
      "2": { "count": 89 }
    }
  }
}
```

**Invalid ID (400):**
```json
{
  "success": false,
  "error": "Invalid member ID format",
  "code": "VALIDATION_ERROR"
}
```

**Invalid year (400):**
```json
{
  "success": false,
  "error": "Invalid year parameter",
  "code": "VALIDATION_ERROR"
}
```

**Member not found (404):**
```json
{
  "success": false,
  "error": "Member not found",
  "code": "NOT_FOUND"
}
```

### GET /api/members/:id/raw

Returns raw usage records for a member. Reads directly from `raw/{memberId}/{year}-{month}.json`. Used for detailed record inspection.

**Auth:** Required (Bearer token)

**Path params:**

| Param | Type | Description |
|-------|------|-------------|
| `id` | string (UUID v4) | Member ID |

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `year` | integer | Current year | Year to fetch |
| `month` | integer | Current month | Month to fetch (1-12) |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "memberId": "550e8400-e29b-41d4-a716-446655440000",
    "year": 2026,
    "month": 2,
    "lastUpdated": "2026-02-25T09:30:00.000Z",
    "records": {
      "2026-02-25": {
        "date": "2026-02-25",
        "updatedAt": "2026-02-25T09:30:00.000Z",
        "totals": {
          "inputTokens": 50000,
          "outputTokens": 12000,
          "cacheCreationTokens": 0,
          "cacheReadTokens": 30000,
          "costUsd": 0.234,
          "recordCount": 5
        },
        "models": {
          "claude-sonnet-4-20250514": {
            "inputTokens": 50000,
            "outputTokens": 12000,
            "cacheCreationTokens": 0,
            "cacheReadTokens": 30000,
            "costUsd": 0.234,
            "recordCount": 5
          }
        },
        "entries": [
          {
            "requestId": "abc123",
            "timestamp": "2026-02-25T10:00:00.000Z",
            "model": "claude-sonnet-4-20250514",
            "projectPath": "my-project",
            "sessionId": "sess-001",
            "inputTokens": 10000,
            "outputTokens": 2400,
            "cacheCreationTokens": 0,
            "cacheReadTokens": 6000,
            "costUsd": 0.0468,
            "claudeVersion": "1.0.88"
          }
        ]
      }
    },
    "totalEntries": 5
  }
}
```

**Empty month (200):**
```json
{
  "success": true,
  "data": {
    "memberId": "uuid-1",
    "year": 2026,
    "month": 2,
    "lastUpdated": null,
    "records": {},
    "totalEntries": 0
  }
}
```

**Member not found (404):**
```json
{
  "success": false,
  "error": "Member not found",
  "code": "NOT_FOUND"
}
```

---

## Agent Endpoints

### GET /api/agent/version

Returns the latest agent version and a presigned download URL.

**Auth:** Not required

**Response (200):**
```json
{
  "success": true,
  "version": "0.5.0",
  "filename": "ccusage-agent-0.5.0.tgz",
  "downloadUrl": "https://ccusage-data-dev.s3.ap-southeast-1.amazonaws.com/releases/ccusage-agent-0.5.0.tgz?X-Amz-..."
}
```

The `downloadUrl` is a presigned S3 URL valid for 10 minutes.

**No release published (404):**
```json
{
  "success": false,
  "error": "No release published yet"
}
```

### GET /api/agent/commands

Agent polls for pending admin commands.

**Auth:** Not required

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Agent's email address |

**Response (200):**
```json
{
  "success": true,
  "commands": [
    {
      "id": "cmd-uuid-1",
      "type": "force-sync",
      "payload": {},
      "createdAt": "2026-02-25T08:00:00.000Z",
      "createdBy": "admin@example.com",
      "status": "pending"
    }
  ]
}
```

Only commands with `status: "pending"` are returned.

**Missing email (400):**
```json
{
  "success": false,
  "error": "email query parameter is required"
}
```

**No commands / unknown member (200):**
```json
{
  "success": true,
  "commands": []
}
```

### POST /api/agent/commands/:commandId/ack

Agent acknowledges a command after execution.

**Auth:** Not required

**Path params:**

| Param | Type | Description |
|-------|------|-------------|
| `commandId` | string (UUID) | Command ID to acknowledge |

**Request body:**
```json
{
  "email": "user@example.com",
  "status": "acked",
  "result": "Sync completed successfully"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string (email) | Yes | Agent's email (for member lookup) |
| `status` | `"acked"` or `"failed"` | Yes | Execution result |
| `result` | string | No | Optional result message |

**Success (200):**
```json
{
  "success": true
}
```

**Already processed (200):**
```json
{
  "success": true,
  "message": "Command already processed"
}
```

**Member not found (404):**
```json
{
  "success": false,
  "error": "Member not found"
}
```

**Command not found (404):**
```json
{
  "success": false,
  "error": "Command not found"
}
```

---

## Admin Endpoints

### POST /api/admin/aggregate

Triggers the aggregator Lambda to recompute views.

**Auth:** Not required (admin endpoints are currently public)

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `force` | `"true"` | `false` | Force full rebuild (reprocess all data) |

**Success (200):**
```json
{
  "success": true,
  "message": "Aggregation completed",
  "membersProcessed": 10,
  "viewsGenerated": ["dashboard.json", "members.json"],
  "durationMs": 4500
}
```

**Force rebuild (200):**
```json
{
  "success": true,
  "message": "Aggregation completed (force rebuild)",
  "membersProcessed": 10,
  "viewsGenerated": ["dashboard.json", "members.json"],
  "durationMs": 12000
}
```

**Aggregator not configured (500):**
```json
{
  "success": false,
  "error": "Aggregator function not configured"
}
```

**Aggregator failure (500):**
```json
{
  "success": false,
  "error": "Aggregator failed: Unhandled",
  "details": { "errorMessage": "...", "errorType": "..." }
}
```

### GET /api/admin/status

Returns system status information.

**Auth:** Not required

**Response (200):**
```json
{
  "success": true,
  "data": {
    "environment": "production",
    "bucket": "ccusage-data-dev",
    "region": "ap-southeast-1",
    "aggregatorFunction": "ccusage-monitor-dev-aggregator"
  }
}
```

### POST /api/admin/commands

Creates a new admin command for an agent to execute.

**Auth:** Not required

**Request body:**
```json
{
  "email": "user@example.com",
  "type": "force-sync",
  "payload": {},
  "created_by": "admin@example.com"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string (email) | Yes | Target member's email |
| `type` | enum | Yes | One of: `revoke-token`, `force-sync`, `update-config`, `custom` |
| `payload` | object | No | Additional command data (default: `{}`) |
| `created_by` | string | No | Who created the command (default: `"admin"`) |

**Success (200):**
```json
{
  "success": true,
  "commandId": "cmd-uuid-1",
  "memberId": "member-uuid-1",
  "memberName": "John Doe"
}
```

**No members registered (404):**
```json
{
  "success": false,
  "error": "No members registered"
}
```

**Member not found (404):**
```json
{
  "success": false,
  "error": "Member not found: unknown@example.com"
}
```

### GET /api/admin/commands/:memberId

View command history for a specific member.

**Auth:** Not required

**Path params:**

| Param | Type | Description |
|-------|------|-------------|
| `memberId` | string (UUID) | Member ID |

**Response (200):**
```json
{
  "success": true,
  "memberId": "member-uuid-1",
  "commands": [
    {
      "id": "cmd-uuid-1",
      "type": "force-sync",
      "payload": {},
      "createdAt": "2026-02-25T08:00:00.000Z",
      "createdBy": "admin@example.com",
      "status": "acked",
      "ackedAt": "2026-02-25T08:05:00.000Z",
      "result": "Sync completed"
    },
    {
      "id": "cmd-uuid-2",
      "type": "revoke-token",
      "payload": {},
      "createdAt": "2026-02-24T10:00:00.000Z",
      "createdBy": "admin",
      "status": "pending"
    }
  ]
}
```

**No commands (200):**
```json
{
  "success": true,
  "commands": []
}
```

---

## Auth Endpoints

### POST /api/auth/login

Authenticate with email and password. Returns JWT access and refresh tokens.

**Auth:** Not required

**Request body:**
```json
{
  "email": "user@example.com",
  "password": "secret123"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string (email) | Yes | User email |
| `password` | string | Yes | User password |

**Success (200):**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "email": "user@example.com",
    "name": "User Name",
    "role": "admin"
  }
}
```

**Invalid credentials (401):**
```json
{
  "success": false,
  "error": "Invalid email or password",
  "code": "INVALID_CREDENTIALS"
}
```

**User roles:** `admin`, `agent`, `member`

**User accounts:** Defined in `lambda-server/src/data/users.json` (hardcoded at build time). Passwords are SHA256 hashed.

### POST /api/auth/refresh

Exchange a refresh token for a new token pair.

**Auth:** Not required

**Request body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refreshToken` | string | Yes | Valid refresh token |

**Success (200):**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Invalid token (401):**
```json
{
  "success": false,
  "error": "Invalid or expired refresh token",
  "code": "INVALID_REFRESH_TOKEN"
}
```

**User no longer exists (401):**
```json
{
  "success": false,
  "error": "User no longer exists",
  "code": "USER_NOT_FOUND"
}
```

### POST /api/auth/logout

Logout the current session. This is a no-op on the server side -- the client is responsible for clearing stored tokens.

**Auth:** Required (Bearer token)

**Request body:** None

**Response (200):**
```json
{
  "success": true
}
```

### GET /api/auth/me

Returns the current authenticated user's info from the JWT payload.

**Auth:** Required (Bearer token)

**Response (200):**
```json
{
  "success": true,
  "user": {
    "email": "user@example.com",
    "name": "User Name",
    "role": "admin"
  }
}
```

**Unauthorized (401):**
```json
{
  "success": false,
  "error": "Unauthorized",
  "code": "AUTH_REQUIRED"
}
```

**Invalid token (401):**
```json
{
  "success": false,
  "error": "Invalid token",
  "code": "INVALID_TOKEN"
}
```

---

## Register Endpoints (Temporary In-Memory Store)

These endpoints provide a simple in-memory key-value store. Data is lost on Lambda cold start. Used for temporary registration workflows.

### GET /api/register

List all items in the store.

**Auth:** Not required

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "email": "user@example.com",
      "link": "https://setup-link.example.com/abc",
      "data": "custom-data-string"
    }
  ]
}
```

### PUT /api/register

Replace the entire store contents.

**Auth:** Not required

**Request body:**
```json
[
  {
    "email": "user@example.com",
    "link": "https://setup-link.example.com/abc",
    "data": "custom-data-string"
  }
]
```

**Success (200):**
```json
{
  "success": true,
  "data": [...]
}
```

**Invalid body (400):**
```json
{
  "success": false,
  "error": "Body must be an array"
}
```

### GET /api/register/link

Lookup a link by email.

**Auth:** Not required

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Email to look up |

**Success (200):**
```json
{
  "success": true,
  "link": "https://setup-link.example.com/abc"
}
```

**Not found (404):**
```json
{
  "success": false,
  "error": "Not found"
}
```

### POST /api/register/update

Update an item's link by matching on the `data` field.

**Auth:** Not required

**Request body:**
```json
{
  "data": "custom-data-string",
  "link": "https://new-link.example.com/xyz"
}
```

**Success (200):**
```json
{
  "success": true,
  "data": {
    "email": "user@example.com",
    "link": "https://new-link.example.com/xyz",
    "data": "custom-data-string"
  }
}
```

**Not found (404):**
```json
{
  "success": false,
  "error": "Not found"
}
```

---

## Common Error Responses

All endpoints follow a consistent error format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

**Standard error codes:**

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `VALIDATION_ERROR` | Request body or params failed validation |
| 400 | `INVALID_ENCODING` | Gzip decompression failed |
| 401 | `AUTH_REQUIRED` | Missing or invalid Authorization header |
| 401 | `INVALID_TOKEN` | JWT token expired or malformed |
| 401 | `INVALID_CREDENTIALS` | Wrong email/password |
| 401 | `INVALID_REFRESH_TOKEN` | Refresh token expired or invalid |
| 401 | `USER_NOT_FOUND` | User no longer exists (refresh flow) |
| 404 | `NOT_FOUND` | Resource not found |
| 500 | `INTERNAL_ERROR` | Server-side error |
| 503 | `SERVICE_UNAVAILABLE` | S3 temporarily unavailable |

**Global error handler:**
Any unhandled exception returns:
```json
{
  "success": false,
  "error": "Internal server error"
}
```
In development, the actual error message is returned instead.

---

## Request Encoding

The server supports gzip-compressed request bodies. If the `Content-Encoding: gzip` header is present on POST requests, the body is automatically decompressed before processing. This is primarily used by the agent to compress large sync payloads.

## CORS Configuration

CORS is configured per stage in `serverless.yml`:
- **dev:** `http://localhost:3000`, `http://127.0.0.1:3000`, `https://d1ohuii7czj4jp.cloudfront.net`
- **prod:** `https://d1ohuii7czj4jp.cloudfront.net`

In development (`NODE_ENV !== 'production'`), any `http://localhost:*` origin is allowed. Requests without an `Origin` header (e.g., curl, server-to-server) are allowed with `*`.
