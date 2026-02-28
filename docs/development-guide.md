# CCUsage Monitor - Development Guide

> Generated 2026-02-25. Covers local development, building, testing, and deployment for all three components.

## Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| Node.js | >= 20.x | Runtime for all components |
| pnpm | 10.24.0 | Package manager (dashboard enforces via `packageManager` field) |
| AWS CLI | v2 | Deployment and S3 operations |
| AWS Profile | `2026-pik` | IAM credentials for deployment |
| Region | `ap-southeast-1` | All AWS resources are in Singapore |

Optional:

| Tool | Purpose |
|------|---------|
| Serverless Framework v4 | Lambda deployment (`pnpm deploy` in lambda-server) |
| tsx | TypeScript execution for local dev (`pnpm dev` in lambda-server and be-agent) |

### AWS Credentials Setup

```bash
aws configure --profile 2026-pik
# AWS Access Key ID: <your-key>
# AWS Secret Access Key: <your-secret>
# Default region name: ap-southeast-1
# Default output format: json

# Verify access
aws s3 ls s3://ccusage-data-dev/ --profile 2026-pik --region ap-southeast-1
```

## Project Structure

```
ccusage-monitor/
├── be-agent/        # CLI agent (Commander.js, undici)
├── lambda-server/   # Serverless backend (Hono, AWS Lambda, S3)
├── dashboard/       # Frontend SPA (Next.js 15, React 19)
└── scripts/         # Deploy and utility scripts
```

Each component is an independent package with its own `package.json`, build pipeline, and test suite.

---

## Local Development

### Lambda Server (Backend API)

The lambda server runs locally using `@hono/node-server` on port 3001. It connects to the real S3 bucket using your AWS credentials, so you are working with production data.

```bash
cd lambda-server
pnpm install

# Create .env for local development
cat > .env << 'EOF'
BUCKET_NAME=ccusage-data-dev
AWS_REGION=ap-southeast-1
AWS_PROFILE=2026-pik
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
JWT_SECRET=dev-secret-key-do-not-use-in-production
AGGREGATOR_FUNCTION_NAME=ccusage-monitor-dev-aggregator
EOF

pnpm dev          # tsx watch src/index.ts -> http://localhost:3001
```

Alternatively, use serverless-offline for a closer Lambda simulation:

```bash
cd lambda-server
pnpm dev:lambda   # serverless offline -> http://localhost:3001
```

**Environment variables:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BUCKET_NAME` | Yes (for S3 ops) | `ccusage-data-dev` | S3 bucket for data storage |
| `JWT_SECRET` | No (dev only) | `dev-secret-key-do-not-use-in-production` | Secret for JWT signing |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000,http://127.0.0.1:3000` | CORS allowed origins (comma-separated) |
| `AGGREGATOR_FUNCTION_NAME` | No | None | Lambda function name for aggregate trigger |
| `AWS_REGION` | No | `ap-southeast-1` | AWS region for S3/Lambda clients |
| `NODE_ENV` | No | `development` | Environment flag |
| `PORT` | No | `3001` | Local dev server port |

**Notes:**
- Local dev requires valid AWS credentials to access S3. Set `AWS_PROFILE=2026-pik` or configure credentials.
- The health check endpoint at `GET /health` does not require auth and returns bucket configuration.
- Routes are lazy-loaded via dynamic `import()` to mirror Lambda cold-start behavior.

### Dashboard (Frontend SPA)

The dashboard runs on Next.js 15 with Turbopack on port 3000.

```bash
cd dashboard
pnpm install
pnpm dev          # next dev --turbopack -> http://localhost:3000
```

**Environment variables** (create `dashboard/.env.local`):

```bash
# For local development: proxy API calls to local lambda server
API_SERVER_URL=http://localhost:3001

# For static export builds pointing to production:
# NEXT_PUBLIC_API_URL=https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com
```

| Variable | Used In | Purpose |
|----------|---------|---------|
| `API_SERVER_URL` | Server-side (dev) | Backend URL for Next.js rewrites |
| `NEXT_PUBLIC_API_URL` | Client-side (static export) | Direct API URL when deployed to S3 |
| `STATIC_EXPORT` | Build time | Enable static export mode (`true` for S3 deploy) |

