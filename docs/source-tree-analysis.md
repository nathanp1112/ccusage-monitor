# CCUsage Monitor - Annotated Source Tree

> Generated 2026-02-25. Reflects agent v0.5.0, lambda-server v0.1.0, dashboard v0.1.0.

## Complete Directory Structure

```
ccusage-monitor/
│
├── be-agent/                          # CLI agent (v0.5.0) - installed globally on dev machines
│   │                                  # Parses local Claude Code JSONL logs and pushes to server
│   │                                  # Entry: `ccusage-agent <command>` via Commander.js
│   │                                  # Dependencies: commander, tinyglobby, undici
│   │                                  # Build: tsup (ESM), installed via `npm install -g ./ccusage-agent-*.tgz`
│   │
│   ├── src/
│   │   ├── index.ts                   # CLI entry point - Commander program definition
│   │   │                              # Registers 5 subcommands: setup, sync, status, update, uninstall
│   │   │                              # Shebang: #!/usr/bin/env node
│   │   │
│   │   ├── daemon.ts                  # Background sync daemon loop
│   │   │                              # Exports: runDaemon() - infinite loop with configurable interval
│   │   │                              # Each cycle: collectUsageData -> pushToServer -> pollAndExecuteCommands
│   │   │                              # Prompt sync throttled separately (prompt_sync_interval_hours, default 24h)
│   │   │                              # Handles SIGTERM/SIGINT for graceful shutdown
│   │   │                              # Logs to ~/.ccusage-agent/agent.log
│   │   │
│   │   ├── commands/
│   │   │   ├── setup.ts              # Full setup: configure agent + install auto-start service
│   │   │   │                          # Options: --server <url> --email <email> --interval <minutes>
│   │   │   │                          # Creates config at ~/.ccusage-agent/config.json
│   │   │   │                          # Installs launchd plist (macOS) or systemd unit (Linux)
│   │   │   │                          # Checks server registration and provides dashboard link
│   │   │   │
│   │   │   ├── push.ts               # Manual sync command (`ccusage-agent sync`)
│   │   │   │                          # Options: --force (full re-read), --dry-run, --verbose, --no-prompts
│   │   │   │                          # Calls collectUsageData + pushToServer
│   │   │   │                          # Updates file offsets in state after sync
│   │   │   │
│   │   │   ├── status.ts             # Show agent status and configuration
│   │   │   │                          # Displays: config, daemon PID, sync state, file offset count
│   │   │   │                          # Shows auth token status, discovered Claude data paths
│   │   │   │
│   │   │   ├── update.ts             # Self-update from S3 releases
│   │   │   │                          # Checks GET /api/agent/version for latest version
│   │   │   │                          # Downloads via presigned S3 URL, runs npm install -g
│   │   │   │                          # Option: --force to re-download even if same version
│   │   │   │                          # Post-update: re-runs setup + sync with existing config
│   │   │   │
│   │   │   ├── uninstall.ts          # Remove auto-start service (keeps config files)
│   │   │   │                          # Removes launchd plist or systemd unit+timer
│   │   │   │
│   │   │   ├── init.ts               # Interactive config initialization (legacy, not in main CLI)
│   │   │   │                          # Prompts for server URL and email interactively
│   │   │   │
│   │   │   ├── start.ts              # Start daemon process (legacy, predates launchd/systemd)
│   │   │   │                          # Can run in foreground (--foreground) or background
│   │   │   │
│   │   │   └── stop.ts               # Stop daemon process (legacy)
│   │   │                              # Reads PID file, sends SIGTERM, waits, then SIGKILL
│   │   │
│   │   └── lib/
│   │       ├── config.ts             # Config + state management (~/.ccusage-agent/)
│   │       │                          # Exports: AgentConfig, AgentState, RuntimeConfig interfaces
│   │       │                          # Files: CONFIG_FILE, STATE_FILE, PID_FILE, LOG_FILE
│   │       │                          # discoverClaudePaths(): auto-discovers ~/.claude/projects,
│   │       │                          #   ~/.config/claude/projects, ~/.ccs/instances/*/projects
│   │       │                          # State v2 uses per-file byte offsets (migrated from v1 ring buffer)
│   │       │                          # loadConfig() merges auto-discovered + extra_claude_paths
│   │       │
│   │       ├── collector.ts          # JSONL parsing, byte-offset incremental reading
│   │       │                          # collectUsageData(): main collection entry point
│   │       │                          # Uses createReadStream(file, { start: byteOffset }) for efficiency
│   │       │                          # Extracts: UsageEntry (from assistant messages with usage)
│   │       │                          #           PromptEntry (from user messages with string content)
│   │       │                          #           ProjectInfo (from cwd paths + git remote resolution)
│   │       │                          # Handles file truncation detection (re-reads from start)
│   │       │                          # Calculates costs via pricing.ts for entries without costUSD
│   │       │
│   │       ├── pusher.ts             # HTTP batch push with retry and exponential backoff
│   │       │                          # pushToServer(): batches entries@1000, prompts@500
│   │       │                          # Sends projects only in first batch (small payload)
│   │       │                          # Includes hostname, local_ip, public_ip metadata
│   │       │                          # Retries 5xx errors with exponential backoff (2^attempt seconds)
│   │       │                          # 4xx errors fail immediately (no retry)
│   │       │
│   │       ├── commander.ts          # Admin command polling and execution
│   │       │                          # pollAndExecuteCommands(): GET /api/agent/commands?email=...
│   │       │                          # Command types: revoke-token, force-sync, update-config
│   │       │                          # revoke-token: deletes Claude credential files from all known paths
│   │       │                          # Acknowledges via POST /api/agent/commands/:id/ack
│   │       │
│   │       ├── auth.ts               # JWT token lifecycle management
│   │       │                          # login(): POST /api/auth/login -> access + refresh tokens
│   │       │                          # refreshToken(): POST /api/auth/refresh -> new token pair
│   │       │                          # getValidToken(): cascade: check access -> try refresh -> re-login
│   │       │                          # Tokens stored in AgentState (persisted to state.json)
│   │       │                          # 60s expiry buffer for preemptive refresh
│   │       │
│   │       ├── pricing.ts            # LiteLLM-based cost calculation
│   │       │                          # calculateCost(): computes USD cost from token counts + model
│   │       │                          # Fetches pricing from LiteLLM GitHub (cached 24h)
│   │       │                          # Supports tiered pricing above 200k tokens
│   │       │                          # Falls back to cached data if fetch fails
│   │       │
│   │       ├── collector.test.ts     # Tests for JSONL parsing, project extraction
│   │       ├── pusher.test.ts        # Tests for batching, error handling, retry
│   │       └── config.test.ts        # Tests for path discovery, state migration
│   │
│   ├── package.json                   # v0.5.0, bin: ccusage-agent -> ./dist/index.js
│   │                                  # Scripts: dev (tsx), build (tsup ESM), test (vitest)
│   │
│   └── vitest.config.ts              # Vitest: globals mode, src/**/*.test.ts pattern
│
│
├── lambda-server/                     # Serverless backend (Hono on AWS Lambda)
│   │                                  # Two Lambda functions: API handler + Aggregator
│   │                                  # All data stored in S3 (no database)
│   │                                  # Three-layer S3 architecture: raw/ -> aggregated/ -> views/
│   │                                  # Dependencies: hono, zod, @aws-sdk/client-s3, @aws-sdk/client-lambda
│   │
│   ├── src/
│   │   ├── lambda.ts                 # Lambda handler entry point (6 lines)
│   │   │                              # Wraps Hono app with handle() from hono/aws-lambda
│   │   │                              # This is the handler referenced in serverless.yml
│   │   │
│   │   ├── index.ts                  # Local dev server entry point
│   │   │                              # Uses @hono/node-server on port 3001
│   │   │                              # Loads .env via dotenv in non-production mode
│   │   │
│   │   ├── app.ts                    # Hono app with middleware + lazy-loaded routes
│   │   │                              # Middleware stack:
│   │   │                              #   1. logger (request logging)
│   │   │                              #   2. prettyJSON (formatted responses)
│   │   │                              #   3. CORS (configurable allowed origins via ALLOWED_ORIGINS env)
│   │   │                              #   4. Gzip decompression (safety net for API Gateway)
│   │   │                              #   5. JWT auth (protects /api/* except public endpoints)
│   │   │                              # Public (no auth): /api/auth/*, /api/sync, /api/admin/*,
│   │   │                              #   /api/register/*, /api/agent/*
│   │   │                              # Routes lazy-loaded via dynamic import() to reduce cold start
│   │   │                              # Health check: GET /health
│   │   │
│   │   ├── aggregator.ts            # Aggregator Lambda (triggered hourly by EventBridge)
│   │   │                              # Reads aggregated/{memberId}/ -> generates views/
│   │   │                              # Output: views/dashboard.json, views/members.json,
│   │   │                              #         views/members/{id}/{year}.json
│   │   │                              # Metadata: meta/last-processed.json
│   │   │                              # Supports force=true for full rebuild
│   │   │                              # Bounded concurrency: 10 parallel S3 operations
│   │   │                              # 1024MB memory, 300s timeout
│   │   │
│   │   ├── routes/
│   │   │   ├── sync.ts               # POST /api/sync - Core data ingestion endpoint (~18KB)
│   │   │   │                          # Receives entries, projects, prompts from agent
│   │   │   │                          # Zod validation for request body
│   │   │   │                          # Pipeline: resolveAndUpdateMember -> processMonthEntries ->
│   │   │   │                          #   saveProjectData + savePrompts + logSyncOperation (parallel)
│   │   │   │                          # Member registry: ETag-based optimistic concurrency
│   │   │   │                          # Raw data: dedup by request_id, grouped by year-month
│   │   │   │                          # Pre-aggregation: writes aggregated/ alongside raw/ on each sync
│   │   │   │
│   │   │   ├── dashboard.ts          # GET /api/dashboard - Serves pre-computed dashboard view
│   │   │   │                          # GET /api/dashboard/model-distribution - Model usage subset
│   │   │   │                          # GET /api/dashboard/meta - Aggregator metadata
│   │   │   │                          # Pure S3 reads from views/dashboard.json, meta/last-processed.json
│   │   │   │
│   │   │   ├── members.ts            # GET /api/members - Member list from views/members.json
│   │   │   │                          # GET /api/members/:id?year= - Member yearly detail
│   │   │   │                          # GET /api/members/:id/raw?year=&month= - Raw usage records
│   │   │   │                          # UUID v4 validation on member IDs
│   │   │   │                          # Fallback: returns registry data if aggregator hasn't run yet
│   │   │   │
│   │   │   ├── agent.ts              # GET /api/agent/version - Latest version + presigned download URL
│   │   │   │                          # GET /api/agent/commands?email= - Poll pending admin commands
│   │   │   │                          # POST /api/agent/commands/:id/ack - Acknowledge command execution
│   │   │   │                          # Presigned URLs valid for 10 minutes
│   │   │   │
│   │   │   ├── admin.ts              # POST /api/admin/aggregate - Trigger aggregator Lambda
│   │   │   │                          # GET /api/admin/status - System status (env, bucket, region)
│   │   │   │                          # POST /api/admin/commands - Create command for agent
│   │   │   │                          # GET /api/admin/commands/:memberId - View command history
│   │   │   │
│   │   │   ├── auth.ts               # POST /api/auth/login - JWT login (email/password)
│   │   │   │                          # POST /api/auth/refresh - Token refresh
│   │   │   │                          # POST /api/auth/logout - No-op (client clears tokens)
│   │   │   │                          # GET /api/auth/me - Current user from JWT payload
│   │   │   │
│   │   │   ├── register.ts           # In-memory temporary data store (resets on cold start)
│   │   │   │                          # GET /api/register - List, PUT to replace, POST to update
│   │   │   │                          # GET /api/register/link?email= - Lookup link by email
│   │   │   │
│   │   │   └── sync.test.ts          # Tests for sync endpoint
│   │   │
│   │   ├── lib/
│   │   │   ├── types.ts              # All TypeScript type definitions (~430 lines)
│   │   │   │                          # Raw data: UsageEntry, DailyRecord, RawMonthlyData
│   │   │   │                          # Registry: MemberInfo, MemberRegistry
│   │   │   │                          # API: SyncRequest/Response, ErrorResponse
│   │   │   │                          # Views: DashboardView, MembersView, MemberYearlyView
│   │   │   │                          # Projects: ProjectData, MemberProjects
│   │   │   │                          # Prompts: PromptRecord, PromptMonthlyData
│   │   │   │                          # Commands: AgentCommand, CommandQueue, CommandType
│   │   │   │                          # Auth: AuthUser, LoginRequest/Response
│   │   │   │                          # Aggregation: MonthAggregation, DayAggregation, ModelBreakdown
│   │   │   │
│   │   │   ├── s3.ts                 # S3 helpers, retry logic, concurrency utilities (~410 lines)
│   │   │   │                          # CRUD: getJsonFromS3, putJsonToS3, objectExists, listObjects
│   │   │   │                          # ETag: getJsonFromS3WithETag, putJsonToS3WithETag
│   │   │   │                          #   (optimistic concurrency for member registry)
│   │   │   │                          # Key helpers: getRawDataKey, getAggregatedDataKey,
│   │   │   │                          #   getMemberRegistryKey, getSyncLogKey, getDashboardViewKey,
│   │   │   │                          #   getMembersViewKey, getMemberDetailViewKey, etc.
│   │   │   │                          # Retry: withRetry (exponential backoff + jitter)
│   │   │   │                          # Utilities: addCost (decimal precision), mapWithConcurrency
│   │   │   │                          # Presigned URLs: getPresignedDownloadUrl (for agent downloads)
│   │   │   │
│   │   │   ├── aggregation.ts        # Shared aggregation logic (used by sync + aggregator)
│   │   │   │                          # aggregateMonthData(): RawMonthlyData -> MonthAggregation
│   │   │   │                          # Computes daily totals, model breakdown, project breakdown
│   │   │   │                          # Uses addCost() for decimal precision in cost accumulation
│   │   │   │
│   │   │   └── auth.ts               # JWT generation, verification, user lookup
│   │   │                              # HS256 algorithm, access token 60min, refresh token 20 days
│   │   │                              # findUser(): looks up users from data/users.json
│   │   │                              # verifyPassword(): SHA256 with timing-safe comparison
│   │   │                              # JWT_SECRET from env var (required in production)
│   │   │
│   │   └── data/
│   │       └── users.json            # Hardcoded user accounts (email, passwordHash, name, role)
│   │                                  # Roles: admin, agent, member
│   │                                  # Imported at build time (bundler-friendly)
│   │
│   ├── serverless.yml                 # Serverless Framework v4 configuration
│   │                                  # Provider: AWS, Node.js 20, ap-southeast-1
│   │                                  # Functions:
│   │                                  #   api: src/lambda.handler (512MB, 29s timeout)
│   │                                  #   aggregator: src/aggregator.handler (1024MB, 300s)
│   │                                  # Aggregator schedule: every 1 hour (EventBridge)
│   │                                  # S3 bucket: ccusage-data-{stage}, SSE-KMS, versioning enabled
│   │                                  # Lifecycle: sync-logs/ expire after 90 days
│   │                                  # CloudWatch: error alarms for API, aggregator, API Gateway 5xx
│   │                                  # Env: BUCKET_NAME, JWT_SECRET, ALLOWED_ORIGINS,
│   │                                  #      AGGREGATOR_FUNCTION_NAME
│   │                                  # Plugin: serverless-offline (local dev on port 3001)
│   │
│   ├── package.json                   # Scripts: dev, build, deploy, deploy:dev, deploy:prod,
│   │                                  #   logs, logs:aggregator, invoke:aggregator, test
│   │
│   └── vitest.config.ts              # Vitest: globals mode, src/**/*.test.ts pattern
│
│
├── dashboard/                         # Next.js 15 SPA (static export to S3 + CloudFront)
│   │                                  # React 19, TypeScript 5.7, TanStack Query 5, Zustand 5
│   │                                  # Tailwind CSS 4, Radix UI, Recharts 2.15
│   │                                  # Deployed as static site: STATIC_EXPORT=true pnpm build -> /out
│   │                                  # No server-side routes; all API calls go directly to Lambda
│   │
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx            # Root layout - fonts (Inter + JetBrains Mono), theme script
│   │   │   │                          # Inline script prevents FOUC by setting dark class before hydration
│   │   │   │
│   │   │   ├── providers.tsx         # QueryClient (5min stale, 30min gc) + ThemeProvider
│   │   │   │                          # Retry only on 5xx errors (up to 3 attempts)
│   │   │   │                          # Disabled refetch on window focus
│   │   │   │
│   │   │   ├── globals.css           # Tailwind v4 + CSS variables for light/dark mode
│   │   │   ├── error.tsx             # Global error boundary
│   │   │   ├── not-found.tsx         # 404 page
│   │   │   │
│   │   │   ├── (auth)/              # Auth route group (centered layout, no sidebar)
│   │   │   │   ├── layout.tsx        # Centered auth layout
│   │   │   │   └── login/
│   │   │   │       └── page.tsx      # Login page
│   │   │   │
│   │   │   ├── (dashboard)/          # Main dashboard route group (sidebar + navbar wrapper)
│   │   │   │   ├── layout.tsx        # Dashboard layout: AuthGuard + Sidebar + Navbar
│   │   │   │   ├── page.tsx          # Dashboard home: summary cards, daily trend, distribution
│   │   │   │   ├── dashboard-charts.tsx  # Charts: Treemap/Pie toggle for cost visualization
│   │   │   │   ├── error.tsx         # Error boundary for dashboard routes
│   │   │   │   ├── members/
│   │   │   │   │   └── page.tsx      # Members list: ranking/cards/chart views, detail modal
│   │   │   │   │                      # URL: /members?detail=X opens DataSheet modal
│   │   │   │   └── reports/
│   │   │   │       └── page.tsx      # Reports page
│   │   │   │
│   │   │   └── (playground)/         # 3D visualization demos (Three.js + React Three Fiber)
│   │   │       ├── layout.tsx        # Playground layout (no sidebar)
│   │   │       └── playground/       # Demo scene pages
│   │   │
│   │   ├── components/
│   │   │   ├── charts/               # Recharts visualization components (9 files)
│   │   │   │   ├── usage-trend-chart.tsx       # Line chart: daily cost trend
│   │   │   │   ├── model-distribution-chart.tsx # Pie chart: model cost breakdown
│   │   │   │   ├── daily-model-usage-chart.tsx  # Stacked bar: daily tokens by model
│   │   │   │   ├── usage-heat-map.tsx           # Calendar heatmap with metric selector
│   │   │   │   ├── usage-heatmap.tsx            # Alternative heatmap implementation
│   │   │   │   ├── cost-treemap-chart.tsx       # Treemap: member/model cost distribution
│   │   │   │   ├── cost-by-model-chart.tsx      # Bar chart: cost by model
│   │   │   │   ├── token-usage-chart.tsx        # Token usage breakdown
│   │   │   │   └── cache-efficiency-chart.tsx   # Cache hit/miss visualization
│   │   │   │
│   │   │   ├── layout/               # Page chrome
│   │   │   │   ├── sidebar.tsx       # Collapsible navigation sidebar (state in Zustand)
│   │   │   │   ├── navbar.tsx        # Header: user info + theme toggle
│   │   │   │   └── auth-guard.tsx    # Redirect to /login if no valid token
│   │   │   │
│   │   │   ├── members/              # Member-specific components (5 files)
│   │   │   │   ├── member-card.tsx             # Card view for member grid
│   │   │   │   ├── member-ranking-list.tsx     # Ranking with medals (top 3) + progress bars
│   │   │   │   ├── member-detail-content.tsx   # Detail view: stats, period selector, charts
│   │   │   │   ├── member-detail-charts.tsx    # Charts: daily cost, model distribution, tokens
│   │   │   │   └── ranking-bar.tsx             # Progress bar for ranking visualization
│   │   │   │
│   │   │   ├── shared/               # Reusable common components (12 files)
│   │   │   │   ├── page-header.tsx   # Title + description + optional back button
│   │   │   │   ├── stats-bar.tsx     # Compact inline stats (responsive hiding on mobile)
│   │   │   │   ├── stats-grid.tsx    # Dashboard-style stat cards in grid
│   │   │   │   ├── controls-bar.tsx  # Container for view toggle + sort/filter
│   │   │   │   ├── data-sheet.tsx    # Modal/sheet for detail views (Radix Dialog)
│   │   │   │   ├── empty-state.tsx   # "No data" display
│   │   │   │   ├── error-state.tsx   # Error with retry button
│   │   │   │   ├── error-fallback.tsx # Error boundary fallback
│   │   │   │   ├── loading-spinner.tsx # Loading states
│   │   │   │   ├── month-selector.tsx # Year/month period selector
│   │   │   │   ├── tag-list.tsx      # Badge/tag list (e.g., models used)
│   │   │   │   └── view-toggle.tsx   # Tab-like toggle (ranking/cards/chart)
│   │   │   │
│   │   │   ├── dashboard/
│   │   │   │   └── summary-card.tsx  # Summary stat card component
│   │   │   │
│   │   │   ├── playground/           # 3D demo scenes (React Three Fiber) - 6 files
│   │   │   │   ├── city-scene.tsx
│   │   │   │   ├── mascot-scene.tsx
│   │   │   │   ├── planets-scene.tsx
│   │   │   │   ├── podium-scene.tsx
│   │   │   │   ├── token-rain-scene.tsx
│   │   │   │   └── usage-meter-scene.tsx
│   │   │   │
│   │   │   ├── theme/                # Dark/light mode support
│   │   │   │   ├── index.ts          # Barrel export
│   │   │   │   ├── theme-provider.tsx # ThemeContext with system preference detection
│   │   │   │   └── theme-toggle.tsx  # Sun/Moon toggle button
│   │   │   │
│   │   │   └── ui/                   # Radix-based primitive components (8 files)
│   │   │       ├── button.tsx        # Button with variants (CVA)
│   │   │       ├── card.tsx          # Card container
│   │   │       ├── badge.tsx         # Tag/badge
│   │   │       ├── input.tsx         # Text input
│   │   │       ├── select.tsx        # Dropdown select (Radix)
│   │   │       ├── tooltip.tsx       # Hover tooltip (Radix)
│   │   │       ├── dropdown-menu.tsx # Context menu (Radix)
│   │   │       └── sheet.tsx         # Slide-over panel (Radix Dialog)
│   │   │
│   │   ├── hooks/                    # Custom React hooks
│   │   │   ├── use-auth.ts          # useSession, useLogin, useLogout
│   │   │   │                          # Token management in localStorage
│   │   │   │                          # useLogin: POST /api/auth/login -> redirect /
│   │   │   │                          # useLogout: clear tokens -> redirect /login
│   │   │   │
│   │   │   ├── use-dashboard.ts     # useDashboard: GET /api/dashboard
│   │   │   │                          # Dual API support (Lambda + legacy PostgreSQL)
│   │   │   │
│   │   │   └── use-members.ts       # useMembers: GET /api/members
│   │   │                              # useMember: GET /api/members/:id?year=
│   │   │                              # useMemberUsage: GET /api/members/:id/raw
│   │   │
│   │   ├── lib/                      # Utilities
│   │   │   ├── api-client.ts        # HTTP client class with JWT auto-refresh
│   │   │   │                          # On 401: try refresh token -> retry request once
│   │   │   │                          # On refresh failure: redirect to /login
│   │   │   │                          # Tokens in localStorage (ccusage-access-token, ccusage-refresh-token)
│   │   │   │                          # Deduplicates concurrent refresh attempts
│   │   │   │
│   │   │   ├── api-adapters.ts      # Transform Lambda API -> frontend types (~10KB)
│   │   │   │                          # Handles both Lambda (has generatedAt) and legacy PG formats
│   │   │   │
│   │   │   ├── calculations.ts      # calculateTotals() - frontend-side aggregation from daily data
│   │   │   ├── member-utils.ts      # sortMembers, calculateRankings, calculateTeamTotals
│   │   │   ├── treemap-utils.ts     # transformToTreemap() for Recharts Treemap data format
│   │   │   ├── query-keys.ts        # Query key factory for TanStack Query cache
│   │   │   └── utils.ts             # cn(), formatCurrency, formatTokens, formatRelativeTime
│   │   │
│   │   ├── stores/                   # Zustand state stores
│   │   │   └── ui-store.ts          # Sidebar open state (persisted to localStorage)
│   │   │
│   │   ├── types/                    # TypeScript type definitions
│   │   │   ├── api.ts               # API response types: DashboardStats, Member, LoginResponse
│   │   │   └── members.ts           # View types: RankedMember, TeamTotals, MembersViewType
│   │   │
│   │   └── schemas/                  # (Empty - reserved for Zod form schemas)
│   │
│   ├── tests/
│   │   └── setup.ts                  # Test setup: mocks for next/navigation, matchMedia, ResizeObserver
│   │
│   ├── next.config.ts                # Static export (STATIC_EXPORT=true), API rewrites for dev
│   ├── vitest.config.ts              # jsdom env, react plugin, @/ path alias, tests/**/*.test.{ts,tsx}
│   ├── package.json                   # Next.js 15.1, React 19, pnpm 10.24.0
│   │                                  # Scripts: dev (Turbopack), build, test, lint, typecheck
│   └── CLAUDE.md                     # Frontend-specific development context and conventions
│
│
├── scripts/                           # Deployment and utility scripts
│   ├── deploy-dashboard-s3.sh        # Build static export + upload to S3 + CloudFront invalidation
│   │                                  # Usage: ./scripts/deploy-dashboard-s3.sh [API_URL]
│   │                                  # Bucket: cc-usage-monitor-tvf, Distribution: E1W8WZ55TBZY1P
│   │                                  # Differential caching: immutable for assets, no-cache for HTML
│   │
│   ├── publish-agent.sh              # Build + pack agent tgz + upload to S3 releases/
│   │                                  # Updates releases/version.json manifest
│   │                                  # Bucket: ccusage-data-dev, Profile: 2026-pik
│   │
│   ├── e2e-sync-test.sh             # End-to-end sync integration test (~18KB)
│   │                                  # Validates full data flow: agent sync -> S3 -> aggregation -> views
│   │
│   ├── test-api.sh                   # curl-based API endpoint testing
│   │
│   └── upload-usage.mjs             # Manual data upload utility (Node.js)
│
│
├── CLAUDE.md                          # Project-level AI context document
│                                      # Architecture overview, data flow, key files, deploy process
│
├── memory/                            # Working notes (not deployed)
└── .s3-backup/                        # Local S3 data backups
```

