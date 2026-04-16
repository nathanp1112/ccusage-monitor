# SRS/BRD Phase 5: Advanced Analytics & Integrations

**Timeline**: Month 3-4
**Priority**: MEDIUM — Differentiation and team engagement
**Items**: P-18, P-20, P-21, P-30, A-9, A-10, A-13, A-29 (8 items — note: A-29 moved from Phase 5 to Phase 3 per Decision #3, but included here for reference as it was originally scoped here; its implementation is covered in Phase 3 SRS)
**Effective Phase 5 items**: P-18, P-20, P-21, P-30, A-9, A-10, A-13 (7 items after A-29 promotion)
**Estimated Effort**: 200–260 dev-hours (2–3 developers for 4–6 weeks; frontend-heavy)
**Dependencies**: Phase 2 (baseline metrics P-1 cost/prompt, P-2 cache rate for benchmarks), Phase 3 (RBAC S-10 for individual insights privacy, P-17 anomaly detection infrastructure for budget alerts, A-31 reports/views infrastructure), Phase 4 (RBAC already enforced for P-30 access controls)

---

## 1. Executive Summary

Phase 5 transforms the dashboard from a reporting tool into an intelligence platform. It introduces team benchmarking (anonymized percentile rankings), individual developer insights with personalized optimization tips, budget management with proactive alerts, and external integrations with tools teams already use (Slack/Teams notifications, GitHub PR correlation, CSV/PDF data export).

This is the "delight" phase — it moves beyond "what happened" to "what should we do about it" and surfaces insights that drive behavioral change across the development team. It also adds configurable date ranges (A-29, promoted to Phase 3 per Decision #3), the most-requested dashboard UX improvement.

**Why this matters**: Without integrations, the dashboard becomes "yet another tab" that people forget to check. Budget alerts prevent overruns. Developer insights create a feedback loop that improves team-wide AI efficiency over time. Export capabilities reduce ad-hoc data requests and integrate with existing enterprise reporting tools.

---

## 2. Business Requirements

### 2.1 Problem Statement

With security hardened and the core platform in place, the system needs to differentiate itself through deeper analytics and integrations with the tools teams already use:

- Managers need budget controls and team benchmarking to justify AI tool investment
- Developers want personalized insights but have no private self-assessment tool
- The system exists in isolation — no connection to Slack for notifications, GitHub for correlating AI usage with development output, or export formats for external analysis
- Without budget alerts, overruns are discovered at month-end when it is too late to act
- Without individual insights, developers have no way to self-improve their AI usage patterns

### 2.2 Stakeholder Analysis

| Stakeholder | Role | Interest Level | Impact |
|-------------|------|----------------|--------|
| Developers | **Primary beneficiary** of P-20 (benchmarks) and P-30 (personal insights) | **CRITICAL** — First time the system gives them personal value | **HIGH** — Behavioral change driver |
| Engineering Managers | Budget management, GitHub correlation, Slack alerts for anomalies | **CRITICAL** | **HIGH** — Proactive management capabilities |
| Security/Compliance Officers | Low direct interest | LOW | LOW |
| System Administrators | Export capabilities reduce ad-hoc data requests | MEDIUM | MEDIUM |
| Finance/Budget Owners | P-18 (budget alerts) is their top feature request | **CRITICAL** | **HIGH** — Automated budget enforcement |
| Team Leads | Onboarding curves help identify coaching opportunities | HIGH | MEDIUM |

### 2.3 Business Value & ROI

**Quantifiable Benefits**:

- **Budget Control**: P-18 prevents budget overruns. With proactive alerts at 80%, managers have time to adjust before hitting limits. Estimated savings: 1–2 budget overrun incidents prevented per quarter ($500–$2,000 each).
- **Developer Efficiency**: P-20 (benchmarks) + P-30 (insights) drive a 10–20% improvement in cache hit rates and model selection within 2 months (Hawthorne effect + actionable guidance). On a $3,000/month team: $300–$600/month saved.
- **Onboarding Acceleration**: P-21 identifies developers who take >4 weeks to reach team-average efficiency. Targeted coaching can reduce this to 2 weeks, saving ~$200/developer in suboptimal AI usage during ramp-up.
- **Communication Efficiency**: A-9 (Slack integration) reduces "check the dashboard" burden. 2 hours/week savings for 5 managers = 40 hours/month.
- **Cross-tool Correlation**: A-10 (GitHub) reveals AI ROI per project: "Project X spent $500 on AI and shipped 15 PRs this month" — enables data-driven resource allocation.
- **Reporting Efficiency**: A-13 (CSV export) replaces manual data extraction requests. 3 hours/month saved for admins.

**Investment**: ~200–260 dev-hours. Expected return: $3,000–$6,000/year in efficiency gains plus budget overrun prevention.

### 2.4 Success Metrics

| KPI | Target | Measurement |
|-----|--------|-------------|
| Budget alert accuracy | 100% of threshold crossings trigger alerts within 1 hour | Simulate budget breach, verify alert delivery |
| Budget alert false positive rate | <5% | Alert review |
| Developer insight engagement | >50% of active members view their insights page monthly | Dashboard page view tracking |
| Benchmark participation | >80% of active members view their benchmark at least once per month | Dashboard analytics |
| Slack integration adoption | >3 teams configure Slack notifications within 1 month of launch | Webhook configuration count |
| Slack notification delivery | >99% delivery rate | Webhook delivery logs |
| GitHub correlation coverage | >60% of projects successfully matched to GitHub repositories | Match rate in project data |
| Export utilization | >5 CSV/PDF exports per month | Export endpoint logs |
| Onboarding convergence | New members reach team-average cache rate within 4 weeks | P-21 metric tracking |

---

## 3. Functional Requirements

### 3.1 User Stories with Acceptance Criteria

#### US-5.1: Budget Alerts & Limits [P-18]

**As an** engineering manager,
**I want** to set monthly cost budgets per member, per project, and team-wide with threshold alerts,
**so that** I am notified before costs exceed approved limits and can take corrective action.

**Acceptance Criteria:**
- [ ] Admin can configure budgets at three scopes: team-wide monthly limit, per-member monthly limit, per-project monthly limit
- [ ] Budget configuration stored at `config/budgets.json` in S3
- [ ] Alert thresholds configurable: 80%, 90%, and 100% (defaults) — each threshold fires at most once per month per scope
- [ ] Alerts written to `views/alerts.json` when thresholds are crossed
- [ ] If Slack webhook is configured (A-9), budget alerts trigger webhook notification
- [ ] Dashboard shows budget status on member cards: "75% of $200 budget used" with color-coded progress bar
- [ ] Budget history chart available: actual vs budget per month for the last 6 months
- [ ] Aggregator checks budgets on each run and de-duplicates (only alert once per threshold crossing per month)
- [ ] Budget exceeded does NOT block sync (soft limit, not enforcement)

```
Budget Configuration UI:

+------------------------------------------------------+
| Settings > Budgets                                    |
+------------------------------------------------------+
|                                                       |
| TEAM BUDGET                                           |
| +---------------------------------------------------+|
| | Monthly Team Budget: [$2,000.00_____]              ||
| | Alert at: [80]% [90]% [100]%                       ||
| |                                                    ||
| | Current: $1,234.56 / $2,000.00  (62%)             ||
| | [========================================--------] ||
| | Projected: $1,890 (on track)                       ||
| +---------------------------------------------------+|
|                                                       |
| MEMBER BUDGETS                                        |
| +---------------------------------------------------+|
| | Member           Budget    Current  Status         ||
| | Alice Johnson    $300/mo   $234     [78%] OK       ||
| | Bob Smith        $250/mo   $212     [85%] WARN     ||
| | Charlie Lee      $200/mo   $198     [99%] DANGER   ||
| | Dave Kim         (no limit) $89     --             ||
| |                                                    ||
| | [Set All]  [Clear All]                             ||
| +---------------------------------------------------+|
+------------------------------------------------------+
```

**Effort**: M
**MoSCoW**: Must

---

#### US-5.2: Anonymized Team Benchmarks [P-20]

**As a** developer,
**I want** to see where I stand relative to team averages and percentiles (anonymized),
**so that** I can self-assess my AI usage efficiency without being compared to named individuals.

**Acceptance Criteria:**
- [ ] Percentile positions calculated for 5 metrics: cost per request, cache hit rate, requests per day, average session length, model tier efficiency
- [ ] Member detail view shows: "Your cost/request is at the 75th percentile" with visual indicator (box-and-whisker style)
- [ ] Team average, median (50th percentile), and 25th/75th quartile boundaries displayed for each metric
- [ ] Benchmarks are fully anonymized: no individual names or emails in percentile display
- [ ] Admin can view any member's percentile position; regular members see only their own
- [ ] Benchmarks updated monthly by aggregator (injected into each member's yearly view)
- [ ] Available in the "Insights" tab of the member detail view

```
+-- Team Benchmarks Card (on Members page) -------------+
|                                                        |
| Team Benchmarks                        [This Month v]  |
|                                                        |
| Cost/Request                                           |
| |--[--|--X--------|--]--|  Your position: 75th %ile   |
|  min  25th  median  75th  max                          |
|                                                        |
| Cache Hit Rate                                         |
| |--[-----|---X----|--]--|  Your position: 62nd %ile   |
|                                                        |
| Requests/Day                                           |
| |--[--X--|--------|--]--|  Your position: 35th %ile   |
|                                                        |
| [View Full Benchmarks]                                 |
+--------------------------------------------------------+
```

**Effort**: M
**MoSCoW**: Must

---

#### US-5.3: Onboarding Curves [P-21]

**As an** engineering manager,
**I want** to track how new team members' AI usage efficiency evolves over their first 8 weeks,
**so that** I can assess whether onboarding is effective and identify members who need additional support.

**Acceptance Criteria:**
- [ ] "New member" defined as: first sync within the last 8 weeks
- [ ] Track weekly metrics for each new member: cost per request, cache hit rate, requests per day, model mix
- [ ] Display onboarding curve chart: member's weekly metrics overlaid on team average at the same point in time (Recharts LineChart with multiple series and a team average reference line)
- [ ] Convergence indicator: "On track" (within 20% of team average by week 6), "Needs attention" (diverging or not converging)
- [ ] Available in admin view: list of onboarding members and their current convergence status
- [ ] Historical onboarding curves for members who have completed the 8-week window
- [ ] Data starts accumulating from Phase 3 aggregation; visualization available once 2+ weeks of data exist

```
+-- Onboarding Curves ---------------------------------+
|                                                        |
| New Member Onboarding                                  |
|                                                        |
| Cost/Request over first 8 weeks                        |
|                                                        |
|   $0.15 |                                              |
|         |  *                                           |
|   $0.10 |    *  *                                      |
|         |          *  *                                |
|   $0.05 |               *--*--*  <- team avg           |
|         |_ _ _ _ _ _ _ _ _ _ _ _ _ _ team average      |
|   $0.00 |___|___|___|___|___|___|___|___               |
|          W1  W2  W3  W4  W5  W6  W7  W8               |
|                                                        |
| [Alice (week 3)] [Bob (week 6)] [Charlie (graduated)] |
|                                                        |
| Members who reached team average:                      |
| 5 of 8 new members (avg 4.2 weeks)                    |
+--------------------------------------------------------+
```

**Effort**: M
**MoSCoW**: Should

---

#### US-5.4: Individual Developer Insights [P-30]

**As a** developer,
**I want** a private view showing personalized tips and actionable insights about my AI usage,
**so that** I can improve my productivity and cost-effectiveness without feeling judged or compared.

**Acceptance Criteria:**
- [ ] "My Insights" page (`/insights`) accessible to all authenticated users
- [ ] Page shows insights for the currently logged-in user by default; admin can view any member's insights
- [ ] Access control strictly enforced: members can only access their own insights (RBAC from S-10/Phase 3)
- [ ] Personalized recommendations generated by aggregator (refreshed monthly):
  - Model tier: "You used Opus for 78% of requests — consider Sonnet for shorter tasks. Estimated savings: $18.45/month."
  - Cache: "Your cache hit rate is 25%. Try structuring prompts with consistent system messages. Team average: 45%."
  - Cost: "Your cost/request is $0.45; team average is $0.28."
  - Sessions: "You average 22 requests per session — consider breaking complex tasks into smaller sessions."
- [ ] Insights stored at `views/insights/{memberId}.json`
- [ ] Each tip has: `category`, `severity` (info/suggestion/warning), `title`, `message`, and supporting `metric` data
- [ ] Recommendations are actionable (include specific advice, not just metrics)
- [ ] Efficiency score (0–100) shown at the top of the Insights page
- [ ] Percentile ranking from P-20 benchmarks shown alongside efficiency score

```
+------------------------------------------------------+
| My Insights                                           |
| Personal AI usage analysis and recommendations        |
+------------------------------------------------------+
|                                                       |
| +---------------------------------------------------+|
| | YOUR EFFICIENCY SUMMARY                            ||
| |                                                    ||
| | Efficiency Score: 78/100  [========--]             ||
| | Team Rank: #3 of 12 (top 25%)                     ||
| | Trend: +5 pts vs last month                        ||
| +---------------------------------------------------+|
|                                                       |
| +---------------------------+ +----------------------+|
| | MODEL USAGE ADVICE        | | CACHE PERFORMANCE   ||
| |                           | |                     ||
| | You used Opus for 78% of  | | Your cache rate:    ||
| | requests. Consider:       | |    72.1%            ||
| |                           | | Team average:       ||
| | "Switch 123 simple Opus   | |    67.3%            ||
| |  requests to Sonnet.      | |                     ||
| |  Estimated savings:       | | [===========-]      ||
| |  $18.45/month"            | | Above average!      ||
| +---------------------------+ +----------------------+|
|                                                       |
| +---------------------------------------------------+|
| | USAGE PATTERNS                                     ||
| |                                                    ||
| | Peak Hours: 10am-12pm, 2pm-4pm                    ||
| | Avg Session Length: 12 requests                    ||
| | Most Used Model: Sonnet (45%)                     ||
| | Busiest Day: Wednesday                             ||
| |                                                    ||
| | [Hourly activity heatmap for this user]            ||
| +---------------------------------------------------+|
+------------------------------------------------------+
```

**Effort**: M
**MoSCoW**: Should

---

#### US-5.5: Slack/Teams Notifications [A-9]

**As a** team lead,
**I want** to receive Slack notifications for key events (daily digest, cost spikes, budget alerts, agent offline),
**so that** I stay informed about team AI usage without needing to check the dashboard.

**Acceptance Criteria:**
- [ ] Webhook configuration in Settings > Notifications tab: Slack webhook URL, channel override, enabled event types
- [ ] Support Microsoft Teams webhook format as well (same UI, different message format)
- [ ] Supported events:
  - `budget.threshold`: when 80%/90%/100% budget thresholds are crossed
  - `anomaly.cost_spike`: when a member's daily cost exceeds 3x 7-day average
  - `sync.daily_digest`: summary of previous day's cost, top member, model distribution (sent at configurable time, default 8:00 AM)
  - `agent.offline`: when an agent fails to sync for >2x its configured interval
  - `dlp.critical_finding`: when a DLP critical finding is auto-redacted
- [ ] Webhook configuration stored at `config/webhooks.json` in S3
- [ ] Delivery is fire-and-forget with 5-second timeout (does not block main Lambda response)
- [ ] Test connection button in Settings UI sends a test payload to the webhook URL
- [ ] Notification history: last 50 notifications visible in admin settings with delivery status (success/failure)
- [ ] Retry logic: 3 attempts with exponential backoff on delivery failure

```
+------------------------------------------------------+
| Settings > Notifications                              |
+------------------------------------------------------+
|                                                       |
| CHANNELS                                              |
| +---------------------------------------------------+|
| | Slack                                              ||
| | Webhook URL: [https://hooks.slack.com/...________] ||
| | Channel: [#ai-usage_________________________]     ||
| | [Test Connection]                    [Connected]   ||
| +---------------------------------------------------+|
| | Microsoft Teams                                    ||
| | Webhook URL: [_________________________________]   ||
| |                              [Not configured]      ||
| +---------------------------------------------------+|
|                                                       |
| ALERT RULES                                           |
| +---------------------------------------------------+|
| | [x] Daily digest (8:00 AM)         [Slack]        ||
| | [x] Budget threshold exceeded      [Slack+Email]  ||
| | [x] Cost anomaly detected (>3x)   [Slack]        ||
| | [ ] New member first sync          [Slack]        ||
| | [ ] Agent offline > 24h            [Email]        ||
| +---------------------------------------------------+|
+------------------------------------------------------+
```

**Effort**: M
**MoSCoW**: Should

---

#### US-5.6: GitHub Integration [A-10]

**As an** engineering manager,
**I want** AI usage correlated with GitHub activity (PRs merged, commits) using the git remote URLs already collected,
**so that** I can understand the cost-per-PR and whether AI investment translates to development output.

**Acceptance Criteria:**
- [ ] Agent already collects git remote URLs — no new data collection required
- [ ] Admin configures GitHub personal access token (stored in Secrets Manager) and org name in Settings
- [ ] GitHub integration is explicitly opt-in — no GitHub API calls unless configured and enabled
- [ ] GitHub API fetches per repository per month: merged PR count, total commit count
- [ ] Data fetched daily by the aggregator Lambda (not on every dashboard load); cached in S3
- [ ] Correlation metrics displayed on the Projects page:
  - Cost per PR: `AI_cost_for_project / prs_merged_this_month`
  - Cost per commit: `AI_cost_for_project / commits_this_month`
- [ ] "AI ROI" metric shown on project detail view (configurable formula, default: `(PRs_merged * estimated_time_saved_hours * hourly_rate) / AI_cost`)
- [ ] GitHub data stored at `views/github/pr-costs/{year}-{month}.json`
- [ ] GitHub API conditional requests (If-None-Match) used to minimize rate limit consumption; data cached 24 hours

**Effort**: L
**MoSCoW**: Could

---

#### US-5.7: CSV/Grafana/DataDog Export [A-13]

**As a** finance stakeholder,
**I want** to export usage data as CSV files and optionally push metrics to Prometheus/Grafana,
**so that** I can integrate AI usage data into existing reporting and monitoring tools.

**Acceptance Criteria:**
- [ ] `GET /api/export/csv?type=members&year=2026&month=2` returns CSV download
- [ ] CSV types supported: `member-summary`, `project-summary`, `daily-detail`, `model-breakdown`
- [ ] CSV uses proper headers, quoting, and UTF-8 encoding
- [ ] Response headers: `Content-Type: text/csv`, `Content-Disposition: attachment; filename=ccusage-{type}-{period}.csv`
- [ ] Export endpoints require authentication (member or admin role)
- [ ] CSV export button available on Dashboard, Members, and Reports pages via a reusable Export Modal
- [ ] Optional: Prometheus-compatible `/api/metrics` endpoint exposing key gauges
- [ ] Export modal allows selecting format (CSV, PDF, JSON), scope (include member/model/daily breakdown), and date range

```
Usage CSV columns: date, member_email, member_name, model, project,
input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
cost_usd, session_id, request_id
```

```
+-- Export Data (Dialog, centered) ----------------------+
|                                                        |
| Export Data                                            |
|                                                        |
| FORMAT                                                 |
| (x) CSV - Spreadsheet compatible                       |
| ( ) PDF - Formatted report                             |
| ( ) JSON - Raw data                                    |
|                                                        |
| SCOPE                                                  |
| [ ] Include member details                             |
| [ ] Include model breakdown                            |
| [x] Include daily breakdown                            |
|                                                        |
| PERIOD                                                 |
| [Current date range: Feb 1-28, 2026]                   |
|                                                        |
|                           [Cancel] [Export]             |
+--------------------------------------------------------+
```

**Effort**: M
**MoSCoW**: Should

---

#### US-5.8: Configurable Date Ranges [A-29] *(Promoted to Phase 3 per Decision #3)*

**Note**: A-29 was promoted to Phase 3 (Decision #3) because Projects page (A-30) and Reports page (A-31) needed date range support from the start. The implementation is documented in the Phase 3 SRS. Included here for traceability.

**MoSCoW**: Must (in Phase 3)

### 3.2 Budget Alerts (P-18)

#### Budget Configuration Schema

```typescript
// S3 key: config/budgets.json
interface BudgetConfig {
  version: 1;
  lastUpdated: string;
  teamBudget: {
    monthlyLimitUsd: number;
    alertThresholds: number[];   // e.g., [0.8, 0.9, 1.0]
  };
  memberBudgets: Record<string, {   // keyed by memberId
    monthlyLimitUsd: number;
    alertThresholds: number[];
  }>;
  projectBudgets: Record<string, {  // keyed by project path
    monthlyLimitUsd: number;
    alertThresholds: number[];
  }>;
}
```

#### Budget Alert Schema (appended to views/alerts.json)

```typescript
interface BudgetAlert {
  id: string;
  type: 'budget_threshold';
  scope: 'team' | 'member' | 'project';
  scopeId: string;
  scopeName: string;
  threshold: number;      // 0.8, 0.9, or 1.0
  currentSpend: number;
  budgetLimit: number;
  percentage: number;
  triggeredAt: string;
  acknowledged: boolean;
}
```

#### Budget Check Logic (in Aggregator)

Run during each aggregation cycle:
1. Load `config/budgets.json`
2. For each scope (team, member, project), compare current month spend to budget limit
3. For each threshold that is newly crossed (not already in alerts.json for this month), append a `BudgetAlert` entry
4. If webhook configured, fire `budget.threshold` webhook event

**New Endpoints**:

```
GET  /api/admin/budgets   -- View current budget config
PUT  /api/admin/budgets   -- Update budget config (admin only)
```

### 3.3 Team Benchmarks (P-20)

#### Benchmark Computation Schema

```typescript
// Added to views/members/{memberId}/{year}.json
interface MemberBenchmarks {
  month: string;
  metrics: {
    costPerRequest:       { value: number; percentile: number; teamMedian: number };
    cacheHitRate:         { value: number; percentile: number; teamMedian: number };
    requestsPerDay:       { value: number; percentile: number; teamMedian: number };
    avgSessionLength:     { value: number; percentile: number; teamMedian: number };
    modelTierEfficiency:  { value: number; percentile: number; teamMedian: number };
  };
}
```

#### Aggregator Change

After computing all member aggregations, compute team-wide percentiles across all active members and inject into each member's view:

```typescript
function computePercentile(values: number[], target: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = sorted.filter(v => v <= target).length;
  return Math.round((rank / sorted.length) * 100);
}
```

**Anonymization guarantee**: The view files contain only the member's own percentile rank and the team median. No other individual values are included.

### 3.4 Onboarding Curves (P-21)

#### Onboarding Metrics Schema

```typescript
// Added to views/members/{memberId}/{year}.json
interface OnboardingMetrics {
  memberSince: string;      // first sync date
  weeksActive: number;
  weeklyProgress: Array<{
    week: number;           // 1-8
    costPerRequest: number;
    cacheHitRate: number;
    requestsPerDay: number;
    teamAvgCostPerRequest: number;
    teamAvgCacheHitRate: number;
  }>;
  convergedToTeamAvg: boolean;   // within 20% of team avg on key metrics
  convergenceWeek: number | null;
}
```

**Data accumulation**: Begins in Phase 3 (or whenever Phase 3 aggregation runs). Visualization available once at least 2 weeks of data exist for a new member.

### 3.5 Individual Developer Insights (P-30)

#### Developer Insights Schema

```typescript
// New view file: views/insights/{memberId}.json
interface DeveloperInsights {
  generatedAt: string;
  memberId: string;
  efficiencyScore: number;     // 0-100
  tips: Array<{
    id: string;
    category: 'cost' | 'efficiency' | 'model' | 'usage';
    severity: 'info' | 'suggestion' | 'warning';
    title: string;
    message: string;
    metric: {
      current: number;
      target: number;
      unit: string;
    };
  }>;
}
```

#### Insight Generation Rules (Aggregator)

```typescript
const insightRules = [
  {
    id: 'opus-overuse',
    condition: (m: MemberMetrics) => m.opusPercentage > 0.5 && m.avgOutputTokens < 2000,
    tip: (m) => ({
      category: 'model',
      severity: 'suggestion',
      title: 'Consider switching simple requests to Sonnet',
      message: `You used Opus for ${Math.round(m.opusPercentage * 100)}% of requests. For requests with <2K output tokens, Sonnet achieves similar quality at 5x lower cost. Estimated savings: $${m.potentialSavings.toFixed(2)}/month.`,
      metric: { current: m.opusPercentage, target: 0.2, unit: 'Opus usage %' },
    }),
  },
  {
    id: 'low-cache-rate',
    condition: (m) => m.cacheHitRate < 0.3,
    tip: (m) => ({
      category: 'efficiency',
      severity: 'warning',
      title: 'Low cache hit rate',
      message: `Your cache rate is ${Math.round(m.cacheHitRate * 100)}% vs team average ${Math.round(m.teamAvgCacheRate * 100)}%. Try reusing consistent system prompts and structuring context to maximize cache reuse.`,
      metric: { current: m.cacheHitRate, target: 0.5, unit: 'cache hit rate' },
    }),
  },
  {
    id: 'marathon-sessions',
    condition: (m) => m.marathonSessionPercentage > 0.2,
    tip: (m) => ({
      category: 'usage',
      severity: 'suggestion',
      title: 'Long sessions detected',
      message: `${Math.round(m.marathonSessionPercentage * 100)}% of your sessions have 30+ requests. Breaking complex tasks into smaller sessions often improves response quality and reduces cost.`,
      metric: { current: m.avgSessionLength, target: 15, unit: 'avg requests/session' },
    }),
  },
];
```

#### New Endpoint

```
GET /api/members/:id/insights   -- admin or own member only
```

**Access control**: Enforced by RBAC middleware (Phase 3, S-10). Non-admin users get 403 if `memberId` does not match their own.

### 3.6 Slack/Teams Notifications (A-9)

#### Webhook Configuration Schema

```typescript
// S3 key: config/webhooks.json
interface WebhookConfig {
  version: 1;
  lastUpdated: string;
  webhooks: Array<{
    id: string;
    name: string;
    url: string;              // stored encrypted (or via Secrets Manager ref)
    type: 'slack' | 'teams' | 'generic';
    events: WebhookEvent[];
    isActive: boolean;
    createdBy: string;
  }>;
}

type WebhookEvent =
  | 'budget.threshold'
  | 'anomaly.cost_spike'
  | 'sync.daily_digest'
  | 'agent.offline'
  | 'dlp.critical_finding';
```

#### Delivery Implementation

```typescript
async function sendWebhook(event: WebhookEvent, payload: Record<string, unknown>) {
  const config = await loadWebhookConfig();
  const relevantHooks = config.webhooks.filter(w => w.isActive && w.events.includes(event));

  for (const hook of relevantHooks) {
    try {
      const body = formatForType(hook.type, event, payload);
      await fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      console.error(`Webhook delivery failed: ${hook.name}`, error);
      // Fire-and-forget: log failure, do not retry synchronously
    }
  }
}
```

#### Slack Message Format

```typescript
function formatForSlack(event: WebhookEvent, payload: Record<string, unknown>) {
  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `CCUsage Alert: ${event}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: payload.message as string },
      },
    ],
  };
}
```

#### New Webhook Management Endpoints

```
GET    /api/admin/webhooks           -- List webhook configurations
POST   /api/admin/webhooks           -- Create webhook
PUT    /api/admin/webhooks/:id       -- Update webhook
DELETE /api/admin/webhooks/:id       -- Delete webhook
POST   /api/admin/webhooks/:id/test  -- Send test payload to verify connectivity
```

### 3.7 GitHub Integration (A-10)

#### Configuration Schema

```typescript
// S3 key: config/integrations.json
interface IntegrationsConfig {
  version: 1;
  github?: {
    tokenSecretArn: string;  // Secrets Manager ARN, not plaintext
    org: string;
    enabled: boolean;
  };
}
```

#### PR Cost Correlation Schema

```typescript
interface PRCostCorrelation {
  prNumber: number;
  title: string;
  author: string;          // GitHub username
  mergedAt: string;
  repository: string;
  estimatedAICost: number; // sum of usage entries for this project during PR lifetime
  requestCount: number;
  primaryModel: string;
}