**API Proxy Pattern:**
- In development: Next.js rewrites `/api/*` to `${API_SERVER_URL}/api/*`
- In static export: Client-side code uses `NEXT_PUBLIC_API_URL` directly (no server-side proxy)

### Agent (CLI Tool)

The agent is typically installed globally, but for development:

```bash
cd be-agent
pnpm install
pnpm build        # tsup src/index.ts --format esm --dts --clean -> dist/

# Run commands directly
pnpm start sync --dry-run         # Preview what would be synced
pnpm start sync --force --verbose # Full sync with detailed output
pnpm start status                 # Show config and state

# Or use tsx for development (no build needed)
pnpm dev sync --dry-run           # tsx src/index.ts sync --dry-run
```

**Agent config location:** `~/.ccusage-agent/config.json`

Example config:
```json
{
  "server_url": "http://localhost:3001",
  "email": "dev@example.com",
  "sync_interval_minutes": 5,
  "max_batch_size": 1000,
  "retry_attempts": 3,
  "prompt_sync_interval_hours": 24
}
```

**Agent state location:** `~/.ccusage-agent/state.json`

Contains per-file byte offsets (for incremental reads), last sync timestamp, token counts, and JWT tokens.

**Data paths scanned automatically:**
- `~/.claude/projects/` -- native Claude Code
- `~/.config/claude/projects/` -- alternative location
- `~/.ccs/instances/*/projects/` -- CCS multi-instance setups

---

## Build Commands

### Lambda Server

```bash
cd lambda-server

pnpm build           # Build for local use (lambda.ts + index.ts -> dist/)
pnpm build:lambda    # Build for Lambda deploy (lambda.ts + aggregator.ts -> dist/)
pnpm typecheck       # TypeScript type checking
pnpm lint            # ESLint
pnpm test            # Vitest
```

The `serverless.yml` uses Serverless Framework v4's built-in esbuild for the actual Lambda deployment, so `pnpm build:lambda` is primarily for verification. The `pnpm deploy` script chains build and deploy.

### Dashboard

```bash
cd dashboard

pnpm build           # Standard Next.js build
STATIC_EXPORT=true pnpm build   # Static export for S3 (output: /out)
pnpm lint            # ESLint (next lint)
pnpm lint:fix        # ESLint with auto-fix
pnpm typecheck       # TypeScript type checking
pnpm format          # Prettier
pnpm format:check    # Prettier check (CI)
pnpm test            # Vitest
pnpm test:ui         # Vitest with browser UI
pnpm test:coverage   # Vitest with coverage report
```

When `STATIC_EXPORT=true`, Next.js generates a fully static site in the `out/` directory. The `NEXT_PUBLIC_API_URL` is baked into the client-side JavaScript at build time.

### Agent

```bash
cd be-agent

pnpm build           # tsup -> dist/index.js (ESM)
pnpm typecheck       # TypeScript type checking
pnpm lint            # ESLint
pnpm test            # Vitest
```

The agent is distributed as a `.tgz` file installed globally via `npm install -g`. The `bin` field in `package.json` registers `ccusage-agent` as a CLI command pointing to `dist/index.js`.

---

## Testing

All three components use **Vitest** as the test runner.

### Vitest Configuration

**be-agent** (`be-agent/vitest.config.ts`):
- Environment: Node.js
- Globals: true
- Pattern: `src/**/*.test.ts`

**lambda-server** (`lambda-server/vitest.config.ts`):
- Environment: Node.js
- Globals: true
- Pattern: `src/**/*.test.ts`

**dashboard** (`dashboard/vitest.config.ts`):
- Environment: jsdom
- Globals: true
- Plugin: `@vitejs/plugin-react`
- Setup file: `tests/setup.ts` (mocks for `next/navigation`, `matchMedia`, `ResizeObserver`)
- Pattern: `tests/**/*.test.{ts,tsx}`
- Path alias: `@` -> `./src`
- Coverage: text + html reporters, excludes types

### Running Tests

```bash
# Agent tests
cd be-agent && pnpm test

# Lambda server tests
cd lambda-server && pnpm test

# Dashboard tests
cd dashboard && pnpm test

# Dashboard with UI
cd dashboard && pnpm test:ui

# Dashboard with coverage
cd dashboard && pnpm test:coverage
```

