# SRS/BRD Phase 2: Quick Win Analytics

**Timeline**: Week 3-4
**Priority**: HIGH — Immediate value from existing data
**Items**: P-1, P-2, P-7, P-13, P-19, P-25, A-24 (7 items)
**Estimated Effort**: ~2 weeks for 2 developers (1 backend/aggregator, 1 frontend); ~60-80 dev-hours total
**Dependencies**: Phase 1 complete (authenticated endpoints, JWT auth infrastructure)

---

## 1. Executive Summary

Phase 2 extracts immediate analytical value from data the system already collects. Every item in this phase uses existing fields in the S3 data model (input/output/cache tokens, timestamps, model names, member IDs, session IDs) — no new data collection is required from the agent.

The result is a dashboard that transforms from "how much did we use?" to "how efficiently are we using AI, and what is it costing us?" This phase delivers the clearest ROI to engineering managers who must justify Claude Code licenses and to developers who want to understand their personal cost efficiency.

**Key insight**: All Phase 2 metrics are computed in the aggregator Lambda and stored in pre-computed view JSON files. The dashboard renders pre-computed data only; no client-side computation from raw data.

**Why Phase 1 must be complete first**: Cost forecasting, adoption tracking, and fleet monitoring on spoofable data is meaningless. Authentication ensures every data point is traceable to a verified developer identity.

---

## 2. Business Requirements

### 2.1 Problem Statement

The dashboard currently shows basic cost totals, token counts, and member rankings but provides no actionable insights. Engineering managers cannot answer:
- "What will our AI spend be at month-end?"
- "Are developers using the cache effectively?"
- "What does each prompt actually cost?"
- "Which hours see peak load across the team?"
- "Which agents are stale or running outdated versions?"

All the raw data to answer these questions is already being collected in S3 — it is just not being surfaced or aggregated into useful views.

### 2.2 Stakeholder Analysis

| Stakeholder | Role | Interest Level | Impact |
|-------------|------|----------------|--------|
| Engineering Managers | **Primary beneficiary** — Justify AI spend, optimize team usage | CRITICAL | HIGH — Actionable cost and adoption data |
| Finance / Budget Owners | Cost forecasting enables proactive budget management | HIGH | HIGH — Forecasting prevents budget surprises |
| Developers | See their own usage patterns, cache effectiveness | MEDIUM | MEDIUM — New insights but no workflow change |
| System Administrators | Agent fleet monitoring is operationally relevant | HIGH | MEDIUM — Better visibility into agent health |
| Security / Compliance Officers | Tangential interest in adoption metrics | LOW | LOW |

### 2.3 Business Value & ROI

**Quantifiable Benefits**:
- **Cost Optimization**: P-1 (cost per prompt) + P-2 (cache hit rate) together can identify 15-30% cost savings opportunities. If monthly AI spend is $2,000 for 50 developers, a 20% optimization saves $400/month ($4,800/year).
- **Budget Accuracy**: P-13 (cost forecasting) replaces reactive end-of-month surprises with proactive mid-month projections. Managers can adjust team guidance before budgets are exceeded.
- **License Optimization**: P-19 (adoption rate) identifies unused licenses. At $20/seat/month, reclaiming 5 inactive seats saves $100/month ($1,200/year).
- **Operational Efficiency**: A-24 (fleet monitoring) reduces time spent troubleshooting agent issues from hours to minutes.

**ROI Estimation**: ~60-80 dev-hours investment yields $6,000+/year in identifiable savings, plus intangible benefits of informed AI adoption decisions.

**Strategic Alignment**:
- Demonstrates tangible value of the monitoring system to stakeholders, building organizational support for Phases 3-6.
- Provides baseline metrics needed for Phase 5 (benchmarks, individual insights).

### 2.4 Success Metrics

| KPI | Target | Measurement |
|-----|--------|-------------|
| Cost forecast accuracy | Month-end projection within 15% of actual | Compare mid-month forecast to actual month-end cost |
| Cache hit rate visibility | Displayed for 100% of members with data | Dashboard coverage check |
| Analytics page load time | < 2 seconds for all new widgets | Performance testing |
| Agent fleet visibility | 100% of registered agents visible with status | Fleet dashboard check |
| Dashboard engagement | 3x increase in weekly active dashboard users | Login event tracking from Phase 1 |
| Feature adoption | All 7 metrics visible on dashboard within 2 weeks | Deployment verification |

### 2.5 Compliance Mapping

Phase 2 has minimal direct compliance impact but provides supporting evidence for:

| Control | Standard | Relevance |
|---------|----------|-----------|
| A.12.1.3 | ISO 27001 | Capacity management — P-13 (forecasting) and P-7 (peak hours) support capacity planning |
| A.12.4.1 | ISO 27001 | Event logging — A-24 (agent monitoring) provides operational logging |

---

## 3. Functional Requirements

### 3.1 User Stories with Acceptance Criteria

#### US-2.1: Cost Per Prompt Metric [P-1]

**As an** engineering manager,
**I want** to see the average cost per prompt (request) broken down by member, project, and model,
**so that** I can identify which use patterns are cost-efficient and which are wasteful.

