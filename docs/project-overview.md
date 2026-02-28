# CCUsage Monitor -- Project Overview

## Executive Summary

CCUsage Monitor is a team monitoring system for tracking Claude Code usage across an engineering organization. It collects token consumption and cost data from individual developer machines, aggregates it in a serverless backend on AWS, and presents interactive dashboards for team-wide visibility.

The system follows a three-component architecture:

1. **be-agent** -- A CLI tool installed on each developer's machine that parses local Claude Code log files and pushes structured usage data to the server.
2. **lambda-server** -- A serverless API backend (AWS Lambda + S3) that ingests raw data, computes pre-aggregated summaries, and serves dashboard-ready views.
3. **dashboard** -- A static single-page application (Next.js) deployed to S3 and served via CloudFront, providing charts, rankings, and per-member drill-down views.

**Primary language:** TypeScript across all three components.
**Infrastructure:** AWS Lambda, S3, API Gateway, CloudFront, EventBridge.
**Region:** ap-southeast-1 (Singapore).

---

## Architecture Overview

```
Developer Machine                    AWS Cloud
┌───────────────────┐               ┌──────────────────────────────────────────┐
│                   │  POST         │           API Gateway (HTTP API)         │
│   be-agent        │  /api/sync    │  ┌────────────────────────────────────┐  │
│   (ccusage-agent) │──────────────▶│  │  Lambda: API Handler (512MB/29s)  │  │
│                   │               │  │  Hono framework, JWT auth         │  │
│ Parse ~/.claude/  │  GET          │  │  Routes: sync, dashboard, members │  │
│ projects/*.jsonl  │  /api/agent/* │  └───────────────┬──────────────────┘  │
│                   │◀──────────────│                  │                      │
│ launchd (macOS)   │               │                  ▼                      │
│ systemd (Linux)   │               │  ┌────────────────────────────────────┐  │
└───────────────────┘               │  │         S3: ccusage-data-dev       │  │
                                    │  │                                    │  │
                                    │  │  raw/          (source of truth)   │  │
                                    │  │  aggregated/   (monthly summaries) │  │
                                    │  │  views/        (dashboard JSON)    │  │
                                    │  │  members/      (registry)          │  │
                                    │  │  sync-logs/    (audit trail)       │  │
                                    │  │  projects/     (git repos)         │  │
                                    │  │  prompts/      (ISMS audit)        │  │
                                    │  │  commands/     (admin queue)       │  │
                                    │  │  releases/     (agent binaries)    │  │
                                    │  └───────────────┬──────────────────┘  │
                                    │                  ▲                      │
                                    │  ┌───────────────┴──────────────────┐  │
Browser                             │  │  Lambda: Aggregator (1024MB/300s) │  │
┌───────────────────┐               │  │  EventBridge: hourly schedule     │  │
│                   │  GET          │  │  Reads aggregated/ -> views/      │  │
│   dashboard       │  /api/*      │  └────────────────────────────────────┘  │
│   (Next.js SPA)   │──────────────▶│                                        │
│                   │               └──────────────────────────────────────────┘
│ CloudFront CDN    │
│ S3 static hosting │
└───────────────────┘
```

---

## Data Flow

### End-to-End Pipeline

```
1. Collect     2. Push          3. Store & Aggregate     4. Compute Views     5. Display
─────────────────────────────────────────────────────────────────────────────────────────
~/.claude/    POST /api/sync   raw/{memberId}/           views/dashboard.json  Dashboard
projects/     (batched,        {year}-{month}.json       views/members.json    SPA
*.jsonl       gzipped)         aggregated/{memberId}/    views/members/{id}/   (Recharts)
                               {year}-{month}.json       {year}.json
```

**Step 1 -- Collect:** The agent scans JSONL log files from Claude Code directories on the developer's machine. It uses per-file byte offsets to read only new data appended since the last sync, making incremental collection efficient.

