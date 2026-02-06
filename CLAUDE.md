# CCUsage Monitor

Team monitoring system for Claude Code usage tracking.

## Architecture (Hybrid)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  be-agent   │────▶│   server    │◀────│  dashboard  │
│ Parse data  │ POST│ Store only  │ GET │ Calculate & │
│ to format   │     │ (raw daily) │     │ Display     │
└─────────────┘     └─────────────┘     └─────────────┘
     │                    │
     │                    ▼
     │              ┌───────────┐
     │              │ PostgreSQL│
     │              └───────────┘
     ▼
  ~/.claude/projects/*
  ~/.ccs/instances/*/projects/*
```

**Data Flow:**
- **Agent**: Parses Claude logs → structured format → POST to server
- **Server**: Stores raw daily aggregates (no complex calculations)
- **Frontend**: Fetches daily data → calculates totals, model breakdowns, charts

## Components

| Component | Port | Responsibility |
|-----------|------|----------------|
| `be-agent` | - | Parse & sync Claude data |
| `server` | 3003 | Store daily aggregates (simple CRUD) |
| `dashboard` | 3000 | Calculate & display (all business logic) |

## Development

```bash
# Start server
cd server && pnpm dev

# Start dashboard
cd dashboard && pnpm dev

# Run agent sync manually
cd be-agent && pnpm start sync
```

## Dashboard API Configuration

The dashboard uses Next.js rewrites to proxy API calls to the backend server. This avoids CORS issues and keeps the backend URL server-side only.

### Configure Backend URL

Edit `dashboard/.env.local`:

```bash
# Local development
API_SERVER_URL=http://localhost:3003

# LAN access (other machines)
API_SERVER_URL=http://192.168.0.193:3003

# Production
API_SERVER_URL=https://api.example.com
```

**Important:** Restart the dashboard after changing `API_SERVER_URL` (rewrites are loaded at startup).

### How it works

1. Frontend makes relative API calls (`/api/members`)
2. `next.config.ts` rewrites `/api/*` to `${API_SERVER_URL}/api/*`
3. No CORS configuration needed
4. Backend URL not exposed to browser

## Agent Setup (be-agent)

### First-time setup

```bash
cd be-agent
pnpm build
pnpm start setup --server http://192.168.0.193:3003 --email user@example.com
```

This will:
- Save configuration
- Install auto-start service (launchd on macOS, systemd on Linux)
- Run initial sync

### Manual sync

```bash
pnpm start sync
```

### Check status

```bash
pnpm start status
```

### Uninstall auto-start

```bash
pnpm start uninstall
```

## Data Paths Scanned

The agent automatically discovers and scans:

- `~/.claude/projects/*` - Native Claude Code
- `~/.config/claude/projects/*` - Alternative location
- `~/.ccs/instances/*/projects/*` - CCS multi-instance setups

## Multi-Device Support

When the same email runs agents on multiple devices:

- Data is merged under the same member account (lookup by email)
- Duplicate records are skipped (deduplication by `request_id`)
- Sync logs track hostname, IP, and user agent per device