**Acceptance Criteria:**
- [ ] Dashboard displays "Avg Cost/Prompt" metric in the team summary stats bar
- [ ] Member detail view shows cost-per-prompt for the selected month
- [ ] Cost-per-prompt is calculated as `totalCostUsd / totalRequests` at each granularity level
- [ ] Input/output token ratio (`inputTokens / outputTokens`) is displayed alongside cost — high ratio (>50:1) is flagged as "large context, small output"
- [ ] Aggregator computes and stores this metric in `views/dashboard.json` and `views/members/{id}/{year}.json`
- [ ] Metric is available per-model to compare efficiency across Opus, Sonnet, Haiku

**Effort**: S (Small) — Aggregator math + dashboard widget
**MoSCoW**: Must

---

#### US-2.2: Cache Hit Rate [P-2]

**As a** developer,
**I want** to see my cache hit rate for Claude Code interactions,
**so that** I can understand whether my prompt patterns are leveraging caching effectively and reduce costs.

**Acceptance Criteria:**
- [ ] Cache hit rate calculated as: `cacheReadTokens / (inputTokens + cacheCreationTokens)` (where cacheCreationTokens > 0 or cacheReadTokens > 0)
- [ ] Displayed as a percentage badge on each member's card/ranking entry
- [ ] Member detail view shows cache hit rate trend over time (monthly line chart)
- [ ] Team-average cache hit rate shown on the dashboard summary
- [ ] Color coding: green (>60%), yellow (30-60%), red (<30%)
- [ ] Tooltip explains what cache hit rate means and how to improve it
- [ ] Edge case handled: when both cacheCreationTokens and cacheReadTokens are 0, display "N/A" (no caching available for that model/request)

**Effort**: S (Small) — Aggregator math + dashboard widget
**MoSCoW**: Must

---

#### US-2.3: Peak Usage Hours Heatmap [P-7]

**As an** engineering manager,
**I want** a 24x7 heatmap showing when Claude Code usage peaks across the team,
**so that** I can understand work patterns, detect after-hours usage, and plan infrastructure capacity.

**Acceptance Criteria:**
- [ ] Heatmap grid: 7 columns (Mon-Sun) x 24 rows (0:00-23:00)
- [ ] Cell color intensity represents request count (gradient from light to dark)
- [ ] Hovering a cell shows tooltip: day-of-week, hour, request count, total cost
- [ ] Available at team level (dashboard) and per-member level (detail view)
- [ ] Aggregator pre-computes hourly distribution in views
- [ ] Uses existing timestamp data from usage entries (no new data collection needed)
- [ ] Hourly bucket data computed at sync time and stored in `aggregated/` files (Option A: sync-time bucketing)

**Effort**: M (Medium) — New chart component + aggregator hourly bucketing
**MoSCoW**: Must

---

#### US-2.4: Cost Forecasting [P-13]

**As a** finance stakeholder,
**I want** to see a projected month-end cost based on current usage trends,
**so that** I can anticipate budget needs and flag potential overruns before they happen.

**Given** it is day N of a 30-day month and the team has spent $X so far,
**When** the dashboard loads,
**Then** a "Projected Month-End" figure is displayed using weighted linear extrapolation,
**And** a confidence indicator is shown based on days elapsed.

**Acceptance Criteria:**
- [ ] Projection displayed prominently on the dashboard summary (alongside actual spend)
- [ ] Visual indicator: on-track (green), trending high (yellow, >120% of last month), trending very high (red, >150%)
- [ ] Per-member projected cost shown in member list
- [ ] Calculation uses weighted recent days (last 7 days weighted more heavily) for better accuracy
- [ ] Projection is only shown after day 5 of the month (insufficient data before that)
- [ ] Confidence levels: `low` if < 7 days elapsed, `medium` if 7-20 days, `high` if > 20 days
- [ ] Confidence level displayed alongside projection (e.g., "Projected: $1,450 (medium confidence)")

**Effort**: M (Medium) — Projection logic + dashboard widget
**MoSCoW**: Must

---

#### US-2.5: AI Adoption Rate [P-19]

**As an** engineering manager,
**I want** to see what percentage of registered team members are actively using Claude Code,
**so that** I can track adoption of AI tools and identify members who may need onboarding support.

**Acceptance Criteria:**
- [ ] "Adoption Rate" widget on dashboard: `(members with >= 1 request this month) / (total registered members) * 100%`
- [ ] Trend line showing adoption rate for the past 6 months
- [ ] List of inactive members (registered but no usage this month) available in an expandable section
- [ ] Definition of "active" is configurable (default: >= 1 request in current month)
- [ ] Aggregator computes from member registry (`members/index.json`) + monthly aggregated data
- [ ] Mini progress bar inside the card. Shows "N of M active this month."

**Effort**: S (Small) — Simple ratio calculation
**MoSCoW**: Should

---

#### US-2.6: Conversation Length Distribution [P-25]

**As an** engineering manager,
**I want** to see the distribution of conversation lengths (requests per session),
**so that** I can understand whether developers are having productive focused sessions or struggling with long back-and-forth exchanges.

**Acceptance Criteria:**
- [ ] Histogram chart showing distribution of requests per session (grouped by sessionId)
- [ ] Session length categories:
  - Quick Lookup: 1-3 requests
  - Focused Work: 4-20 requests
  - Deep Dive: 21-50 requests
  - Marathon: 50+ requests