## Critical Directories Explained

### `be-agent/src/`

**Purpose:** CLI tool installed on each developer's machine to collect and push Claude Code usage data.

**Entry point:** `index.ts` registers Commander subcommands (`setup`, `sync`, `status`, `update`, `uninstall`).

**Core data flow:** `config.ts` discovers JSONL paths -> `collector.ts` reads new bytes from each file -> `pusher.ts` batches and POSTs to server -> `daemon.ts` orchestrates the loop.

**Integration points:**
- Reads from: `~/.claude/projects/*/*.jsonl`, `~/.config/claude/projects/*/*.jsonl`, `~/.ccs/instances/*/projects/*/*.jsonl`
- Writes to: `~/.ccusage-agent/config.json`, `~/.ccusage-agent/state.json`, `~/.ccusage-agent/agent.log`
- HTTP calls: `POST /api/sync`, `GET /api/agent/version`, `GET /api/agent/commands`, `POST /api/auth/login`, `POST /api/auth/refresh`

### `lambda-server/src/`

**Purpose:** Serverless backend that receives usage data, stores it in S3, and serves pre-computed views.

**Entry points:**
- `lambda.ts` -- API Gateway handler (wraps Hono app)
- `index.ts` -- Local dev server (Hono on port 3001)
- `aggregator.ts` -- standalone Lambda triggered hourly by EventBridge