### Test Files

| Component | Test File | What It Tests |
|-----------|----------|---------------|
| be-agent | `src/lib/collector.test.ts` | JSONL parsing, project extraction, byte offset handling |
| be-agent | `src/lib/config.test.ts` | Path discovery, state migration v1->v2, config defaults |
| be-agent | `src/lib/pusher.test.ts` | Batching logic, retry behavior, error handling |
| lambda-server | `src/routes/sync.test.ts` | Sync endpoint validation, deduplication, S3 writes |

### End-to-End Test

```bash
./scripts/e2e-sync-test.sh    # Full agent-to-server sync test
```

This script validates the complete data flow: agent sync -> S3 storage -> aggregation -> dashboard view serving. Requires AWS credentials.

---

## Deployment

### Lambda Server

Deploy uses Serverless Framework v4 with esbuild bundling.

```bash
cd lambda-server

# Deploy to dev stage (default)
pnpm deploy
# Equivalent to: pnpm build:lambda && serverless deploy --aws-profile default --region ap-southeast-1

# Deploy to specific stage
pnpm deploy:dev
pnpm deploy:prod

# View deployment info
pnpm info

# Tail logs
pnpm logs                # API function logs
pnpm logs:aggregator     # Aggregator function logs

# Invoke aggregator manually
pnpm invoke:aggregator

# Remove deployment
pnpm remove              # Dev stage
pnpm remove:prod         # Production stage
```

**What gets deployed:**
- API Lambda function (`src/lambda.handler`) -- 512MB, 29s timeout
- Aggregator Lambda function (`src/aggregator.handler`) -- 1024MB, 300s timeout
- S3 bucket `ccusage-data-{stage}` with SSE-KMS encryption and versioning
- EventBridge rule: aggregator runs every 1 hour
- CloudWatch log groups with 30-day retention
- CloudWatch alarms for API errors, aggregator errors, and API Gateway 5xx

**Environment variables set by serverless.yml:**
- `NODE_ENV=production`
- `BUCKET_NAME=ccusage-data-{stage}`
- `ALLOWED_ORIGINS` (per stage, includes CloudFront domain)
- `AGGREGATOR_FUNCTION_NAME`
- `JWT_SECRET` (from env or fallback)

### Dashboard

Deploy to S3 + CloudFront using the deploy script.

```bash
# Deploy with default API URL
./scripts/deploy-dashboard-s3.sh

# Deploy with custom API URL
./scripts/deploy-dashboard-s3.sh https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com
```

**What the script does:**
1. Runs `pnpm install` in dashboard directory
2. Runs `STATIC_EXPORT=true NEXT_PUBLIC_API_URL=<url> pnpm build` (produces `/out` static directory)
3. Syncs `/out` to S3 bucket `cc-usage-monitor-tvf` with differential caching:
   - Static assets (JS, CSS, images): `max-age=31536000, immutable`
   - HTML files: `no-cache, must-revalidate`
   - `_next/data/`: `max-age=60`
4. Sets S3 website configuration (index.html, 404.html)
5. Invalidates CloudFront distribution `E1W8WZ55TBZY1P`

**AWS resources:**
- S3 bucket: `cc-usage-monitor-tvf`
- CloudFront distribution: `E1W8WZ55TBZY1P`
- CloudFront domain: `d1ohuii7czj4jp.cloudfront.net`

### Agent Release

Build and publish a new agent version for auto-update.

```bash
# 1. Update version in three places:
#    - be-agent/package.json ("version" field)
#    - be-agent/src/commands/update.ts (CURRENT_VERSION constant)
#    - be-agent/src/lib/pusher.ts (agent_version in payload)

# 2. Run the publish script:
./scripts/publish-agent.sh
```

**What the script does:**
1. Reads version from `be-agent/package.json`
2. Builds the agent (`pnpm build`)
3. Packs to tgz (`npm pack`)
4. Uploads tgz to S3 (`s3://ccusage-data-dev/releases/ccusage-agent-{version}.tgz`)
5. Updates version manifest (`s3://ccusage-data-dev/releases/version.json`)

Teammates receive the update automatically:
```bash
ccusage-agent update    # Checks /api/agent/version -> downloads presigned URL -> npm install -g
```