// New S3 key: views/github/pr-costs/{year}-{month}.json
interface PRCostView {
  generatedAt: string;
  period: { year: number; month: number };
  correlations: PRCostCorrelation[];
  repositorySummary: Array<{
    repository: string;
    totalCost: number;
    prsMerged: number;
    costPerPR: number;
    costPerCommit: number;
  }>;
}
```

#### New Endpoint

```
GET /api/github/pr-costs?year=&month=   -- PR cost correlation (admin, member)
```

### 3.8 CSV/PDF Export (A-13)

#### Export Endpoints

```
GET /api/export/csv?type=members&year=2026&month=2
GET /api/export/csv?type=team&year=2026&month=2
GET /api/export/csv?type=projects&year=2026&month=2
GET /api/export/csv?type=daily-detail&memberId=&year=2026&month=2
```

#### CSV Column Definitions

**Member Summary CSV:**

| Column | Source |
|--------|--------|
| `member_email` | Member registry |
| `member_name` | Member registry |
| `total_cost_usd` | Monthly aggregation |
| `total_requests` | Monthly aggregation |
| `avg_cost_per_request` | Computed: total_cost / total_requests |
| `cache_hit_rate` | Monthly aggregation |
| `input_tokens` | Monthly aggregation |
| `output_tokens` | Monthly aggregation |
| `cache_read_tokens` | Monthly aggregation |
| `primary_model` | Monthly aggregation (most used by cost) |

**Daily Detail CSV:**

| Column | Source |
|--------|--------|
| `date` | Entry timestamp (YYYY-MM-DD) |
| `model` | Entry model field |
| `project` | Entry projectPath field |
| `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens` | Entry fields |
| `cost_usd` | Computed from pricing |
| `session_id` | Entry sessionId field |
| `request_id` | Entry requestId field |

#### Optional Prometheus Endpoint

```
GET /api/metrics   -- Prometheus-compatible metrics (no auth required for scraping)
```

```
# HELP ccusage_total_cost_usd Total cost in USD for current month
# TYPE ccusage_total_cost_usd gauge
ccusage_total_cost_usd{period="current_month"} 1234.56