**Step 2 -- Push:** Collected entries, project metadata, and prompt text are batched (entries at 1000 per request, prompts at 500 per request) and sent to the server via POST /api/sync. Request bodies are gzip-compressed to stay within API Gateway's 10MB payload limit.

**Step 3 -- Store and Aggregate:** The sync endpoint deduplicates by `request_id`, stores entries in `raw/`, and immediately computes updated monthly summaries in `aggregated/`. The member registry, sync logs, project lists, and prompt archives are updated atomically with ETag-based concurrency control.

**Step 4 -- Compute Views:** An Aggregator Lambda, triggered hourly by EventBridge, reads all `aggregated/` files and produces dashboard-ready JSON views in `views/`. These views contain pre-computed totals, trends, rankings, and model breakdowns.

**Step 5 -- Display:** The dashboard SPA fetches pre-computed view files through the API Lambda and renders them using Recharts. No computation happens at read time -- the views are served as-is from S3.

### Three-Layer S3 Architecture

| Layer | S3 Prefix | Purpose | Written By |
|-------|-----------|---------|------------|
| **Raw** | `raw/` | Source of truth. Individual usage entries grouped by member and month. | Sync endpoint |
| **Aggregated** | `aggregated/` | Pre-computed monthly summaries with daily breakdowns, model stats, and project distributions. | Sync endpoint |
| **Views** | `views/` | Dashboard-ready JSON. Team summary, member list, per-member yearly detail. | Aggregator Lambda |

Each layer can be rebuilt from the one above it: `raw/ -> aggregated/ -> views/`. The `force=true` parameter on the admin aggregate endpoint triggers a full rebuild from raw data.

---

## Component Details

### be-agent (ccusage-agent v0.5.0)

A Node.js CLI tool installed globally on each developer's machine.

| Aspect | Detail |
|--------|--------|
| **Package name** | `ccusage-agent` |
| **Version** | 0.5.0 |
| **Entry point** | `dist/index.js` (ESM) |
| **Build tool** | tsup |
| **Runtime** | Node.js |
| **Key dependencies** | Commander (CLI framework), tinyglobby (file discovery), undici (HTTP client) |

**Responsibilities:**
- Parse `~/.claude/projects/**/*.jsonl` files to extract usage entries (model, tokens, cost, timestamps)
- Discover projects by resolving `git remote get-url origin` from working directory paths found in JSONL data
- Extract user prompt text for ISMS audit compliance
- Push data to the server in batches with gzip compression and retry logic
- Auto-start via launchd (macOS) or systemd (Linux) for background operation
- Self-update by checking `/api/agent/version` and downloading new tarballs from S3 presigned URLs
- Poll and execute admin commands (revoke-token, force-sync, update-config)

**Data paths scanned:**
- `~/.claude/projects/*` -- Native Claude Code
- `~/.config/claude/projects/*` -- Alternative location
- `~/.ccs/instances/*/projects/*` -- CCS multi-instance setups

**CLI commands:**
| Command | Description |
|---------|-------------|
| `ccusage-agent setup` | Initial configuration (server URL, email, sync interval, auto-start service) |
| `ccusage-agent sync` | Incremental sync (since last sync) |
| `ccusage-agent sync --force` | Full historical sync |
| `ccusage-agent status` | Display config, sync state, tracked files |
| `ccusage-agent update` | Self-update from S3 releases |
| `ccusage-agent uninstall` | Remove auto-start service |

**Config location:** `~/.ccusage-agent/config.json`

---

### lambda-server (ccusage-lambda-server v0.1.0)

A serverless API backend deployed via Serverless Framework v4.

| Aspect | Detail |
|--------|--------|
| **Package name** | `ccusage-lambda-server` |
| **Version** | 0.1.0 |
| **Framework** | Hono (lightweight web framework for Lambda) |
| **Build tool** | tsup (for local dev), Serverless Framework esbuild (for Lambda deploy) |
| **Runtime** | Node.js 20.x on AWS Lambda |
| **Key dependencies** | Hono, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner, @aws-sdk/client-lambda, Zod |

