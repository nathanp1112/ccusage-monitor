# SRS/BRD Phase 3: Core Platform

**Timeline**: Month 2
**Priority**: HIGH — Enterprise readiness foundation
**Items**: S-6, S-10, A-15, A-29, A-30, A-31, P-4, P-5, P-8, P-15, P-17, P-28 (12 items — A-29 moved from Phase 5 per Decision #3)
**Estimated Effort**: ~4 weeks for 2-3 developers; ~200-280 dev-hours total
**Dependencies**: Phase 1 complete (JWT auth, S3 user store) + Phase 2 complete (recommended but not blocking for P-5/P-8/P-4/P-15)

---

## 1. Executive Summary

Phase 3 builds the enterprise-readiness foundation that transforms CCUsage Monitor from a developer tool into an organizational platform. It introduces:

1. **Role-based access control enforcement** (S-10): Three roles defined in Phase 1 are now actually enforced at every endpoint.
2. **User management UI** (A-15): Eliminates the need for Lambda redeployments to add/remove/update users.
3. **Data retention policies** (S-6): All S3 prefixes get documented lifecycle rules; no more indefinite data growth.
4. **Project-level dashboard** (A-30): Usage attributed to git repositories for budget allocation decisions.
5. **Reports page** (A-31, P-28): Automated weekly/monthly summaries replace manual dashboard review.
6. **Date range picker** (A-29): Universal date filter for all dashboard views — foundational UX primitive needed by Projects and Reports before they are built (moved from Phase 5 per Decision #3).
7. **Model tier advisor** (P-4, P-15): Identifies expensive-model requests that could use cheaper models, with per-member savings estimates.
8. **Session efficiency analytics** (P-5, P-8): Classifies developer coding sessions by depth to reveal work patterns.
9. **Cost anomaly detection** (P-17): Alerts when a member's daily cost exceeds 3x their 7-day moving average.

**Decision #3 impact**: A-29 (date range picker) was originally in Phase 5. The PM moved it to Phase 3 because building the Projects page (A-30) and Reports page (A-31) without date range support would require expensive retrofitting. The Architect confirmed on-the-fly filtering from pre-aggregated monthly files is feasible without new infrastructure.

**Decision #4 checkpoint**: At Phase 3 kickoff, confirm with stakeholders whether multi-tenancy (A-3) is required. If yes, adjust Phase 3 S3 key patterns to include `orgId` prefix proactively. If no (current expectation), proceed without org-level partitioning.

---

## 2. Business Requirements

### 2.1 Problem Statement

The system lacks fundamental platform capabilities needed for enterprise adoption:
- Users are managed via a hardcoded JSON file that requires Lambda redeployment to modify — any user addition takes 2+ hours including build and deploy
- Role-based access control is defined in JWTs but **never enforced** — any authenticated user has identical access to all endpoints
- Data grows indefinitely with no retention policy — no GDPR or data minimization compliance
- The dashboard has placeholder pages for Reports (`/reports` is empty) and no project-level views
- Session-level analytics and cost anomaly detection — key differentiators against competitors like LinearB — are absent
- Managers receive no automated summaries and must visit the dashboard manually for weekly reviews

This phase transforms CCUsage Monitor from a prototype into a platform that can be administered, trusted, and used for organizational decision-making.

### 2.2 Stakeholder Analysis

| Stakeholder | Role | Interest Level | Impact |
|-------------|------|----------------|--------|
| System Administrators | User management (A-15) eliminates the redeploy-to-add-user pain point | CRITICAL | HIGH — Major operational improvement |
| Security/Compliance Officers | S-6 (retention) and S-10 (RBAC) directly serve ISMS compliance | HIGH | HIGH — RBAC is foundational for access control audit |
| Engineering Managers | Reports, project views, anomaly detection, model recommendations | CRITICAL | HIGH — Weekly reports replace manual dashboard checking |
| Finance / Budget Owners | P-4/P-15 (model recommendations) and P-17 (anomaly detection) | HIGH | HIGH — Proactive cost management |
| Developers | Session-level insights into their work patterns, model tier recommendations | HIGH | MEDIUM — Recommendations are advisory, not enforced |

### 2.3 Business Value & ROI

**Quantifiable Benefits**:
- **Cost Savings via Model Optimization** (P-4, P-15): Identifying 20-40% savings by recommending model downgrades for simple tasks. If Opus costs $15/MTok output vs Sonnet at $3/MTok, moving 50% of simple queries saves ~60% on those. For a $3,000/month team: potential savings $600-$1,200/month.
- **Operational Efficiency** (A-15): Saves ~2 hours per user addition/removal (currently: edit JSON, commit, build, deploy). At 5 user changes/month: 10 hours saved/month.
- **Anomaly Prevention** (P-17): Catches cost spikes within 1 aggregation cycle (hourly) vs. discovery at month-end. Early detection could prevent $500-$2,000 in unintended spend per incident.
- **Manager Time Savings** (P-28): Saves each manager ~30 minutes/week of manual dashboard review. With 5 managers: 10 hours/month saved.
- **Data Compliance** (S-6): Reduces S3 storage costs over time and ensures GDPR-compatible data lifecycle management.

**ROI Estimation**: ~200-280 dev-hours investment. Cost savings of $7,200-$14,400/year from model optimization alone, plus operational efficiencies.

**Strategic Alignment**:
- S-10 (RBAC) is prerequisite for ISO 27001 A.9.2 (user access management) and Phase 4 compliance items
- S-6 (retention) is prerequisite for ISO 27001 A.8.3 (media handling) and GDPR Article 5(1)(e) (storage limitation)
- A-15 (user management) enables self-service onboarding, reducing friction for team growth

### 2.4 Success Metrics

| KPI | Target | Measurement |
|-----|--------|-------------|
| User management self-service | 100% of user add/remove operations via UI (zero redeployments) | Admin operation log |
| RBAC coverage | All endpoints enforce role-based access | Automated test suite with role-specific test cases |
| Retention policy implementation | All S3 prefixes have documented retention periods and active lifecycle rules | S3 lifecycle configuration audit |
| Model optimization savings identified | >$500/month in identifiable savings surfaced | Sum of all model tier recommendation savings |
| Cost anomaly detection | <4 hours from spike to alert | Simulated anomaly test with timestamp verification |
| Report generation | Weekly reports auto-generated by Monday 9:00 AM | Scheduled job monitoring |
| Project dashboard coverage | >80% of usage entries attributed to a named project | Project attribution rate in aggregated data |

---

## 3. Functional Requirements

### 3.1 User Stories with Acceptance Criteria

#### US-3.1: Data Retention Policy [S-6]

**As a** security officer,
**I want** configurable data retention policies per data type,
**so that** the system complies with data minimization principles and we are not storing data longer than necessary.

**Acceptance Criteria:**
- [ ] Retention policies defined per S3 prefix:
  - `raw/`: 730 days (24 months, configurable)
  - `aggregated/`: -1 (indefinite, regenerable from raw)
  - `prompts/`: 365 days (12 months — sensitive content, shorter default)
  - `sync-logs/`: 365 days (12 months, extended from current 90 days)
  - `audit-logs/`: -1 (indefinite — compliance)
  - `views/`: -1 (indefinite — regenerable at any time)
  - `commands/`: 90 days
- [ ] S3 lifecycle rules are generated from a central configuration file stored at `config/retention.json`
- [ ] Admin can view current retention settings via Settings > System tab
- [ ] A script or admin endpoint (`PUT /api/admin/retention`) regenerates lifecycle rules from config
- [ ] IAM permissions: Lambda role gains `s3:PutBucketLifecycleConfiguration` and `s3:GetBucketLifecycleConfiguration`

**Effort**: M (Medium) — S3 lifecycle config + admin view
**MoSCoW**: Must

---

#### US-3.2: RBAC Enforcement [S-10]

**As a** security officer,
**I want** role-based access control enforced on every API endpoint,
**so that** members can only access their own data, agents can only sync their own data, and only admins can perform administrative actions.

**Acceptance Criteria:**
- [ ] Three roles enforced: `admin`, `member`, `agent`
- [ ] `admin`: full access to all endpoints
- [ ] `member`: read access to dashboard, members list, own member detail; no access to admin endpoints; no sync access
- [ ] `agent`: POST /api/sync (own email only), GET/POST /api/agent/* (own email only); no dashboard access
- [ ] Role checked in JWT middleware after token validation via a `requireRole()` factory middleware
- [ ] Middleware returns 403 with `{ success: false, error: "Forbidden", code: "INSUFFICIENT_ROLE" }` on role mismatch
- [ ] Email validation: agent-role tokens can only sync/query data matching their own email claim
- [ ] Unit tests verify access matrix for all role x endpoint combinations (matrix: 3 roles x all endpoints)
- [ ] Permissive mode first deployment: log violations but don't block for 1 week before enforcing

**Effort**: M (Medium) — Middleware enhancement + access matrix tests
**MoSCoW**: Must

---

#### US-3.3: User Management UI [A-15]

**As an** admin,
**I want** a settings page in the dashboard where I can add, edit, deactivate, and remove users,
**so that** I can manage team access without touching source code or redeploying Lambda.

**Acceptance Criteria:**
- [ ] Settings page accessible only to admin role users (redirect non-admins to dashboard)
- [ ] `/settings?tab=users` shows user list table with columns: email, name, role, status (active/inactive), last login, created date
- [ ] "Invite User" form (DataSheet modal): email (required, unique), name, role (dropdown: admin/member/agent), initial password (auto-generated option)
- [ ] "Edit User" form (DataSheet modal): update name, role, reset password, status toggle
- [ ] "Deactivate User" action: sets `isActive: false`, invalidates active tokens (admin sends `revoke-token` command)
- [ ] "Delete User" action: with confirmation dialog — removes user record from `auth/users.json` in S3 (does NOT delete usage data; that is Phase 4 S-18)
- [ ] All user management actions produce audit log entries
- [ ] ETag-based concurrency control prevents race conditions on concurrent user modifications
- [ ] On email duplicate: inline form error "This email is already registered"

**Effort**: L (Large) — Full CRUD UI + API endpoints + invite flow
**MoSCoW**: Must

---

#### US-3.4: Date Range Picker [A-29]

**As a** dashboard user,
**I want** a universal date range selector in the navigation bar,
**so that** I can filter all dashboard views (Projects, Reports, Members) to any time period, not just the current month.

**Note**: Moved from Phase 5 to Phase 3 per Decision #3. Required to build Projects and Reports pages with date filtering from the start.

**Acceptance Criteria:**
- [ ] Date range picker displayed in the Navbar as a compact button showing the active range (e.g., "Feb 1-28, 2026")
- [ ] Clicking the button opens a Radix Popover panel with:
  - Preset options: Today, Last 7 days, This month (default), Last month, This quarter, Year to date, Custom
  - Custom range: two date inputs (From / To) with a calendar grid
- [ ] Default state: "This month" (current month, first to last day)
- [ ] Date range stored in Zustand `useUIStore` as `dateRange: {from: Date, to: Date} | null`
- [ ] Null means "current month" (backward compatible default)
- [ ] All TanStack Query hooks on Dashboard, Members, Projects, Reports pages receive dateRange as a query parameter
- [ ] API endpoints accept `?from=YYYY-MM-DD&to=YYYY-MM-DD` query params (or fall back to current month)
- [ ] Server-side filtering: aggregate monthly files within the date range and merge
- [ ] Responsive: desktop shows presets + calendar side by side; mobile shows presets only (custom via bottom sheet)

**Effort**: M (Medium) — Zustand state + Radix Popover + query param propagation
**MoSCoW**: Must (Decision #3: foundational for A-30 and A-31)

---

#### US-3.5: Project Dashboard [A-30]

**As an** engineering manager,
**I want** a project-level dashboard page showing cost, member count, model usage, and git repository for each project,
**so that** I can understand which projects consume the most AI resources and allocate budgets accordingly.

**Acceptance Criteria:**
- [ ] New "Projects" page in the dashboard sidebar navigation (between Members and Reports)
- [ ] Project list with columns: project name, git remote URL, total cost (current period per date range), member count, request count, primary model
- [ ] Sortable by cost, request count, member count
- [ ] Clicking a project opens a DataSheet detail view with:
  - Monthly cost trend (line chart, last 6 months)
  - Member breakdown table (member name, cost, requests, % of project)
  - Model distribution donut chart
- [ ] Project names derived from git remote URLs (repo name) with full URL in tooltip; unnamed projects show local path
- [ ] Data sourced from existing `projects/{memberId}.json` files cross-referenced with `aggregated/` data
- [ ] Aggregator generates `views/projects.json` with pre-computed project-level summaries
- [ ] Respects date range picker selection (US-3.4)
- [ ] Three view modes: Ranking (default), Cards, Chart (reuse ViewToggle pattern from Members page)

**Effort**: L (Large) — New page + aggregator changes + project cross-referencing
**MoSCoW**: Must

---

#### US-3.6: Reports Page [A-31, P-28]

**As an** engineering manager,
**I want** a reports page that generates weekly and monthly summary reports,
**so that** I can share AI usage insights with stakeholders without requiring dashboard access.

**Acceptance Criteria:**
- [ ] Reports page replaces the current placeholder (`/reports`)
- [ ] Report types: Daily Summary, Weekly Summary (default), Monthly Summary, Executive Summary
- [ ] Period selector: dropdown for preset periods or custom range via date range picker (US-3.4)
- [ ] Each report includes: total cost, cost change vs previous period, top members, model distribution, project breakdown, cost forecast
- [ ] Report preview renders inline (HTML) within the dashboard
- [ ] CSV export button: downloads tabular data (member costs, project costs, model breakdown)
- [ ] PDF export button: browser print dialog with print-optimized CSS
- [ ] Aggregator generates `views/reports/{year}-{month}.json` automatically (monthly report)
- [ ] Reports are auto-generated: weekly on Monday 00:00 UTC, monthly on the 1st
- [ ] Executive Summary report: key metrics + trends + model recommendations in single-page format

**Effort**: L (Large) — Report generation + export + scheduling
**MoSCoW**: Should

---

#### US-3.7: Model Tier Advisor [P-4, P-15]

**As an** engineering manager,
**I want** per-member and team-level recommendations for model tier optimization,
**so that** I can guide the team to use cost-appropriate models and reduce unnecessary spending on premium models.

**Acceptance Criteria:**
- [ ] Analysis identifies requests where Opus was used but Sonnet or Haiku would likely suffice
- [ ] Heuristic: requests with `outputTokens < 2000` AND no `cacheCreation` are candidates for model downgrade
- [ ] Per-member recommendation card: "You used Opus for X requests this month. Estimated savings from switching Y requests to Sonnet: $Z"
- [ ] Team-level summary: "Potential monthly savings from model optimization: $N"
- [ ] Model tier classification:
  - Premium: `claude-opus-*` ($15/MTok input, $75/MTok output approximate)
  - Standard: `claude-sonnet-*` ($3/MTok input, $15/MTok output approximate)
  - Economy: `claude-haiku-*` ($0.25/MTok input, $1.25/MTok output approximate)
- [ ] Recommendations displayed in: member detail view (Efficiency tab), Reports page (Model Tier Advisor card), and Executive Summary
- [ ] Aggregator computes recommendations and stores in `views/members/{memberId}/{year}.json` under `analytics.modelRecommendations`

**Effort**: M (Medium) — Heuristic analysis + recommendation cards
**MoSCoW**: Should

---

#### US-3.8: Session Efficiency Analytics [P-5, P-8]

**As a** developer,
**I want** to see analytics about my coding sessions (grouped by sessionId),
**so that** I can understand my work patterns and identify opportunities to be more effective with AI assistance.

**Acceptance Criteria:**
- [ ] Sessions grouped by `sessionId` from usage entries
- [ ] Per-session metrics: total cost, duration (first to last request timestamp), request count, models used, primary project
- [ ] Session classification:
  - Quick Lookup: 1-3 requests, < 5 minutes
  - Focused Work: 4-15 requests, 5-60 minutes
  - Deep Dive: 16-40 requests, 1-4 hours
  - Marathon: 40+ requests or 4+ hours
- [ ] Session type distribution chart (bar) per member per month
- [ ] Average session cost and duration trends over time (line chart)
- [ ] Member detail view includes "Sessions" tab with session list and classification breakdown
- [ ] Top 5 most expensive sessions listed per month with cost, duration, model
- [ ] Data sourced from `aggregated/` files (session metrics computed at sync time as per Phase 2 pattern)

**Effort**: M (Medium) — Session grouping extension in aggregator + member detail sessions tab
**MoSCoW**: Should

---

#### US-3.9: Cost Anomaly Detection [P-17]

**As an** admin,
**I want** automatic detection and alerting when a member's daily cost exceeds a threshold,
**so that** I can investigate unusual spending before it becomes a significant budget issue.

**Given** a member's daily cost exceeds 3x their 7-day moving average,
**When** the aggregator runs,
**Then** an anomaly entry is created in `views/alerts.json`,
**And** the anomaly is visible on the dashboard with member name, date, actual cost, expected cost, and deviation factor.

**Acceptance Criteria:**
- [ ] Anomaly threshold: daily cost > 3x rolling 7-day average (configurable multiplier)
- [ ] Minimum absolute threshold: daily cost must exceed $5 to trigger (avoid noise on low-usage members)
- [ ] Two severity levels: `warning` (>2x average), `critical` (>3x average)
- [ ] Alerts displayed on dashboard in a dismissible banner component at page top
- [ ] Admin sees all member alerts; members see only their own anomalies
- [ ] Each alert shows: member, date, actual cost, expected cost, deviation multiplier, severity
- [ ] Alerts auto-resolve when the next aggregation cycle shows the member returned to normal spending
- [ ] Historical alerts retained for 30 days in `views/alerts.json`
- [ ] New S3 key: `views/alerts.json`

**Effort**: M (Medium) — Anomaly detection logic in aggregator + alerts UI
**MoSCoW**: Should

### 3.2 API Specifications

#### New Endpoints (Phase 3)

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| `GET` | `/api/admin/users` | admin | List all users (no password hashes returned) |
| `POST` | `/api/admin/users` | admin | Create new user |
| `PUT` | `/api/admin/users/:email` | admin | Update user (name, role, password, isActive) |
| `DELETE` | `/api/admin/users/:email` | admin | Soft-delete user (sets isActive: false) |
| `GET` | `/api/admin/retention` | admin | View current retention policy |
| `PUT` | `/api/admin/retention` | admin | Update retention policy + apply lifecycle rules |
| `GET` | `/api/projects` | admin, member | Project-level dashboard data |
| `GET` | `/api/reports?year=&month=` | admin, member | Monthly report view |

#### Modified Endpoints (Phase 3)

| Endpoint | Change |
|----------|--------|
| `GET /api/dashboard` | Add `alerts` array from `views/alerts.json` |
| `GET /api/members/:id?year=` | Add `analytics.sessionMetrics`, `analytics.modelRecommendations` |
| All existing endpoints | RBAC middleware now enforced (S-10) |

#### User Management TypeScript Interfaces

```typescript
// GET /api/admin/users Response
interface AdminUsersResponse {
  success: true;
  users: Array<{
    email: string;
    name: string;
    role: 'admin' | 'agent' | 'member';
    isActive: boolean;
    createdAt: string;
    lastLoginAt: string | null;
    // passwordHash is NEVER returned
  }>;
}

// POST /api/admin/users Request
interface CreateUserRequest {
  email: string;          // required, unique
  name: string;           // required
  role: 'admin' | 'agent' | 'member';
  password: string;       // server bcrypt-hashes before storing
}

// POST /api/admin/users Response
interface CreateUserResponse {
  success: true;
  user: { email: string; name: string; role: string; };
}

// PUT /api/admin/users/:email Request (all fields optional)
interface UpdateUserRequest {
  name?: string;
  role?: 'admin' | 'agent' | 'member';
  password?: string;       // if provided, re-hash with bcrypt
  isActive?: boolean;
}

// PUT /api/admin/users/:email Response
interface UpdateUserResponse {
  success: true;
  user: { email: string; name: string; role: string; isActive: boolean; };
}

// DELETE /api/admin/users/:email Response
interface DeleteUserResponse {
  success: true;
  message: 'User deactivated';
}
```

#### Retention Policy TypeScript Interfaces

```typescript
// GET/PUT /api/admin/retention
interface RetentionPolicyRequest {
  rules: Array<{
    prefix: string;        // e.g., "raw/", "prompts/"
    retentionDays: number; // -1 = indefinite
    description: string;
  }>;
}

interface RetentionPolicyResponse {
  success: true;
  policy: RetentionPolicy;
  appliedAt: string;       // ISO timestamp when S3 lifecycle rules were applied
}

interface RetentionPolicy {
  version: 1;
  lastUpdated: string;
  rules: Array<{
    prefix: string;
    retentionDays: number;
    description: string;
  }>;
}
```

#### Projects TypeScript Interfaces

```typescript
// GET /api/projects Response
interface ProjectsResponse {
  success: true;
  generatedAt: string;
  period: { from: string; to: string };
  projects: Array<ProjectSummary>;
}

interface ProjectSummary {
  projectPath: string;
  gitRepo: string | null;            // normalized git remote URL
  totalCost: number;
  totalRequests: number;
  memberCount: number;
  members: Array<{
    memberId: string;
    name: string;
    costUsd: number;
    requestCount: number;
  }>;
  modelDistribution: Array<{
    model: string;
    costUsd: number;
    percentage: number;
  }>;
  monthlyCost: Array<{
    month: string;                   // "2026-01"
    costUsd: number;
  }>;
  lastActivity: string;              // ISO timestamp of most recent entry
}
```

#### Reports TypeScript Interfaces

```typescript
// GET /api/reports?year=&month= Response
interface ReportsResponse {
  success: true;
  report: MonthlyReport;
}

interface MonthlyReport {
  generatedAt: string;
  period: { year: number; month: number };
  teamSummary: {
    totalCost: number;
    costChange: number;              // vs previous month (positive = increase)
    costChangePercent: number;
    totalRequests: number;
    activeMembers: number;
    avgCostPerMember: number;
    avgCostPerRequest: number;
    cacheHitRate: number;
    adoptionRate: number;
  };
  memberRankings: {
    byCost: Array<{ memberId: string; name: string; costUsd: number; rank: number }>;
    byEfficiency: Array<{ memberId: string; name: string; cacheHitRate: number; rank: number }>;
    byActivity: Array<{ memberId: string; name: string; requestCount: number; rank: number }>;
  };
  modelAnalysis: {
    distribution: Array<{ model: string; costUsd: number; percentage: number }>;
    tierBreakdown: {
      premium: number;               // cost in premium models
      standard: number;
      economy: number;
    };
    potentialTeamSavings: number;    // from model tier advisor
  };
  projectAnalysis: Array<{
    projectPath: string;
    gitRepo: string | null;
    costUsd: number;
    memberCount: number;
    avgCostPerMember: number;
  }>;
  costForecast: {
    nextMonthProjected: number;
    trend: 'decreasing' | 'stable' | 'increasing' | 'high';
  };
  highlights: string[];              // auto-generated insight strings, e.g., "Opus usage increased 23%"
}
```

#### RBAC Middleware TypeScript Interface

```typescript
// src/lib/auth.ts

type Role = 'admin' | 'member' | 'agent';

function requireRole(...allowedRoles: Role[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user');  // set by Phase 1 auth middleware
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized', code: 'AUTH_REQUIRED' }, 401);
    }
    if (!allowedRoles.includes(user.role)) {
      return c.json({ success: false, error: 'Forbidden', code: 'INSUFFICIENT_ROLE',
        required: allowedRoles, actual: user.role }, 403);
    }
    return next();
  };
}

// Usage in routes:
adminRoute.use('*', requireRole('admin'));
syncRoute.use('*', requireRole('admin', 'agent'));
dashboardRoute.use('*', requireRole('admin', 'member'));
membersRoute.use('*', requireRole('admin', 'member'));
projectsRoute.use('*', requireRole('admin', 'member'));
reportsRoute.use('*', requireRole('admin', 'member'));

// Endpoint-to-role matrix
const ENDPOINT_ROLES: Record<string, Role[]> = {
  'POST /api/sync':                      ['agent', 'admin'],
  'GET /api/agent/commands':             ['agent'],
  'POST /api/agent/commands/:id/ack':    ['agent'],
  'GET /api/dashboard*':                 ['admin', 'member'],
  'GET /api/members*':                   ['admin', 'member'],
  'GET /api/projects':                   ['admin', 'member'],
  'GET /api/reports':                    ['admin', 'member'],
  'POST /api/admin/*':                   ['admin'],
  'GET /api/admin/*':                    ['admin'],
  'PUT /api/admin/*':                    ['admin'],
  'DELETE /api/admin/*':                 ['admin'],
};
```

#### Cost Anomaly Detection TypeScript Interface

```typescript
// views/alerts.json
interface AlertsView {
  generatedAt: string;
  alerts: Array<CostSpikeAlert>;
}

interface CostSpikeAlert {
  id: string;
  type: 'cost_spike';
  severity: 'warning' | 'critical';    // warning: >2x, critical: >3x
  memberId: string;
  memberName: string;
  date: string;                         // ISO date of the spike
  actualCost: number;
  expectedCost: number;                 // 7-day moving average
  ratio: number;                        // actualCost / expectedCost
  message: string;                      // human-readable, e.g., "Daily cost $89 is 3.2x the 7-day average"
  createdAt: string;
  resolvedAt: string | null;
}
```

#### Model Recommendations TypeScript Interface

```typescript
// Added to views/members/{memberId}/{year}.json
interface ModelRecommendations {
  currentTierDistribution: {
    premium: { count: number; costUsd: number; percentage: number };
    standard: { count: number; costUsd: number; percentage: number };
    economy: { count: number; costUsd: number; percentage: number };
  };
  potentialSavings: {
    ifAllStandard: number;             // savings if all premium switched to standard
    ifMixedOptimal: number;            // savings with rule-based optimization
    topRecommendation: string;         // e.g., "Switch 342 Opus requests to Sonnet, save $47/mo"
  };
}
```

#### Session Metrics TypeScript Interface

```typescript
// Added to MonthAggregation.analytics (aggregated/{memberId}/{year}-{month}.json)
interface SessionMetrics {
  totalSessions: number;
  avgSessionCost: number;
  avgSessionDuration: number;          // minutes, estimated first-to-last timestamp
  avgRequestsPerSession: number;
  sessionsByDepth: {
    quick: number;                     // 1-3 requests
    focused: number;                   // 4-15 requests
    deep: number;                      // 16-40 requests
    marathon: number;                  // 41+ requests
  };
  topSessions: Array<{                 // top 5 most expensive
    sessionId: string;
    requestCount: number;
    costUsd: number;
    durationMinutes: number;
    model: string;                     // primary model used
    project: string | null;
  }>;
}
```

### 3.3 Data Model Changes

#### New S3 Keys (Phase 3)

| Key | Purpose | Written By |
|-----|---------|------------|
| `config/retention.json` | Retention policy configuration | Admin API (`PUT /api/admin/retention`) |
| `views/projects.json` | Project-level aggregation | Aggregator Lambda |
| `views/reports/{year}-{month}.json` | Monthly report data | Aggregator Lambda |
| `views/alerts.json` | Active cost anomaly alerts | Aggregator Lambda |

#### Modified S3 Schemas

| Key | Change |
|-----|--------|
| `aggregated/{memberId}/{year}-{month}.json` | Add `analytics.sessionMetrics`, `analytics.modelRecommendations` |
| `views/members/{memberId}/{year}.json` | Add `analytics.modelRecommendations` |
| `views/dashboard.json` | Add `alerts` array reference from `views/alerts.json` |

#### Default Retention Configuration

```typescript
// config/retention.json (initial value applied at Phase 3 deploy)
const DEFAULT_RETENTION: RetentionPolicy = {
  version: 1,
  lastUpdated: new Date().toISOString(),
  rules: [
    { prefix: 'sync-logs/',   retentionDays: 365,  description: 'Sync audit trail (12 months)' },
    { prefix: 'prompts/',     retentionDays: 365,  description: 'Prompt text archive (12 months)' },
    { prefix: 'raw/',         retentionDays: 730,  description: 'Raw usage entries (24 months)' },
    { prefix: 'commands/',    retentionDays: 90,   description: 'Command queue (3 months)' },
    { prefix: 'aggregated/',  retentionDays: -1,   description: 'Keep indefinitely (regenerable)' },
    { prefix: 'views/',       retentionDays: -1,   description: 'Keep indefinitely (regenerable)' },
    { prefix: 'audit/',       retentionDays: -1,   description: 'Keep indefinitely (compliance)' },
    { prefix: 'config/',      retentionDays: -1,   description: 'Keep indefinitely (system config)' },
    { prefix: 'members/',     retentionDays: -1,   description: 'Keep indefinitely (member registry)' },
    { prefix: 'releases/',    retentionDays: -1,   description: 'Keep indefinitely (agent binaries)' },
  ],
};
```

---

## 4. Non-Functional Requirements

### 4.1 Security (RBAC Enforcement — S-10)

**Current weakness**: Three roles are defined in JWT tokens but no middleware validates them. Any authenticated user (regardless of role) can call any endpoint. An agent-role token (meant only for machine-to-machine sync) could theoretically access dashboard views or trigger admin operations.

**Target**: All 19 API endpoint patterns have explicit role enforcement via the `requireRole()` middleware factory. Unit tests cover all role x endpoint combinations in a matrix (3 roles x 19 endpoint patterns = 57 test cases).

**Email validation** (for agent-role tokens): Beyond role checking, agent endpoints validate that the authenticated agent's email claim matches the resource being accessed. An agent cannot read another agent's commands or sync data under a different email.

**Deployment strategy**: Deploy in "permissive" mode for one week (log violations but don't block). After observing no legitimate cross-role access, switch to enforcement mode. This prevents RBAC from breaking existing dashboard sessions that may have been issued with incomplete role claims.

### 4.2 Data Retention (S-6 — S3 Lifecycle Rules)

**Enforcement mechanism**: S3 native lifecycle rules (not Lambda-driven deletion). This is the most reliable approach because S3 handles deletion automatically without Lambda involvement.

**IAM addition required**:
```yaml
# serverless.yml addition
- Effect: Allow
  Action:
    - s3:PutBucketLifecycleConfiguration
    - s3:GetBucketLifecycleConfiguration
  Resource:
    - arn:aws:s3:::${self:custom.bucketName}
```

**Safety note**: Retention rules are set conservatively (raw data: 24 months). Never auto-delete `raw/` without explicit admin confirmation. Phase 4 (S-18 right to erasure) will add member-specific deletion; bulk retention is handled here.

### 4.3 Performance

| Change | Aggregator Impact | Notes |
|--------|------------------|-------|
| Project-level aggregation (A-30) | +200ms | Cross-reference projects across all members |
| Report generation (P-28, A-31) | +100ms per report | One report per month, computed once and cached |
| Anomaly detection (P-17) | +50ms | Simple moving average over 7 days per member |
| Session metrics (P-5, P-8) | Already computed at sync time (Phase 2) | No aggregator cost |
| Model recommendations (P-4, P-15) | +30ms per member | Simple tier classification |

**Aggregator total**: For 500 members, adds ~2-3 minutes to the hourly aggregation cycle. The 5-minute (300-second) Lambda timeout provides adequate headroom.

**Cold start impact of RBAC (S-10)**: Minimal. `requireRole()` is a synchronous in-memory check; no additional I/O. Estimated +1ms per request.

---

## 5. UX Requirements

### 5.1 Date Range Picker [A-29]

A universal date range filter in the Navbar that affects all dashboard data. Stored in Zustand; propagated to all TanStack Query hooks.

**Navbar integration:**
```
+------------------------------------------------------+
| Team Usage Monitor            [Feb 1-28, 2026 v]  ... |
+------------------------------------------------------+
```

**Expanded picker panel (Radix Popover):**
```
+-- Date Range Picker ----------------------------------+
|                                                        |
| PRESETS                    CUSTOM RANGE                |
| [Today      ]             From: [2026-02-01]           |
| [Last 7 days]             To:   [2026-02-28]           |
| [This month*]                                          |
| [Last month ]             [< Feb 2026 >]               |
| [This quarter]            [Calendar grid]              |
| [Year to date]                                         |
| [Custom...  ]                                          |
|                                                        |
|                           [Cancel] [Apply]             |
+--------------------------------------------------------+
```

**Implementation**: Store in Zustand `useUIStore` as `dateRange: {from: Date, to: Date} | null`. Null defaults to current month. Displayed in Navbar as a compact button.

### 5.2 User Management UI [A-15]

#### Settings Page: Users Tab `/settings?tab=users`

```
+------------------------------------------------------+
| Settings                                              |
| System configuration and administration               |
+------------------------------------------------------+
| [Users*] [Security] [System]                          |
+------------------------------------------------------+
|                                                       |
| Users (12)                          [+ Invite User]   |
|                                                       |
| Search: [________________] [Filter: All Roles v]      |
|                                                       |
| +---------------------------------------------------+ |
| | Name           Email              Role    Status   | |
| |---------------------------------------------------| |
| | Alice Johnson  alice@tvf.co.jp    admin   Active   | |
| | Bob Smith      bob@tvf.co.jp      member  Active   | |
| | Charlie Lee    charlie@tvf.co.jp  member  Inactive | |
| | Dave Kim       dave@tvf.co.jp     agent   Active   | |
| |                                                    | |
| | [Edit] [Deactivate] [...more]  per row on hover    | |
| +---------------------------------------------------+ |
|                                                       |
+------------------------------------------------------+
```

#### Invite User DataSheet (side="right")

```
+-- Invite User (DataSheet modal) ----------------------+
|                                                        |
| Invite New User                                        |
| Send an invitation to join the team                    |
|                                                        |
| Email: *                                               |
| [________________________________]                     |
|                                                        |
| Name: *                                                |
| [________________________________]                     |
|                                                        |
| Role:                                                  |
| ( ) Admin - Full access, manage users                  |
| (x) Member - View dashboard, own data                  |
| ( ) Agent - Machine account, sync only                 |
|                                                        |
| Initial Password: *                                    |
| [________________________________]                     |
| Must be at least 8 characters                          |
|                                                        |
|                      [Cancel] [Create User]            |
+--------------------------------------------------------+
```

#### Edit User DataSheet

```
+-- Edit User (DataSheet modal) ------------------------+
|                                                        |
| Edit User                                              |
| alice@techvify.com.vn                                  |
|                                                        |
| Name:                                                  |
| [Alice Johnson_______________________]                 |
|                                                        |
| Role:                                                  |
| [Admin v]                                              |
|                                                        |
| Status:                                                |
| [Active v]                                             |
|                                                        |
| Reset Password:                                        |
| [________________________________]                     |
| Leave blank to keep current password                   |
|                                                        |
| DANGER ZONE                                            |
| +--------------------------------------------------+  |
| | [Deactivate User]  [Delete User Record]           |  |
| +--------------------------------------------------+  |
|                                                        |
|                      [Cancel] [Save Changes]           |
+--------------------------------------------------------+
```

**Error states for User Management:**

| Error | Display |
|-------|---------|
| Duplicate email | Inline form error: "This email is already registered" |
| Validation failure | Per-field error messages below inputs |
| Server error | Toast with retry option |
| Delete confirmation | AlertDialog: "This will remove this user's login access. Their usage data is retained. This action cannot be undone." |

#### User Management User Flow

```
1. Admin navigates to Settings
2. Users tab is selected by default
3. User list loads: name, email, role, status
4. Admin clicks [+ Invite User] -> DataSheet opens on right
5. Admin fills: email, name, role (member), password
6. Admin clicks [Create User]
7. Loading state: "Creating..."
8. SUCCESS: Toast "User alice@tvf.co.jp created successfully"
   -> DataSheet closes, list refreshes
9. ERROR: Inline error messages on form
   -> User corrects and retries
```

### 5.3 Projects Dashboard Page [A-30]

#### New Screen: `/projects`

```
+------------------------------------------------------+
| Projects                                              |
| AI usage breakdown by project                         |
+------------------------------------------------------+
|                                                       |
| Team Cost: $1,234 | Projects: 18 | Active: 12        |
|                                                       |
| [Ranking] [Cards] [Chart]     Sort: [Cost v]          |
+------------------------------------------------------+
|                                                       |
| RANKING VIEW:                                         |
| +---------------------------------------------------+ |
| | #1  workflow-scout                                 | |
| |     github.com/org/workflow-scout                  | |
| |     Cost: $345.67  Members: 4  Requests: 2,340    | |
| |     [==================               ] 28%       | |
| |---------------------------------------------------| |
| | #2  ccusage-monitor                                | |
| |     github.com/org/ccusage-monitor                 | |
| |     Cost: $234.12  Members: 3  Requests: 1,890    | |
| |     [============                     ] 19%       | |
| |---------------------------------------------------| |
| | #3  internal-tools                                 | |
| |     (no git remote)                                | |
| |     Cost: $189.45  Members: 2  Requests: 1,123    | |
| |     [==========                       ] 15%       | |
| +---------------------------------------------------+ |
|                                                       |
| [Click row -> Project Detail DataSheet]               |
+------------------------------------------------------+
```

#### Project Detail DataSheet (size="xl")

```
+-- Project Detail (DataSheet, size="xl") ---------------+
|                                                         |
| workflow-scout                                          |
| github.com/org/workflow-scout                           |
|                                                         |
| OVERVIEW                                                |
| Total Cost: $345.67  |  Requests: 2,340  |  Members: 4 |
|                                                         |
| MEMBER BREAKDOWN                                        |
| +------------------------------------------------------+|
| | Member         Cost      Requests  % of Project      ||
| |-------------------------------------------------------||
| | Alice Johnson  $123.45   890       35.7%             ||
| | Bob Smith      $98.76    654       28.6%             ||
| | Charlie Lee    $67.89    456       19.6%             ||
| | Dave Kim       $55.57    340       16.1%             ||
| +------------------------------------------------------+|
|                                                         |
| MONTHLY TREND                                           |
| [Line chart: cost over last 6 months]                   |
|                                                         |
| MODEL USAGE                                             |
| [Donut chart: Opus 45%, Sonnet 40%, Haiku 15%]          |
|                                                         |
+----------------------------------------------------------+
```

**Data source**: Aggregator cross-references `projects/{memberId}.json` with `aggregated/` data to build `views/projects.json`. Uses `gitRepo` URL as canonical project identifier (normalized: strip trailing `.git`, lowercase).

### 5.4 Reports Page [A-31, P-28]

#### Updated Screen: `/reports`

```
+------------------------------------------------------+
| Reports                                               |
| Generate and export usage reports                     |
+------------------------------------------------------+
|                                                       |
| REPORT TYPE                                           |
| [Daily] [Weekly*] [Monthly] [Executive Summary]       |
|                                                       |
| PERIOD                                                |
| [Feb 2026 v]  or  [Custom Range...]                   |
|                                                       |
| FILTERS                                               |
| Members: [All Members v]  Projects: [All Projects v]  |
|                                                       |
+------------------------------------------------------+
| PREVIEW                                               |
| +---------------------------------------------------+ |
| | Weekly Report: Feb 17-23, 2026                     | |
| |                                                    | |
| | SUMMARY                                            | |
| | Total Cost: $312.45   Requests: 3,456              | |
| | Avg Cost/Request: $0.09  Active Members: 8/12      | |
| |                                                    | |
| | TOP MEMBERS                                        | |
| | 1. Alice Johnson    $89.12  (28.5%)                | |
| | 2. Bob Smith        $67.34  (21.5%)                | |
| | 3. Charlie Lee      $54.23  (17.4%)                | |
| |                                                    | |
| | MODEL DISTRIBUTION                                 | |
| | Opus: 45%  Sonnet: 40%  Haiku: 15%                | |
| |                                                    | |
| | DAILY BREAKDOWN                                    | |
| | Mon: $56  Tue: $48  Wed: $52  Thu: $61  Fri: $45  | |
| | Sat: $23  Sun: $27                                 | |
| +---------------------------------------------------+ |
|                                                       |
| [Download CSV]  [Download PDF]  [Send via Email]      |
+------------------------------------------------------+
```

#### Executive Summary Report (P-28)

```
+-- Executive Summary ----------------------------------+
|                                                        |
| EXECUTIVE SUMMARY - February 2026                      |
|                                                        |
| KEY METRICS                                            |
| +----------------------------------------------------+ |
| | Total AI Spend    $1,234.56   +12% vs last month   | |
| | Team Adoption     66.7%       +8.3% vs last month  | |
| | Cache Efficiency   67.3%      +5.1% vs last month  | |
| | Avg Cost/Member   $102.88     -3% vs last month    | |
| +----------------------------------------------------+ |
|                                                        |
| COST TREND (sparkline chart)                           |
| Jan ===== $980                                         |
| Feb ======== $1,234                                    |
| Forecast Mar ========== $1,450                         |
|                                                        |
| TOP COST DRIVERS                                       |
| 1. workflow-scout project: $345 (28%)                  |
| 2. Opus model usage: $678 (55%)                        |
| 3. Alice Johnson: $234 (19%)                           |
|                                                        |
| RECOMMENDATIONS                                        |
| - 342 Opus requests could use Sonnet (est. save $47)   |
| - 3 members have <30% cache rate (training needed)     |
| - Cost forecast suggests 15% increase next month       |
+--------------------------------------------------------+
```

### 5.5 Model Tier Advisor Widget [P-4, P-15]

Embedded within the Reports page and optionally surfaced in individual member detail views.

```
+-- Model Tier Advisor Card ----------------------------+
|                                                        |
| [Lightbulb] Model Tier Recommendations                 |
|                                                        |
| Potential Monthly Savings: $127.45                     |
|                                                        |
| +----------------------------------------------------+ |
| | Member         Current  Suggested  Est. Savings     | |
| |-----------------------------------------------------| |
| | Alice Johnson  342 Opus  -> Sonnet  $47.30/mo      | |
| | Bob Smith      189 Opus  -> Sonnet  $26.12/mo      | |
| | Charlie Lee    567 Sonnet -> Haiku  $34.03/mo      | |
| +----------------------------------------------------+ |
|                                                        |
| Based on requests with <2K output tokens               |
+--------------------------------------------------------+
```

### 5.6 Session Efficiency Analytics [P-5, P-8]

Added as a "Sessions" tab within the Member Detail DataSheet.

```
+-- Member Detail DataSheet (enhanced) -----------------+
|                                                        |
| [Overview*] [Sessions] [Efficiency]                    |
|                                                        |
| SESSIONS TAB:                                          |
| +----------------------------------------------------+ |
| | Session           Duration  Requests  Cost  Model  | |
| |-----------------------------------------------------| |
| | #a1b2c3 (today)   45 min    23       $4.56  Opus   | |
| | #d4e5f6 (today)   12 min    5        $0.89  Sonnet | |
| | #g7h8i9 (yester)  120 min   67       $12.34 Mixed  | |
| +----------------------------------------------------+ |
|                                                        |
| Session Types Distribution (bar chart):                |
| Quick (1-3):   |################| 45%                  |
| Focused (4-15):|##########| 30%                        |
| Deep (16-40):  |######| 18%                            |
| Marathon (40+):|##| 7%                                 |
+--------------------------------------------------------+
```

### 5.7 Cost Anomaly Alert Banner [P-17]

A dismissible banner at the top of the Dashboard page when anomalies are detected.

```
+------------------------------------------------------+
| [AlertTriangle] Cost Alert                    [x]     |
| Bob Smith's daily cost ($89.34) is 3.2x the          |
| 7-day average ($27.92). Review usage patterns.        |
+------------------------------------------------------+
```

- Admin sees all member alerts
- Members see only their own anomalies
- Alert can be dismissed (dismissed state stored in localStorage per session)
- Multiple alerts collapsed into "N cost anomalies detected" with expand button

### 5.8 Phase 3 Complete Component Inventory

| Component | Type | Location | Props |
|-----------|------|----------|-------|
| `DateRangePicker` | New | `components/shared/date-range-picker.tsx` | `value, onChange, presets` |
| `NavbarDateRange` | New | `components/layout/navbar-date-range.tsx` | Wraps DateRangePicker in Navbar |
| `/settings` page (enhanced) | Update | `app/(dashboard)/settings/page.tsx` | Tab-based layout |
| `UserManagementTab` | New | `components/settings/user-management-tab.tsx` | Users list + CRUD |
| `UserTable` | New | `components/settings/user-table.tsx` | `users: User[], onEdit, onDeactivate` |
| `InviteUserForm` | New | `components/settings/invite-user-form.tsx` | `onSubmit, onCancel` |
| `EditUserForm` | New | `components/settings/edit-user-form.tsx` | `user: User, onSubmit, onCancel` |
| `/projects` page | New | `app/(dashboard)/projects/page.tsx` | Mirrors Members page pattern |
| `ProjectRankingList` | New | `components/projects/project-ranking-list.tsx` | `projects: RankedProject[]` |
| `ProjectCard` | New | `components/projects/project-card.tsx` | `project: Project, onClick` |
| `ProjectDetailContent` | New | `components/projects/project-detail-content.tsx` | `projectId: string` |
| `/reports` page (rewrite) | Update | `app/(dashboard)/reports/page.tsx` | Full report generation UI |
| `ReportTypeSelector` | New | `components/reports/report-type-selector.tsx` | `value, onChange, options` |
| `ReportPreview` | New | `components/reports/report-preview.tsx` | `type, period, data` |
| `ReportExportBar` | New | `components/reports/report-export-bar.tsx` | `onExportCSV, onExportPDF` |
| `ExecutiveSummary` | New | `components/reports/executive-summary.tsx` | `data: ExecutiveSummaryData` |
| `ModelTierAdvisor` | New | `components/reports/model-tier-advisor.tsx` | `recommendations: Recommendation[]` |
| `CostAlertBanner` | New | `components/dashboard/cost-alert-banner.tsx` | `alerts: CostAlert[], onDismiss` |
| `SessionList` | New | `components/members/session-list.tsx` | `sessions: Session[]` |

**Sidebar update**: Add `Projects` entry with `FolderKanban` icon between Members and Reports.

**New TanStack Query keys**:
```typescript
queryKeys.projects.list(dateRange)
queryKeys.projects.detail(projectId)
queryKeys.reports.generate(type, period, filters)
queryKeys.settings.users()
queryKeys.dashboard.alerts()
```

### 5.9 Phase 3 User Flows

#### Flow: Create New User

```
1. Admin navigates to Settings -> Users tab
2. Clicks [+ Invite User]
3. DataSheet opens on right
4. Fills: email, name, role (member), password
5. Clicks [Create User]
6. Loading state: "Creating..."
7. SUCCESS: Toast "User created successfully"
   -> DataSheet closes, list refreshes
8. ERROR: Inline error messages on form
   -> User corrects and retries
```

#### Flow: Generate Weekly Report

```
1. User navigates to Reports page
2. Selects "Weekly" report type
3. Selects week range from dropdown
4. Preview section loads with report data
5. User reviews preview
6. Clicks [Download PDF]
7. Browser print dialog opens with print-optimized layout
8. ALTERNATIVE: Clicks [Download CSV]
9. CSV file downloads with tabular data
```

#### Flow: Explore Project Costs

```
1. User navigates to Projects page
2. Project list shows ranked by cost (current month default)
3. User uses date range picker to select "Last quarter"
4. Project rankings update for the 3-month period
5. User clicks "workflow-scout" row
6. DataSheet opens with project detail
7. Shows member breakdown, 6-month cost trend, model usage
8. User identifies that Opus usage is 45% of project cost
9. Cross-references with Model Tier Advisor in Reports
```

#### Flow: Respond to Cost Anomaly

```
1. Dashboard loads with cost alert banner at top
2. Banner: "Bob Smith's daily cost ($89.34) is 3.2x the 7-day average"
3. Admin clicks on member name in banner -> member detail DataSheet opens
4. Admin reviews Bob's session list for unusual large sessions
5. Admin identifies a 120-minute marathon session ($12.34)
6. Admin contacts Bob to discuss the session
7. Alert auto-resolves on next aggregation cycle if costs return to normal
```

---

## 6. Technical Architecture

### 6.1 RBAC Middleware (requireRole Factory)

The `requireRole()` factory is added to `lambda-server/src/lib/auth.ts` (new file created in Phase 1). It wraps Hono route groups:

```typescript
// Apply at route group level in src/app.ts
import { adminRoute } from './routes/admin';
import { syncRoute } from './routes/sync';
import { dashboardRoute } from './routes/dashboard';
import { membersRoute } from './routes/members';

// Admin routes: admin role only
app.route('/api/admin', adminRoute);
adminRoute.use('*', requireRole('admin'));

// Sync routes: agent or admin
syncRoute.use('*', requireRole('admin', 'agent'));

// Dashboard/Members/Projects/Reports: admin or member
dashboardRoute.use('*', requireRole('admin', 'member'));
membersRoute.use('*', requireRole('admin', 'member'));
```

Additional email validation in sync and agent-command routes:
```typescript
// In sync route — agent can only sync own email
if (user.role === 'agent' && user.email !== body.email) {
  return c.json({ success: false, error: 'Cannot sync data for a different email', code: 'EMAIL_MISMATCH' }, 403);
}
```

### 6.2 User Management CRUD

Built on top of the S3 user store (`auth/users.json`) created in Phase 1 (S-9).

- All CRUD operations use ETag-based conditional writes to prevent concurrent modification races
- User store cached in Lambda memory with 5-minute TTL
- Cache invalidated on write operations
- Password is never returned in GET responses
- Delete is soft-delete only (`isActive: false`); hard delete requires Phase 4 S-18 (right to erasure)

### 6.3 Data Retention (S3 Lifecycle Rules from Config)

```typescript
// src/lib/retention.ts
async function applyRetentionRules(policy: RetentionPolicy): Promise<void> {
  const rules = policy.rules
    .filter(r => r.retentionDays > 0)
    .map(r => ({
      ID: `retention-${r.prefix.replace(/\//g, '-').replace(/-$/, '')}`,
      Filter: { Prefix: r.prefix },
      Status: 'Enabled' as const,
      Expiration: { Days: r.retentionDays },
    }));

  await s3Client.send(new PutBucketLifecycleConfigurationCommand({
    Bucket: BUCKET_NAME,
    LifecycleConfiguration: { Rules: rules },
  }));
}
```

This function is called:
1. Once at Phase 3 deploy time with the default policy
2. Whenever an admin updates the retention policy via `PUT /api/admin/retention`

### 6.4 Anomaly Detection Algorithm (P-17)

```typescript
// src/aggregator.ts additions
function detectCostAnomalies(
  members: Array<{ memberId: string; name: string; dailyCosts: Array<{ date: string; cost: number }> }>
): CostSpikeAlert[] {
  const alerts: CostSpikeAlert[] = [];

  for (const member of members) {
    const sorted = member.dailyCosts.slice().sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 7; i < sorted.length; i++) {
      const today = sorted[i];
      const last7 = sorted.slice(i - 7, i);
      const movingAvg = last7.reduce((sum, d) => sum + d.cost, 0) / 7;

      const MINIMUM_COST_THRESHOLD = 5;   // USD — avoid noise on low-usage members
      if (today.cost < MINIMUM_COST_THRESHOLD) continue;
      if (movingAvg === 0) continue;

      const ratio = today.cost / movingAvg;

      if (ratio >= 3) {
        alerts.push({
          id: `${member.memberId}-${today.date}`,
          type: 'cost_spike',
          severity: 'critical',
          memberId: member.memberId,
          memberName: member.name,
          date: today.date,
          actualCost: today.cost,
          expectedCost: movingAvg,
          ratio,
          message: `Daily cost $${today.cost.toFixed(2)} is ${ratio.toFixed(1)}x the 7-day average`,
          createdAt: new Date().toISOString(),
          resolvedAt: null,
        });
      } else if (ratio >= 2) {
        alerts.push({
          // ... same structure, severity: 'warning'
        });
      }
    }
  }

  return alerts;
}
```

### 6.5 Session Analytics (Extended from Phase 2)

Phase 2 computed basic session distribution (count per bucket) at sync time. Phase 3 extends this to include top sessions and average duration:

```typescript
// src/routes/sync.ts — extended session tracking
interface SessionAccumulator {
  sessionId: string;
  requestCount: number;
  totalCost: number;
  firstTimestamp: string;
  lastTimestamp: string;
  models: Set<string>;
  project: string | null;
}

function buildSessionMetrics(
  accumulated: Map<string, SessionAccumulator>
): SessionMetrics {
  const sessions = Array.from(accumulated.values());

  const byDepth = { quick: 0, focused: 0, deep: 0, marathon: 0 };
  for (const s of sessions) {
    if (s.requestCount <= 3) byDepth.quick++;
    else if (s.requestCount <= 15) byDepth.focused++;
    else if (s.requestCount <= 40) byDepth.deep++;
    else byDepth.marathon++;
  }

  const topSessions = sessions
    .sort((a, b) => b.totalCost - a.totalCost)
    .slice(0, 5)
    .map(s => ({
      sessionId: s.sessionId,
      requestCount: s.requestCount,
      costUsd: s.totalCost,
      durationMinutes: Math.round(
        (new Date(s.lastTimestamp).getTime() - new Date(s.firstTimestamp).getTime()) / 60000
      ),
      model: Array.from(s.models)[0] ?? 'unknown',
      project: s.project,
    }));

  return {
    totalSessions: sessions.length,
    avgSessionCost: sessions.reduce((sum, s) => sum + s.totalCost, 0) / sessions.length,
    avgSessionDuration: /* ... */,
    avgRequestsPerSession: sessions.reduce((sum, s) => sum + s.requestCount, 0) / sessions.length,
    sessionsByDepth: byDepth,
    topSessions,
  };
}
```

### 6.6 Infrastructure Changes

#### serverless.yml Changes (Phase 3)

```yaml
provider:
  iam:
    role:
      statements:
        # Existing S3 read/write permissions (unchanged)
        # NEW: lifecycle rule management for S-6
        - Effect: Allow
          Action:
            - s3:PutBucketLifecycleConfiguration
            - s3:GetBucketLifecycleConfiguration
          Resource:
            - arn:aws:s3:::${self:custom.bucketName}