- [ ] Available at team level and per-member level
- [ ] Long sessions (>50 requests) are flagged as potential "struggle sessions" worth investigating
- [ ] Average session length metric displayed as a summary stat
- [ ] Data sourced from existing `sessionId` field in usage entries
- [ ] Entries with `sessionId: null` are counted as single-request sessions

**Effort**: M (Medium) — Session grouping in aggregator + histogram chart
**MoSCoW**: Should

---

#### US-2.7: Agent Fleet Monitoring [A-24]

**As an** admin,
**I want** a fleet monitoring view showing all registered agents with their last sync time, version, and health status,
**so that** I can quickly identify stale agents, version mismatches, and sync problems.

**Acceptance Criteria:**
- [ ] Table view showing all agents: member email, hostname, last sync timestamp, agent version, sync interval, status
- [ ] Status derived from last sync:
  - Healthy (online): synced within 2x interval
  - Warning (stale): synced 2-6x interval overdue
  - Offline: no sync in > 6x interval or never synced
  - Outdated: agent version < latest version (amber badge)
- [ ] Agent version distribution chart (pie or bar) to track update adoption
- [ ] Sort and filter by status, version, last sync
- [ ] Data sourced from existing sync-logs and member registry
- [ ] Refreshes automatically every 5 minutes (TanStack Query)
- [ ] Summary footer shows "N online, N stale, N offline"
- [ ] Admin only (hide for member/agent roles); click row opens member detail DataSheet

**Effort**: M (Medium) — New admin page + sync-log data extraction
**MoSCoW**: Should

### 3.2 API Specifications

No new API endpoints are required for Phase 2. All analytics data is added to existing view files and served through existing endpoints.

The response schemas are extended (additive, backward compatible):

| Endpoint | New Fields Added |
|----------|-----------------|
| `GET /api/dashboard` | `analytics`, `costForecast`, `adoptionMetrics`, `fleetHealth`, `hourlyActivity`, `sessionDistribution` |
| `GET /api/members/:id?year=` | `analytics.monthlyMetrics` (per-month: cache rate, cost/request, session stats) |

#### Extended `GET /api/dashboard` Response Schema

```typescript
interface DashboardView {
  // --- Existing fields (unchanged) ---
  generatedAt: string;
  currentMonth: { year: number; month: number };
  teamTotals: {
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    recordCount: number;
    activeMembers: number;
  };
  dailyTrend: Array<{ date: string; costUsd: number; recordCount: number }>;
  memberRankings: Array<{ memberId: string; name: string; costUsd: number; rank: number }>;
  modelDistribution: Array<{ model: string; costUsd: number; percentage: number }>;

  // --- NEW Phase 2 fields ---
  analytics: {
    avgCostPerRequest: number;           // teamTotals.costUsd / teamTotals.recordCount
    avgInputOutputRatio: number;         // teamTotals.inputTokens / teamTotals.outputTokens
    teamCacheHitRate: number;            // teamTotals.cacheReadTokens / (inputTokens + cacheCreationTokens)
    costPerRequestTrend: Array<{         // last 30 days
      date: string;
      value: number;
    }>;
  };

  costForecast: CostForecast;

  adoptionMetrics: AdoptionMetrics;

  fleetHealth: FleetHealth;

  hourlyActivity: Array<{
    dayOfWeek: number;    // 0=Sunday, 6=Saturday
    hour: number;         // 0-23
    requestCount: number;
    costUsd: number;
  }>;

  sessionDistribution: Array<{
    bucket: 'quick' | 'focused' | 'deep' | 'marathon';
    label: string;        // "Quick Lookup (1-3)", etc.
    count: number;
    percentage: number;
  }>;
}

interface CostForecast {
  currentMonthActual: number;          // cost so far this month
  currentMonthProjected: number;       // extrapolated to month end
  daysElapsed: number;
  daysRemaining: number;
  dailyAverage: number;                // currentMonthActual / daysElapsed
  projectedChangePercent: number;      // vs last month's total
  confidence: 'low' | 'medium' | 'high';  // low if < 7 days data
}

interface AdoptionMetrics {
  totalRegistered: number;
  activeThisMonth: number;
  adoptionRate: number;                // activeThisMonth / totalRegistered
  adoptionTrend: Array<{               // last 6 months
    month: string;                     // "2026-01"
    rate: number;
  }>;
  inactiveMembers: Array<{             // members who have not synced in 30+ days
    memberId: string;
    name: string;
    lastSyncAt: string;
    daysSinceLastSync: number;
  }>;
}

interface FleetHealth {
  totalAgents: number;
  activeAgents: number;               // synced in last 24 hours
  staleAgents: number;                // synced 1-7 days ago
  offlineAgents: number;              // not synced in 7+ days
  versionDistribution: Record<string, number>;   // version -> count
  latestVersion: string;
  agentsOnLatest: number;
  agents: Array<{
    memberId: string;
    name: string;
    lastSyncAt: string;
    agentVersion: string;
    hostname: string;
    status: 'active' | 'stale' | 'offline';
  }>;
}
```

#### Extended `GET /api/members/:id?year=` Response Schema