# HELP ccusage_active_members Number of active members this month
# TYPE ccusage_active_members gauge
ccusage_active_members 42

# HELP ccusage_cache_hit_rate Team average cache hit rate
# TYPE ccusage_cache_hit_rate gauge
ccusage_cache_hit_rate 0.673
```

### 3.9 API Specifications

#### New Endpoints Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/budgets` | admin | View budget configuration |
| `PUT` | `/api/admin/budgets` | admin | Update budget configuration |
| `GET` | `/api/members/:id/insights` | admin or own member | Personal developer insights |
| `GET` | `/api/admin/webhooks` | admin | List webhook configurations |
| `POST` | `/api/admin/webhooks` | admin | Create webhook |
| `PUT` | `/api/admin/webhooks/:id` | admin | Update webhook |
| `DELETE` | `/api/admin/webhooks/:id` | admin | Delete webhook |
| `POST` | `/api/admin/webhooks/:id/test` | admin | Test webhook delivery |
| `GET` | `/api/github/pr-costs` | admin, member | PR cost correlation (`?year=&month=`) |
| `GET` | `/api/export/csv` | admin, member | CSV data export (`?type=&year=&month=`) |
| `GET` | `/api/metrics` | public | Prometheus metrics |

#### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `GET /api/dashboard` | Add `budgetAlerts` to alerts array from `views/alerts.json` |
| `GET /api/members/:id` | Add `benchmarks`, `onboarding`, and `insights` fields from corresponding view files |