```

No new AWS resources are introduced. All Phase 3 work operates within the existing Lambda + S3 + API Gateway infrastructure.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Type | Notes |
|------------|------|-------|
| Phase 1 complete | Hard prerequisite | S-10 (RBAC) requires Phase 1 JWT auth middleware. A-15 (user management) requires Phase 1 S3 user store (S-9). |
| Phase 2 complete | Soft prerequisite | P-5/P-8 (session analytics) builds on Phase 2 session distribution. A-30 (project dashboard) extends Phase 2 cost metrics. |
| Decision #3 | Architecture impact | A-29 moved from Phase 5 to Phase 3. All Phase 3 dashboard work (A-30, A-31) must use date range picker from day 1. |
| Decision #4 checkpoint | Process | At Phase 3 kickoff, confirm whether multi-tenancy (A-3) is needed. If yes, all S3 key patterns in Phase 3 must include `orgId` prefix. |
| Session ID data quality | Data dependency | P-5/P-8 (session analytics) quality depends on `sessionId` population rate from agents. Run data quality check before implementation. |
| Project path normalization | Data dependency | A-30 requires consistent project identification across members. Use `gitRepo` URL (normalized) as canonical key; fall back to `projectPath` basename. |

### 7.2 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| RBAC breaks existing dashboard access | MEDIUM | HIGH | Deploy in permissive mode (log only) for 1 week before enforcement. Ensure all existing member/admin tokens include correct role claims. |
| Model tier recommendations are inaccurate | MEDIUM | MEDIUM | Frame as "suggestions" with estimated savings, not mandates. Allow users to dismiss. Base on outputTokens heuristic (< 2000). |
| Data retention deletes needed data | LOW | HIGH | Conservative defaults (raw: 24 months). Never auto-delete without explicit admin confirmation. S3 versioning provides recovery window. |
| Reports page scope creep | HIGH | MEDIUM | Start with simple weekly summary. Defer PDF generation server-side (use browser print). Defer email delivery to Phase 5 (A-9). |
| Project attribution inaccuracy | MEDIUM | MEDIUM | Projects identified by `projectPath` which may differ across machines. Use git remote URL as canonical identifier (already collected). |
| Session ID gaps in data | MEDIUM | LOW | Orphan entries (null sessionId) handled as single-request sessions. Document in UI tooltip. |
| RBAC token migration | LOW | MEDIUM | Existing tokens may lack role claim (issued before Phase 1). If RBAC starts blocking valid users, provide a token refresh mechanism. |
| Aggregator timeout with project cross-referencing | MEDIUM | MEDIUM | Bound concurrent S3 reads to 10 (existing pattern). Cache project registry in Lambda memory. Add timeout guard. |

**Decision #3 note**: Moving A-29 to Phase 3 eliminates the retro-fitting risk for Projects and Reports pages but adds ~1 week of scope to Phase 3. The Architect confirmed the filtering implementation (merge monthly aggregated files server-side) is straightforward without new infrastructure.

**Decision #4 note**: The multi-tenancy checkpoint must happen before any S3 key patterns are written for Phase 3. If multi-tenancy is confirmed, the S3 layout changes from `raw/{memberId}/` to `raw/{orgId}/{memberId}/` — affecting every Lambda read/write operation. This is a significant architectural change best addressed at Phase 3 start rather than retrofit later.

---

## 8. Implementation Plan

### Week 1 (Month 2, Days 1-5)

```
1. [S-10] RBAC middleware + requireRole() factory (4 hr)
   - Implement requireRole() in src/lib/auth.ts
   - Deploy in permissive mode (log violations, don't block)

2. [S-10] Update all routes with role requirements (4 hr, depends on #1)
   - Apply requireRole() to all route groups
   - Add email validation to sync and agent routes

3. [A-15] User management API endpoints (6 hr, depends on Phase 1 S-9)
   - GET/POST/PUT/DELETE /api/admin/users
   - ETag concurrency, audit logging, bcrypt password hashing

4. [A-15] Dashboard settings page with user CRUD (8 hr, depends on #3)
   - /settings?tab=users
   - UserTable, InviteUserForm, EditUserForm components
   - TanStack Query integration

   Critical path: #1 -> #2 (RBAC must deploy before enforcing routes)
   Parallelizable: #3 and #4 can develop in parallel (mock API first)
```

### Week 2 (Month 2, Days 6-10)

```
5. [A-29] Date range picker (3 hr)
   - DateRangePicker component with presets + calendar
   - Zustand useUIStore dateRange state
   - Propagate to all query hooks

6. [S-6] Retention policy config + S3 lifecycle rules (4 hr)
   - config/retention.json schema + default values
   - applyRetentionRules() in src/lib/retention.ts
   - GET/PUT /api/admin/retention endpoints
   - Settings > System tab: retention display

7. [P-4, P-15] Model tier advisor aggregation + dashboard widget (6 hr)
   - MODEL_TIERS configuration
   - Recommendation computation in aggregator
   - ModelTierAdvisor component in Reports page
   - Member detail Efficiency tab

8. [P-5, P-8] Session metrics extension: top sessions + duration (6 hr)
   - Extend sync-time session tracking (Phase 2 foundation)
   - Add topSessions, avgSessionDuration to SessionMetrics
   - SessionList component in member detail Sessions tab
   - Session distribution bar chart

   Parallelizable: #5, #6, #7, #8 can run in parallel
```

### Week 3 (Month 2, Days 11-15)

```
9. [P-17] Anomaly detection in aggregator + alerts view (5 hr)
   - detectCostAnomalies() with 7-day moving average
   - views/alerts.json generation
   - GET /api/dashboard extended with alerts
   - CostAlertBanner component (dismissible)

10. [A-30] Project-level aggregation + projects page (8 hr)
    - Project cross-referencing logic in aggregator
    - views/projects.json generation
    - /projects page with ViewToggle (Ranking/Cards/Chart)
    - ProjectDetailContent DataSheet

   Critical path: #10 is the longest item
```

### Week 4 (Month 2, Days 16-20)

```
11. [P-28, A-31] Report generation + reports page (8 hr)
    - views/reports/{year}-{month}.json generation in aggregator
    - GET /api/reports endpoint
    - /reports page rewrite: TypeSelector, Preview, ExportBar
    - ExecutiveSummary component

12. [S-10] Switch RBAC from permissive to enforcement mode (1 hr)
    - After 1-week observation: confirm no legitimate cross-role access
    - Enable enforcement flag

13. Integration testing + force re-aggregation (4 hr)
    - End-to-end tests for all new endpoints with RBAC
    - POST /api/admin/aggregate?force=true
    - Verify views/projects.json and views/reports/*.json generated

   Critical path: #11 is the longest item alongside #10
```

**Total estimate**: ~86 backend hours + ~72 frontend hours = ~158 hours + ~20 hours integration/testing = ~178 hours for 2-3 developers over 4 weeks.

---

## 9. Acceptance Criteria & Test Strategy

### 9.1 RBAC Access Matrix Tests (S-10)

| Endpoint | admin | member | agent | unauthenticated |
|----------|-------|--------|-------|-----------------|
| `POST /api/sync` | 200 | 403 | 200 (own email) | 401 |
| `GET /api/dashboard` | 200 | 200 | 403 | 401 |
| `GET /api/members` | 200 | 200 | 403 | 401 |
| `GET /api/projects` | 200 | 200 | 403 | 401 |
| `GET /api/reports` | 200 | 200 | 403 | 401 |
| `GET /api/admin/users` | 200 | 403 | 403 | 401 |
| `POST /api/admin/aggregate` | 200 | 403 | 403 | 401 |
| `GET /api/agent/commands` | 403 | 403 | 200 (own email) | 401 |

All 32 cells in this matrix must have automated test coverage.

### 9.2 Functional Acceptance Tests

| Feature | Test Scenario | Pass Condition |
|---------|--------------|----------------|
| User Management (A-15) | Create user via Settings UI | User appears in list, can log in with provided password |
| User Management (A-15) | Deactivate user | User token is invalidated; subsequent requests return 401 |
| User Management (A-15) | Edit user role | New role reflected in next login JWT |
| Retention Policy (S-6) | Apply default policy | S3 lifecycle rules reflect configured retention periods |
| Date Range Picker (A-29) | Select "Last month" | All dashboard views filter to previous month data |
| Projects Page (A-30) | View project list | Projects ranked by cost with correct attribution |
| Projects Page (A-30) | Click project | DataSheet shows member breakdown and monthly trend |
| Reports Page (A-31) | Generate weekly report | Preview shows correct data for selected week |
| Reports Page (A-31) | Download CSV | CSV file downloads with all member cost data |
| Model Advisor (P-4) | Recommendations shown | At least 1 recommendation for a member with Opus usage |
| Session Analytics (P-5) | Sessions tab | Top 5 sessions listed with cost and duration |
| Anomaly Detection (P-17) | Spike detected | Alert banner visible when member cost > 3x average |
| Anomaly Detection (P-17) | Alert dismissal | Dismissed alert hidden until page refresh |

### 9.3 Performance Acceptance Tests

| Metric | Target | Measurement |
|--------|--------|-------------|
| Projects page load (50 projects) | < 2 seconds | Browser DevTools |
| Reports page load (monthly report) | < 2 seconds | Browser DevTools |
| Aggregator runtime with 100 members + projects | < 120 seconds | Lambda duration CloudWatch |
| RBAC middleware overhead | < 2ms per request | Lambda duration delta vs Phase 2 baseline |

---

## 10. References

| Document | Location | Relevant Sections |
|----------|----------|-------------------|
| PRD Draft | `grooming-artifacts/planning-artifacts/prd-draft.md` | Phase 3 (§3) — all user stories, effort sizing, MoSCoW priorities |
| Business Analysis | `grooming-artifacts/planning-artifacts/analysis.md` | Phase 3 (§4) — stakeholder analysis, ROI $7,200-$14,400/yr estimate, risk assessment |
| Technical Architecture | `grooming-artifacts/planning-artifacts/architecture.md` | Phase 3 (§Phase 3) — all TypeScript interfaces, RBAC factory, retention lifecycle, anomaly detection algorithm, implementation order |
| UX Design | `grooming-artifacts/planning-artifacts/ux-design.md` | Phase 3 (§7) — all ASCII wireframes, component inventory, user flows |
| Decision Log | `grooming-artifacts/planning-artifacts/decision-log.md` | Decision #3 (A-29 moved to Phase 3), Decision #4 (multi-tenancy checkpoint at Phase 3 kickoff) |
| CLAUDE.md | `/CLAUDE.md` | S3 bucket layout, three-layer architecture, existing API endpoints |
| Phase 2 SRS | `docs/srs/02-analytics-quickwins.md` | Session distribution (Phase 2 foundation extended in Phase 3 P-5/P-8) |