```typescript
interface MemberYearlyView {
  // --- Existing fields (unchanged) ---
  memberId: string;
  name: string;
  year: number;
  months: Record<string, MonthSummary>;  // keyed by month number "1"-"12"

  // --- NEW Phase 2 fields ---
  analytics: {
    monthlyMetrics: Record<string, {     // keyed by month "1"-"12"
      avgCostPerRequest: number;
      cacheHitRate: number;
      inputOutputRatio: number;
      sessionCount: number;
      avgRequestsPerSession: number;
      sessionDistribution: {
        quick: number;
        focused: number;
        deep: number;
        marathon: number;
      };
      hourlyHeatmap: Array<{
        dayOfWeek: number;
        hour: number;
        requestCount: number;
        costUsd: number;
      }>;
    }>;
  };
}
```

### 3.3 Data Model Changes

#### Extended `aggregated/{memberId}/{year}-{month}.json` Schema

```typescript
// Added to existing MonthAggregation
interface ExtendedMonthAggregation extends MonthAggregation {
  analytics: {
    // --- P-1: Cost per prompt ---
    avgCostPerRequest: number;           // totals.costUsd / totals.recordCount
    avgInputTokensPerRequest: number;    // totals.inputTokens / totals.recordCount
    avgOutputTokensPerRequest: number;   // totals.outputTokens / totals.recordCount
    inputOutputRatio: number;            // totals.inputTokens / totals.outputTokens
    avgCostPerModel: Record<string, {    // per-model average cost
      avgCost: number;
      avgInputTokens: number;
      avgOutputTokens: number;
      requestCount: number;
    }>;

    // --- P-2: Cache hit rate ---
    cacheHitRate: number;                // month-level ratio
    cacheCreationTokens: number;         // total cache creation
    cacheReadTokens: number;             // total cache reads
    dailyCacheRate: Array<{
      date: string;
      cacheHitRate: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
    }>;
    cacheRateByModel: Record<string, number>;   // per-model cache rate

    // --- P-7: Hourly heatmap ---
    hourlyHeatmap: Array<{
      dayOfWeek: number;     // 0=Sunday, 6=Saturday
      hour: number;          // 0-23
      requestCount: number;
      costUsd: number;
    }>;

    // --- P-25: Session analytics ---
    sessionCount: number;
    avgRequestsPerSession: number;
    sessionDistribution: {
      quick: number;         // 1-3 requests
      focused: number;       // 4-10 requests
      deep: number;          // 11-30 requests
      marathon: number;      // 31+ requests
    };
  };
}
```

**Sync-time computation**: Both the hourly heatmap and session distribution are computed at sync time (when entries are written to `aggregated/` files), not during the aggregation Lambda. This avoids the aggregator needing to re-read `raw/` files for every aggregation cycle.

#### No New S3 Keys

All Phase 2 data fits into existing key patterns. No migration of S3 structure is needed. The only changes are additive fields in existing JSON files.

---

## 4. Non-Functional Requirements

### 4.1 Performance (Aggregator Impact)

| Change | Aggregator Impact | Dashboard Impact |
|--------|------------------|-----------------|
| Hourly heatmap computation | +50ms per member (parse timestamps at sync time) | None (pre-computed) |
| Session grouping | +30ms per member (group by sessionId at sync time) | None (pre-computed) |
| Cost forecasting | +5ms (simple weighted arithmetic) | None (pre-computed) |
| Adoption metrics | +10ms (scan member registry) | None (pre-computed) |
| Fleet health | +10ms (scan member registry) | None (pre-computed) |

**Total aggregator impact**: ~100ms additional per member. For 500 members, adds ~50 seconds to the hourly aggregation cycle. The Lambda timeout is 300 seconds, providing adequate headroom.

### 4.2 Data Volume (View JSON Size Increases)

| File | Size Increase | Notes |
|------|--------------|-------|
| `aggregated/{memberId}/{year}-{month}.json` | +2-3KB/month | Hourly heatmap (168 cells) + session distribution (4 buckets) |
| `views/dashboard.json` | +2-5KB | Fleet data (one row per member) dominates |
| `views/members/{memberId}/{year}.json` | +1KB | 12 months of analytics objects |

These are negligible increases relative to existing data volumes.

### 4.3 Backward Compatibility (Additive Schema Changes)

All Phase 2 changes are strictly additive to existing JSON schemas. The dashboard components that consumed the existing API responses continue to work unmodified. New dashboard components access the new fields. Old dashboard deployments (e.g., during a phased rollout) simply ignore the new fields.

**No breaking changes.** No migrations required for existing data structures. The aggregator can be rerun with `?force=true` to backfill analytics for historical months using data already present in `raw/` files.

---

## 5. UX Requirements

### 5.1 Enhanced Dashboard StatsGrid (P-1, P-2, P-13, P-19)

The existing 4-card StatsGrid expands to show 8 key metrics in two rows. The top row keeps the existing 4 metrics. A second row adds new analytics metrics.

**New stat cards (second row)**:

1. **Avg Cost/Prompt** (P-1): `totalCost / totalRequests`. Shows average cost per API request with a trend arrow comparing to the previous month.
2. **Cache Hit Rate** (P-2): `cacheReadTokens / (inputTokens + cacheCreationTokens) * 100`. Mini progress bar inside the card. Color-coded: green >60%, amber 30-60%, red <30%.
3. **Adoption Rate** (P-19): `activeMembers / totalMembers * 100`. Mini progress bar. Shows "N of M active this month."
4. **Cost Forecast** (P-13): Linear extrapolation from daily average * remaining days. Shows projected month-end cost. Color-coded vs previous month.