**Core data flow:** `routes/sync.ts` receives agent data -> writes to `raw/` + `aggregated/` in S3 -> `aggregator.ts` reads `aggregated/` -> writes `views/` -> `routes/dashboard.ts` and `routes/members.ts` serve views.

**Integration points:**
- S3 bucket `ccusage-data-{stage}`: all data persistence
- Lambda invocation: API function invokes aggregator function via `@aws-sdk/client-lambda`
- External: API Gateway v2 HTTP API

### `dashboard/src/`

**Purpose:** Next.js SPA that visualizes team usage data. Deployed as static export to S3/CloudFront.

**Entry point:** `app/layout.tsx` (root layout) -> `app/providers.tsx` (QueryClient + Theme) -> route pages.

**Core data flow:** React hooks (`use-dashboard.ts`, `use-members.ts`) -> `api-client.ts` (HTTP with JWT) -> Lambda API -> `api-adapters.ts` transforms response -> components render.

**Integration points:**
- HTTP calls to Lambda API: `/api/dashboard`, `/api/members`, `/api/auth/*`
- JWT tokens in `localStorage` (auto-refresh on 401)
- Static export deployed to S3 bucket `cc-usage-monitor-tvf`, served via CloudFront `E1W8WZ55TBZY1P`

### `lambda-server/src/lib/s3.ts`

