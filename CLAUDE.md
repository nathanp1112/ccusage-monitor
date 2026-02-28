# CCUsage Monitor

Team monitoring system for Claude Code usage tracking. Serverless architecture on AWS (Lambda + S3).

## Architecture

```
┌─────────────┐  POST /api/sync  ┌──────────────┐  S3 read   ┌───────────────┐
│  be-agent   │─────────────────▶│ lambda-server │◀───────────│   dashboard   │
│ (local CLI) │                  │ (Hono+Lambda) │            │ (Next.js SPA) │
│             │  GET /api/agent  │               │  GET /api  │               │
│ Parse JSONL │◀─────────────────│ Store to S3   │───────────▶│ Display views │
│ + push data │   (commands,     │ + aggregate   │            │ (CloudFront)  │
│             │    updates)      │               │            │               │
└─────────────┘                  └───────┬───────┘            └───────────────┘
     ▲                                   │
     │                                   ▼
~/.claude/projects/*.jsonl         ┌──────────┐
~/.ccs/instances/*/projects/*      │    S3    │
                                   │ (single  │
                                   │  bucket) │
                                   └──────────┘
```

### Data Flow (End-to-End)

1. **Agent** parses `~/.claude/projects/*/*.jsonl` files on developer's machine
2. **Agent** sends structured JSON (entries, projects, prompts) via `POST /api/sync`
3. **Lambda sync endpoint** stores raw data in S3 (`raw/`) and computes pre-aggregated summaries (`aggregated/`)
4. **Aggregator Lambda** (triggered hourly or manually) reads `aggregated/` files and generates dashboard views (`views/`)
5. **Dashboard** fetches pre-computed `views/*.json` via Lambda API and renders charts

### Three-Layer S3 Architecture

```
raw/           = "What happened"    (source of truth, individual entries)
aggregated/    = "What it means"    (pre-computed per-month summaries, written by sync)
views/         = "What to show"     (dashboard-ready JSON, written by aggregator)
```

Each layer can be rebuilt from the one above: `raw/ → aggregated/ → views/`

## S3 Bucket Layout

```
INPUT LAYER (written by sync endpoint):
├── raw/{memberId}/{year}-{month}.json          All usage entries (source of truth)
├── aggregated/{memberId}/{year}-{month}.json   Pre-computed monthly summaries
├── members/index.json                          Member registry (email→id mapping)
├── sync-logs/{year}-{month}/{memberId}.json    Sync audit trail
├── projects/{memberId}.json                    Project list with git remotes
├── prompts/{memberId}/{year}-{month}.json      Prompt text archive (ISMS audit)
└── commands/{memberId}/queue.json              Admin command queue for agents

OUTPUT LAYER (written by aggregator):
└── views/
    ├── dashboard.json                          Team-wide summary stats
    ├── members.json                            Member list with current/prev month
    └── members/{memberId}/{year}.json          Per-member yearly detail

METADATA:
└── meta/last-processed.json                    Aggregation timestamp

RELEASES:
└── releases/
    ├── version.json                            Latest agent version manifest
    └── ccusage-agent-*.tgz                     Agent binaries for auto-update
```

## Components

| Component | Tech | Responsibility |
|-----------|------|----------------|
| `be-agent` | Node.js CLI (Commander) | Parse local JSONL logs, push to server, auto-update |
| `lambda-server` | Hono on AWS Lambda | Store raw data in S3, serve views, admin commands |
| `dashboard` | Next.js 15 (static export) | Fetch views, render charts (Recharts), CloudFront hosted |

## API Endpoints

### Sync (Agent → Server)
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/sync` | Receive entries, projects, prompts from agent |

### Dashboard (Dashboard → Server)
| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/dashboard` | Team-wide summary from `views/dashboard.json` |
| `GET` | `/api/dashboard/model-distribution` | Model usage breakdown (subset of dashboard) |
| `GET` | `/api/dashboard/meta` | Aggregator processing metadata (last run, duration) |
| `GET` | `/api/members` | Member list from `views/members.json` |
| `GET` | `/api/members/:id?year=2026` | Member yearly detail from `views/members/{id}/{year}.json` |
| `GET` | `/api/members/:id/raw?year=&month=` | Raw usage records for inspection |

### Agent (Agent → Server)
| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/agent/version` | Latest agent version + presigned download URL |
| `GET` | `/api/agent/commands?email=...` | Poll pending commands |
| `POST` | `/api/agent/commands/:commandId/ack` | Acknowledge command execution |

### Admin
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/admin/aggregate` | Trigger aggregator (`?force=true` for full rebuild) |
| `POST` | `/api/admin/commands` | Create command for agent (revoke-token, force-sync, etc.) |
| `GET` | `/api/admin/commands/:memberId` | View command history |
| `GET` | `/api/admin/status` | System status |