```
+------------------------------------------------------+
| Dashboard                                             |
| Team usage overview for the current period            |
+------------------------------------------------------+
|                                                       |
| +------------+ +------------+ +------------+ +------+|
| | Total Cost | | Total      | | Active     | | Avg  ||
| | $1,234.56  | | Tokens     | | Members    | | Cost ||
| |  +12.3%    | | 45.2M      | | 8 of 12    | |/Memb ||
| +------------+ +------------+ +------------+ +------+|
|                                                       |
| +------------+ +------------+ +------------+ +------+|
| | Avg Cost/  | | Cache Hit  | | Adoption   | | Cost ||
| | Prompt     | | Rate       | | Rate       | | Fore ||
| | $0.023     | | 67.3%      | | 66.7%      | | cast ||
| |            | | [=====-]   | | [======-]  | |$2.1k ||
| +------------+ +------------+ +------------+ +------+|
|                                                       |
```

**Component change**: Enhance `components/shared/stats-grid.tsx` — add `description` and `progressBar` optional fields to `StatCardItem`.

### 5.2 Peak Activity Heatmap (P-7)

A 24x7 grid showing request density by hour of day and day of week. Uses the same heat color scale as the existing `UsageHeatMap` component but applied to a fixed 24-row x 7-column grid.

```
+---------------------------+
| Peak Activity Heatmap     |
| (P-7)                     |
|    M T W T F S S          |
| 0h [ ][ ][ ][ ][ ][ ][ ] |
| 3h [ ][ ][ ][ ][ ][ ][ ] |
| 6h [ ][ ][ ][ ][ ][ ][ ] |
| 9h [X][X][ ][ ][ ][ ][ ] |
|12h [X][X][X][X][ ][ ][ ] |
|15h [X][X][X][X][X][ ][ ] |
|18h [ ][ ][ ][X][ ][ ][ ] |
|21h [ ][ ][ ][ ][ ][ ][ ] |
+---------------------------+
```

**Interactions**:
- Hover any cell to see tooltip: "Monday 14:00-15:00: 342 requests"
- Available at both team level (dashboard) and per-member level (member detail DataSheet)

**New component**: `components/charts/hourly-heatmap-chart.tsx`
- Props: `data: {day: 0-6, hour: 0-23, count: number}[], title, className`
- Chart type: Custom SVG grid or Recharts `ScatterChart`

**Data source**: `views/dashboard.json` → `hourlyActivity` array

### 5.3 Session Length Distribution (P-25)

A bar chart (histogram) showing the distribution of conversation lengths across the team.

```
+----------------------+
| Session Length Dist. |
| (P-25)              |
|                     |
| |##  |              |
| |### |              |
| |####|              |
| |##  |              |
| |#   |              |
| 1-3  5-20 20+ 50+  |
|  quick focused deep |
|         marathon    |
+----------------------+
```

**Buckets**:
- Quick Lookup: 1-3 requests per session
- Focused Work: 4-20 requests
- Deep Dive: 21-50 requests
- Marathon: 50+ requests

**New component**: `components/charts/session-distribution-chart.tsx`
- Props: `data: {bucket: string, count: number, percentage: number}[], title, className`
- Chart type: Recharts `BarChart` with custom bar labels showing count and percentage

**Data source**: `views/dashboard.json` → `sessionDistribution` array

### 5.4 Agent Fleet Status (A-24)

A compact table/list showing all registered agents with their health status. Visible only to admin-role users.

```
+---------------------------------------------------+
| Agent Fleet Status (A-24)                          |
|                                                    |
| [O] alice@tvf    v0.4.0  synced 5m ago   [OK]    |
| [O] bob@tvf      v0.4.0  synced 12m ago  [OK]    |
| [!] charlie@tvf  v0.3.1  synced 3h ago   [STALE] |
| [X] dave@tvf     v0.3.1  synced 2d ago   [DOWN]  |
|                                                    |
| 10 online  2 stale  1 offline                      |
+---------------------------------------------------+
```

**Status logic**:

| Condition | Status | Icon | Color |
|-----------|--------|------|-------|
| Last sync < 2x interval | Online | `Wifi` | Green |
| Last sync 2-6x interval | Stale | `AlertTriangle` | Amber |
| Last sync > 6x interval or never | Offline | `WifiOff` | Red |
| Agent version < latest | Outdated | `AlertTriangle` | Amber badge |

**New components**:
- `components/dashboard/agent-fleet-status.tsx` — Props: `members: FleetMember[], className`
- `components/shared/fleet-status-badge.tsx` — Props: `status: 'online'|'stale'|'offline', label`

**Data source**: `views/dashboard.json` → `fleetHealth` object

### 5.5 Enhanced Member Detail (P-1, P-2)

Add a new "Efficiency Metrics" section to the existing member detail DataSheet slide-over panel.