#### TypeScript Interface Additions

```typescript
// Updated views/members/{memberId}/{year}.json
interface MemberYearlyView {
  // ... existing fields ...
  benchmarks: Record<string, MemberBenchmarks>;  // keyed by "YYYY-MM"
  onboarding: OnboardingMetrics | null;           // null if member >8 weeks old
}

// views/insights/{memberId}.json
interface DeveloperInsights {
  generatedAt: string;
  memberId: string;
  efficiencyScore: number;
  tips: InsightTip[];
}

// config/budgets.json
interface BudgetConfig {
  version: 1;
  lastUpdated: string;
  teamBudget: { monthlyLimitUsd: number; alertThresholds: number[] };
  memberBudgets: Record<string, { monthlyLimitUsd: number; alertThresholds: number[] }>;
  projectBudgets: Record<string, { monthlyLimitUsd: number; alertThresholds: number[] }>;
}
```

### 3.10 Data Model Changes

#### New S3 Keys

| Key | Purpose | Written By |
|-----|---------|------------|
| `config/budgets.json` | Budget configuration | Admin budget API |
| `config/webhooks.json` | Webhook configuration | Admin webhook API |
| `config/integrations.json` | GitHub/external integration config | Admin settings API |
| `views/insights/{memberId}.json` | Developer insights per member | Aggregator (monthly) |
| `views/github/pr-costs/{year}-{month}.json` | PR cost correlation | Aggregator (daily, if GitHub enabled) |

