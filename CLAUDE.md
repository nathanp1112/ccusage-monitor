# CCUsage Monitor

Team monitoring system for Claude Code usage tracking. Serverless architecture on AWS (Lambda + S3).

## Architecture

Three components, one shared S3 bucket per stage. Each does exactly one job:

| Component | Tech | Runs on | Job |
|-----------|------|---------|-----|
| **be-agent** | Node.js CLI (Commander) | Teammate's laptop (launchd/systemd) | Parse local Claude JSONL logs, push deltas to server |
| **lambda-server** | Hono on AWS Lambda | AWS Lambda + API Gateway | Receive pushes, persist to S3, serve read APIs. Hosts sync/read API Lambda + hourly aggregator Lambda |
| **dashboard** | Next.js 15 (static export) | S3 + CloudFront | Fetch pre-computed JSON views from Lambda API, render charts (Recharts) |

Only the agent writes data into the system. Only the aggregator produces dashboard-ready views. The dashboard is a pure reader.

### be-agent — data producer

**Where it scans** (`be-agent/src/lib/config.ts:discoverClaudePaths`):
- `~/.config/claude/projects/*` — alternate Claude Code location
- `~/.claude/projects/*` — default Claude Code location
- `~/.ccs/instances/*/projects/*` — CCS multi-instance setups

**How it reads** (`be-agent/src/lib/collector.ts`): keeps a byte offset + SHA-256 fingerprint of the first 512 bytes in `~/.ccusage-agent/config.json`. Only reads bytes appended since last sync. File truncation/rotation detected via fingerprint triggers re-read from byte 0.

**What it extracts per JSONL line:**
1. **Usage entry** — timestamp, request_id, session_id, project_path, model, token usage, costUSD
2. **File-extension counters** — from `Read|Edit|Write|Glob|NotebookEdit` tool_use blocks; drives "File Activity by Language" chart
3. **Project info** — `{path, gitRepo}` from each `cwd`, resolved via `git remote get-url origin`
4. **Prompts** — only for `type: "user"` lines with plain string content (tool results skipped)

**Server URL is baked in at build time** per stage. `--server` is only for local dev overrides.

### Three-Layer S3 Architecture

