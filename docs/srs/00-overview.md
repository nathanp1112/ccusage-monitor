# CCUsage Monitor — SRS/BRD Overview

**Document Version**: 1.0
**Date**: 2026-02-28
**Status**: Final (synthesized from 4 planning artifacts)
**Authors**: John (PM), Mary (BA), Winston (Architect), Sally (UX Designer)

---

## 1. Document Index

| # | File | Phase | Focus | Timeline | Items | Priority |
|---|------|-------|-------|----------|-------|----------|
| 00 | `00-overview.md` | — | Roadmap overview, decisions, traceability | — | — | — |
| 01 | `01-security-hardening.md` | Phase 1 | JWT auth, bcrypt, user store, audit logging, rate limiting | Week 1-2 | 11 items (S-1, S-2, S-3, S-7, S-8, S-9, S-13, S-16, S-17, S-24, S-33) | CRITICAL |
| 02 | `02-quick-win-analytics.md` | Phase 2 | Cost/prompt, cache hit rate, heatmap, forecasting, adoption, fleet monitoring | Week 3-4 | 7 items (P-1, P-2, P-7, P-13, P-19, P-25, A-24) | HIGH |
| 03 | `03-core-platform.md` | Phase 3 | RBAC, data retention, user management UI, project dashboard, reports, model advisor, session analytics | Month 2 | 12 items (S-6, S-10, A-15, A-29, A-30, A-31, P-4, P-5, P-8, P-15, P-17, P-28) | HIGH |
| 04 | `04-isms-compliance.md` | Phase 4 | DLP, token revocation, right to erasure, redaction, immutable logs, non-repudiation, WAF, secret rotation | Month 2-3 | 10 items (S-4, S-12, S-18, S-20, S-21, S-22, S-25, S-28, A-20, P-29) | CRITICAL |
| 05 | `05-advanced-analytics.md` | Phase 5 | Budget alerts, benchmarks, onboarding curves, developer insights, Slack, GitHub, CSV export | Month 3-4 | 8 items (P-18, P-20, P-21, P-30, A-9, A-10, A-13, A-29) | MEDIUM |
| 06 | `06-scale-realtime.md` | Phase 6 | Registry bottleneck, data partitioning, multi-tenancy, WebSocket, streaming aggregation, SSO, trace viewer | Month 4-6 | 7 items (A-1, A-2, A-3, A-5, A-7, A-12, A-33) | MEDIUM |

> Note: A-29 (date range picker) was moved from Phase 5 to Phase 3 per Decision 3.

---

## 2. Executive Summary

### Why This Roadmap Exists

CCUsage Monitor is an internal tool that tracks how development teams use Claude Code (an AI coding assistant). It currently consists of three components: a local CLI agent (`be-agent`) that collects usage data from developer machines, a serverless backend (Lambda + S3) that stores and aggregates data, and a dashboard (Next.js SPA) that visualizes team usage patterns.

The system is functional today but has critical gaps in security, analytics depth, compliance readiness, and scalability:

- **Security**: All sync, admin, and agent endpoints are publicly accessible with zero authentication. Passwords use unsalted SHA-256. Credentials are committed to the source repository.
- **Analytics**: The dashboard shows basic cost totals and token counts but cannot answer questions like "What will our spend be at month-end?" or "Are developers using the cache effectively?"
- **Compliance**: The system cannot pass an ISMS (ISO 27001) audit. There is no audit trail, no data retention policy, no right-to-erasure mechanism, and no DLP scanning.
- **Scalability**: The single-file member registry and monthly raw data files will become bottlenecks at approximately 50 concurrent users.

Without addressing these gaps, the system cannot pass a security audit, cannot be trusted as a data source, and creates liability for the organization.

### Scope

A structured grooming session involving Product Manager, Business Analyst, Architect, and UX Designer identified **97 improvement items** across three domains:
- Security (S-1 through S-33): 33 items
- Performance analytics (P-1 through P-34): 34 items
- Architecture (A-1 through A-37): 30 items (note: not all numbers used)

Of these 97 items:
- **53 items** were selected for implementation across 6 phases
- **44 items** were deferred to the backlog (see Section 7)

---

## 3. Roadmap Timeline