### Trigger Aggregation

After deploying new server code or after significant data changes, trigger aggregation to update dashboard views:

```bash
# Incremental aggregation (only processes changes since last run)
curl -X POST "https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com/api/admin/aggregate"

# Full rebuild (reprocesses all data from scratch)
curl -X POST "https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com/api/admin/aggregate?force=true"

# Or invoke Lambda directly
cd lambda-server && pnpm invoke:aggregator
```

---

## Common Development Workflows

### Adding a New API Endpoint

1. Define request/response types in `lambda-server/src/lib/types.ts`
2. Create or extend a route file in `lambda-server/src/routes/`
3. Register the route in `lambda-server/src/app.ts` (add a lazy-load block in the `/api/*` handler)
4. If the endpoint needs auth exemption, add the path to the public endpoints list in `app.ts` (line ~79)
5. Add Zod validation schema for request bodies
6. Test locally: `cd lambda-server && pnpm dev`, then use curl

### Adding a New Dashboard Page

1. Create page in `dashboard/src/app/(dashboard)/new-page/page.tsx`
2. Add navigation link in `dashboard/src/components/layout/sidebar.tsx`
3. Create data fetching hook in `dashboard/src/hooks/use-new-data.ts`
4. Add query key in `dashboard/src/lib/query-keys.ts`
5. Use shared components from `dashboard/src/components/shared/` for consistency (PageHeader, StatsBar, StatsGrid, DataSheet, etc.)

**Important:** Use modals (`DataSheet`) for detail views instead of dynamic routes. The static export does not support dynamic route segments (`/members/[id]`) without CloudFront rewrite rules. Use query params (`/members?detail=X`) or hash navigation instead.

### Adding a New Agent Command

1. Create command handler in `be-agent/src/commands/new-command.ts`
2. Register the subcommand in `be-agent/src/index.ts` using Commander's `.command()` API
3. If the command needs server interaction, use `undici.request()` following the pattern in `pusher.ts`
4. Build and test: `pnpm build && pnpm start new-command`

### Modifying the S3 Data Schema

1. Update types in `lambda-server/src/lib/types.ts`
2. Update S3 key helpers in `lambda-server/src/lib/s3.ts` if adding new key patterns
3. Update `routes/sync.ts` for write-side changes
4. Update `aggregator.ts` if the change affects pre-computed views
5. Update `lambda-server/src/lib/aggregation.ts` if aggregation logic changes
6. Consider backward compatibility -- existing data in S3 must still be readable
7. After deploying, trigger a full re-aggregation: `POST /api/admin/aggregate?force=true`

### Working with the Member Registry

The member registry (`members/index.json`) uses ETag-based optimistic concurrency to handle concurrent writes from multiple agents syncing simultaneously:

```typescript
// Read with ETag
const result = await getJsonFromS3WithETag<MemberRegistry>('members/index.json');
// result.data contains the registry, result.etag is the current ETag

// Modify the data
result.data.members[memberId] = updatedMember;

// Write with ETag (will fail if another write happened between read and write)
await putJsonToS3WithETag('members/index.json', result.data, result.etag);

// ConditionalCheckFailed errors are handled by withRetry() automatically
```

---

## Debugging

### Lambda Server

```bash
# Tail API function logs in real-time
cd lambda-server && pnpm logs

# Tail aggregator logs
cd lambda-server && pnpm logs:aggregator

# Check system status
curl https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com/api/admin/status

# Check health
curl https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com/health

# Check aggregation metadata (last run, duration)
curl https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com/api/dashboard/meta
```

### Agent

```bash
# Check agent status
ccusage-agent status

# View daemon logs
tail -50 ~/.ccusage-agent/agent.log

# View launchd logs (macOS)
tail -50 ~/.ccusage-agent/launchd.log
tail -50 ~/.ccusage-agent/launchd.error.log

# Dry run to see what data would be collected
ccusage-agent sync --dry-run --verbose

# Force full re-sync (resets byte offsets, re-reads all files)
ccusage-agent sync --force --verbose

# Check launchd service status (macOS)
launchctl list | grep ccusage

# Check systemd timer status (Linux)
systemctl --user status ccusage-agent.timer
```

### Dashboard