**Two Lambda functions:**

| Function | Memory | Timeout | Trigger | Purpose |
|----------|--------|---------|---------|---------|
| **API Handler** | 512 MB | 29 sec | API Gateway (HTTP API, catch-all) | Sync ingestion, dashboard reads, agent endpoints, admin operations |
| **Aggregator** | 1024 MB | 300 sec | EventBridge (hourly) + manual trigger | Read aggregated data, compute and write dashboard views |

**API Endpoints:**

| Category | Method | Path | Purpose |
|----------|--------|------|---------|
| **Auth** | POST | `/api/auth/login` | Authenticate user, return JWT tokens |
| **Auth** | POST | `/api/auth/refresh` | Refresh access token |
| **Sync** | POST | `/api/sync` | Receive entries, projects, prompts from agent |
| **Dashboard** | GET | `/api/dashboard` | Team-wide summary from views/dashboard.json |
| **Dashboard** | GET | `/api/dashboard/model-distribution` | Model usage breakdown |
| **Dashboard** | GET | `/api/dashboard/meta` | Aggregator metadata (last run, duration) |
| **Members** | GET | `/api/members` | Member list from views/members.json |
| **Members** | GET | `/api/members/:id` | Member yearly detail (query: `?year=2026`) |
| **Members** | GET | `/api/members/:id/raw` | Raw usage records (query: `?year=&month=`) |
| **Agent** | GET | `/api/agent/version` | Latest agent version + presigned download URL |
| **Agent** | GET | `/api/agent/commands` | Poll pending commands (query: `?email=...`) |
| **Agent** | POST | `/api/agent/commands/:commandId/ack` | Acknowledge command execution |
| **Admin** | POST | `/api/admin/aggregate` | Trigger aggregation (`?force=true` for full rebuild) |
| **Admin** | POST | `/api/admin/commands` | Create command for agent |
| **Admin** | GET | `/api/admin/commands/:memberId` | View command history |
| **Admin** | GET | `/api/admin/status` | System status |
| **Health** | GET | `/health` | Health check |

**Authentication:**
- JWT-based with HS256 signing
- Access tokens: 60-minute expiry
- Refresh tokens: 20-day expiry
- Public endpoints (no auth): `/api/auth/login`, `/api/auth/refresh`, `/api/sync`, `/api/agent/*`, `/api/admin/*`, `/api/register/*`
- Protected endpoints require `Authorization: Bearer <token>` header

**Key design patterns:**
- Lazy route loading: Route modules are dynamically imported on first request to minimize cold start time
- Gzip decompression middleware: Handles compressed request bodies from the agent
- ETag concurrency: Member registry updates use S3 conditional writes (IfMatch/IfNoneMatch) to handle concurrent agent syncs safely

---

### dashboard (ccusage-dashboard v0.1.0)

A static single-page application deployed to S3 with CloudFront CDN.

| Aspect | Detail |
|--------|--------|
| **Package name** | `ccusage-dashboard` |
| **Version** | 0.1.0 |
| **Framework** | Next.js 15.1 (App Router, static export, Turbopack for dev) |
| **UI** | React 19, Tailwind CSS 4, Radix UI primitives |
| **State** | TanStack Query 5 (server state), Zustand 5 (UI state) |
| **Charts** | Recharts 2.15 |
| **Validation** | Zod, React Hook Form |

**Pages and features:**

| Route | Feature | Description |
|-------|---------|-------------|
| `/` | Dashboard | Team cost summary, daily trend chart, model distribution (treemap/pie toggle), top members |
| `/members` | Members | Ranked list with medals, card grid, treemap chart; sorting by cost/tokens; member detail via slide-over modal |
| `/login` | Login | JWT authentication form |