```
+------------------------------------------------------+
| [X]  Alice Johnson                                    |
|      alice@techvify.com.vn                            |
+------------------------------------------------------+
|                                                       |
| YEAR TO DATE                                          |
| Cost: $234.56  |  Send: 12.3M  |  Receive: 4.5M     |
|                                                       |
| EFFICIENCY METRICS (NEW)                              |
| +--------------------------------------------------+ |
| | Avg Cost/Prompt: $0.018  | Cache Rate: 72.1%     | |
| | Input/Output Ratio: 3.2  | Requests: 1,234       | |
| +--------------------------------------------------+ |
|                                                       |
| PERIOD SELECTION                                      |
| Year: [2025] [2026]                                   |
| Month: [Jan] [Feb*] [Mar] ...                         |
|                                                       |
| [...existing heatmap...]                              |
|                                                       |
| FEBRUARY 2026 SUMMARY                                 |
| Cost | Send | Receive | Requests | Prompts            |
| $45  | 2.1M | 890K   | 234      | 180                |
|                                                       |
| [...existing charts: Daily Cost, Model Dist, Daily...]|
|                                                       |
| MODELS USED                                           |
| [Opus] [Sonnet] [Haiku]                               |
|                                                       |
+------------------------------------------------------+
```

**New "Efficiency Metrics" section** — 2x2 compact grid using StatsBar pattern:
- `Avg Cost/Prompt`: totalCost / recordCount for the selected period
- `Cache Hit Rate`: cacheReadTokens / (inputTokens + cacheCreationTokens) * 100
- `Input/Output Ratio`: inputTokens / outputTokens (higher = more context, less generation)
- Total `Requests` count

**Component change**: Update `components/members/member-detail-content.tsx`

### 5.6 Phase 2 Complete Component Inventory

| Component | Type | Location | Props |
|-----------|------|----------|-------|
| `HourlyHeatmapChart` | New | `components/charts/hourly-heatmap-chart.tsx` | `data: {day, hour, count}[], title, className` |
| `SessionDistributionChart` | New | `components/charts/session-distribution-chart.tsx` | `data: {bucket, count, percentage}[], title, className` |
| `AgentFleetStatus` | New | `components/dashboard/agent-fleet-status.tsx` | `members: FleetMember[], className` |
| `FleetStatusBadge` | New | `components/shared/fleet-status-badge.tsx` | `status: 'online'|'stale'|'offline', label` |
| `MiniProgressBar` | New | `components/shared/mini-progress-bar.tsx` | `value: number, max: number, colorThresholds` |
| `CostForecastCard` | New | `components/dashboard/cost-forecast-card.tsx` | `projected: number, current: number, daysRemaining: number, confidence` |
| Enhanced `StatsGrid` | Update | `components/shared/stats-grid.tsx` | Add `description` and `progressBar` to `StatCardItem` |
| Enhanced `MemberDetailContent` | Update | `components/members/member-detail-content.tsx` | Add efficiency metrics section |

**New TanStack Query keys**:
```typescript
queryKeys.dashboard.hourlyActivity(dateRange)
queryKeys.dashboard.sessionDistribution(dateRange)
queryKeys.dashboard.fleetStatus()
queryKeys.dashboard.costForecast()
queryKeys.dashboard.adoptionMetrics()
```

### 5.7 Phase 2 User Flows

#### Flow: Dashboard Overview

```
1. User logs in
2. Dashboard page loads
3. StatsGrid shows 8 key metrics (existing 4 + new 4)
4. Charts section shows:
   a. Daily Cost Trend (existing)
   b. Treemap/Pie toggle (existing)
   c. Peak Activity Heatmap (NEW)
   d. Session Length Distribution (NEW)
   e. Agent Fleet Status (NEW, admin only)
5. User hovers Peak Activity cell -> tooltip with time + count
6. User clicks fleet row -> DataSheet opens with member detail
```

#### Flow: Cache Hit Rate Drill-down

```
1. User sees low cache rate (red) on dashboard stats
2. User navigates to Members page
3. Members are sortable by cache rate (new sort option)
4. User clicks member with lowest cache rate
5. DataSheet opens showing member's cache rate trend
6. User identifies months with low rates for follow-up
```

#### Flow: Cost Forecasting Review

```
1. Finance stakeholder opens dashboard mid-month
2. Cost Forecast card shows projected month-end cost
3. Color coding indicates "trending high" (amber, >120% of last month)
4. Stakeholder clicks card for detail -> shows daily breakdown
5. Stakeholder alerts team lead to review usage patterns
```

---

## 6. Technical Architecture

### 6.1 Aggregation Logic Changes

**Principle**: All computation happens server-side in the aggregator (Lambda or sync endpoint). The dashboard renders pre-computed JSON only.

Two tiers of computation:
1. **Sync-time computation** (in `lambda-server/src/routes/sync.ts`): Hourly buckets and session grouping — computed as entries arrive, incrementally updated in `aggregated/` files.
2. **Aggregator Lambda computation** (in `lambda-server/src/aggregator.ts`): Cost forecasting, adoption metrics, fleet health — computed once per aggregation cycle from `aggregated/` summary data.

### 6.2 Sync-Time Computation (Hourly Buckets and Session Grouping)

**Rationale for sync-time**: Options were:
- **Option A (chosen)**: Extend sync-time aggregation to include hourly buckets in the `aggregated/` files. Adds ~200 bytes per day but avoids the aggregator needing to re-read `raw/` files.
- **Option B (rejected)**: Have the aggregator read raw data for hourly breakdown. Significantly increases aggregator runtime and S3 read costs.

**Hourly bucketing (P-7)**: When processing entries in `src/routes/sync.ts`, extract `hour` and `dayOfWeek` from each entry's timestamp and accumulate into hourly buckets in the `aggregated/` file.