#### Modified S3 Keys

| Key | Change |
|-----|--------|
| `views/members/{memberId}/{year}.json` | Add `benchmarks` and `onboarding` fields |
| `views/alerts.json` | Add `BudgetAlert` entries alongside existing anomaly alerts |
| `views/dashboard.json` | Add `budgetStatus` summary for team-level budget gauges |

---

## 4. Non-Functional Requirements

### 4.1 Privacy (P-30 Individual Insights Access Control)

Individual developer insights must be strictly private:

| Requirement | Target |
|-------------|--------|
| Access control | Members can only access their own insights (`/api/members/:id/insights` returns 403 if `id` does not match authenticated member's own ID) |
| No cross-member data in insights view | `views/insights/{memberId}.json` contains only data for that member |
| Benchmark anonymization | Team benchmarks show only percentile position and team median — no individual names or values |
| Admin audit | Admin access to any member's insights is logged in the audit trail |

**Legal notice**: Individual insights must not be used as the basis for employment decisions without human review (GDPR Article 22 — automated individual decision-making). A notice to this effect should be displayed on the Insights page.

### 4.2 External Service Dependencies (Slack, GitHub)

| Service | Dependency Type | Risk | Mitigation |
|---------|----------------|------|------------|
| Slack webhooks | Optional — configured by admin | Webhook unavailability causes missed notifications, not system failure | Fire-and-forget delivery; 5-second timeout; failures logged |
| GitHub API | Optional — configured by admin | Rate limit 5,000 req/hr with PAT | Daily batch fetch; conditional requests (If-None-Match); 24-hour cache |
| Secrets Manager | Required for GitHub token storage | Rare outage | 5-minute in-memory cache of secrets |

### 4.3 Performance

| Change | Aggregator Impact | Dashboard Impact |
|--------|------------------|-----------------|
| Budget check | +10ms (threshold comparison) | None (pre-computed) |
| Benchmark percentile computation | +50ms (sort + rank across all members) | None (pre-computed) |
| Onboarding curve computation | +20ms (new members only) | None (pre-computed) |
| Insights generation | +30ms per member (rule evaluation) | None (pre-computed) |
| Webhook delivery | +0–5,000ms (async, fire-and-forget, 5s timeout) | None |
| GitHub API calls | +500–2,000ms (daily only, not per-aggregation) | None |
| CSV export for large datasets | +2–5s (stream from raw data) | N/A |
| Date range queries (A-29, Phase 3) | +100ms (filter pre-aggregated monthly files) | +0ms vs current |

**Aggregator total impact per run**: +150–200ms for Phase 5 additions. Well within 300-second Lambda timeout for 500 members.

---

## 5. UX Requirements

### 5.1 Insights Page (P-30)

New screen: `/insights`

Navigation: "Insights" entry in sidebar with `Lightbulb` icon, placed between Reports and Playground (after Phase 5).

```
+------------------------------------------------------+
| My Insights                                           |
| Personal AI usage analysis and recommendations        |
+------------------------------------------------------+
|                                                       |
| EFFICIENCY SUMMARY                                    |
| Efficiency Score: 78/100  [========--]                |
| Team Rank: #3 of 12 (top 25%)    Trend: +5 pts       |
|                                                       |
| RECOMMENDATIONS (3 active)                            |
| +---------------------------------------------------+|
| | [Lightbulb] Switch simple Opus requests to Sonnet  ||
| |   Estimated savings: $18.45/month                  ||
| |   "You used Opus for 78% of requests. For tasks    ||
| |    with <2K output, Sonnet achieves similar         ||
| |    quality at 5x lower cost."                       ||
| |                            [Dismiss] [Learn More]  ||
| |---------------------------------------------------||
| | [AlertTriangle] Low cache hit rate (25%)           ||
| |   Team average: 45%. Try consistent system prompts.||
| |                            [Dismiss] [Learn More]  ||
| +---------------------------------------------------+|
|                                                       |
| TEAM BENCHMARKS                                       |
| Cost/Request    |--[--|--X--|--]--|  75th percentile  |
| Cache Hit Rate  |--[-----|---X--|--|  62nd percentile  |
|                                                       |
| USAGE PATTERNS                                        |
| [Hourly heatmap for this user]                        |
| Peak hours: 10am-12pm, 2pm-4pm  Busiest day: Wed     |
|                                                       |
+------------------------------------------------------+
```

**Legal notice** (required): Display at top of Insights page:
> *"These insights are for personal improvement only and are not shared with management or used in performance evaluations. Individual usage data is private.*"

**Components**:
- `/insights` page — `app/(dashboard)/insights/page.tsx`
- `EfficiencyScoreCard` — `components/insights/efficiency-score-card.tsx` (`score`, `rank`, `trend`)
- `ModelAdviceCard` — `components/insights/model-advice-card.tsx` (`recommendations: InsightTip[]`)
- `UsagePatternsCard` — `components/insights/usage-patterns-card.tsx` (`patterns: UsagePattern`)

### 5.2 Team Benchmarks Visualization (P-20)

Location: Members page and Insights page (dual placement).

```
+-- Team Benchmarks Card (box-and-whisker style) -------+
|                                                        |
| Team Benchmarks                        [This Month v]  |
|                                                        |
| Cost/Request                                           |
| |--[--|--X--------|--]--|  Your position: 75th %ile   |
|  min  25th  median  75th  max                          |
|                                                        |
| Cache Hit Rate                                         |
| |--[-----|---X----|--]--|  Your position: 62nd %ile   |
|                                                        |
| Requests/Day                                           |
| |--[--X--|--------|--]--|  Your position: 35th %ile   |
|                                                        |
| [View Full Benchmarks]                                 |
+--------------------------------------------------------+
```

**Chart type**: Custom SVG box-and-whisker plot. X-axis shows the metric distribution (min, 25th, median, 75th, max). Current user's position shown as a highlighted dot (blue) with percentile label.

**Component**: `PercentileBoxPlot` — `components/charts/percentile-box-plot.tsx` (custom SVG, no Recharts wrapper needed)

**Team Benchmarks Card**: `components/members/team-benchmarks-card.tsx` (`benchmarks: BenchmarkData`, `userPosition: PercentilePosition`)

### 5.3 Budget Configuration (P-18)

Location: `/settings?tab=budgets`

Budget gauge component:
- 0–79%: Green
- 80–89%: Amber (warning)
- 90–99%: Red (danger)
- 100%+: Dark red, bar overflows with striped overflow pattern

**Component**: `BudgetGauge` — `components/shared/budget-gauge.tsx` (props: `current`, `max`, `thresholds: {warn: number, danger: number}`)

**Budget Config Tab**: `components/settings/budget-config-tab.tsx` — full CRUD for team, member, and project budgets

### 5.4 Notification Settings (A-9)

Location: `/settings?tab=notifications`

**Component**: `NotificationSettingsTab` — `components/settings/notification-settings-tab.tsx`

Key UI flows:
1. Admin pastes Slack webhook URL → clicks [Test Connection] → system sends test payload → shows [Connected] badge
2. Admin configures which events to route to which channels
3. Admin views notification history (last 50 delivery attempts with status)

### 5.5 Export Modal (A-13)

Reusable export dialog triggered from any page with exportable data (Dashboard, Members, Reports, Projects).

**Component**: `ExportModal` — `components/shared/export-modal.tsx` (props: `format`, `scope`, `onExport`)

**Export trigger locations**:
- Dashboard page header: [Export] button
- Members page header: [Export] button
- Reports page: dedicated [Download CSV] and [Download PDF] buttons
- Projects page: [Export] button

**Implementation**: CSV generated client-side using a utility function (`lib/csv-generator.ts`). PDF generated using browser print-to-PDF (window.print() with print styles) or optional lightweight PDF library (jsPDF). JSON export provides the raw API response as a downloadable file.

### 5.6 Onboarding Curves (P-21)

Location: Insights page (admin view) and individual Insights page.

```
+-- Onboarding Progress Card ---------------------------+
|                                                        |
| New Member Onboarding                                  |
| (visible on admin Insights view, shows all new members)|
|                                                        |
| Cost/Request over first 8 weeks                        |
|                                                        |
|   $0.15 | *                                            |
|   $0.10 |    * *                                       |
|   $0.05 |        * * *--*-- <- team avg                |
|          W1  W2  W3  W4  W5  W6  W7  W8               |
|                                                        |
| [Alice (week 3)]  [Bob (week 6)]  [Charlie (done)]    |
|                                                        |
| 5 of 8 new members reached team average (avg 4.2 wks) |
+--------------------------------------------------------+
```

**Chart type**: Recharts `LineChart` with multiple series (one per new member) and a reference line for team average.

**Component**: `OnboardingCurveChart` — `components/charts/onboarding-curve-chart.tsx` (`members: OnboardingData[]`, `teamAvg: number`)

---

## 6. Technical Architecture

### 6.1 Budget Check Pipeline (in Aggregator)

```
Hourly aggregation run
  |
  v
[Compute member and project costs for current month]
  |
  v
[Load config/budgets.json]
  |
  v
[For each budget scope (team/member/project)]:
  [Compare current spend to each threshold]
  [If newly crossed (not in alerts.json for this month)]:
    -> Append BudgetAlert to views/alerts.json
    -> Trigger webhook (if configured)
  |
  v
[Update views/dashboard.json with budgetStatus summary]
```

### 6.2 Benchmark Computation (in Aggregator)

```
After all member aggregations complete:
  |
  v
[Collect all active members' monthly metrics into an array]
  |
  v
[For each metric (costPerRequest, cacheHitRate, etc.)]:
  [Sort values]
  [Compute percentiles for each member's value]
  [Compute team median]
  |
  v
[For each member]:
  [Inject MemberBenchmarks into their yearly view]
```

### 6.3 Insights Generation (in Aggregator)

```
For each active member during monthly aggregation:
  |
  v
[Load member's monthly metrics]
  |
  v
[Evaluate each insight rule (condition check)]
  |
  v
[Collect triggered tips]
  |
  v
[Compute efficiency score (weighted avg of sub-scores)]
  |
  v
[Write views/insights/{memberId}.json]
```

### 6.4 GitHub Integration Data Flow (Daily, Optional)

```
Daily schedule (if GitHub integration enabled):
  |
  v
[Load config/integrations.json]
  |
  v
[Fetch current month's merged PRs from GitHub API]
  |
  v
[For each PR, match repository to project in views/projects.json]
  |
  v
[Compute cost per PR using aggregated project costs]
  |
  v
[Write views/github/pr-costs/{year}-{month}.json]
```

### 6.5 CSV Export Data Flow

```
GET /api/export/csv?type=members&year=2026&month=2
  |
  v
[Authenticate: member or admin]
  |
  v
[Load aggregated/{memberId}/{year}-{month}.json for all members]
  |
  v
[Generate CSV string (streaming for large datasets)]
  |
  v
[Set Content-Type: text/csv, Content-Disposition: attachment]
  |
  v
[Return CSV response]
```

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Type | Required For |
|------------|------|-------------|
| Phase 2: P-1 (cost per prompt), P-2 (cache rate) | Hard | P-20 benchmarks, P-30 insights |
| Phase 3: S-10 (RBAC enforcement) | Hard | P-30 individual insights privacy controls |
| Phase 3: P-17 (anomaly detection infrastructure in alerts.json) | Hard | P-18 budget alerts (same alerts mechanism) |
| Phase 3: A-30 (project dashboard) | Soft | A-10 GitHub integration displays on Projects page |
| Phase 4: Secrets Manager (for GitHub token storage) | Soft | A-10 GitHub integration token |
| Slack workspace webhook URL | External | A-9 Slack notifications |
| GitHub PAT or GitHub App | External | A-10 GitHub integration |

### 7.2 Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Benchmarks create unhealthy competition | MEDIUM | MEDIUM | Ensure fully anonymized (percentile only, no names). Frame as "team efficiency" not "ranking." Add opt-out option for sensitive organizations. |
| Budget alerts create alert fatigue | MEDIUM | LOW | Default to 80%/100% only (skip 90%). Per-member notification preferences. De-duplicate: one alert per threshold crossing per month. |
| GitHub API rate limiting | MEDIUM | LOW | Daily batch fetch only. Conditional requests (If-Modified-Since). Cache results 24 hours in S3. |
| Insights privacy concerns (visible to management) | MEDIUM | HIGH | Strict RBAC enforcement. Legal notice on Insights page. Log all admin access to member insights in audit trail. |
| Slack webhook security (URL exposure) | LOW | MEDIUM | Store webhook URLs in S3 with server-side encryption. Never expose in API responses. Validate webhook URL format on save. |
| Onboarding curves require 4–8 weeks of data | HIGH | LOW | Display "Insufficient data" state until 2+ weeks accumulated. Start data collection from Phase 3 deployment. |
| GitHub repository matching failures | MEDIUM | LOW | Match on normalized git remote URL (strip `.git`, normalize `https` vs `git@`). Fall back to path-based matching. Report unmatched projects. |

---

## 8. Implementation Plan

```
Month 3, Week 3:
  1. [P-18] Budget config API + budget check in aggregator + Settings UI (6h)
  2. [A-9]  Webhook config API + Slack/Teams delivery (6h)

  Parallelizable: #1 and #2 are independent

Month 3, Week 4:
  3. [P-20] Benchmark percentile computation in aggregator + box-plot chart component (6h)
  4. [P-30] Insights generation rules + Insights page (6h)
  5. [A-13] CSV export endpoint + Export Modal + download buttons (4h)

  Parallelizable: #3, #4, #5 are independent

Month 4, Week 1:
  6. [P-21] Onboarding curve tracking in aggregator + visualization (5h)
  7. [A-10] GitHub integration: config + PR cost correlation + Projects page integration (8h)
     Note: requires GitHub API access token from admin

Month 4, Week 2:
  8. Integration testing: budget alerts end-to-end, webhook delivery verification (4h)
  9. Privacy testing: verify P-30 access controls (members cannot access others' insights) (2h)
  10. Performance testing: benchmark computation for 500 members, CSV export large dataset (2h)
```

---

## 9. Acceptance Criteria & Test Strategy

### Acceptance Criteria Summary

| Story | Primary Acceptance Test |
|-------|------------------------|
| US-5.1 Budget Alerts | Set $100 budget; simulate $80 spend; verify Slack notification fires and alert appears in dashboard |
| US-5.2 Team Benchmarks | For 10+ active members, verify each member's view contains correct percentile positions |
| US-5.3 Onboarding Curves | New member with 3 weeks of data; verify weekly progress chart matches raw aggregation |
| US-5.4 Individual Insights | Member A cannot access Member B's insights (403); Member A can access own insights |
| US-5.5 Slack Notifications | Configure webhook; trigger cost spike; verify Slack message received within 2 aggregation cycles |
| US-5.6 GitHub Integration | Configure PAT; verify PR count fetched; verify cost-per-PR displayed on Projects page |
| US-5.7 CSV Export | Request `type=members` CSV; verify all active members present with correct totals |

### Test Strategy

| Type | Coverage | Notes |
|------|----------|-------|
| Unit tests | Percentile computation | Verify correct percentile for known datasets |
| Unit tests | Insight rule evaluation | Test each rule condition with edge cases |
| Unit tests | Budget threshold detection | Verify de-duplication (only one alert per threshold per month) |
| Integration tests | P-30 RBAC enforcement | Member accessing another member's insights returns 403 |
| Integration tests | Webhook delivery | Mock Slack endpoint; verify payload format for each event type |
| Integration tests | CSV export format | Verify CSV headers, encoding, content for each type |
| Privacy tests | Benchmark anonymization | Verify no individual names/emails in benchmark view files |
| Load tests | Aggregator performance with 500 members | Benchmark computation under 300-second Lambda timeout |

---

## 10. References

- Decision Log, Decision #3: A-29 (date ranges) promoted to Phase 3
- Decision Log, Open Question: Slack webhook URL and GitHub PAT availability — confirm before implementation
- PRD Draft: Phase 5 (US-5.1–US-5.8), `grooming-artifacts/planning-artifacts/prd-draft.md`
- Business Analysis: Phase 5 (Section 6), `grooming-artifacts/planning-artifacts/analysis.md`
- Architecture: Phase 5, `grooming-artifacts/planning-artifacts/architecture.md`
- UX Design: Phase 5 (Section 9), `grooming-artifacts/planning-artifacts/ux-design.md`
- GDPR Article 22 — Automated individual decision-making (relevant to P-30 insights)
- ISO 27001 A.12.1.3 — Capacity management (P-18 budgets support resource planning)
- ISO 27001 A.16.1.2 — Reporting information security events (A-9 Slack alerts for anomalies)
- GitHub REST API documentation — Pulls and Commits endpoints
- Slack Block Kit documentation — Message formatting