```bash
# Dev mode with Turbopack (fast HMR)
cd dashboard && pnpm dev

# Check for type errors
cd dashboard && pnpm typecheck

# Browser DevTools -> Application -> Local Storage
# Keys: ccusage-access-token, ccusage-refresh-token, ccusage-theme
```

---

## Troubleshooting

### Lambda Server Won't Start Locally

**Symptom:** `pnpm dev` fails with AWS credential errors.

**Fix:** Ensure your AWS profile has access to the S3 bucket:
```bash
aws s3 ls s3://ccusage-data-dev/ --profile 2026-pik --region ap-southeast-1
```

If using a different profile, create a `.env` file with `AWS_PROFILE=your-profile-name`.

### Dashboard Shows "Unauthorized" Errors

**Symptom:** Dashboard redirects to login, or API calls return 401.

**Fix:**
1. Check that the lambda server has `JWT_SECRET` set (must match between server and tokens)
2. Clear localStorage in the browser:
   ```javascript
   localStorage.removeItem('ccusage-access-token');
   localStorage.removeItem('ccusage-refresh-token');
   ```
3. Log in again

### Agent Reports "No new data to sync"

**Symptom:** Agent sync completes but reports 0 entries.

**Possible causes:**
1. No Claude Code JSONL files found. Check paths: `ccusage-agent status`
2. All data was already synced (byte offsets point to end of file). Use `--force` to re-read.
3. JSONL files exist but contain no usage data (only system/user messages without token counts).

**Debug:**
```bash
ccusage-agent sync --dry-run --verbose --force
```

### Aggregator Produces Empty Views

**Symptom:** Dashboard shows no data even though sync succeeded.

**Fix:**
1. Verify raw data exists in S3: `aws s3 ls s3://ccusage-data-dev/raw/ --profile 2026-pik`
2. Verify aggregated data: `aws s3 ls s3://ccusage-data-dev/aggregated/ --profile 2026-pik`
3. Trigger manual aggregation:
   ```bash
   curl -X POST "https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com/api/admin/aggregate?force=true"
   ```
4. Check aggregator logs: `cd lambda-server && pnpm logs:aggregator`

### CloudFront Serving Stale Content

**Symptom:** Dashboard shows old version after deployment.

**Fix:** The deploy script automatically invalidates CloudFront, but you can manually invalidate:
```bash
aws cloudfront create-invalidation \
  --profile 2026-pik \
  --distribution-id E1W8WZ55TBZY1P \
  --paths "/*"
```

### S3 Concurrent Write Conflicts

**Symptom:** Sync endpoint returns "Concurrent modification detected" errors.

**Explanation:** The member registry uses ETag-based optimistic concurrency. When multiple agents sync simultaneously, one may get a ConditionalCheckFailed error.

**Fix:** This is handled automatically by `withRetry()` in `s3.ts` with exponential backoff. If you see persistent errors, check CloudWatch for retry exhaustion.

### Agent Auto-Start Not Working

**macOS:**
```bash
# Check if service is loaded
launchctl list | grep ccusage

# View plist
cat ~/Library/LaunchAgents/com.ccusage.agent.plist

# View logs
tail -20 ~/.ccusage-agent/launchd.log
tail -20 ~/.ccusage-agent/launchd.error.log

# Manually reload
launchctl unload ~/Library/LaunchAgents/com.ccusage.agent.plist
launchctl load ~/Library/LaunchAgents/com.ccusage.agent.plist
```

**Linux:**
```bash
# Check timer status
systemctl --user status ccusage-agent.timer

# View logs
journalctl --user -u ccusage-agent.service

# Manually reload
systemctl --user daemon-reload
systemctl --user restart ccusage-agent.timer
```

### Agent Update Fails

**Symptom:** `ccusage-agent update` fails during npm install.

**Fix:** The global npm install may require elevated permissions:
```bash
# Try with sudo (if using system Node.js)
sudo ccusage-agent update

# Or if using nvm, ensure correct Node.js version is active
nvm use 20
ccusage-agent update
```

---

## Code Conventions

### Lambda Server