### Register (Temporary In-Memory Store)
| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/register` | List all registration items |
| `PUT` | `/api/register` | Replace entire registration list |
| `GET` | `/api/register/link?email=...` | Get dashboard link for email |
| `POST` | `/api/register/update` | Update link by data field match |

Data persists across Lambda warm invocations, resets on cold start. No auth required.

## Key Files

### be-agent (Local CLI)
- `src/lib/collector.ts` — Parse JSONL files, extract entries + projects + prompts
- `src/lib/pusher.ts` — Batch + retry push to server (entries@1000/batch, prompts@500/batch)
- `src/lib/config.ts` — Config + state management (`~/.ccusage-agent/config.json`)
- `src/lib/commander.ts` — Poll and execute admin commands (revoke-token, force-sync)
- `src/lib/pricing.ts` — Token cost calculation
- `src/commands/setup.ts` — Initial setup (config + launchd/systemd)
- `src/commands/push.ts` — Manual sync (`ccusage-agent sync`)
- `src/commands/update.ts` — Self-update from S3 releases
- `src/commands/status.ts` — Check agent status
- `src/commands/uninstall.ts` — Remove auto-start service
- `src/daemon.ts` — Auto-start service setup (launchd on macOS, systemd on Linux)

### lambda-server (Serverless Backend)
- `src/app.ts` — Hono app with lazy-loaded routes (minimize cold start)
- `src/lambda.ts` — Lambda handler entry point
- `src/aggregator.ts` — Aggregator Lambda: reads aggregated/ → writes views/
- `src/routes/sync.ts` — POST /api/sync (entry point for all agent data)
- `src/routes/dashboard.ts` — GET /api/dashboard
- `src/routes/members.ts` — GET /api/members, /api/members/:id
- `src/routes/agent.ts` — Agent-facing endpoints (version, commands)
- `src/routes/admin.ts` — Admin endpoints (aggregate trigger, command management)
- `src/routes/register.ts` — In-memory temporary registration store
- `src/lib/s3.ts` — S3 helpers, key patterns, ETag support, retry logic, cost math
- `src/lib/types.ts` — All TypeScript type definitions
- `src/lib/aggregation.ts` — Shared aggregation logic (used by sync + aggregator)

### dashboard (Frontend SPA)
- `src/hooks/use-dashboard.ts` — Dashboard data fetching (TanStack Query)
- `src/hooks/use-members.ts` — Members list + detail fetching
- `src/lib/api-adapters.ts` — Transform Lambda API → frontend format
- `src/lib/api-client.ts` — HTTP client with retry
- `src/components/members/` — Member detail modal, charts, ranking
- `src/components/charts/` — Recharts visualizations
- `src/components/shared/` — Reusable: PageHeader, StatsBar, DataSheet, etc.

### scripts/
- `deploy.sh` — Orchestrator: deploy one or more modules with `--stage`
- `deploy-lambda.sh` — Deploy lambda-server via Serverless Framework
- `deploy-dashboard.sh` — Build + upload dashboard to S3 + invalidate CloudFront
- `publish-agent.sh` — Build + pack + upload agent to S3 releases
- `stage-config.sh` — Shared stage → AWS resource mapping (sourced by all deploy scripts)
- `test-api.sh` — Test backend endpoints
- `upload-usage.mjs` — Manual data upload utility

## Agent Setup & Commands

### First-time setup (manual, one-time)
```bash
npm install -g ./ccusage-agent-<version>.tgz
ccusage-agent setup --email user@example.com --interval 60
ccusage-agent sync --force
```

The server URL is baked into the binary at build time (per stage). No `--server` needed.
Use `--server <url>` only to override the built-in URL (e.g. local dev).
Setup also fetches a dashboard registration link from `/api/register/link?email=...`.

### Agent commands
```bash
ccusage-agent sync              # Incremental sync (since last sync)
ccusage-agent sync --force      # Full historical sync
ccusage-agent status            # Show config and sync state
ccusage-agent update            # Auto-update to latest version from S3
ccusage-agent update --force    # Force re-download even if same version
ccusage-agent uninstall         # Remove launchd/systemd auto-start
```

### Agent auto-start
After setup, the agent runs automatically:
- **macOS**: `~/Library/LaunchAgents/com.ccusage.agent.plist` (launchd)
- **Linux**: `~/.config/systemd/user/ccusage-agent.service` (systemd)

### Agent config location
`~/.ccusage-agent/config.json` — stores server_url, email, interval, sync state

## Release Process (Agent)

```bash
# 1. Update version in be-agent/package.json and src/commands/update.ts and src/lib/pusher.ts
# 2. Publish to each stage (builds with stage-specific SERVER_URL baked in):
./scripts/publish-agent.sh --stage dev   # Builds with dev Lambda URL → uploads to ccusage-data-dev
./scripts/publish-agent.sh --stage jit   # Builds with jit Lambda URL → uploads to ccusage-data-jit
```

Teammates auto-update via `ccusage-agent update` (checks `/api/agent/version` → downloads presigned URL → installs globally → re-runs setup → sync --force).

## Deploy Process

All deploy scripts accept `--stage <dev|jit>`. Stage config is centralized in `scripts/stage-config.sh`.

### Orchestrator (deploy all or specific modules)
```bash
./scripts/deploy.sh --stage dev                         # Deploy ALL modules
./scripts/deploy.sh --stage jit --only lambda           # Lambda only
./scripts/deploy.sh --stage dev --only dashboard        # Dashboard only
./scripts/deploy.sh --stage jit --only agent            # Agent only
./scripts/deploy.sh --stage dev --only lambda,dashboard # Multiple modules
```

### Individual module deploys
```bash
./scripts/deploy-lambda.sh --stage dev       # Lambda server (Serverless Framework)
./scripts/deploy-dashboard.sh --stage jit    # Dashboard (S3 + CloudFront)
./scripts/publish-agent.sh --stage dev       # Agent (S3 releases)
```

### Trigger aggregation (after deploy or data changes)
```bash
# dev
curl -X POST "https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com/api/admin/aggregate?force=true"
# jit
curl -X POST "https://eu9i1zr4x6.execute-api.ap-southeast-1.amazonaws.com/api/admin/aggregate?force=true"
```

## Development

```bash
# Start lambda server locally
cd lambda-server && pnpm dev