From PRD Appendix B:

```
Week:   1    2    3    4    5    6    7    8    9   10   11   12   13-16  17-24
       |----Phase 1----|----Phase 2----|
                                       |---------Phase 3---------|
                                                  |----------Phase 4---------|
                                                                 |--Phase 5--|
                                                                        |-----Phase 6-----|
```

**Notes on overlap**:
- Phase 3 (Core Platform) and Phase 4 (ISMS Compliance) overlap because they address different concerns (platform capabilities vs compliance controls) and can be parallelized with sufficient team capacity.
- Phase 5 (Advanced Analytics) and Phase 6 (Scale & Real-time) similarly overlap.
- Phase 1 is a strict prerequisite: no other phase should begin until the authenticated endpoint infrastructure is deployed.

### Capacity Planning Summary (from BA)

| Phase | Estimated Dev-Hours | Recommended Team | Duration |
|-------|---------------------|------------------|----------|
| Phase 1 | 80-120 | 2 backend developers | 2 weeks |
| Phase 2 | 60-80 | 1 backend + 1 frontend | 2 weeks |
| Phase 3 | 200-280 | 2 backend + 2 frontend | 4 weeks |
| Phase 4 | 240-320 | 2 backend + 1 security | 4-6 weeks |
| Phase 5 | 200-260 | 1 backend + 2 frontend | 4-6 weeks |
| Phase 6 | 320-420 | 3 backend + 1 frontend | 8-12 weeks |
| **Total** | **1,100-1,480** | | **24-40 weeks** |

---

## 4. Phase Dependency Graph

From BA cross-phase dependency map:

```
Phase 1 (Security)
  ├── S-1, S-2, S-3 (endpoint auth) ──────────────────────────────────┐
  ├── S-8, S-9 (user store) ──────────────────────────────────────────┤
  ├── S-7, S-16 (audit logging) ──────────────────────────────────────┤
  └── S-24, S-33, S-17 (hardening) ───────────────────────────────────┤
                                                                       │
Phase 2 (Analytics) ◄─────────────────────────────────────────────────┘
  ├── P-1, P-2 (cost, cache metrics) ─────────────────────────────────┐
  ├── P-7, P-25 (usage patterns) ─────────────────────────────────────┤
  ├── P-13, P-19 (forecasting, adoption) ─────────────────────────────┤
  └── A-24 (fleet monitoring) ────────────────────────────────────────┤
                                                                       │
Phase 3 (Platform) ◄──────────────────────────────────────────────────┘
  ├── A-15 (user management) ─────────► Phase 4: A-20 (erasure UI)
  ├── S-10 (RBAC) ───────────────────► Phase 5: P-30 (insights privacy)
  ├── S-6 (retention) ──────────────► Phase 4: S-21 (immutable logs)
  ├── P-4, P-15 (model recommendations)
  ├── P-5, P-8 (session analytics)
  ├── A-29 (date range picker, moved from Phase 5)
  ├── A-30, A-31 (project, reports)
  ├── P-17 (anomaly detection) ──────► Phase 5: P-18 (budget alerts)
  └── P-28 (executive reports)

Phase 4 (Compliance) ◄── Depends on Phase 1 (auth) + Phase 3 (RBAC, retention)
  ├── S-4 (DLP) ──────────────────── Independent within phase
  ├── S-12 (token revocation) ─────── Requires Phase 1 JWT infra
  ├── S-18, A-20 (erasure) ────────── Requires Phase 3 user mgmt
  ├── S-20 (redaction) ───────────── Requires Phase 1 admin auth
  ├── S-21 (immutable logs) ───────── Requires Phase 3 retention
  ├── S-22 (non-repudiation) ─────── Independent
  ├── S-25 (WAF) ─────────────────── Independent
  ├── S-28 (secret rotation) ─────── Requires Phase 1 JWT infra
  └── P-29 (health scorecard) ────── Requires Phase 2 metrics

Phase 5 (Advanced Analytics) ◄── Depends on Phase 2 (metrics) + Phase 3 (platform)
  ├── P-18 (budgets) ────────────── Requires Phase 3 P-17
  ├── P-20 (benchmarks) ─────────── Requires Phase 2 P-1, P-2
  ├── P-21 (onboarding) ─────────── Requires 4-8 weeks of data
  ├── P-30 (insights) ──────────── Requires Phase 3 S-10
  ├── A-9 (Slack) ───────────────── Independent
  ├── A-10 (GitHub) ─────────────── Independent
  └── A-13 (export) ─────────────── Independent

Phase 6 (Scale) ◄── Depends on all previous phases being stable
  ├── A-1 (registry fix) ────────── CAN BE PROMOTED if scaling issues emerge
  ├── A-2 (data partitioning) ────── CAN BE PROMOTED if scaling issues emerge
  ├── A-3 (multi-tenancy) ────────── DEFER unless multi-org requirement confirmed
  ├── A-5 (WebSocket) ───────────── Requires A-7 (event-driven)
  ├── A-7 (event-driven) ────────── Independent
  ├── A-12 (SSO) ────────────────── Independent (can be promoted)
  └── A-33 (trace viewer) ────────── Requires agent changes
```