**Purpose:** Central S3 abstraction layer used by all server-side code.

This file defines the S3 key schema (how data is organized in the bucket) and provides all S3 operations. Every route and the aggregator depend on it.

**Key patterns:**
- `raw/{memberId}/{year}-{month}.json` -- source of truth
- `aggregated/{memberId}/{year}-{month}.json` -- pre-computed summaries
- `views/dashboard.json`, `views/members.json`, `views/members/{id}/{year}.json` -- dashboard-ready JSON
- `members/index.json` -- member registry with ETag concurrency
- `commands/{memberId}/queue.json` -- admin command queues
- `releases/version.json` + `releases/ccusage-agent-*.tgz` -- agent binaries

### `lambda-server/src/lib/types.ts`

**Purpose:** Single source of truth for all TypeScript types used across the server.

Contains 16 major interfaces/types organized into sections: raw data types, member registry, sync logs, API request/response, pre-computed views, project tracking, prompt audit, admin commands, auth, and aggregation types. Both routes and the aggregator import from this file.

## Dependency Summary

### be-agent

| Package | Version | Purpose |
|---------|---------|---------|
| commander | ^12.1.0 | CLI argument parsing and subcommand routing |
| tinyglobby | ^0.2.10 | Fast glob pattern matching for JSONL file discovery |
| undici | ^7.2.0 | HTTP client for server communication |
| tsup | ^8.3.5 | Bundler: ESM output from TypeScript |
| tsx | ^4.19.2 | TypeScript execution for development |
| vitest | ^2.1.8 | Test runner |