# Start dashboard (dev mode with API proxy)
cd dashboard && pnpm dev
# Configure API_SERVER_URL in dashboard/.env.local

# Build agent locally
cd be-agent && pnpm build

# Test sync manually
cd be-agent && pnpm start sync --dry-run
```

## Key Design Patterns

- **Idempotent sync**: Dedup by `request_id` (agent + server side). Safe to re-sync.
- **ETag concurrency**: Member registry uses `IfMatch`/`IfNoneMatch` for concurrent writes.
- **Lazy route loading**: Hono app lazy-loads route modules to reduce Lambda cold start.
- **Presigned URLs**: Agent downloads use S3 presigned URLs (10 min expiry), no auth needed.
- **Batched uploads**: Entries batched at 1000/request, prompts at 500/request (avoid API Gateway 10MB limit).
- **Dual API support**: Dashboard adapters handle both Lambda and legacy PostgreSQL formats.

## AWS Resources

- **Region**: `ap-southeast-1`
- **AWS Profile**: `2026-pik`
- **Serverless Org**: `piktekk` (user: `pikt@qa.team`)

### Per-Stage Resources

| Resource | dev | jit |
|----------|-----|-----|
| **Lambda API URL** | `https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com` | `https://eu9i1zr4x6.execute-api.ap-southeast-1.amazonaws.com` |
| **S3 Data Bucket** | `ccusage-data-dev` | `ccusage-data-jit` |
| **S3 Dashboard Bucket** | `cc-usage-monitor-tvf` | `cc-usage-monitor-jit` |
| **CloudFront Dist ID** | `E1W8WZ55TBZY1P` | `E3W5CFHO5Z8UU2` |
| **CloudFront Domain** | `d1ohuii7czj4jp.cloudfront.net` | `dg2i6v0xgt3mw.cloudfront.net` |

### Lambda Functions (per stage)
- `ccusage-monitor-{stage}-api` — API handler (`lambda.ts`)
- `ccusage-monitor-{stage}-aggregator` — Aggregator (`aggregator.ts`)

## Dashboard Login Accounts

Accounts are stored in `lambda-server/src/data/users.json` (SHA256 hashed passwords).

| Email | Password | Role |
|-------|----------|------|
| `nghia@techvify.com.vn` | `admin123` | admin |
| `nghiapham@techvify.com.vn` | `admin123` | admin |
| `user@tvf.co.jp` | `agent123` | agent |
| `member@techvify.com.vn` | `member123` | member |

## Data Paths Scanned (Agent)

The agent automatically discovers and scans:
- `~/.claude/projects/*` — Native Claude Code
- `~/.config/claude/projects/*` — Alternative location
- `~/.ccs/instances/*/projects/*` — CCS multi-instance setups

## Multi-Device Support

When the same email runs agents on multiple devices:
- Data is merged under the same member account (lookup by email)
- Duplicate records are skipped (deduplication by `request_id`)
- Sync logs track hostname, IP, and user agent per device