### Critical Path for ISMS Certification

```
Phase 1 (S-8/S-9 user store)
  --> Phase 1 (S-1/S-2/S-3 auth endpoints)
    --> Phase 3 (S-10 RBAC + A-15 user management)
      --> Phase 4 (S-18/A-20 erasure + S-21 immutable logs)
        --> ISMS Audit Readiness
```

Any delay on this critical path directly delays the ISMS certification timeline.

---

## 5. Key Decisions

The following 6 decisions were made during the grooming session (2026-02-28) involving PM (John), BA (Mary), Architect (Winston), and UX Designer (Sally):

### Decision 1: S-13 (JWT Secret) Included in Phase 1

| Aspect | Details |
|--------|---------|
| **Options** | Include in Phase 1 (BA recommendation) vs. Defer to backlog (PM recommendation) |
| **Decision** | Include S-13 in Phase 1 (simple fix via Secrets Manager). Defer S-14 (requires OS keychain per-platform). |
| **Rationale** | S-13 is a 1-hour change that eliminates a hardcoded dev secret. S-14 requires OS-specific keychain integration (macOS Keychain, Linux Secret Service) — complex and can wait. The agent's refresh token (90-day per Architect) reduces password exposure. |
| **Impact** | Phase 1 gains 1 additional item (S-13), bringing the total to 11 items. S-14 stays in backlog. |

### Decision 2: Non-Repudiation (S-22) Moved to Phase 4 Should