**Key architectural decision -- Modal-based navigation:** Member detail views open in a slide-over sheet (`DataSheet` component) rather than navigating to a separate page. This eliminates the need for CloudFront URL rewrite rules, since all routes resolve to `index.html` without server-side configuration. Shareable URLs use query parameters: `/members?detail=<memberId>`.

**Data flow:** TanStack Query hooks fetch pre-computed view JSON from the Lambda API. The frontend performs no aggregation -- all totals, trends, and breakdowns arrive ready to render. API adapters handle response format differences between the Lambda backend and a legacy PostgreSQL backend for backward compatibility.

---

## S3 Bucket Layout

```
ccusage-data-dev/
│
│  INPUT LAYER (written by sync endpoint)
├── raw/{memberId}/{year}-{month}.json            Usage entries (source of truth)
├── aggregated/{memberId}/{year}-{month}.json     Pre-computed monthly summaries
├── members/index.json                            Member registry (email-to-id mapping)
├── sync-logs/{year}-{month}/{memberId}.json      Sync audit trail (90-day retention)
├── projects/{memberId}.json                      Project list with git remotes
├── prompts/{memberId}/{year}-{month}.json        Prompt text archive (ISMS audit)
├── commands/{memberId}/queue.json                Admin command queue for agents
│
│  OUTPUT LAYER (written by aggregator)
├── views/
│   ├── dashboard.json                            Team-wide summary statistics
│   ├── members.json                              Member list with current/previous month
│   └── members/{memberId}/{year}.json            Per-member yearly detail
│
│  METADATA
├── meta/last-processed.json                      Aggregation timestamp and stats
│
│  RELEASES
└── releases/
    ├── version.json                              Latest agent version manifest
    └── ccusage-agent-*.tgz                       Agent binaries for auto-update
```

---

## AWS Infrastructure

### Resource Inventory

| Resource | Identifier | Configuration |
|----------|-----------|---------------|
| **API Lambda** | `ccusage-monitor-dev-api` | 512 MB memory, 29s timeout, Node.js 20.x, x86_64 |
| **Aggregator Lambda** | `ccusage-monitor-dev-aggregator` | 1024 MB memory, 300s timeout, Node.js 20.x, x86_64 |
| **API Gateway** | HTTP API | Endpoint: `https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com` |
| **S3 (Data)** | `ccusage-data-dev` | SSE-KMS encryption, versioning enabled, 90-day sync-log lifecycle |
| **S3 (Dashboard)** | `cc-usage-monitor-tvf` | Static website hosting |
| **CloudFront** | `E1W8WZ55TBZY1P` | CDN for dashboard SPA |
| **EventBridge** | Hourly schedule rule | Triggers Aggregator Lambda every hour |
| **CloudWatch** | Log groups, alarms | 30-day log retention; alarms for API errors (>5/5min), Aggregator errors (>1/5min), API Gateway 5xx (>10/5min) |
| **Region** | `ap-southeast-1` | Singapore |

### IAM Permissions

The Lambda execution role has access to:
- S3: GetObject, PutObject, DeleteObject, ListBucket on the data bucket
- KMS: Decrypt, GenerateDataKey (for SSE-KMS encrypted objects)
- Lambda: InvokeFunction on the Aggregator (for manual trigger from admin endpoint)

### S3 Bucket Security

- All public access blocked (BlockPublicAcls, BlockPublicPolicy, IgnorePublicAcls, RestrictPublicBuckets)
- Server-side encryption with AWS KMS (bucket key enabled for cost optimization)
- Versioning enabled for data protection
- Lifecycle policy: sync-logs automatically deleted after 90 days

---

## Key Design Decisions

### Pre-computed Views Pattern
Rather than computing aggregations at read time, the system writes dashboard-ready JSON files during ingestion (sync endpoint) and periodic aggregation (Aggregator Lambda). Dashboard API endpoints serve these files directly from S3, resulting in consistently fast read latency regardless of data volume.

