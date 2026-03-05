# CCUsage Monitor — Brainstorm: Improvements & Missing Features

> Auto-generated brainstorm from three expert perspectives: ISMS Security, Prompt Performance Analytics, and System Architecture. Each suggestion rated by priority/impact and implementation complexity.

---

## Table of Contents

1. [ISMS & Security](#1-isms--security)
2. [Prompt Performance & AI Productivity](#2-prompt-performance--ai-productivity)
3. [System Architecture & Platform](#3-system-architecture--platform)
4. [Prioritized Roadmap](#4-prioritized-roadmap)

---

## 1. ISMS & Security

### 1.1 Critical Security Gaps

| # | Issue | Complexity | Description |
|---|-------|-----------|-------------|
| S-1 | Sync endpoint unauthenticated | Simple | POST /api/sync is public. Anyone can inject fake usage data for any email. Require JWT auth, validate email matches token. |
| S-2 | Admin endpoints unauthenticated | Simple | /api/admin/* is public. Anyone can trigger aggregation, create commands, view system config. Require admin role JWT. |
| S-3 | Agent endpoints unauthenticated | Simple | /api/agent/* is public. Anyone can poll commands for any member by email. Require JWT, validate email match. |
| S-4 | No DLP scanning on prompts | Complex | Prompts contain actual code, possibly credentials, API keys, PII. No scanning or classification occurs before storage. Build pattern-matching DLP pipeline at sync time. |
| S-5 | Prompt data unclassified | Medium | Full prompt text stored as plain JSON. No data classification labels. Add classification framework and S3 object tags. |
| S-6 | No data retention policy | Medium | Only sync-logs has 90-day lifecycle. Raw data, prompts, projects persist indefinitely. Define and implement per-prefix retention. |
| S-7 | No admin audit trail | Medium | Admin operations produce no audit log. Create immutable audit log in S3 with Object Lock. |

### 1.2 Authentication & Authorization

| # | Issue | Priority | Complexity | Description |
|---|-------|----------|-----------|-------------|
| S-8 | SHA-256 password hashing (unsalted) | High | Simple | Two users share same hash. Migrate to bcrypt/Argon2 with per-user salt. |
| S-9 | Hardcoded users.json in source | High | Medium | Credentials committed to repo, bundled at build time. Move to S3/DynamoDB, add user management API. |
| S-10 | No RBAC enforcement | High | Medium | Three roles defined but never checked. JWT middleware only validates token, not role. Add role-based middleware. |
| S-11 | No API key management for agents | High | Medium | No machine-to-machine auth system. Implement per-agent API keys, rotatable and revocable. |
| S-12 | No token revocation list | Medium | Medium | JWTs are stateless. Stolen tokens valid until expiry (60min/20days). Add server-side blocklist. |
| S-13 | JWT secret fallback to dev value | Medium | Simple | serverless.yml defaults to 'dev-secret-key-do-not-use-in-production'. Use Secrets Manager. |
| S-14 | Password stored plaintext on agent | High | Simple | ~/.ccusage-agent/config.json stores password in cleartext. Use OS keychain or device token flow. |
| S-15 | No account lockout | Medium | Medium | Unlimited login attempts allowed. Progressive lockout after N failures. |
| S-16 | No login attempt logging | High | Simple | Failed and successful logins produce no audit entries. Log all auth events. |
| S-17 | Register endpoint public and unguarded | High | Simple | In-memory store accessible by anyone. Remove or require admin auth. |

### 1.3 Data Protection

| # | Issue | Priority | Complexity | Description |
|---|-------|----------|-----------|-------------|
| S-18 | No right to erasure / data deletion | High | Medium | No mechanism to delete a member's data. Build DELETE /api/admin/members/:id/data endpoint. |
| S-19 | No field-level encryption on prompts | Medium | Medium | Prompt content readable by any principal with s3:GetObject. Envelope encrypt content field with separate KMS key. |
| S-20 | No prompt content redaction | High | Medium | No way to redact secrets found in stored prompts. Build admin redaction endpoint. |
| S-21 | Sync logs mutable and short-lived | High | Medium | 90-day lifecycle, no Object Lock. Extend retention, add immutability. |
| S-22 | No non-repudiation for submissions | High | Complex | No proof data came from a specific agent. Implement payload signing with agent key pairs. |
| S-23 | PII in member registry and sync logs | Medium | Medium | Stores email, name, IPs, hostname. Document PII, implement anonymization after retention period. |

### 1.4 Network & Transport Security

| # | Issue | Priority | Complexity | Description |
|---|-------|----------|-----------|-------------|
| S-24 | No API rate limiting | High | Medium | No throttling on any endpoint. Add API Gateway throttling + per-email limits. |
| S-25 | No WAF protection | High | Medium | No AWS WAF. Add managed rule groups, geo-blocking, request size limits. |
| S-26 | No IP whitelisting | Medium | Simple | API accessible worldwide. Restrict admin endpoints to VPN/office IPs. |
| S-27 | No mTLS agent-server | Medium | Complex | Standard HTTPS only. Consider mutual TLS for strong machine identity. |

### 1.5 Operational Security

| # | Issue | Priority | Complexity | Description |
|---|-------|----------|-----------|-------------|
| S-28 | No JWT secret rotation | High | Medium | Set once, never rotated. Support dual-secret grace period + Secrets Manager rotation. |
| S-29 | No backup/recovery testing | High | Medium | S3 versioning on but no documented recovery procedure. Document and test quarterly. |
| S-30 | No dependency vulnerability scanning | Medium | Simple | No npm audit or Snyk in CI. Add to all three packages. |
| S-31 | No secret scanning in CI/CD | Medium | Simple | users.json with hashes committed. Add trufflehog/gitleaks pre-commit hooks. |
| S-32 | No agent update signature verification | Low | Medium | Agent downloads tgz and installs without verifying signature. Add code signing. |
| S-33 | Health endpoint leaks infrastructure details | Medium | Simple | Returns bucket name, environment. Remove from public response. |

---

## 2. Prompt Performance & AI Productivity

### 2.1 Prompt Effectiveness Metrics

| # | Feature | Value | Complexity | Data | Description |
|---|---------|-------|-----------|------|-------------|
| P-1 | Cost per prompt | Critical | Simple | Already collected | Avg cost per request, input/output token ratio per member/project/model. High ratio = large context, small output. |
| P-2 | Cache hit rate | Critical | Simple | Already collected | cacheReadTokens / (inputTokens + cacheCreationTokens). Low rate = poor prompt structure. |
| P-3 | Token waste detection | High | Medium | Already collected | Flag requests with inputTokens >100k but outputTokens <500. Compute context efficiency score. |
| P-4 | Model tier advisor | Critical | Medium | Already collected | Identify expensive model usage for simple tasks. Estimate savings from downgrading Opus to Sonnet/Haiku. |
| P-5 | Session efficiency | High | Medium | Already collected | Group by sessionId: total cost, duration, request count. Sessions are proxies for tasks. |
| P-6 | Prompt-to-output ratio trends | Medium | Simple | Already collected | Histogram of input/output ratio buckets over time. Shows if team is learning. |

### 2.2 Usage Pattern Analytics

| # | Feature | Value | Complexity | Data | Description |
|---|---------|-------|-----------|------|-------------|
| P-7 | Peak usage hours heatmap | High | Simple | Already collected | 24x7 activity heatmap from timestamps. Extends existing calendar heatmap to hourly. |
| P-8 | Session duration & depth | High | Medium | Already collected | Classify sessions: quick lookup (1-3 req), focused work (5-20), deep dive (20+), marathon (50+). |
| P-9 | Project-level AI dependency | High | Simple | Already collected | Total cost/requests/members per project. Which projects consume most AI? |
| P-10 | Model preference trends | Medium | Simple | Already collected | Month-over-month model distribution. Detect adoption shifts on new model releases. |
| P-11 | Inter-prompt idle time | Medium | Medium | Needs calculation | Time gaps between consecutive requests in sessions. Classify: rapid iteration vs deliberate work. |
| P-12 | Burst vs steady patterns | Medium | Medium | Already collected | Gini coefficient on hourly request counts. Batched AI use vs continuous integration. |

### 2.3 Cost Optimization

| # | Feature | Value | Complexity | Data | Description |
|---|---------|-------|-----------|------|-------------|
| P-13 | Cost forecasting | Critical | Medium | Already collected | Linear extrapolation from daily trends. Projected month-end cost on dashboard. |
| P-14 | Project cost allocation / chargeback | Critical | Medium | Already collected | Project-level cost reports with member breakdown. CSV export for finance. |
| P-15 | Model tier recommendations | Critical | Medium | Already collected | Per-member recommendations: "Switch 342 Opus requests to Haiku, save $47/month." |
| P-16 | Cache optimization suggestions | High | Complex | Needs prompt analysis | Correlate low cache rates with prompt patterns. Suggest standardization. |
| P-17 | Cost spike anomaly detection | High | Medium | Already collected | Alert when daily cost >3x 7-day moving average. Store in views/alerts.json. |
| P-18 | Budget alerts & limits | High | Medium | Needs config | Per-member/project monthly budgets. Alert at 80%/90%/100%. |

### 2.4 Team Productivity

| # | Feature | Value | Complexity | Data | Description |
|---|---------|-------|-----------|------|-------------|
| P-19 | AI adoption rate | High | Simple | Already collected | % of registered members active this month. Track adoption trends. |
| P-20 | Anonymized team benchmarks | High | Medium | Already collected | Percentile positions for key metrics. "Your cost/request is 75th percentile." |
| P-21 | Onboarding curves | Medium | Medium | Already collected | Track new members' efficiency over first 4-8 weeks toward team average. |
| P-22 | Best practices from top performers | High | Complex | Needs analysis | Identify top-efficiency members' patterns (models, session styles, prompt lengths). |
| P-23 | Knowledge sharing opportunities | Medium | Medium | Already collected | Detect members working on same project. Flag collaboration opportunities. |

### 2.5 Quality Indicators

| # | Feature | Value | Complexity | Data | Description |
|---|---------|-------|-----------|------|-------------|
| P-24 | Retry rate (repeated prompts) | High | Complex | Needs prompt similarity | Detect similar consecutive prompts in sessions. High retry = unclear prompting. |
| P-25 | Conversation length distribution | High | Simple | Already collected | Histogram of requests per session. Long sessions may indicate struggle. |
| P-26 | Error rate tracking | Medium | Medium | Needs agent reporting | Track sync failures, timeouts, retries. Agent reports error stats in payload. |
| P-27 | Model escalation detection | Medium | Complex | Already collected | Detect mid-session model upgrades (Haiku to Sonnet). Indicates first model insufficient. |

### 2.6 Reporting & Engagement

| # | Feature | Value | Complexity | Data | Description |
|---|---------|-------|-----------|------|-------------|
| P-28 | Executive summary reports | Critical | Medium | Already collected | Weekly/monthly PDF/HTML reports. Fills placeholder Reports page. |
| P-29 | Team health scorecard | High | Medium | Already collected | Composite score (0-100) from adoption, cache, cost, model selection, consistency. |
| P-30 | Individual developer insights | High | Medium | Already collected | Private view with personalized tips. "You used Opus for 78% — consider Sonnet." |
| P-31 | Project ROI estimation | High | Complex | Needs external config | Compare AI cost vs developer time saved. Configurable hourly rate + time-saved assumptions. |
| P-32 | Trend analysis & predictions | Medium | Medium | Already collected | Linear regression on monthly metrics. Flag undesirable trends. |
| P-33 | Efficiency leaderboards | Medium | Simple | Already collected | Multiple categories: Best Cache, Most Efficient, Most Active. Extend existing ranking. |
| P-34 | Achievement badges | Low | Medium | Already collected | Milestones: "Cache Master" (>80% rate), "Cost Conscious" (below median 3 months). |

---

## 3. System Architecture & Platform

### 3.1 Scalability

| # | Issue | Impact | Complexity | Description |
|---|-------|--------|-----------|-------------|
| A-1 | Member registry single-file bottleneck | Critical | Medium | members/index.json is a global mutex with ETag concurrency. At 50+ concurrent syncs, retry storms. Replace with per-member files + DynamoDB lookup. |
| A-2 | Unbounded monthly raw data files | High | Medium | A heavy user generates 15MB+ monthly files. Full read-modify-write on every sync. Partition by day or use append-only with separate dedup index. |
| A-3 | Multi-tenancy support | High | Complex | Flat namespace assumes single org. Add orgId prefix to all S3 keys for multi-org support. |
| A-4 | Split Lambda by responsibility | Medium | Simple | Single Lambda handles reads + writes. Separate sync-handler (write-heavy, more memory) from api-reader (read-only, cacheable). |

### 3.2 Real-time Capabilities

| # | Feature | Impact | Complexity | Description |
|---|---------|--------|-----------|-------------|
| A-5 | WebSocket for live dashboard | High | Complex | Dashboard data up to 65 minutes stale (60min aggregation + 5min cache). Add WebSocket/SSE for push updates. |
| A-6 | Real-time usage alerts | High | Medium | No alerting mechanism. Add rules engine + SNS/Slack delivery for cost spikes, anomalies. |
| A-7 | Streaming aggregation | Medium | Medium | Replace hourly batch with event-driven: trigger incremental view update after each sync. |
| A-8 | Live session monitoring | Medium | Complex | No concept of "active sessions." Add agent heartbeat + "Currently Active" indicators. |

### 3.3 Integration Ecosystem

| # | Feature | Impact | Complexity | Description |
|---|---------|--------|-----------|-------------|
| A-9 | Slack/Teams notifications | High | Simple | Daily digest, threshold alerts, sync summaries via webhooks. |
| A-10 | GitHub integration | High | Medium | Correlate AI usage with PR activity using git remote URLs already collected. Cost per PR. |
| A-11 | Webhook system | Medium | Medium | Event-based hooks: sync.completed, cost.threshold.exceeded. HMAC-signed payloads to registered URLs. |
| A-12 | SSO/SAML integration | Medium | Complex | Replace custom auth with Cognito for enterprise SSO (SAML, OIDC, Google Workspace, AD). |
| A-13 | CSV/Grafana/DataDog export | Medium | Simple | CSV download endpoint. Prometheus metrics for Grafana. DataDog Lambda extension. |
| A-14 | JIRA/Linear integration | Medium | Medium | Parse git branches for ticket IDs. Tag usage with tickets. Cost per sprint/story. |

### 3.4 Administration

| # | Feature | Impact | Complexity | Description |
|---|---------|--------|-----------|-------------|
| A-15 | User management UI | Critical | Medium | Currently hardcoded users.json requires Lambda redeploy. Build Settings page with CRUD + invite flow. |
| A-16 | Policy engine | High | Medium | Per-member/role: daily cost caps, model restrictions, allowed projects. Store in S3, enforce at sync. |
| A-17 | Fleet management dashboard | Medium | Medium | All agents: version, sync interval, last sync, hostname. Push config updates via command queue. |
| A-18 | Self-service onboarding | Medium | Medium | Admin generates invite link. Developer visits, downloads agent, runs setup --token. Auto-creates account. |
| A-19 | Data retention configuration | Medium | Simple | Admin-configurable retention per data type. Generate S3 lifecycle rules from config. |

### 3.5 Data Management & Compliance

| # | Feature | Impact | Complexity | Description |
|---|---------|--------|-----------|-------------|
| A-20 | GDPR right to erasure | High | Medium | DELETE endpoint to purge all member data. Remove from registry, re-aggregate views. |
| A-21 | Data export & portability | Medium | Simple | GET endpoint packaging all member data as downloadable ZIP. |
| A-22 | Data versioning UI | Medium | Simple | Browse S3 versions, restore previous version via admin API. Self-service recovery. |
| A-23 | Cross-region replication | Low | Simple | Enable S3 CRR for disaster recovery to another region. |

### 3.6 Observability

| # | Feature | Impact | Complexity | Description |
|---|---------|--------|-----------|-------------|
| A-24 | Agent fleet monitoring dashboard | High | Medium | All agents sorted by last sync. Version distribution. Stale agent alerts. |
| A-25 | Comprehensive health check | High | Medium | S3 connectivity, last aggregation, oldest un-synced member, Lambda memory. System Health page. |
| A-26 | Sync failure tracking | Medium | Medium | Persistent failure log per member. Auto-retry or admin alert on repeated failures. |
| A-27 | System cost tracking | Medium | Simple | AWS Cost Explorer tags. Show "monitoring costs X% of AI spend it tracks." |
| A-28 | Structured JSON logging | Medium | Simple | Replace console.log with pino. Consistent fields for CloudWatch Insights queries. |

### 3.7 Dashboard Enhancements

| # | Feature | Impact | Complexity | Description |
|---|---------|--------|-----------|-------------|
| A-29 | Configurable date ranges | High | Medium | Date range picker with presets (today, 7d, month, custom). Adjust all charts. |
| A-30 | Project-level dashboard page | High | Medium | All projects with cost, members, models, git repos. Fills existing data gap. |
| A-31 | Reports page implementation | Medium | Medium | Daily/weekly/monthly reports. PDF/CSV export. Fills placeholder page. |
| A-32 | Comparison view | Medium | Medium | Side-by-side comparison of two members, projects, or time periods. |
| A-33 | Prompt/response trace viewer | High | Medium | Capture assistant responses from JSONL. Full conversation thread viewer per session. |

### 3.8 Developer Experience

| # | Feature | Impact | Complexity | Description |
|---|---------|--------|-----------|-------------|
| A-34 | `ccusage-agent stats` command | Medium | Simple | Personal usage summary from terminal (today, week, month). |
| A-35 | `ccusage-agent doctor` command | Medium | Simple | Diagnostics: connectivity, permissions, service status, sync health. |
| A-36 | VS Code extension | Medium | Medium | Status bar showing "Today: $X.XX". Sidebar panel with usage charts. |
| A-37 | Improved dry-run mode | Medium | Simple | Show exactly what would be synced: entry count, data size, files changed. |

---

## 4. Prioritized Roadmap

### Phase 1: Security Hardening (Week 1-2)
**Must-do before any production ISMS audit.**

| # | Item | Source |
|---|------|--------|
| 1 | Authenticate sync, admin, agent endpoints | S-1, S-2, S-3 |
| 2 | Replace SHA-256 with bcrypt + salt | S-8 |
| 3 | Move users.json to S3 (stop committing credentials) | S-9 |
| 4 | Add API rate limiting | S-24 |
| 5 | Add admin audit logging | S-7 |
| 6 | Add login attempt logging | S-16 |
| 7 | Remove register endpoint or require auth | S-17 |
| 8 | Remove infrastructure details from health endpoint | S-33 |

### Phase 2: Quick Win Analytics (Week 3-4)
**High value, low effort — uses data already collected.**

| # | Item | Source |
|---|------|--------|
| 1 | Cache hit rate per member/project | P-2 |
| 2 | Cost per prompt metric | P-1 |
| 3 | Cost forecasting (projected month-end) | P-13 |
| 4 | AI adoption rate widget | P-19 |
| 5 | Session length distribution | P-25 |
| 6 | Peak usage hours heatmap | P-7 |
| 7 | Agent health indicators (from existing lastSyncAt) | A-24 |

### Phase 3: Core Platform (Month 2)
**Foundation for enterprise readiness.**

| # | Item | Source |
|---|------|--------|
| 1 | User management UI | A-15 |
| 2 | RBAC enforcement | S-10 |
| 3 | Data retention policies (lifecycle rules per prefix) | S-6 |
| 4 | Model tier recommendations | P-4, P-15 |
| 5 | Session-level analytics | P-5, P-8 |
| 6 | Project-level dashboard page | A-30 |
| 7 | Cost anomaly detection & alerts | P-17 |
| 8 | Reports page (weekly/monthly) | P-28, A-31 |

### Phase 4: ISMS Compliance (Month 2-3)
**Required for formal ISMS certification.**

| # | Item | Source |
|---|------|--------|
| 1 | DLP scanning on prompt content | S-4 |
| 2 | Prompt redaction capability | S-20 |
| 3 | Right to erasure endpoint | S-18, A-20 |
| 4 | Immutable sync logs (Object Lock) | S-21 |
| 5 | Non-repudiation (payload signing) | S-22 |
| 6 | WAF protection | S-25 |
| 7 | Token revocation list | S-12 |
| 8 | Secret rotation mechanism | S-28 |
| 9 | Compliance reporting dashboard | P-29 |

### Phase 5: Advanced Analytics & Integrations (Month 3-4)
**Differentiation and team productivity.**

| # | Item | Source |
|---|------|--------|
| 1 | Team benchmarks (anonymized percentiles) | P-20 |
| 2 | Budget alerts & limits | P-18 |
| 3 | Private developer insights | P-30 |
| 4 | Slack/Teams notifications | A-9 |
| 5 | GitHub integration (cost per PR) | A-10 |
| 6 | CSV/PDF export | A-13 |
| 7 | Configurable date ranges | A-29 |
| 8 | Onboarding curves | P-21 |

### Phase 6: Scale & Real-time (Month 4-6)
**Handle growth and improve responsiveness.**

| # | Item | Source |
|---|------|--------|
| 1 | Fix member registry bottleneck | A-1 |
| 2 | Partition raw data by day | A-2 |
| 3 | Event-driven aggregation (SQS/SNS) | A-7 |
| 4 | WebSocket for live dashboard | A-5 |
| 5 | SSO/SAML via Cognito | A-12 |
| 6 | Prompt/response trace viewer | A-33 |
| 7 | Multi-tenancy foundation | A-3 |

---

## Summary Statistics

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| ISMS & Security | 7 | 16 | 9 | 1 | 33 |
| Prompt Performance | 4 | 11 | 13 | 1 | 29 |
| System Architecture | 2 | 12 | 20 | 1 | 35 |
| **Total** | **13** | **39** | **42** | **3** | **97** |

> 97 actionable improvements identified. 13 critical items should be addressed before any ISMS audit or production deployment.