```typescript
// src/routes/sync.ts additions
function extractHourlyBucket(timestamp: string): { dayOfWeek: number; hour: number } {
  const d = new Date(timestamp);
  return {
    dayOfWeek: d.getUTCDay(),  // stored in UTC, converted in browser
    hour: d.getUTCHours(),
  };
}
```

**Session grouping (P-25)**: Track unique `sessionId` values and their request counts in a lightweight map during entry processing. Store session summary stats (count per bucket) in the aggregated file.

```typescript
// src/routes/sync.ts additions
function updateSessionStats(
  current: SessionAnalytics,
  entries: UsageEntry[]
): SessionAnalytics {
  const sessionCounts = new Map<string, number>();
  for (const entry of entries) {
    const key = entry.sessionId ?? `__orphan_${entry.requestId}`;
    sessionCounts.set(key, (sessionCounts.get(key) ?? 0) + 1);
  }
  // Bucket sessions into categories and merge with existing stats
  // ...
}
```

### 6.3 Cost Forecasting Algorithm (P-13)

```typescript
// src/aggregator.ts additions
function computeCostForecast(
  dailyTrend: Array<{ date: string; costUsd: number }>,
  currentMonth: { year: number; month: number }
): CostForecast {
  const today = new Date();
  const daysElapsed = today.getDate();
  const daysInMonth = new Date(currentMonth.year, currentMonth.month, 0).getDate();
  const daysRemaining = daysInMonth - daysElapsed;

  if (daysElapsed < 5) {
    return {
      currentMonthActual: sum(dailyTrend.map(d => d.costUsd)),
      currentMonthProjected: 0,
      daysElapsed,
      daysRemaining,
      dailyAverage: 0,
      projectedChangePercent: 0,
      confidence: 'low',
    };
  }

  // Weighted moving average: last 7 days weighted 2x vs earlier days
  const recentDays = dailyTrend.slice(-7);
  const olderDays = dailyTrend.slice(0, -7);
  const weightedAvg = (
    sum(recentDays.map(d => d.costUsd)) * 2 +
    sum(olderDays.map(d => d.costUsd))
  ) / (recentDays.length * 2 + olderDays.length);

  const actualSoFar = sum(dailyTrend.map(d => d.costUsd));
  const projected = actualSoFar + (weightedAvg * daysRemaining);

  return {
    currentMonthActual: actualSoFar,
    currentMonthProjected: projected,
    daysElapsed,
    daysRemaining,
    dailyAverage: weightedAvg,
    projectedChangePercent: 0,  // computed against last month total
    confidence: daysElapsed < 7 ? 'low' : daysElapsed < 20 ? 'medium' : 'high',
  };
}
```

### 6.4 Infrastructure Changes

**None required for Phase 2.** No new AWS resources, no `serverless.yml` changes, no new Lambda dependencies. All Phase 2 data fits into existing key patterns and existing Lambda functions.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| Phase 1 complete | Hard prerequisite | Dashboard auth (S-2) must be in place before adding analytics. Spoofable data makes forecasting meaningless. |
| `sessionId` field population | Data dependency | P-25 (conversation length) depends on `sessionId` being reliably captured in JSONL entries. Verify population rate in existing data before implementing histogram. |
| Agent JSONL timestamp format | Data dependency | P-7 (hourly heatmap) requires reliable UTC timestamps. Verify no timezone issues in existing log entries. |

### 7.2 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cost forecasting inaccuracy in early months | HIGH | LOW | Label projections clearly as "estimates based on N days of data." Require minimum 5 days of data before showing forecast. |
| Cache hit rate metric misinterpreted | MEDIUM | MEDIUM | Provide contextual tooltips explaining what "good" cache rates look like. Not all low cache rates are bad (exploratory coding). |
| Adoption rate denominator inaccuracy | MEDIUM | LOW | Ensure member registry accurately reflects active team size. Provide mechanism to mark members as "inactive/departed" vs "not using AI." |
| Session ID gaps in data | MEDIUM | LOW | Treat null sessionId entries as single-request sessions. Document this assumption in tooltip. |
| Dashboard performance impact from new visualizations | LOW | MEDIUM | All computations happen in the aggregator (server-side). Dashboard only renders pre-computed JSON. No client-side heavy computation. |
| Agent monitoring alerts create noise | LOW | LOW | Start with conservative thresholds (no sync in 48h = warning, 7d = alert). Allow admin-configurable thresholds. |
| Historical data lacks hourly/session breakdowns | MEDIUM | LOW | Run aggregator with `force=true` after deploy to recompute from raw data. Hourly data for entries before Phase 2 will be computed from raw timestamps. |

---

## 8. Implementation Plan

### Week 3 (Days 1-5)