| Aspect | Details |
|--------|---------|
| **Options** | Keep in Phase 4 Must (BA) vs. Move to Phase 6/Should (PM) |
| **Decision** | Move S-22 to Phase 4 **Should** (not Must). Include if time permits, otherwise defer to Phase 6. |
| **Rationale** | JWT auth (Phase 1) + immutable audit logs (S-21, Phase 4) provide adequate provenance for ISO 27001. Ed25519 payload signing (Architect's design) is defense-in-depth. The Architect's design is solid but XL effort and not a hard ISMS requirement. |
| **Impact** | Phase 4 scope reduced slightly. S-22 implemented if capacity allows, otherwise moves to Phase 6. |

### Decision 3: Date Range Picker (A-29) Moved to Phase 3

| Aspect | Details |
|--------|---------|
| **Options** | Phase 5 (original roadmap + UX) vs. Phase 3 (PM recommendation) |
| **Decision** | Move A-29 to Phase 3. |
| **Rationale** | Date range filtering is a foundational UX primitive. Building Projects page (A-30) and Reports page (A-31) in Phase 3 without date ranges means retrofitting later. The Architect's design shows on-the-fly filtering from pre-aggregated monthly files is feasible without new infrastructure. UX designer's NavBar DateRangePicker design is clean and reusable. |
| **Impact** | Phase 3 gains A-29. Phase 5 loses A-29 but gains capacity for other items. All Phase 3 dashboard work (Projects, Reports) inherits date range support from the start. |

### Decision 4: Multi-Tenancy (A-3) Kept in Phase 6 with Gate

| Aspect | Details |
|--------|---------|
| **Options** | Keep in Phase 6 vs. Move to Phase 3 vs. Remove entirely |
| **Decision** | Keep in Phase 6 but add an architectural decision gate at Phase 3 start. |
| **Rationale** | PM correctly notes that retrofitting org prefixes is harder than designing in. However, BA found no confirmed multi-org requirement. Architect's design (orgId prefix on all S3 keys + DynamoDB) is clean but touches every component. At Phase 3 kickoff, confirm with stakeholders whether multi-org is needed. |
| **Impact** | No immediate change. Phase 3 includes a decision checkpoint. |

### Decision 5: DynamoDB Introduction in Phase 6 Only

| Aspect | Details |
|--------|---------|
| **Options** | Phase 6 only (Architect: member lookup) vs. Earlier introduction |
| **Decision** | Phase 6 only. Do not introduce DynamoDB before it is needed. |
| **Rationale** | Architect proposes DynamoDB for member lookup to fix the registry bottleneck (A-1). The current ETag-based S3 approach works fine for <50 concurrent syncs. Adding DynamoDB earlier increases operational complexity without immediate benefit. "Boring technology" principle applies. |
| **Impact** | No DynamoDB cost until Phase 6. S3 ETag approach continues through Phases 1-5. |

### Decision 6: Streaming Aggregation (A-7) Kept in Phase 6

| Aspect | Details |
|--------|---------|
| **Options** | Keep in Phase 6 (original) vs. Pull into late Phase 3 (PM suggestion) |
| **Decision** | Keep in Phase 6. |
| **Rationale** | While PM correctly notes this improves dashboard freshness, the Architect's design requires SQS + separate aggregation Lambda — new infrastructure. Phase 3 is already the largest phase (11 items + A-29). Adding SQS would increase Phase 3 risk. The current hourly aggregation is acceptable for Phases 1-5 scope. |
| **Impact** | No change. Dashboard data remains up to 65 minutes stale through Phase 5. |

### Conflicts Resolved

| Conflict | Resolution |
|----------|-----------|
| **Effort Estimates Divergence**: BA estimates 1,100-1,480 dev-hours total. PM provides T-shirt sizing per story. Architect provides hour estimates per task. | Use Architect's per-task estimates for implementation planning (most granular). Use BA's total for budgeting and capacity planning. No conflict — different granularity levels complement each other. |
| **Audit Log Storage Pattern**: Architect proposes separate S3 audit bucket with Object Lock. BA and PM assume same bucket. | Adopt Architect's separate bucket design for Phase 4 (immutable logs). Phase 1 audit logging starts in the main bucket (simple append), then migrates to Object Lock bucket in Phase 4. |
| **Agent Token Type**: PM specifies JWT refresh token for agents. Architect proposes 90-day agent-specific tokens. | Adopt Architect's 90-day agent token design. Agents authenticate once during setup, receive a long-lived token, and refresh it periodically. Simpler than the dashboard's 60min/20day token pair and appropriate for machine-to-machine auth. |

---

## 6. Cross-Cutting Concerns

### 6.1 Backward Compatibility with Existing Agents

Agents currently deployed in the field (v0.3.x, v0.4.x) must continue working during and after each phase. Breaking the sync protocol is not acceptable without a full fleet update cycle.

**Phase 1 migration strategy**:
- Deploy auth-required endpoints with a 2-week grace period
- During the grace period, the server optionally accepts unauthenticated sync requests with a deprecation warning header (`X-CCUsage-Deprecation: auth-required-after-YYYY-MM-DD`)
- Use the existing `force-sync` + `update` command flow to migrate the fleet
- After the grace period, remove the unauthenticated fallback

**Agent version compatibility matrix**:

| Server Phase | Agent v0.3.x/v0.4.x | Agent v0.5.x (auth support) |
|--------------|---------------------|------------------------------|
| Phase 0 (current) | Works | Works |
| Phase 1 (during grace period) | Works (with deprecation warning) | Works |
| Phase 1 (after grace period) | 401 on sync | Works |
| Phase 2+ | 401 on sync | Works |

### 6.2 Migration Strategy Per Phase

| Phase | Migration Required | Strategy |
|-------|-------------------|----------|
| 1 | Agent re-authentication, user store migration | `scripts/migrate-users.sh` to seed S3; agent auto-update via existing mechanism |
| 2 | None | Aggregator changes are additive; new fields in views are opt-in |
| 3 | None (or optional RBAC soft rollout) | Deploy RBAC in permissive mode first (log violations but don't block) |
| 4 | S3 bucket Object Lock (requires new bucket) | Create new audit bucket; migrate sync logs; plan data migration window |
| 5 | None | Date range picker is backward compatible (default = current month) |
| 6 | S3 key pattern changes (A-2), member registry (A-1) | Dual-read support: new data in new format, aggregator reads both |

### 6.3 AWS Cost Impact Summary (from Architect)

| Phase | Monthly Cost Increase | Services Added |
|-------|----------------------|----------------|
| Phase 1 | ~$0 | No new services (existing API Gateway, Lambda, S3) |
| Phase 2 | ~$0 | No new services |
| Phase 3 | ~$1-2 | Additional S3 lifecycle rules (free), slightly larger Lambda execution time |
| Phase 4 | ~$10-15 | WAF ($5+), Secrets Manager ($0.40), Object Lock (storage pricing) |
| Phase 5 | ~$2-5 | Slack webhook (free), GitHub API (free), minimal additional compute |
| Phase 6 | ~$15-30 | DynamoDB ($1-10), Cognito (free first 50k), SQS ($0.01), WebSocket API ($1+) |
| **Total** | **~$28-52/month** | |

Note: The PRD Architect states "~$20/month total" as a rough estimate; the detailed breakdown above gives a range of $28-52/month.

### 6.4 Effort Estimate

**1,100-1,480 dev-hours** across all 6 phases (BA total; Architect's per-task estimates are the authoritative implementation-level details in each phase SRS file).

---

## 7. Deferred Items (Backlog)

The following 44 items from the original 97 brainstormed improvements are **not** included in the 6-phase roadmap. They are documented here with rationale for deferral.

Items marked with * are recommended for bundling with Phase 1 per BA recommendation (see Section 9.1 of analysis.md), but per Decision 1 only S-13 was promoted; S-14 and S-15 remain deferred.

### Security (S-series) — 13 deferred

| ID | Item | Reason for Deferral |
|----|------|---------------------|
| S-5 | Prompt data classification | Partially addressed by S-4 (DLP). Full classification framework deferred. |
| S-11 | API key management for agents | Covered by JWT auth (S-1, S-3). Dedicated API keys deferred. |
| S-13* | JWT secret fallback fix | **Promoted to Phase 1** per Decision 1 — included, not actually deferred. |
| S-14* | Password stored plaintext on agent | Requires OS keychain integration (complex, OS-specific). Deferred. Agent's 90-day token reduces exposure. |
| S-15* | Account lockout | Partially addressed by S-24 (rate limiting) and S-16 (logging). Full lockout deferred to Phase 3 or Phase 4. |
| S-19 | Field-level encryption on prompts | High complexity, marginal gain over bucket-level encryption (SSE-KMS already enabled). Deferred. |
| S-23 | PII in member registry | Addressed by S-6 (retention) and S-18 (erasure). Anonymization deferred. |
| S-26 | IP whitelisting | WAF (S-25) provides geo-restriction. Explicit IP allowlists deferred. |
| S-27 | mTLS agent-server | Non-repudiation (S-22) partially addresses. Full mTLS deferred. |
| S-29 | Backup/recovery testing | Operational procedure, not a feature. Document and test quarterly. |
| S-30 | Dependency vulnerability scanning | CI/CD improvement, not product feature. Add `npm audit` to CI. |
| S-31 | Secret scanning in CI/CD | CI/CD improvement. Add gitleaks pre-commit hook. |
| S-32 | Agent update signature verification | Low priority per brainstorm. Deferred. |

### Performance Analytics (P-series) — 17 deferred

| ID | Item | Reason for Deferral |
|----|------|---------------------|
| P-3 | Token waste detection | Addressed partially by P-1 (cost per prompt) and P-4 (model tier advisor). |
| P-6 | Prompt-to-output ratio trends | Addressed partially by P-1. Standalone trend deferred. |
| P-9 | Project-level AI dependency | Addressed by A-30 (project dashboard). |
| P-10 | Model preference trends | Low priority. Month-over-month comparison exists in current dashboard. |
| P-11 | Inter-prompt idle time | Medium complexity, lower value. Deferred. |
| P-12 | Burst vs steady patterns | Niche metric. Deferred. |
| P-14 | Project cost allocation / chargeback | Addressed partially by A-30 + A-13 (CSV export). Full chargeback deferred. |
| P-16 | Cache optimization suggestions | Requires prompt content analysis. Complex. Deferred to after DLP (S-4). |
| P-22 | Best practices from top performers | Requires prompt content analysis. Complex. Deferred. |
| P-23 | Knowledge sharing opportunities | Low priority. Deferred. |
| P-24 | Retry rate (repeated prompts) | Requires prompt similarity analysis. Complex. Deferred. |
| P-26 | Error rate tracking | Agent reporting enhancement. Deferred. |
| P-27 | Model escalation detection | Complex, niche metric. Deferred. |
| P-31 | Project ROI estimation | Requires external configuration. Partially addressed by A-10 (GitHub integration). |
| P-32 | Trend analysis & predictions | Partially addressed by P-13 (cost forecasting). Advanced regression deferred. |
| P-33 | Efficiency leaderboards | Partially exists (member ranking). Enhancement deferred. |
| P-34 | Achievement badges | Low priority. Gamification deferred. |

### Architecture (A-series) — 14 deferred (of in-roadmap candidates)

| ID | Item | Reason for Deferral |
|----|------|---------------------|
| A-4 | Split Lambda by responsibility | Optimization. Defer until performance issues manifest. |
| A-6 | Real-time usage alerts | Partially addressed by A-9 (Slack notifications) + P-17 (anomaly detection). |
| A-8 | Live session monitoring | Requires agent heartbeat. Complex. Deferred. |
| A-11 | Webhook system | Partially addressed by A-9 (Slack). Generic webhooks deferred. |
| A-14 | JIRA/Linear integration | Low priority relative to GitHub. Deferred. |
| A-16 | Policy engine | Partially addressed by P-18 (budgets). Full policy engine deferred. |
| A-17 | Fleet management dashboard | Partially addressed by A-24 (agent fleet monitoring). Full fleet management deferred. |
| A-18 | Self-service onboarding | Partially addressed by A-15 (user management). Self-service deferred. |
| A-19 | Data retention configuration UI | Addressed by S-6 (data retention policy). Admin UI deferred. |
| A-21 | Data export & portability | Partially addressed by A-13 (CSV export). Full ZIP export deferred. |
| A-22 | Data versioning UI | Low priority. S3 versioning exists. UI deferred. |
| A-23 | Cross-region replication | Low priority. Deferred. |
| A-25 | Comprehensive health check | Partially addressed by S-33 (health endpoint) and A-24 (fleet monitoring). |
| A-26 | Sync failure tracking | Partially addressed by A-24 (fleet monitoring) and A-9 (Slack alerts). |
| A-27 | System cost tracking | Operational metric. Use AWS Cost Explorer tags. Deferred. |
| A-28 | Structured JSON logging | CI/CD improvement. Add pino. Low effort but not a product feature. |
| A-32 | Comparison view | Nice-to-have. Deferred. |
| A-34 | ccusage-agent stats command | Developer convenience. Deferred. |
| A-35 | ccusage-agent doctor command | Developer convenience. Deferred. |
| A-36 | VS Code extension | Separate product scope. Deferred. |
| A-37 | Improved dry-run mode | Developer convenience. Deferred. |

---

## 8. Traceability

Full matrix of all 53 selected items (out of 97 brainstormed) mapped to phase assignments.

### Phase-to-Item Mapping

| Phase | Security (S-) | Performance (P-) | Architecture (A-) | Total |
|-------|--------------|------------------|-------------------|-------|
| 1 | S-1, S-2, S-3, S-7, S-8, S-9, S-13, S-16, S-17, S-24, S-33 | — | — | 11 |
| 2 | — | P-1, P-2, P-7, P-13, P-19, P-25 | A-24 | 7 |
| 3 | S-6, S-10 | P-4, P-5, P-8, P-15, P-17, P-28 | A-15, A-29, A-30, A-31 | 12 |
| 4 | S-4, S-12, S-18, S-20, S-21, S-22, S-25, S-28 | P-29 | A-20 | 10 |
| 5 | — | P-18, P-20, P-21, P-30 | A-9, A-10, A-13 | 7 |
| 6 | — | — | A-1, A-2, A-3, A-5, A-7, A-12, A-33 | 7 |
| **Total** | **21** | **17** | **16** | **54** |

> Note: A-29 was moved from Phase 5 to Phase 3 per Decision 3 above.

### Complete Item Traceability Matrix

| Brainstorm ID | Phase | PRD Story | Status |
|---------------|-------|-----------|--------|
| S-1 | 1 | US-1.1 | Included |
| S-2 | 1 | US-1.2 | Included |
| S-3 | 1 | US-1.3 | Included |
| S-4 | 4 | US-4.1 | Included |
| S-5 | — | — | Deferred: partially addressed by S-4 |
| S-6 | 3 | US-3.1 | Included |
| S-7 | 1 | US-1.4 | Included |
| S-8 | 1 | US-1.5 | Included |
| S-9 | 1 | US-1.6 | Included |
| S-10 | 3 | US-3.2 | Included |
| S-11 | — | — | Deferred: covered by JWT auth |
| S-12 | 4 | US-4.2 | Included |
| S-13 | 1 | — (bundled) | Included (Decision 1) |
| S-14 | — | — | Deferred: OS keychain complexity |
| S-15 | — | — | Deferred: partially addressed by S-24, S-16 |
| S-16 | 1 | US-1.7 | Included |
| S-17 | 1 | US-1.8 | Included |
| S-18 | 4 | US-4.3 | Included |
| S-19 | — | — | Deferred: field-level encryption |
| S-20 | 4 | US-4.4 | Included |
| S-21 | 4 | US-4.5 | Included |
| S-22 | 4 | US-4.6 | Included (Should) |
| S-23 | — | — | Deferred: anonymization |
| S-24 | 1 | US-1.9 | Included |
| S-25 | 4 | US-4.7 | Included |
| S-26 | — | — | Deferred: WAF provides geo-restriction |
| S-27 | — | — | Deferred: mTLS |
| S-28 | 4 | US-4.8 | Included |
| S-29 | — | — | Deferred: operational procedure |
| S-30 | — | — | Deferred: CI/CD improvement |
| S-31 | — | — | Deferred: CI/CD improvement |
| S-32 | — | — | Deferred: low priority |
| S-33 | 1 | US-1.10 | Included |
| P-1 | 2 | US-2.1 | Included |
| P-2 | 2 | US-2.2 | Included |
| P-3 | — | — | Deferred: partially addressed by P-1, P-4 |
| P-4 | 3 | US-3.6 | Included |
| P-5 | 3 | US-3.7 | Included |
| P-6 | — | — | Deferred: partially addressed by P-1 |
| P-7 | 2 | US-2.3 | Included |
| P-8 | 3 | US-3.7 | Included (combined with P-5) |
| P-9 | — | — | Deferred: addressed by A-30 |
| P-10 | — | — | Deferred: low priority |
| P-11 | — | — | Deferred: medium complexity, lower value |
| P-12 | — | — | Deferred: niche metric |
| P-13 | 2 | US-2.4 | Included |
| P-14 | — | — | Deferred: partially addressed by A-30 + A-13 |
| P-15 | 3 | US-3.6 | Included (combined with P-4) |
| P-16 | — | — | Deferred: requires DLP first |
| P-17 | 3 | US-3.8 | Included |
| P-18 | 5 | US-5.1 | Included |
| P-19 | 2 | US-2.5 | Included |
| P-20 | 5 | US-5.2 | Included |
| P-21 | 5 | US-5.3 | Included |
| P-22 | — | — | Deferred: requires prompt content analysis |
| P-23 | — | — | Deferred: low priority |
| P-24 | — | — | Deferred: requires similarity analysis |
| P-25 | 2 | US-2.6 | Included |
| P-26 | — | — | Deferred: agent enhancement |
| P-27 | — | — | Deferred: complex, niche |
| P-28 | 3 | US-3.5 | Included (combined with A-31) |
| P-29 | 4 | US-4.10 | Included |
| P-30 | 5 | US-5.4 | Included |
| P-31 | — | — | Deferred: partially addressed by A-10 |
| P-32 | — | — | Deferred: partially addressed by P-13 |
| P-33 | — | — | Deferred: enhancement to existing ranking |
| P-34 | — | — | Deferred: gamification |
| A-1 | 6 | US-6.1 | Included |
| A-2 | 6 | US-6.2 | Included |
| A-3 | 6 | US-6.3 | Included |
| A-4 | — | — | Deferred: optimization |
| A-5 | 6 | US-6.4 | Included |
| A-6 | — | — | Deferred: partially addressed by A-9, P-17 |
| A-7 | 6 | US-6.5 | Included |
| A-8 | — | — | Deferred: agent heartbeat required |
| A-9 | 5 | US-5.5 | Included |
| A-10 | 5 | US-5.6 | Included |
| A-11 | — | — | Deferred: partially addressed by A-9 |
| A-12 | 6 | US-6.6 | Included |
| A-13 | 5 | US-5.7 | Included |
| A-14 | — | — | Deferred: low priority vs GitHub |
| A-15 | 3 | US-3.3 | Included |
| A-16 | — | — | Deferred: partially addressed by P-18 |
| A-17 | — | — | Deferred: partially addressed by A-24 |
| A-18 | — | — | Deferred: partially addressed by A-15 |
| A-19 | — | — | Deferred: addressed by S-6 |
| A-20 | 4 | US-4.3, US-4.9 | Included (backend + UI) |
| A-21 | — | — | Deferred: partially addressed by A-13 |
| A-22 | — | — | Deferred: low priority |
| A-23 | — | — | Deferred: low priority |
| A-24 | 2 | US-2.7 | Included |
| A-25 | — | — | Deferred: partially addressed by S-33, A-24 |
| A-26 | — | — | Deferred: partially addressed by A-24, A-9 |
| A-27 | — | — | Deferred: use AWS Cost Explorer |
| A-28 | — | — | Deferred: CI/CD improvement |
| A-29 | 3 | US-5.8 | Included (moved from Phase 5 to Phase 3, Decision 3) |
| A-30 | 3 | US-3.4 | Included |
| A-31 | 3 | US-3.5 | Included (combined with P-28) |
| A-32 | — | — | Deferred: nice-to-have |
| A-33 | 6 | US-6.7 | Included |
| A-34 | — | — | Deferred: developer convenience |
| A-35 | — | — | Deferred: developer convenience |
| A-36 | — | — | Deferred: separate product scope |
| A-37 | — | — | Deferred: developer convenience |

### ISO 27001 Annex A Coverage

| Annex A Domain | Controls Addressed | Phase |
|---------------|-------------------|-------|
| A.8 Asset management | A.8.2.3, A.8.3.2 | Phase 3 (S-6), Phase 4 (S-4) |
| A.9 Access control | A.9.1.1, A.9.2.1, A.9.2.2, A.9.2.5, A.9.4.2, A.9.4.4 | Phase 1, 3, 4, 6 |
| A.10 Cryptography | A.10.1.1, A.10.1.2 | Phase 4 (S-22, S-28) |
| A.12 Operations security | A.12.1.3, A.12.4.1, A.12.4.2, A.12.4.3 | Phase 1, 2, 4, 6 |
| A.13 Communications security | A.13.1.1 | Phase 4 (S-25) |
| A.14 System acquisition | A.14.1.1, A.14.1.2 | Phase 1 (S-24), Phase 6 (A-3) |
| A.18 Compliance | A.18.1.4 | Phase 4 (S-4, S-18, S-20) |

---

## Open Questions

- [ ] Confirm multi-org requirement before Phase 3 — Assigned to: stakeholders (drives Decision 4 gate)
- [ ] Determine Slack workspace webhook URL availability — Assigned to: admin (for Phase 5 A-9)
- [ ] Confirm GitHub API access token availability — Assigned to: admin (for Phase 5 A-10)

---

*This overview document synthesizes planning artifacts from: prd-draft.md (PM), analysis.md (BA), architecture.md (Architect), ux-design.md (UX), and decision-log.md. All item IDs (S-X, P-X, A-X) reference the brainstorm document at `docs/context/08-brainstorm-improvements.md`.*