- Route files export a default Hono instance
- Use Zod schemas for all request validation (`@hono/zod-validator`)
- Use `withRetry()` from `lib/s3.ts` for S3 operations that may face concurrency issues
- Use `addCost()` for cost arithmetic (avoids floating-point precision errors)
- Import types from `lib/types.ts` (single source of truth)
- Use `.js` extensions in import paths (ESM resolution)

### Dashboard

- Use `@/` import alias for `src/` directory
- Use `cn()` utility for conditional Tailwind classes
- Use `font-mono` class for numeric values (costs, tokens)
- Use shared components from `components/shared/` for consistency
- TanStack Query hooks follow naming: `use{Resource}` (e.g., `useDashboard`, `useMembers`)
- Zustand stores for UI-only state (sidebar), TanStack Query for server state
- No Next.js API routes -- all API calls go directly to Lambda via `NEXT_PUBLIC_API_URL`
- Modal-based detail views (DataSheet) instead of dynamic routes

### Agent

- Use `.js` extension in import paths (ESM requirement after tsup build)
- Use `undici.request()` for HTTP calls (no fetch polyfill needed)
- State management through `loadState()` / `saveState()` (atomic file writes)
- Byte offsets for incremental file reading (never re-read data already sent)
- Version string must be updated in three places when releasing (see Agent Release section)

---

## AWS Resource Reference

| Resource | Identifier | Purpose |
|----------|-----------|---------|
| API Gateway | `https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com` | HTTP API for Lambda |
| Lambda (API) | `ccusage-monitor-dev-api` | API handler |
| Lambda (Aggregator) | `ccusage-monitor-dev-aggregator` | View computation |
| S3 (Data) | `ccusage-data-dev` | All usage data + agent releases |
| S3 (Dashboard) | `cc-usage-monitor-tvf` | Static site hosting |
| CloudFront | `E1W8WZ55TBZY1P` | Dashboard CDN |
| CloudFront Domain | `d1ohuii7czj4jp.cloudfront.net` | Dashboard URL |
| Region | `ap-southeast-1` | Singapore |
| AWS Profile | `2026-pik` | IAM credentials |

---

## Quick Reference

```bash
# --- Lambda Server ---
cd lambda-server
pnpm dev                    # Start local server (port 3001, auto-reload)
pnpm build                  # Build for local use
pnpm deploy                 # Build + deploy to AWS Lambda (dev stage)
pnpm deploy:prod            # Build + deploy to production
pnpm logs                   # Tail API Lambda logs
pnpm logs:aggregator        # Tail Aggregator Lambda logs
pnpm invoke:aggregator      # Manually trigger aggregation
pnpm test                   # Run tests
pnpm typecheck              # Type check only

# --- Dashboard ---
cd dashboard
pnpm dev                    # Start dev server (Turbopack, port 3000)
pnpm build                  # Build for development
STATIC_EXPORT=true pnpm build  # Build static export for S3
pnpm lint                   # Lint
pnpm lint:fix               # Lint + auto-fix
pnpm format                 # Format with Prettier
pnpm typecheck              # Type check only
pnpm test                   # Run tests
pnpm test:coverage          # Run tests with coverage report

# --- Agent ---
cd be-agent
pnpm dev sync --dry-run     # Run sync directly via tsx
pnpm build                  # Build ESM bundle
pnpm start sync             # Run built version
pnpm test                   # Run tests

# --- Scripts ---
./scripts/publish-agent.sh            # Publish new agent version to S3
./scripts/deploy-dashboard-s3.sh      # Deploy dashboard to S3 + CloudFront
./scripts/test-api.sh                 # Test API endpoints
./scripts/e2e-sync-test.sh            # End-to-end integration test

# --- Agent CLI (after global install) ---
ccusage-agent setup --server <url> --email <email> --interval 60
ccusage-agent sync                    # Incremental sync
ccusage-agent sync --force            # Full re-sync
ccusage-agent sync --dry-run --verbose  # Preview what would sync
ccusage-agent status                  # Show agent status
ccusage-agent update                  # Auto-update from S3
ccusage-agent uninstall               # Remove auto-start service

# --- Admin Operations ---
curl -X POST ".../api/admin/aggregate?force=true"   # Full aggregation rebuild
curl ".../api/admin/status"                          # System status
curl ".../health"                                    # Health check
curl ".../api/dashboard/meta"                        # Aggregation metadata
```