### Idempotent Sync with Deduplication
Every usage entry carries a unique `request_id`. Both the agent (client-side) and the sync endpoint (server-side) deduplicate by this identifier. This makes sync operations safe to retry and allows multiple devices under the same email to push data without creating duplicates.

### Byte-Offset Incremental Collection
The agent tracks per-file byte offsets rather than timestamps. Since JSONL files are append-only, the agent reads only new bytes appended since the last sync. If a file is truncated (size smaller than recorded offset), it re-reads from the beginning.

### ETag Concurrency Control
The member registry (`members/index.json`) uses S3 conditional writes with ETags to prevent lost updates when multiple agents sync concurrently for different members. On conflict, the sync endpoint retries with the latest ETag.

### Lazy Route Loading
The Hono application dynamically imports route modules on first request rather than loading all routes at startup. This reduces Lambda cold start time by deferring the cost of importing heavy dependencies (S3 SDK, Zod schemas) until they are needed.

### Modal-Based Detail Views
The dashboard uses slide-over modals for member detail views instead of dedicated routes. This avoids the need for CloudFront URL rewrite rules and keeps the static export compatible with simple S3 hosting. Shareable state is encoded in query parameters.

### Gzip Request Compression
The agent compresses sync request bodies with gzip. A middleware layer in the Hono application handles decompression. In production, API Gateway may auto-decompress; the middleware serves as both a local development handler and a production safety net.

---

## Development Workflow

### Local Development

```bash
# Start the Lambda server locally (port 3001)
cd lambda-server && pnpm dev

# Start the dashboard with API proxy (port 3000)
cd dashboard && pnpm dev
# Configure API_SERVER_URL=http://localhost:3001 in dashboard/.env.local

# Build the agent locally
cd be-agent && pnpm build

# Test a manual sync (dry run)
cd be-agent && pnpm start sync --dry-run
```

### Deployment

```bash
# Deploy Lambda functions
cd lambda-server && pnpm deploy:dev

# Deploy dashboard to S3 + CloudFront
./scripts/deploy-dashboard-s3.sh

# Publish new agent version
./scripts/publish-agent.sh

# Trigger full view rebuild
curl -X POST "https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com/api/admin/aggregate?force=true"
```

### Agent Release Process

1. Update version in `be-agent/package.json`, `src/commands/update.ts`, and `src/lib/pusher.ts`
2. Run `./scripts/publish-agent.sh` (builds, packs tgz, uploads to S3 releases/, updates version.json)
3. Teammates auto-update via the agent's built-in update mechanism (checks `/api/agent/version`, downloads presigned URL, installs globally, re-runs setup, triggers force sync)

---

## Multi-Device Support

When the same email address runs agents on multiple devices (e.g., a developer's laptop and desktop):

- Data is merged under the same member account (lookup by email in member registry)
- Duplicate records are skipped via `request_id` deduplication
- Sync logs track hostname, local IP, public IP, and user agent per device for audit visibility

---

## Technology Summary

| Component | Runtime | Framework | Build | Test |
|-----------|---------|-----------|-------|------|
| **be-agent** | Node.js | Commander | tsup | Vitest |
| **lambda-server** | Node.js 20.x (Lambda) | Hono | Serverless Framework + esbuild | Vitest |
| **dashboard** | Browser (static) | Next.js 15, React 19 | Next.js static export | Vitest + Testing Library |

| Category | Technologies |
|----------|-------------|
| **Cloud** | AWS Lambda, S3, API Gateway (HTTP API), CloudFront, EventBridge, CloudWatch, KMS |
| **Auth** | JWT (HS256), 60min access tokens, 20-day refresh tokens |
| **IaC** | Serverless Framework v4 |
| **Language** | TypeScript 5.7 across all components |
| **Package manager** | pnpm |
| **Styling** | Tailwind CSS 4, Radix UI |
| **Charts** | Recharts 2.15 |
| **Validation** | Zod |
| **HTTP** | undici (agent), Hono (server), TanStack Query (dashboard) |