### lambda-server

| Package | Version | Purpose |
|---------|---------|---------|
| hono | ^4.6.14 | Web framework with native Lambda adapter |
| @hono/node-server | ^1.13.7 | Local development server |
| @hono/zod-validator | ^0.4.2 | Request validation middleware |
| @aws-sdk/client-s3 | ^3.986.0 | S3 read/write operations |
| @aws-sdk/s3-request-presigner | ^3.986.0 | Presigned download URLs |
| @aws-sdk/client-lambda | ^3.975.0 | Invoke aggregator Lambda |
| zod | ^3.24.1 | Runtime schema validation |
| serverless | ^4.4.9 | Lambda deployment framework |
| serverless-offline | ^14.4.0 | Local Lambda emulation |

### dashboard

| Package | Version | Purpose |
|---------|---------|---------|
| next | ^15.1.0 | React framework (App Router, static export) |
| react | ^19.0.0 | UI library |
| @tanstack/react-query | ^5.62.0 | Server state with caching |
| zustand | ^5.0.0 | Client-side UI state |
| recharts | ^2.15.0 | Chart library |
| @radix-ui/* | Various | Accessible UI primitives |
| tailwindcss | ^4.0.0 | CSS framework |
| three | ^0.182.0 | 3D rendering (playground) |
| vitest | ^2.1.0 | Test runner |

## S3 Bucket Layout

```
INPUT LAYER (written by sync endpoint):
raw/{memberId}/{year}-{month}.json          All usage entries (source of truth)
aggregated/{memberId}/{year}-{month}.json   Pre-computed monthly summaries
members/index.json                          Member registry (email -> id mapping)
sync-logs/{year}-{month}/{memberId}.json    Sync audit trail
projects/{memberId}.json                    Project list with git remotes
prompts/{memberId}/{year}-{month}.json      Prompt text archive (ISMS audit)
commands/{memberId}/queue.json              Admin command queue for agents

OUTPUT LAYER (written by aggregator):
views/dashboard.json                        Team-wide summary stats
views/members.json                          Member list with current/prev month
views/members/{memberId}/{year}.json        Per-member yearly detail

METADATA:
meta/last-processed.json                    Aggregation timestamp

RELEASES:
releases/version.json                       Latest agent version manifest
releases/ccusage-agent-*.tgz               Agent binaries for auto-update
```

## Integration Flow

```
Agent (developer machine)
  |
  | POST /api/sync (entries, projects, prompts)
  v
Lambda API (sync endpoint)
  |
  | writes raw/ + aggregated/ + members/ + sync-logs/ + projects/ + prompts/
  v
S3 Bucket
  ^
  | reads aggregated/ -> writes views/
  |
Aggregator Lambda (hourly)
  |
  v
S3 Bucket (views/)
  ^
  | GET /api/dashboard, /api/members
  |
Lambda API (dashboard/members endpoints)
  ^
  | HTTP requests (JWT auth)
  |
Dashboard (browser SPA)
```