```
1. [P-1] Cost per prompt aggregation logic + dashboard stats bar widget (4 hr)
   - Add analytics object to MonthAggregation schema
   - Compute avgCostPerRequest, inputOutputRatio in aggregator
   - Update views/dashboard.json schema
   - Add Avg Cost/Prompt card to StatsGrid second row

2. [P-2] Cache hit rate computation + dashboard chart (4 hr)
   - Add cacheHitRate fields to MonthAggregation.analytics
   - Handle edge case: no cache tokens → display "N/A"
   - Update views/dashboard.json and views/members/{id}/{year}.json
   - Add Cache Hit Rate card with MiniProgressBar to StatsGrid

3. [P-7] Hourly heatmap: sync-time aggregation + dashboard heatmap component (6 hr)
   - Extend sync.ts to extract hour/dayOfWeek and bucket
   - Update aggregated/ schema with hourlyHeatmap array
   - Build HourlyHeatmapChart component (24x7 SVG/Recharts grid)
   - Add to dashboard below existing charts

4. [P-13] Cost forecasting algorithm + dashboard forecast widget (4 hr)
   - Implement weighted moving average in aggregator
   - Add CostForecast to views/dashboard.json
   - Build CostForecastCard component with confidence indicator
   - Add to StatsGrid second row

   Note: All four items can be developed in parallel by different developers.
```

### Week 4 (Days 6-10)

```
5. [P-19] Adoption rate computation + dashboard widget (3 hr)
   - Read members/index.json, compare lastSyncAt to current month bounds
   - Add AdoptionMetrics to views/dashboard.json
   - Add Adoption Rate card with trend sparkline to StatsGrid second row

6. [P-25] Session distribution: sync-time grouping + dashboard histogram (5 hr)
   - Extend sync.ts to group entries by sessionId and bucket
   - Update aggregated/ schema with sessionDistribution
   - Build SessionDistributionChart component
   - Add to dashboard alongside heatmap

7. [A-24] Fleet health view + dashboard fleet card (4 hr)
   - Compute FleetHealth from members/index.json in aggregator
   - Add FleetHealth to views/dashboard.json
   - Build AgentFleetStatus component (admin-only)
   - Add below session distribution chart

8. Integration testing + view schema validation (4 hr)
   - Test all new fields present in API responses
   - Verify backward compatibility (old dashboard ignores new fields)
   - Test edge cases: no sessions, no cache tokens, < 5 days data

9. Force re-aggregation to backfill analytics for historical data (1 hr)
   - POST /api/admin/aggregate?force=true
   - Verify historical months now include analytics fields
```

**Total estimate**: ~35 backend hours + ~26 frontend hours = ~61 hours for 2 developers over 2 weeks

**Critical path**: None — all items are independent and can be parallelized across backend (aggregator) and frontend (dashboard components) tracks.

---

## 9. Acceptance Criteria & Test Strategy

### 9.1 Acceptance Tests (per user story)

| User Story | Test | Pass Condition |
|------------|------|----------------|
| US-2.1 (P-1) | Dashboard stats bar loads | "Avg Cost/Prompt" card visible with correct value |
| US-2.1 (P-1) | Member detail view | Cost-per-prompt displayed for current month |
| US-2.2 (P-2) | Cache rate display | Color-coded badge visible on each member card |
| US-2.2 (P-2) | Zero-cache edge case | "N/A" shown for members with no cache tokens |
| US-2.3 (P-7) | Heatmap renders | 24x7 grid visible on dashboard |
| US-2.3 (P-7) | Heatmap tooltip | Hover cell shows request count and cost |
| US-2.4 (P-13) | Forecast calculation | Day 15 projection within 15% of month-end actual (simulation test) |
| US-2.4 (P-13) | Early month suppression | Forecast hidden before day 5 |
| US-2.5 (P-19) | Adoption rate | Correct percentage shown when registry has 12 members, 8 active |
| US-2.6 (P-25) | Histogram buckets | Four buckets shown with correct counts |
| US-2.6 (P-25) | Null sessionId | Single-request session counted in Quick bucket |
| US-2.7 (A-24) | Fleet status hidden | Fleet table not visible to member-role users |
| US-2.7 (A-24) | Fleet status visible | Admin sees table with correct status badges |
| US-2.7 (A-24) | Stale detection | Agent with 3x interval overdue shows STALE status |

### 9.2 Performance Tests

| Test | Target | Tool |
|------|--------|------|
| Dashboard page load (with all new widgets) | < 2 seconds | Browser DevTools Network tab |
| Aggregator runtime with 100 members | < 60 seconds total | Lambda duration CloudWatch metric |
| View JSON size: views/dashboard.json | < 50KB | S3 object size check |

### 9.3 Backward Compatibility Test

- Deploy Phase 2 aggregator without deploying Phase 2 dashboard
- Verify existing dashboard still renders correctly (new fields silently ignored)
- Verify `GET /api/dashboard` response still includes all existing fields

---

## 10. References

| Document | Location | Relevant Sections |
|----------|----------|-------------------|
| PRD Draft | `grooming-artifacts/planning-artifacts/prd-draft.md` | Phase 2 (§2) — all user stories and effort sizing |
| Business Analysis | `grooming-artifacts/planning-artifacts/analysis.md` | Phase 2 (§3) — stakeholder analysis, ROI, risk assessment |
| Technical Architecture | `grooming-artifacts/planning-artifacts/architecture.md` | Phase 2 (§Phase 2) — TypeScript interfaces, sync-time vs aggregator decision, implementation order |
| UX Design | `grooming-artifacts/planning-artifacts/ux-design.md` | Phase 2 (§6) — ASCII wireframes, component inventory, user flows |
| Decision Log | `grooming-artifacts/planning-artifacts/decision-log.md` | Decision 6 (streaming aggregation deferred to Phase 6) |
| CLAUDE.md | `/CLAUDE.md` | S3 bucket layout, three-layer architecture, API endpoints |