```
raw/           = "What happened"    (source of truth, individual entries)
aggregated/    = "What it means"    (pre-computed per-month summaries; written by sync
                                     AND refreshed hourly by the aggregator Lambda)
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
├── commands/{memberId}/queue.json              Admin command queue for agents
└── quotas/{memberId}.json                      Per-member quota state (feature disabled)

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

## API Endpoints

**Sync** (agent → server): `POST /api/sync`

**Dashboard** (dashboard → server):
- `GET /api/dashboard` — team-wide summary
- `GET /api/dashboard/model-distribution` — model usage breakdown
- `GET /api/dashboard/meta` — aggregator processing metadata
- `GET /api/members` — member list
- `GET /api/members/:id?year=2026` — member yearly detail
- `GET /api/members/:id/raw?year=&month=` — raw usage records

**Agent** (agent → server):
- `GET /api/agent/version` — latest agent version + presigned download URL
- `GET /api/agent/commands?email=...` — poll pending commands
- `POST /api/agent/commands/:commandId/ack` — acknowledge command

**Auth**: `/api/auth/{login,refresh,me,logout}` — JWT-based. Logout is stateless (client clears tokens).

**Admin** (currently **unauthenticated**):
- `POST /api/admin/aggregate?force=true` — trigger aggregator
- `POST /api/admin/commands` — create agent command
- `GET /api/admin/commands/:memberId` — command history
- `GET /api/admin/status` — system status
- `DELETE /api/admin/month/current` — hard-delete current-month data for all members
- `GET /api/admin/members/:id/prompts/months` — **JIT only**, 404 on dev
- `GET /api/admin/members/:id/prompts?year=&month=` — **JIT only**, 404 on dev

**Register** (temporary in-memory store, no auth): `GET/PUT /api/register`, `GET /api/register/link?email=...`, `POST /api/register/update`. Resets on cold start.

## Auth & Authorization

- Global JWT middleware at `lambda-server/src/app.ts:74-103` gates `/api/*` by default.
- **Public** (no token): `/api/auth/login`, `/api/auth/refresh`, `/api/admin/*`, `/api/sync`, `/api/register/*`, `/api/agent/*`, `/health`.
- **Protected** (Bearer required): `/api/dashboard/*`, `/api/members/*`.
- Token lifetimes (`lambda-server/src/lib/auth.ts:19-20`): access `60 min`, refresh `20 days`.
- Secret: `JWT_SECRET` env var. Production startup fails if unset.
- JWT payload carries `role: admin | agent | member`. No route enforces role today; prompt-viewer endpoints gate by **stage** (JIT only).

## Agent Commands

First-time setup:
```bash
npm install -g ./ccusage-agent-<version>.tgz
ccusage-agent setup --email user@example.com --interval 60
ccusage-agent sync --force
```

Runtime commands: `sync`, `sync --force`, `status`, `update`, `update --force`, `uninstall`.

Auto-start: macOS `~/Library/LaunchAgents/com.ccusage.agent.plist` (launchd), Linux `~/.config/systemd/user/ccusage-agent.service` (systemd). Config at `~/.ccusage-agent/config.json`.

## Release Process (Agent)

1. Bump version in `be-agent/package.json`, `src/commands/update.ts`, `src/lib/pusher.ts`.
2. Publish per stage (builds with stage-specific SERVER_URL baked in):
   ```bash
   ./scripts/publish-agent.sh --stage dev
   ./scripts/publish-agent.sh --stage jit
   ```

Teammates auto-update via `ccusage-agent update` (polls `/api/agent/version` → presigned download → global install → re-setup → sync --force).

## Deploy Process

All deploy scripts accept `--stage <dev|jit>`. Stage config is centralized in `scripts/stage-config.sh`.

```bash
# Orchestrator
./scripts/deploy.sh --stage dev                         # Deploy ALL modules
./scripts/deploy.sh --stage jit --only lambda           # Lambda only
./scripts/deploy.sh --stage dev --only lambda,dashboard # Multiple modules

# Individual
./scripts/deploy-lambda.sh --stage dev       # Serverless Framework
./scripts/deploy-dashboard.sh --stage jit    # S3 + CloudFront
./scripts/publish-agent.sh --stage dev       # Agent S3 releases
```

Trigger aggregation after deploys:
```bash
# dev
curl -X POST "https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com/api/admin/aggregate?force=true"
# jit
curl -X POST "https://eu9i1zr4x6.execute-api.ap-southeast-1.amazonaws.com/api/admin/aggregate?force=true"
```

## Development

```bash
cd lambda-server && pnpm dev                 # local dev
cd lambda-server && npx serverless offline   # emulate API Gateway (HTTP :3001 / Lambda :3002)
cd dashboard && pnpm dev                     # dashboard (configure API_SERVER_URL in .env.local)
cd be-agent && pnpm build                    # build agent
cd be-agent && pnpm start sync --dry-run     # test sync
```

## Key Design Patterns

- **Idempotent sync**: Dedup by `request_id` (entries) and `uuid` (prompts). Safe to re-sync.
- **ETag concurrency**: Member registry uses `IfMatch`/`IfNoneMatch` for concurrent writes.
- **Lazy route loading**: Hono app lazy-loads route modules to reduce Lambda cold start.
- **Presigned URLs**: Agent downloads use S3 presigned URLs (10 min expiry), no auth needed.
- **Batched uploads**: Entries at 1000/request, prompts at 500/request (avoid API Gateway 10 MB limit).
- **File-extension tracking**: `file_extensions` per entry extracted at `be-agent/src/lib/collector.ts:178-194`.
- **Hidden-email prefix filter**: `HIDDEN_EMAIL_PREFIXES` in `lambda-server/src/routes/members.ts:30` silently omits matching members from `/api/members`.
- **Lambda-first adapter**: `isLambdaResponse` in `dashboard/src/lib/api-adapters.ts` gates a transform that could branch to a legacy PostgreSQL shape — no PG backend exists, treat Lambda as the only backend.
- **Sync writes aggregated/ opportunistically**: non-blocking; aggregation failure doesn't fail the sync (`lambda-server/src/routes/sync.ts:481-489`).

## AWS Resources

- **Region**: `ap-southeast-1`
- **AWS Profile**: `2026-pik`
- **Deploy tool**: Serverless Framework v4. Not linked to Serverless dashboard — deploys go straight to CloudFormation stacks named `ccusage-monitor-{stage}`.

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
- `ccusage-monitor-{stage}-aggregator` — Aggregator (`aggregator.ts`). Runs on `rate(1 hour)` via EventBridge (`serverless.yml:86-89`), enabled in both stages. Manual re-trigger via `POST /api/admin/aggregate?force=true`.

## Dashboard Login Accounts

Per-stage in `lambda-server/src/data/users.{stage}.json` (SHA256 hashed). Stage derived from `BUCKET_NAME` env at runtime. Roles: `admin | agent | member`.
