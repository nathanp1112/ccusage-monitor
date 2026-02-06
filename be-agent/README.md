# CCUsage Agent

Local agent for collecting and syncing Claude Code usage data to the CCUsage Monitor server.

## Overview

The agent is a **scheduled job** (not a daemon) that:
- Runs periodically in the background (default: every 60 minutes)
- Scans local Claude Code log files
- Extracts usage data (tokens, costs, models)
- Syncs to the central monitoring server
- Exits after each run

**No port required** - the agent is not a server.

## Installation

### Option 1: Install from tarball

```bash
# Install globally
npm install -g ./ccusage-agent-0.2.0.tgz

# Or with pnpm
pnpm add -g ./ccusage-agent-0.2.0.tgz
```

### Option 2: Install from source

```bash
cd be-agent
pnpm install
pnpm build

# Run commands via pnpm
pnpm start <command>
```

## Setup

Run the setup command once to configure and install auto-start:

```bash
ccusage-agent setup --server <SERVER_URL> --email <YOUR_EMAIL>
```

### Setup Options

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--server <url>` | Yes | - | Server URL (e.g., `https://api.example.com`) |
| `--email <email>` | Yes | - | Your email for identification |
| `--interval <minutes>` | No | 60 | Sync interval in minutes |

### Example

```bash
# Production server
ccusage-agent setup \
  --server https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com \
  --email developer@company.com

# With custom interval (every 30 minutes)
ccusage-agent setup \
  --server https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com \
  --email developer@company.com \
  --interval 30
```

### What Setup Does

1. **Saves configuration** to `~/.ccusage-agent/config.json`
2. **Discovers Claude paths** automatically:
   - `~/.claude/projects/*`
   - `~/.config/claude/projects/*`
   - `~/.ccs/instances/*/projects/*`
3. **Installs auto-start service**:
   - macOS: launchd (`~/Library/LaunchAgents/com.ccusage.agent.plist`)
   - Linux: systemd (`~/.config/systemd/user/ccusage-agent.service`)

## Commands

| Command | Description |
|---------|-------------|
| `ccusage-agent setup` | Initial setup and install auto-start |
| `ccusage-agent sync` | Manual sync (run immediately) |
| `ccusage-agent status` | Check configuration and sync status |
| `ccusage-agent uninstall` | Remove auto-start service |

### Manual Sync

```bash
# Sync new data
ccusage-agent sync

# Force sync all historical data (ignore last sync timestamp)
ccusage-agent sync --force

# Dry run (collect but don't push)
ccusage-agent sync --dry-run
```

### Check Status

```bash
ccusage-agent status
```

Output example:
```
CCUsage Agent Status

Configuration:
  Config file: /Users/you/.ccusage-agent/config.json
  Server URL: https://api.example.com
  Email: developer@company.com
  Sync interval: 60 minutes

Daemon:
  Status: RUNNING (PID: 12345)

Sync Status:
  State file: /Users/you/.ccusage-agent/state.json
  Last sync: 2026-01-27T14:30:00.000Z
             (30 minutes ago)
  Last sync records: 150
  Total synced records: 19112
  Tracked request IDs: 10000

Claude Data Paths:
  ✓ /Users/you/.claude/projects
  ✓ /Users/you/.ccs/instances/main/projects
```

## Configuration

Configuration is stored in `~/.ccusage-agent/config.json`:

```json
{
  "server_url": "https://api.example.com",
  "email": "developer@company.com",
  "sync_interval_minutes": 60,
  "max_batch_size": 1000,
  "retry_attempts": 3,
  "extra_claude_paths": []
}
```

### Adding Custom Paths

If you have Claude data in non-standard locations, add them to `extra_claude_paths`:

```json
{
  "server_url": "https://api.example.com",
  "email": "developer@company.com",
  "sync_interval_minutes": 60,
  "max_batch_size": 1000,
  "retry_attempts": 3,
  "extra_claude_paths": [
    "/custom/path/to/claude/projects",
    "/another/location/projects"
  ]
}
```

Auto-discovered paths are always included - `extra_claude_paths` adds to them.

## Auto-Start Behavior

| Platform | Mechanism | Runs On |
|----------|-----------|---------|
| macOS | launchd | User login + every N minutes |
| Linux | systemd timer | Boot (1 min delay) + every N minutes |

### Verify Auto-Start (macOS)

```bash
# Check if loaded
launchctl list | grep ccusage

# View logs
tail -f ~/.ccusage-agent/launchd.log
tail -f ~/.ccusage-agent/launchd.error.log
```

### Verify Auto-Start (Linux)

```bash
# Check timer status
systemctl --user status ccusage-agent.timer

# View logs
journalctl --user -u ccusage-agent
```

## Uninstall

```bash
# Remove auto-start service (keeps config)
ccusage-agent uninstall

# Completely remove (manual)
rm -rf ~/.ccusage-agent
```

## Data Flow

```
~/.claude/projects/*.jsonl     ─┐
~/.ccs/instances/*/projects/*  ─┼──▶ [Agent] ──POST──▶ [Server API]
custom paths (if configured)   ─┘
```

## Multi-Device Support

- Same email can run agents on multiple devices
- Data is merged under the same member account
- Duplicates are automatically skipped (by `request_id`)
- Each sync includes hostname for tracking

## Troubleshooting

### Agent not syncing

1. Check status: `ccusage-agent status`
2. Check logs: `tail ~/.ccusage-agent/launchd.log` (macOS)
3. Manual sync: `ccusage-agent sync`

### No data found

1. Verify Claude Code has been used (creates log files)
2. Check paths exist: `ls ~/.claude/projects`
3. Run with dry-run: `ccusage-agent sync --dry-run`

### Server connection errors

1. Verify server URL is correct
2. Check network connectivity
3. Agent retries 3 times with exponential backoff

### Reset and resync all data

```bash
# Reset state (will resync everything)
rm ~/.ccusage-agent/state.json

# Or use force flag
ccusage-agent sync --force
```

## Version

Current version: **0.2.0**

### Changelog

- **0.2.0**: Fixed sync endpoint, payload format, command names
- **0.1.0**: Initial release
