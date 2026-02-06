# API Contracts

## CLI Commands

### Global Options

All commands share these options:

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `--json` | boolean | Output as JSON | `false` |
| `--mode` | string | Cost calculation mode | `auto` |
| `--since` | string | Filter from date (YYYY-MM-DD) | - |
| `--until` | string | Filter to date (YYYY-MM-DD) | - |
| `--timezone` | string | Timezone for date display | System |
| `--locale` | string | Locale for formatting | `en-US` |
| `--compact` | boolean | Force compact table mode | `false` |
| `--breakdown` | boolean | Show model breakdown | `false` |
| `--debug` | boolean | Show debug information | `false` |
| `--config` | string | Config file path | Auto-detect |

### Cost Calculation Modes

| Mode | Behavior |
|------|----------|
| `auto` | Use pre-calculated `costUSD` when available, otherwise calculate |
| `calculate` | Always calculate from tokens, ignore `costUSD` |
| `display` | Always use `costUSD`, show 0 if missing |

---

## Command: `daily`

**Description:** Show usage report grouped by date

### Additional Options

| Option | Type | Description |
|--------|------|-------------|
| `--instances` / `-i` | boolean | Group by project/instance |
| `--project` / `-p` | string | Filter to specific project |
| `--projectAliases` | string | Comma-separated aliases |

### Output Schema (JSON)

```typescript
interface DailyOutput {
  daily: Array<{
    date: string;           // "YYYY-MM-DD"
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
    modelsUsed: string[];
    modelBreakdowns: ModelBreakdown[];
    project?: string;       // Only with --instances
  }>;
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
  };
}

// With --instances flag
interface DailyInstancesOutput {
  projects: {
    [projectName: string]: DailyOutput['daily'];
  };
  totals: DailyOutput['totals'];
}
```

---

## Command: `weekly`

**Description:** Show usage report grouped by week

### Output Schema (JSON)

```typescript
interface WeeklyOutput {
  weekly: Array<{
    week: string;           // "YYYY-Www" (e.g., "2026-W04")
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
    modelsUsed: string[];
    modelBreakdowns: ModelBreakdown[];
  }>;
  totals: Totals;
}
```

---

## Command: `monthly`

**Description:** Show usage report grouped by month

### Output Schema (JSON)

```typescript
interface MonthlyOutput {
  monthly: Array<{
    month: string;          // "YYYY-MM"
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
    modelsUsed: string[];
    modelBreakdowns: ModelBreakdown[];
  }>;
  totals: Totals;
}
```

---

## Command: `session`

**Description:** Show usage report grouped by conversation session

### Output Schema (JSON)

```typescript
interface SessionOutput {
  sessions: Array<{
    sessionId: string;
    projectPath: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
    lastActivity: string;   // ISO timestamp
    versions: string[];
    modelsUsed: string[];
    modelBreakdowns: ModelBreakdown[];
  }>;
  totals: Totals;
}
```

---

## Command: `blocks`

**Description:** Show usage report grouped by 5-hour billing blocks

### Additional Options

| Option | Type | Description |
|--------|------|-------------|
| `--active` | boolean | Show only active block with projections |
| `--recent` | boolean | Show blocks from last 3 days |
| `--token-limit` | string/number | Token limit for quota warnings |

### Output Schema (JSON)

```typescript
interface BlocksOutput {
  blocks: Array<{
    blockId: string;
    startTime: string;      // ISO timestamp
    endTime: string;        // ISO timestamp
    durationMinutes: number;
    isActive: boolean;
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    totalTokens: number;
    totalCost: number;
    modelsUsed: string[];
    projection?: {          // Only for active block
      projectedTokens: number;
      projectedCost: number;
      remainingMinutes: number;
    };
  }>;
  totals: Totals;
}
```

---

## Command: `statusline` (Beta)

**Description:** Compact status line for IDE integration

### Output Schema (JSON)

```typescript
interface StatuslineOutput {
  status: string;           // Formatted status string
  tokens: number;
  cost: number;
  activeBlock: boolean;
}
```

---

## MCP Server Tools

### Transport Options

| Transport | Command |
|-----------|---------|
| Stdio | `ccusage-mcp` |
| HTTP | `ccusage-mcp --type http --port 8080` |

### Tool: `daily`

**Description:** Show usage report grouped by date

**Input Schema:**
```typescript
{
  since?: string;     // YYYY-MM-DD
  until?: string;     // YYYY-MM-DD
  mode?: "auto" | "calculate" | "display";
}
```

**Output:** Same as CLI `daily --json`

---

### Tool: `session`

**Description:** Show usage report grouped by conversation session

**Input Schema:**
```typescript
{
  since?: string;
  until?: string;
  mode?: "auto" | "calculate" | "display";
}
```

**Output:** Same as CLI `session --json`

---

### Tool: `monthly`

**Description:** Show usage report grouped by month

**Input Schema:**
```typescript
{
  since?: string;
  until?: string;
  mode?: "auto" | "calculate" | "display";
}
```

**Output:** Same as CLI `monthly --json`

---

### Tool: `blocks`

**Description:** Show usage report grouped by 5-hour billing blocks

**Input Schema:**
```typescript
{
  since?: string;
  until?: string;
  mode?: "auto" | "calculate" | "display";
  active?: boolean;
  recent?: boolean;
}
```

**Output:** Same as CLI `blocks --json`

---

### Tool: `codex-daily`

**Description:** Show Codex usage grouped by day

**Input Schema:**
```typescript
{
  since?: string;
  until?: string;
  offline?: boolean;
}
```

---

### Tool: `codex-monthly`

**Description:** Show Codex usage grouped by month

**Input Schema:**
```typescript
{
  since?: string;
  until?: string;
  offline?: boolean;
}
```

---

## Library API

### Data Loading

```typescript
import { loadDailyUsageData, loadSessionUsageData } from 'ccusage/data-loader';

// Load daily usage
const daily = await loadDailyUsageData({
  since: '2026-01-01',
  until: '2026-01-31',
  mode: 'auto',
  groupByProject: false,
});

// Load session usage
const sessions = await loadSessionUsageData({
  since: '2026-01-01',
});
```

### Cost Calculation

```typescript
import { calculateTotals, getTotalTokens } from 'ccusage/calculate-cost';

const totals = calculateTotals(dailyData);
const totalTokens = getTotalTokens(totals);
```

### Pricing Integration

```typescript
import { LiteLLMPricingFetcher } from '@ccusage/internal/pricing';

using fetcher = new LiteLLMPricingFetcher({ offline: false });

const pricing = await fetcher.getModelPricing('claude-sonnet-4-20250514');
const cost = fetcher.calculateCostFromPricing(tokens, pricing);
```

---

## Error Responses

### CLI Errors

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | Error (invalid args, no data, etc.) |

### MCP Errors

```typescript
{
  error: {
    code: number;
    message: string;
  }
}
```

| Code | Meaning |
|------|---------|
| -32600 | Invalid request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
