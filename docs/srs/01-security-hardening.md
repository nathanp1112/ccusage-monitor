# SRS/BRD Phase 1: Security Hardening

**Timeline**: Week 1-2
**Priority**: CRITICAL — Blocker for production use and ISMS audit
**Items**: S-1, S-2, S-3, S-7, S-8, S-9, S-13, S-16, S-17, S-24, S-33 (11 items)
**Estimated Effort**: 80-120 dev-hours (2 developers, 2 weeks)
**Document Version**: 1.0
**Date**: 2026-02-28
**Sources**: prd-draft.md (PM John), analysis.md (BA Mary), architecture.md (Architect Winston), ux-design.md (UX Sally), decision-log.md

---

## 1. Executive Summary

Phase 1 closes the most dangerous security gaps in the current CCUsage Monitor system. Today, all three API surface areas (sync, admin, agent) are completely unauthenticated — anyone with the API Gateway URL can inject fake usage data, trigger aggregation, view system internals, or issue commands to developer machines. Password hashing uses unsalted SHA-256, and credentials are committed to the source repository.

This phase is a **non-negotiable prerequisite** before any ISMS audit engagement and before onboarding additional teams.

**What Phase 1 delivers**:
1. JWT authentication on all write endpoints (sync, admin, agent commands)
2. bcrypt password hashing with per-user salt (replacing SHA-256)
3. User store externalized from source code to S3
4. Immutable admin and auth audit logging
5. Rate limiting at API Gateway and application level
6. Login attempt logging for ISO 27001 compliance
7. Registration endpoint removed or gated
8. Health endpoint sanitized (no infrastructure leakage)
9. JWT signing secret in AWS Secrets Manager (Decision 1: S-13 promoted to Phase 1)
10. 90-day agent-specific tokens for machine-to-machine auth (Decision 3: Architect's design)

**Phase 1 is the foundation for every subsequent phase.** Authentication infrastructure built here is extended by RBAC (Phase 3), DLP controls (Phase 4), and SSO migration (Phase 6).

---

## 2. Business Requirements

### 2.1 Problem Statement (from PRD)

The system is currently deployed with **zero authentication on its most critical endpoints**. The sync endpoint (`POST /api/sync`) is publicly accessible, meaning anyone on the internet can inject fabricated usage data for any email address. Admin endpoints that trigger aggregation, create remote commands for developer machines, and expose infrastructure details are similarly unprotected.

Passwords are hashed with unsalted SHA-256. Two users with the same password produce identical hashes, rendering the user store vulnerable to rainbow table attacks. Credentials are committed directly to the source repository in `lambda-server/src/data/users.json`, making them accessible to anyone with repository access.

This is not a theoretical risk — it is an active vulnerability. Without addressing these gaps, the system:
- Cannot be presented for any security review
- Cannot be trusted as a data source (anyone can inject fake usage)
- Creates organizational liability
- Will fail an ISMS audit on first inspection, wasting $15,000-$30,000 in engagement fees

### 2.2 Stakeholder Analysis (from BA)

| Stakeholder | Role | Interest Level | Impact |
|-------------|------|---------------|--------|
| Developers (agent users) | End users whose machines run the agent | Medium — Setup flow changes (new auth token step) | LOW — Transparent after initial re-setup |
| Engineering Managers | Dashboard viewers | Low — Security is invisible when done right | LOW — No dashboard changes |
| Security/Compliance Officers | ISMS audit gatekeepers | **CRITICAL** — This phase directly addresses their concerns | **HIGH** — Unblocks audit process |
| System Administrators | Deploy and operate the system | High — Must implement and maintain auth infrastructure | **HIGH** — Significant implementation work |
| Finance/Budget Owners | Approve spending | Low — Minimal AWS cost increase (~$0 new services) | LOW — No new services required |

### 2.3 Business Value & ROI (from BA)

**Quantifiable Benefits**:
- **Risk Reduction**: Eliminates the #1 vulnerability — unauthenticated data injection that could corrupt all usage analytics. A single data poisoning incident could invalidate months of usage data used for budget decisions.
- **ISMS Pre-qualification**: Without Phase 1, an ISMS auditor would flag critical non-conformities on first inspection, wasting audit engagement fees (typically $15,000-$30,000 per engagement).
- **Data Integrity**: Authenticated sync ensures every record is traceable to a verified developer identity, making the analytics trustworthy.

**ROI Estimation**: Investment of ~80-120 dev-hours yields audit-readiness that would otherwise require 3-6 months of remediation if flagged during a live audit.

**Strategic Alignment**:
- Directly maps to ISO 27001 Annex A controls: A.9.1 (access control policy), A.9.2 (user access management), A.9.4 (system and application access control), A.12.4 (logging and monitoring)
- Prerequisite for SOC 2 Type I/II Trust Service Criteria: CC6.1 (logical access), CC6.2 (access restrictions), CC7.2 (monitoring)

### 2.4 Success Metrics (from PRD + BA)

| KPI | Target | Measurement |
|-----|--------|-------------|
| Authenticated endpoints | 100% of write endpoints require valid JWT | Automated test suite (unauthenticated requests return 401) |
| Password hashing strength | 100% of passwords use bcrypt with salt | Verify no SHA-256 hashes remain in user store |
| Credential exposure | Zero credentials in source control | git-secrets scan in CI |
| Rate limiting | All endpoints throttled | API Gateway configuration audit |
| Audit coverage | 100% of admin actions logged | Audit log completeness check |
| Failed login visibility | All login attempts (success + failure) logged | CloudWatch log query |
| Auth event coverage | 100% of login attempts logged | CloudWatch Logs query for auth events over 7-day period |
| API abuse incidents | 0 successful unauthorized data injection | Review sync logs for entries without valid auth tokens |
| Admin operation traceability | 100% of admin actions have audit records | Spot-check S3 audit log against admin API calls |

### 2.5 Compliance Mapping (from BA — ISO 27001 controls)

| Control | Standard | Requirement | Addressed By |
|---------|----------|-------------|-------------|
| A.9.1.1 | ISO 27001 | Access control policy | S-1, S-2, S-3 (enforce auth on all endpoints) |
| A.9.2.1 | ISO 27001 | User registration and de-registration | S-9 (managed user store), S-17 (secure registration) |
| A.9.4.2 | ISO 27001 | Secure log-on procedures | S-8 (strong hashing), S-16 (login logging) |
| A.9.4.4 | ISO 27001 | Use of privileged utility programs | S-2 (admin auth), S-7 (admin audit trail) |
| A.12.4.1 | ISO 27001 | Event logging | S-7 (admin audit), S-16 (auth logging) |
| A.14.1.2 | ISO 27001 | Securing application services on public networks | S-24 (rate limiting), S-33 (info leakage prevention) |
| CC6.1 | SOC 2 | Logical and physical access controls | S-1, S-2, S-3 |
| CC7.2 | SOC 2 | System monitoring | S-7, S-16 |

---

## 3. Functional Requirements

### 3.1 User Stories with Acceptance Criteria

All Phase 1 items are **MoSCoW: Must**. Security is binary — a partially secured system provides a false sense of security that is worse than an openly insecure one.

---

#### US-1.1: Authenticate Sync Endpoint [S-1]

**As a** security officer,
**I want** the sync endpoint to require JWT authentication with email validation,
**so that** only authorized agents can submit usage data, and each agent can only submit data for its own email.

**Acceptance Criteria:**
- [ ] `POST /api/sync` returns 401 if no Bearer token is provided
- [ ] `POST /api/sync` returns 403 if the email in the request body does not match the email in the JWT
- [ ] Agent obtains JWT during setup (via login flow) and includes it in all sync requests
- [ ] Agent automatically refreshes expired access tokens using its refresh token
- [ ] Existing agents without tokens receive a clear error message instructing them to re-run setup
- [ ] During the 2-week grace period, unauthenticated sync requests return 200 with a deprecation warning header (`X-CCUsage-Deprecation: auth-required-after-YYYY-MM-DD`) rather than 401

**Effort**: M (requires agent-side JWT integration)
**MoSCoW**: Must

---

#### US-1.2: Authenticate Admin Endpoints [S-2]

**As an** admin,
**I want** all admin endpoints to require admin-role JWT authentication,
**so that** only authorized administrators can trigger aggregation, manage commands, or view system status.

**Acceptance Criteria:**
- [ ] `POST /api/admin/aggregate` returns 401 without token, 403 without admin role
- [ ] `POST /api/admin/commands` returns 401 without token, 403 without admin role
- [ ] `GET /api/admin/commands/:memberId` returns 401 without token, 403 without admin role
- [ ] `GET /api/admin/status` returns 401 without token, 403 without admin role (detailed info only for admin)
- [ ] JWT middleware checks `role` claim and enforces `admin` for all `/api/admin/*` routes
- [ ] Non-admin users (role: member, agent) receive 403 Forbidden with `{ error: "insufficient_permissions", required_role: "admin" }`

**Effort**: S (JWT middleware + role check)
**MoSCoW**: Must

---

#### US-1.3: Authenticate Agent Endpoints [S-3]

**As a** developer,
**I want** agent-facing endpoints to require authentication with email validation,
**so that** no one can poll my pending commands or acknowledge commands on my behalf.

**Acceptance Criteria:**
- [ ] `GET /api/agent/commands?email=X` returns 401 without token
- [ ] `GET /api/agent/commands?email=X` returns 403 if JWT email does not match query parameter email
- [ ] `POST /api/agent/commands/:id/ack` returns 401 without token
- [ ] `POST /api/agent/commands/:id/ack` returns 403 if JWT email does not match request email
- [ ] `GET /api/agent/version` remains public (needed for unauthenticated update checks by all agent versions)

**Effort**: S (same middleware as US-1.2, email match check)
**MoSCoW**: Must

---

#### US-1.4: Admin Audit Trail [S-7]

**As a** security officer,
**I want** all admin operations to produce an immutable audit log entry,
**so that** I can review who performed what admin action and when during a security audit.

**Acceptance Criteria:**
- Given an admin triggers `POST /api/admin/aggregate`
- When the request completes
- Then an audit entry is written to S3 at `audit/{year}-{month}.json`
- And the entry contains: actor email, action, parameters, timestamp, source IP, result status

- [ ] All `POST /api/admin/*` endpoints produce audit log entries
- [ ] Audit log entries are written to a dedicated S3 prefix (`audit/`)
- [ ] Each entry includes: timestamp, actor (email from JWT), action, request parameters, response status, source IP
- [ ] Audit log files use S3 append-only write pattern (each month is a single JSON array)
- [ ] Phase 1 audit logs are in the main bucket; Phase 4 will migrate to S3 Object Lock bucket (see Conflict 2 resolution in decision-log.md)
- [ ] A `GET /api/admin/audit-log` endpoint allows admins to query recent audit entries

**Effort**: M (S3 Object Lock configuration + write logic)
**MoSCoW**: Must

---

#### US-1.5: Bcrypt Password Hashing [S-8]

**As a** security officer,
**I want** all passwords hashed with bcrypt (cost factor >= 12) with per-user salt,
**so that** a database compromise does not reveal user passwords and two users with the same password produce different hashes.

**Acceptance Criteria:**
- [ ] Login endpoint validates passwords using `bcrypt.compare()`
- [ ] All stored password hashes use bcrypt format (`$2b$` prefix)
- [ ] Cost factor is configurable via `BCRYPT_ROUNDS` environment variable, defaulting to 12
- [ ] Migration strategy: lazy migration — on login, if stored hash is SHA-256 format, validate with SHA-256, then if successful, re-hash with bcrypt and update stored hash (`hashAlgorithm` field tracks this)
- [ ] No two identical passwords produce the same hash (salt uniqueness verified in tests)
- [ ] The `bcryptjs` package is used (pure JS, no native bindings, avoids Lambda compilation issues)

**Effort**: S (bcrypt swap + migration path)
**MoSCoW**: Must

---

#### US-1.6: Move Users to S3 [S-9]

**As an** admin,
**I want** user accounts stored in S3 rather than hardcoded in the source code,
**so that** adding or removing users does not require a Lambda redeployment, and credentials are never committed to version control.

**Acceptance Criteria:**
- [ ] User data is stored at S3 key `auth/users.json`
- [ ] Auth routes read user data from S3 with 5-minute TTL in-memory cache
- [ ] Cache validation uses S3 ETag (conditional GET, returns 304 if unchanged)
- [ ] The old `src/data/users.json` file is removed from the repository
- [ ] A seed script (`scripts/migrate-users.sh`) initializes the user store in S3 with bcrypt-hashed passwords
- [ ] ETag-based concurrency prevents race conditions on concurrent user modifications (same pattern as existing member registry)
- [ ] `.gitignore` updated to prevent accidental re-commit of user data files

**Effort**: M (S3 CRUD + caching + cleanup)
**MoSCoW**: Must

---

#### US-1.7: Login Attempt Logging [S-16]

**As a** security officer,
**I want** all login attempts (successful and failed) logged with contextual details,
**so that** I can detect brute-force attacks, compromised accounts, and unauthorized access attempts.

**Acceptance Criteria:**
- Given a user attempts `POST /api/auth/login`
- When the attempt succeeds, then a log entry records: email, timestamp, source IP, user-agent, result=success
- When the attempt fails, then a log entry records: email, timestamp, source IP, user-agent, result=failure, reason (invalid password / unknown email)

- [ ] Log entries written to the same `audit/{year}-{month}.json` file as admin audit events (using action types `auth.login.success` / `auth.login.failure`)
- [ ] Structured JSON format suitable for CloudWatch Insights queries
- [ ] Failed attempts do NOT leak whether the email exists (generic "Invalid credentials" message to client)
- [ ] Console logging also emits structured JSON for CloudWatch
- [ ] `UserRecord.failedLoginAttempts` counter is incremented on failure and reset to 0 on success
- [ ] `UserRecord.lastFailedLoginAt` is updated on each failure

**Effort**: S (structured logging, implemented as part of US-1.4 audit trail)
**MoSCoW**: Must

---

#### US-1.8: Guard Register Endpoint [S-17]

**As a** security officer,
**I want** the register endpoint either removed or protected by admin authentication,
**so that** arbitrary users cannot create registration entries or read existing ones.

**Acceptance Criteria:**
- [ ] Option A (chosen per Architect): Remove `/api/register` entirely
  - Delete `lambda-server/src/routes/register.ts`
  - Remove register route block from `src/app.ts`
  - Remove register-related code from `be-agent/src/commands/setup.ts`
- [ ] Agent setup flow is updated to use `POST /api/auth/login` instead of register endpoint
- [ ] No unauthenticated endpoint exists that can write or read registration data
- [ ] Any existing clients using `/api/register` receive a 404 or 410 Gone response

**Effort**: S (remove or guard route)
**MoSCoW**: Must

---

#### US-1.9: API Rate Limiting [S-24]

**As a** system administrator,
**I want** all API endpoints rate-limited at the API Gateway level,
**so that** the system is protected against denial-of-service attacks and runaway agent loops.

**Acceptance Criteria:**
- [ ] API Gateway throttling configured: 100 requests/second burst, 50 requests/second sustained (in `serverless.yml`)
- [ ] Per-identity rate limiting implemented in application layer:
  - `POST /api/auth/login`: 10 requests per 15 minutes per IP (brute-force protection)
  - `POST /api/sync`: 5 requests per minute per email
  - `GET /api/agent/commands`: 20 requests per minute per email
  - `POST /api/admin/*`: 30 requests per minute
  - `GET /api/dashboard*`: 60 requests per minute
- [ ] Rate limit exceeded returns 429 Too Many Requests with `Retry-After` header
- [ ] Response body: `{ "success": false, "error": "Rate limit exceeded", "code": "RATE_LIMITED", "retryAfter": 42 }`
- [ ] Response headers on all requests: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- [ ] Agent handles 429 responses with exponential backoff
- [ ] Rate limit configuration is adjustable via API Gateway settings and Lambda environment variables without code changes

**Effort**: M (API Gateway config + app-level in-memory limiter)
**MoSCoW**: Must

---

#### US-1.10: Sanitize Health Endpoint [S-33]

**As a** security officer,
**I want** the health/status endpoint to not expose internal infrastructure details,
**so that** an attacker cannot learn bucket names, environment labels, or function names from a public endpoint.

**Acceptance Criteria:**
- [ ] `GET /health` returns only: `{ "status": "ok", "timestamp": "..." }` for all requests (no auth required)
- [ ] Full system details (bucket, region, environment, aggregator function) are moved to `GET /api/admin/status` and only returned when a valid admin JWT is provided
- [ ] No endpoint accessible without authentication returns AWS resource names, ARNs, or environment labels

**Effort**: S (conditional response based on auth — trivial change)
**MoSCoW**: Must

---

#### US-1.11: JWT Secret in AWS Secrets Manager [S-13]

**As a** security officer,
**I want** the JWT signing secret stored in AWS Secrets Manager rather than hardcoded in the Lambda environment,
**so that** the current `dev-secret-key-do-not-use-in-production` placeholder cannot be accidentally used in production and secrets can be rotated without code changes.

**Decision Reference**: Decision 1 — S-13 promoted to Phase 1 (1-hour change that eliminates hardcoded dev secret).

**Acceptance Criteria:**
- [ ] JWT secret stored in AWS Secrets Manager at a documented ARN
- [ ] Lambda reads the secret from Secrets Manager on cold start, cached for warm invocations
- [ ] `serverless.yml` references Secrets Manager ARN instead of plaintext `JWT_SECRET` environment variable
- [ ] The string `dev-secret-key-do-not-use-in-production` does not appear in deployed Lambda environment
- [ ] Supports dual-secret validation for Phase 4 secret rotation (S-28): middleware checks both current and previous secret during rotation window

**Effort**: S (1-2 hours, bundled with S-8/S-9 user store work)
**MoSCoW**: Must (Decision 1)

---

### 3.2 API Specifications

#### New Endpoints

**POST /api/auth/login** (modified response — adds `agentToken`)

```typescript
// Request (unchanged)
interface LoginRequest {
  email: string;
  password: string;
}

// Response (modified — adds agentToken)
interface LoginResponse {
  success: true;
  accessToken: string;    // 60-minute, type: 'access'
  refreshToken: string;   // 20-day, type: 'refresh'
  agentToken: string;     // 90-day, type: 'agent' (NEW per Decision 3)
  user: {
    email: string;
    name: string;
    role: 'admin' | 'member' | 'agent';
  };
}
```

**GET /api/admin/audit-log** (new endpoint)

```typescript
// Query parameters
interface AuditLogQuery {
  year?: number;
  month?: number;
  actor?: string;      // filter by actor email
  action?: string;     // filter by action type
  limit?: number;      // default 100
}

// Response
interface AuditLogResponse {
  entries: AuditEntry[];
  total: number;
  year: number;
  month: number;
}
```

#### Modified Endpoints

| Endpoint | Change | Auth Required |
|----------|--------|---------------|
| `POST /api/sync` | Add JWT validation + email match check | agent or access token |
| `GET /api/agent/commands` | Add JWT validation + email match check | agent token |
| `POST /api/agent/commands/:id/ack` | Add JWT validation + email match check | agent token |
| `POST /api/admin/aggregate` | Add admin role check | access token, admin role |
| `POST /api/admin/commands` | Add admin role check | access token, admin role |
| `GET /api/admin/commands/:id` | Add admin role check | access token, admin role |
| `GET /api/admin/status` | Move detailed info to admin-only response; public gets minimal response | public / access token |
| `GET /health` | Strip infrastructure details | none (public) |

#### Endpoint-to-Role Matrix

| Endpoint Pattern | Allowed Roles | Token Type | Notes |
|-----------------|---------------|------------|-------|
| `POST /api/auth/login` | public | none | Login entry point |
| `POST /api/auth/refresh` | public | refresh | Token refresh |
| `GET /api/agent/version` | public | none | Version check (safe to expose) |
| `GET /health` | public | none | Load balancer health check (sanitized) |
| `POST /api/sync` | agent, admin | agent or access | email in token must match body email |
| `GET /api/agent/commands` | agent | agent | email in token must match query param |
| `POST /api/agent/commands/:id/ack` | agent | agent | email in token must match body |
| `GET /api/dashboard*` | admin, member | access | |
| `GET /api/members*` | admin, member | access | |
| `POST /api/admin/*` | admin | access | |
| `GET /api/admin/*` | admin | access | |

#### Error Response Shapes

```typescript
// 401 Unauthorized
interface UnauthorizedError {
  success: false;
  error: 'unauthorized';
  message: 'Bearer token required' | 'Token expired' | 'Token revoked';
}

// 403 Forbidden
interface ForbiddenError {
  success: false;
  error: 'forbidden';
  message: 'Email mismatch' | 'Insufficient permissions';
  required_role?: 'admin' | 'agent' | 'member';
}

// 429 Too Many Requests
interface RateLimitError {
  success: false;
  error: 'Rate limit exceeded';
  code: 'RATE_LIMITED';
  retryAfter: number;  // seconds until next allowed request
}
```

---

### 3.3 Data Model Changes

#### New S3 Keys

| Key | Purpose | Written By |
|-----|---------|------------|
| `auth/users.json` | User credentials and profiles | Auth routes, admin API |
| `audit/{year}-{month}.json` | Monthly audit trail (admin actions + auth events) | Auth middleware, admin routes, sync route |

#### Modified S3 Keys

None. All existing keys (`raw/`, `aggregated/`, `views/`, `members/`, etc.) are unchanged.

#### Removed Files

| File | Reason |
|------|--------|
| `lambda-server/src/data/users.json` | Moved to S3 at `auth/users.json`. Remove from repository. |

---

#### User Store TypeScript Interface

```typescript
// S3 key: auth/users.json
interface UserStore {
  version: 1;
  lastUpdated: string;    // ISO 8601 timestamp
  users: Record<string, UserRecord>;  // keyed by email (lowercase)
}

interface UserRecord {
  email: string;          // normalized to lowercase
  name: string;           // display name
  role: 'admin' | 'agent' | 'member';
  passwordHash: string;   // bcrypt hash (or legacy SHA-256 during migration)
  hashAlgorithm: 'bcrypt' | 'sha256';  // 'sha256' only during lazy migration window
  isActive: boolean;      // false = deactivated account
  createdAt: string;      // ISO 8601
  updatedAt: string;      // ISO 8601
  lastLoginAt: string | null;
  failedLoginAttempts: number;        // reset to 0 on successful login
  lastFailedLoginAt: string | null;   // ISO 8601 or null
}
```

---

#### Audit Entry TypeScript Interface

```typescript
// S3 key: audit/{year}-{month}.json
interface AuditLog {
  year: number;
  month: number;
  entries: AuditEntry[];
}

interface AuditEntry {
  id: string;            // UUIDv4
  timestamp: string;     // ISO 8601
  actor: string;         // email from JWT (or 'anonymous' for unauthenticated attempts)
  action: AuditAction;
  resource: string;      // e.g., "member:{memberId}", "aggregator", "command:{commandId}"
  details: Record<string, unknown>;  // action-specific payload (see below)
  ip: string | null;     // source IP from API Gateway
  userAgent: string | null;
}

type AuditAction =
  | 'auth.login.success'
  | 'auth.login.failure'
  | 'auth.token.refresh'
  | 'admin.aggregate.trigger'
  | 'admin.command.create'
  | 'admin.user.create'
  | 'admin.user.update'
  | 'admin.user.delete'
  | 'admin.status.view'
  | 'agent.sync.complete'
  | 'agent.command.ack';

// Action-specific detail shapes:

// auth.login.failure
interface LoginFailureDetails {
  email: string;
  reason: 'invalid_credentials' | 'account_disabled' | 'account_locked';
  failedAttemptCount: number;
  ip: string;
}

// auth.login.success
interface LoginSuccessDetails {
  email: string;
  tokenType: 'access' | 'agent';
  ip: string;
  previousFailedAttempts: number;  // reset to 0 on success
}

// admin.aggregate.trigger
interface AggregateTriggerDetails {
  force: boolean;
  targetMonths?: string[];  // e.g., ["2026-01", "2026-02"]
}

// agent.sync.complete
interface SyncCompleteDetails {
  memberId: string;
  entriesSubmitted: number;
  entriesInserted: number;
  entriesDuplicated: number;
  month: string;  // "2026-02"
}
```

---

#### Rate Limit Config TypeScript Interface

```typescript
interface RateLimitConfig {
  windowMs: number;      // window duration in milliseconds
  maxRequests: number;   // max allowed requests per window
}

// Applied configurations:
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'auth.login':     { windowMs: 15 * 60_000, maxRequests: 10 },   // 10/15min (brute force)
  'sync':           { windowMs: 60_000,       maxRequests: 5 },    // 5/min per email
  'agent.commands': { windowMs: 60_000,       maxRequests: 20 },   // 20/min
  'admin':          { windowMs: 60_000,       maxRequests: 30 },   // 30/min
  'dashboard.read': { windowMs: 60_000,       maxRequests: 60 },   // 60/min
};
```

---

## 4. Non-Functional Requirements

### 4.1 Security (from Architecture)

**Auth flow overview**:
```
Request
  |
  v
[CORS middleware]
  |
  v
[Gzip decompression]
  |
  v
[Rate limit check] -----> 429 Too Many Requests
  |
  v
[Is public endpoint?] --yes--> [Route handler]
  |
  no
  |
  v
[Extract Bearer token from Authorization header]
  |
  v
[Verify JWT signature + expiry] --fail--> 401 Unauthorized
  |
  v
[Check token type matches endpoint class]
  |  - /api/sync         => type: 'agent' or 'access'
  |  - /api/agent/*      => type: 'agent'
  |  - /api/admin/*      => type: 'access', role: 'admin'
  |  - /api/dashboard/*  => type: 'access'
  |  - /api/members/*    => type: 'access'
  |
  v
[Set c.var('user') with { email, role, memberId }]
  |
  v
[Route handler]
```

**Token specifications**:
- Access token: HS256, 60-minute expiry, claims `{ sub: memberId, email, role, type: 'access', iat, exp }`
- Refresh token: HS256, 20-day expiry, claims `{ sub: memberId, email, type: 'refresh', iat, exp }`
- Agent token: HS256, 90-day expiry, claims `{ sub: memberId, email, role: 'agent', type: 'agent', iat, exp }` (Decision 3)
- JWT secret: stored in AWS Secrets Manager (S-13); read on cold start, cached for warm invocations

**bcrypt specification**:
- Algorithm: bcrypt via `bcryptjs` (pure JavaScript, no native dependencies)
- Cost factor: 12 (OWASP-recommended minimum for 2024-2026)
- Configured via `BCRYPT_ROUNDS` environment variable
- Lazy migration: on login with SHA-256 hash, validate then re-hash with bcrypt and update user record

### 4.2 Performance (from Architecture)

| Change | Cold Start Impact | Per-Request Latency Impact |
|--------|-------------------|---------------------------|
| Auth middleware (JWT verify) | +5ms | +5ms per authenticated request |
| bcrypt on login | +50ms first call | +200ms per login (acceptable — agents authenticate once per 90 days; users once per 20 days) |
| User store S3 read | +0ms (in-memory cache, 5-min TTL) | +0ms (cache hit) / +50ms (cache miss, conditional GET) |
| Audit log write | +0ms | +30ms per auditable event (async S3 write, non-blocking) |
| Rate limit check | +0ms (in-memory) | +1ms per request |
| JWT secret Secrets Manager read | +10ms (cold start only) | +0ms (cached for Lambda lifetime) |

**Total worst case**: +6ms per non-login authenticated request. Well within the 2-second cold start budget.

**Lambda memory**: No change (512 MB API Lambda). The `bcryptjs` library adds ~25KB to bundle size.

### 4.3 Backward Compatibility (grace period for agent migration)

- Old agents (pre-auth, v0.3.x, v0.4.x) will receive 401 on sync after the grace period
- **Grace period**: 2 weeks after Phase 1 deployment
- During grace period: server accepts unauthenticated sync requests but adds `X-CCUsage-Deprecation: auth-required-after-{DATE}` response header
- Migration path: admin uses the existing `ccusage-agent update` + `force-sync` command flow
- Agent v0.5.0 (Phase 1) adds auth support: reads stored `agentToken` from `~/.ccusage-agent/state.json` and includes it in all requests
- `BCRYPT_ROUNDS` environment variable in `serverless.yml` with default 12
- `AUTH_GRACE_PERIOD_END` environment variable configures the end date of the grace period

---

## 5. UX Requirements

### 5.1 Login Page Updates (from UX)

**Source items**: S-15 (account lockout data model groundwork), S-16 (login attempt logging)

The existing login page requires minimal changes. Phase 1 UX scope is intentionally small — the security work is backend-focused.

#### Updated Screen: `/login`

```
+------------------------------------------------------+
|                                                      |
|              CCUsage Team Monitor                    |
|          Sign in to view team usage                  |
|                                                      |
|   +----------------------------------------------+  |
|   |  [!] Account locked. Try again in 5 minutes  |  |  <-- NEW: lockout banner (on 429)
|   +----------------------------------------------+  |
|                                                      |
|   +----------------------------------------------+  |
|   |  [x] Invalid email or password (3/5 attempts)|  |  <-- NEW: attempt counter (on 401)
|   +----------------------------------------------+  |
|                                                      |
|   Email:                                             |
|   [____________________________________]             |
|                                                      |
|   Password:                                          |
|   [____________________________________]             |
|                                                      |
|   [ Sign in                            ]             |
|                                                      |
+------------------------------------------------------+
```

**Changes to existing LoginPage** (`dashboard/src/app/(auth)/login/page.tsx` or equivalent):
- Add lockout state detection: when API returns 429, show lockout banner with countdown timer
- Show attempt count on 401: "Invalid email or password (attempt N of 5)"
- Add `aria-live="polite"` region for error messages so screen readers announce updates
- Disable submit button during lockout period with visual countdown

**Error state mapping**:

| API Response | Display Text |
|--------------|--------------|
| 401 | "Invalid email or password (attempt N of 5)" |
| 429 | "Account locked. Try again in MM:SS" with countdown |
| 500 | "Login service unavailable. Please try again later." |

**New components**: None (enhance existing login page inline)

### 5.2 Settings Page Seed (from UX)

**Source items**: A-15 preparation (Phase 3), S-9 user management foundation

A placeholder settings page is created in Phase 1 to provide a home for the forthcoming user management (Phase 3) and security settings (Phase 4). The page shows a grid of setting category cards; future-phase cards are disabled with "Coming soon" labels.

#### New Screen: `/settings`

```
+------------------------------------------------------+
| Settings                                              |
| System configuration and administration               |
+------------------------------------------------------+
|                                                       |
|  +-------------+  +-------------+  +-------------+   |
|  | [UserCog]   |  | [Shield]    |  | [Bell]      |   |
|  | Users       |  | Security    |  | Notifica-   |   |
|  | Manage team |  | Auth &      |  | tions       |   |
|  | members     |  | compliance  |  | Coming soon |   |
|  | [Phase 3]   |  | [Phase 4]   |  | [Phase 5]   |   |
|  +-------------+  +-------------+  +-------------+   |
|                                                       |
|  +---------------------------------------------------+|
|  | System Information                                 |
|  |                                                    |
|  | Version: 0.4.0    Last Aggregation: 2h ago         |
|  | Members: 12       Agent Version: 0.4.0             |
|  +---------------------------------------------------+|
|                                                       |
+------------------------------------------------------+
```

**Implementation notes**:
- Page route: `app/(dashboard)/settings/page.tsx`
- Only accessible to `admin` role (check `useSession().data.role === 'admin'`)
- System info section reads from `/api/admin/status` (now protected) and `/api/dashboard/meta`
- Category cards use the new `SettingsCategoryCard` component

**New components**:

| Component | File | Notes |
|-----------|------|-------|
| Settings page | `app/(dashboard)/settings/page.tsx` | New page |
| `SettingsCategoryCard` | `components/settings/settings-category-card.tsx` | Card with icon, title, description, disabled state |
| `SystemInfoPanel` | `components/settings/system-info-panel.tsx` | Read-only system status display |

---

## 6. Technical Architecture

### 6.1 Auth Middleware Design (from Architecture)

The auth middleware is a single Hono middleware that is composed per-route group. It is designed to be a single point of control for all authentication logic.

```typescript
// lambda-server/src/middleware/auth.ts

import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';

interface AuthUser {
  sub: string;       // memberId
  email: string;
  role: 'admin' | 'member' | 'agent';
  type: 'access' | 'refresh' | 'agent';
  iat: number;
  exp: number;
}

// Middleware factory: creates middleware with required role and token type
export function requireAuth(options?: {
  roles?: Array<'admin' | 'member' | 'agent'>;
  tokenType?: Array<'access' | 'agent'>;
}) {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ success: false, error: 'unauthorized', message: 'Bearer token required' }, 401);
    }

    const token = authHeader.slice(7);
    const secret = await getJwtSecret();  // reads from Secrets Manager (cached)

    let payload: AuthUser;
    try {
      payload = await verify(token, secret) as AuthUser;
    } catch {
      return c.json({ success: false, error: 'unauthorized', message: 'Token expired or invalid' }, 401);
    }

    // Check token type
    if (options?.tokenType && !options.tokenType.includes(payload.type as 'access' | 'agent')) {
      return c.json({ success: false, error: 'forbidden', message: 'Incorrect token type' }, 403);
    }

    // Check role
    if (options?.roles && !options.roles.includes(payload.role)) {
      return c.json({
        success: false,
        error: 'forbidden',
        message: 'Insufficient permissions',
        required_role: options.roles[0],
      }, 403);
    }

    c.set('user', payload);
    await next();
  };
}

// Email match middleware: ensures JWT email matches a request parameter
export function requireEmailMatch(getRequestEmail: (c: Context) => string | undefined) {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as AuthUser;
    const requestEmail = getRequestEmail(c);
    if (requestEmail && user.email !== requestEmail) {
      return c.json({ success: false, error: 'forbidden', message: 'Email mismatch' }, 403);
    }
    await next();
  };
}
```

**Route composition example**:

```typescript
// lambda-server/src/app.ts (modified)

import { requireAuth, requireEmailMatch } from './middleware/auth';

// Sync endpoint (agents only, email must match body)
app.post('/api/sync',
  requireAuth({ roles: ['agent', 'admin'], tokenType: ['agent', 'access'] }),
  requireEmailMatch((c) => c.req.valid('json')?.email),
  syncHandler
);

// Admin routes (admin role only)
app.use('/api/admin/*', requireAuth({ roles: ['admin'], tokenType: ['access'] }));

// Agent command routes (agent token only, email must match query)
app.get('/api/agent/commands',
  requireAuth({ roles: ['agent'], tokenType: ['agent'] }),
  requireEmailMatch((c) => c.req.query('email')),
  agentCommandsHandler
);
```

### 6.2 Agent Token Flow (90-day tokens per Decision 3)

**Decision 3 (Conflict resolution)**: The Architect's 90-day agent token design was adopted over the PM's JWT refresh token approach. Agents run unattended and authenticate once during setup. 90-day tokens avoid the complexity of refresh flows in daemon processes.

```
Agent (first run / re-setup)         Server
     |                                 |
     |-- POST /api/auth/login -------->|  { email, password }
     |<-- { accessToken,              |
     |      refreshToken,             |  accessToken: 60min, type:'access'
     |      agentToken, ... } --------|  refreshToken: 20day, type:'refresh'
     |                                |  agentToken: 90day, type:'agent'  (NEW)
     |                                |
     |   [stores agentToken in        |
     |    ~/.ccusage-agent/state.json] |
     |                                |
     |   [periodic sync loop]          |
     |                                |
     |-- POST /api/sync ------------->|  Authorization: Bearer <agentToken>
     |   { email, entries, ... }      |  Server validates: token.email == body.email
     |<-- { success, inserted } ------|
     |                                |
     |-- GET /api/agent/commands ---->|  Authorization: Bearer <agentToken>
     |   ?email=<from-config>         |  Server validates: token.email == query.email
     |<-- { commands: [...] } --------|
     |                                |
     |   [7 days before token expiry] |
     |-- POST /api/auth/login ------->|  (stored email + password)
     |<-- { agentToken, ... } --------|  new 90-day token
     |   [update stored agentToken]   |
```

**Agent token specification**:
- Type: `agent` (distinct from `access` type used by dashboard users)
- Expiry: 90 days
- Claims: `{ sub: memberId, email, role: 'agent', type: 'agent', iat, exp }`
- Storage: `~/.ccusage-agent/state.json` (alongside existing access/refresh tokens)
- Rotation: Agent re-authenticates when token is within 7 days of expiry
- Revocation: Admin sends `revoke-token` command via admin API; agent clears stored token and re-authenticates on next sync cycle

**Changes to `be-agent/src/lib/pusher.ts`**:
- Add `Authorization: Bearer <agentToken>` header to all HTTP requests
- On 401 response: attempt to re-login with stored credentials from config
- If re-login fails, log error and skip sync (do not crash daemon)

**Changes to `be-agent/src/commands/setup.ts`**:
- After config creation, call `POST /api/auth/login` with email + password
- Store the returned `agentToken` in `state.json`
- If login fails, print error and exit (setup is incomplete without auth)
- Add `--password` flag or interactive password prompt to setup command

### 6.3 Rate Limiting Strategy (API Gateway + app-level)

**Two-layer approach**:

**Layer 1: API Gateway default throttling** (infrastructure-level safety net)

In `serverless.yml`:
```yaml
provider:
  httpApi:
    throttle:
      burstLimit: 100    # max concurrent requests
      rateLimit: 50       # requests per second sustained
```

This provides a hard ceiling independent of application code. No changes needed to Lambda code.

**Layer 2: Application-level in-memory sliding window** (per-identity, per-endpoint)

```typescript
// lambda-server/src/middleware/rate-limit.ts

const windows = new Map<string, number[]>();  // key -> timestamps

export function rateLimit(key: (c: Context) => string, config: RateLimitConfig) {
  return async (c: Context, next: Next) => {
    const windowKey = `${key(c)}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const timestamps = (windows.get(windowKey) ?? []).filter(t => t > windowStart);

    if (timestamps.length >= config.maxRequests) {
      const oldestInWindow = timestamps[0];
      const retryAfter = Math.ceil((oldestInWindow + config.windowMs - now) / 1000);

      c.header('X-RateLimit-Limit', String(config.maxRequests));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Math.ceil((now + config.windowMs) / 1000)));

      return c.json({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
        retryAfter,
      }, 429);
    }

    timestamps.push(now);
    windows.set(windowKey, timestamps);

    c.header('X-RateLimit-Limit', String(config.maxRequests));
    c.header('X-RateLimit-Remaining', String(config.maxRequests - timestamps.length));
    c.header('X-RateLimit-Reset', String(Math.ceil((now + config.windowMs) / 1000)));

    await next();
  };
}
```

**Note**: In-memory rate limiting resets on Lambda cold start. This is acceptable because: (1) cold starts are infrequent, and (2) the API Gateway throttle provides the hard ceiling regardless.

### 6.4 Infrastructure Changes

**`serverless.yml` changes** (additions only, no removals):

```yaml
provider:
  environment:
    # Add to existing environment block
    BCRYPT_ROUNDS: '12'
    AUTH_GRACE_PERIOD_END: '2026-03-14'    # 2 weeks after deploy date
    JWT_SECRET_ARN: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:ccusage/jwt-secret'
  httpApi:
    throttle:
      burstLimit: 100
      rateLimit: 50
  # Add Secrets Manager read permission to Lambda IAM role
  iam:
    role:
      statements:
        - Effect: Allow
          Action:
            - secretsmanager:GetSecretValue
          Resource: !Sub 'arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:ccusage/jwt-secret*'
```

**New dependencies** (lambda-server):

| Package | Version | Purpose | Size |
|---------|---------|---------|------|
| `bcryptjs` | ^2.4.3 | Password hashing (pure JS, no native bindings) | ~25KB |

**No new AWS services** are introduced in Phase 1. All changes use existing Lambda, S3, and API Gateway.

---

## 7. Dependencies & Risks

### 7.1 Dependencies

- **No external dependencies** — All items use existing AWS services (API Gateway, Lambda, S3, Secrets Manager which is already in the account)
- **Agent re-deployment required** — After S-1 and S-3 are implemented, all running agents must update to include auth tokens in requests. The existing auto-update mechanism (`ccusage-agent update`) facilitates this.
- **Dashboard re-deployment required** — After S-2, the dashboard must send JWT tokens with all API requests. The `use-auth.ts` hook is partially implemented; needs verification.
- **Team capacity**: Estimated 2 developers full-time for 2 weeks

### 7.2 Risks (from PRD + BA + Architecture)

| Risk | Probability | Impact | Severity | Mitigation |
|------|------------|--------|----------|------------|
| Agent fleet cannot update (stuck on old version) | HIGH | MEDIUM | HIGH | 2-week grace period with unauthenticated fallback; admin can push `force-sync` + `update` commands to all agents |
| JWT secret management complexity | MEDIUM | HIGH | HIGH | Use AWS Secrets Manager from day 1 (S-13 bundled per Decision 1). Eliminates hardcoded `dev-secret-key-do-not-use-in-production` default. |
| Rate limiting too aggressive, blocks legitimate heavy users | MEDIUM | LOW | LOW | Start with generous limits (100 req/min per email for sync, 10 req/min for admin). Monitor and adjust based on actual traffic patterns. |
| Users.json migration data loss | LOW | HIGH | MEDIUM | Export current users to S3 with backup before migration. Support dual-read (S3 + fallback to bundled file) during transition. |
| Register endpoint removal breaks onboarding | MEDIUM | MEDIUM | MEDIUM | Audit current usage of `/api/register`; if actively used for setup flow, gate behind admin auth rather than removing entirely. |
| bcrypt slows down Lambda cold start | LOW | LOW | LOW | Only affects login endpoint; `bcryptjs` is pure JS with no native compilation overhead. bcrypt adds ~50ms to first login call. |
| User store S3 file corruption during concurrent writes | MEDIUM | MEDIUM | MEDIUM | Use ETag-based conditional writes (same pattern as existing member registry). |
| In-memory rate limiting resets on cold start | LOW | LOW | LOW | API Gateway throttle provides hard ceiling regardless of application-level state. |

---

## 8. Implementation Plan

### Week-by-Week Breakdown (from Architecture)

```
Week 1:
  Day 1:
    1. [S-33] Sanitize health endpoint (30 min, standalone — immediate risk reduction)
    2. [S-17] Remove register endpoint (1 hr, standalone — immediate risk reduction)

  Day 1-2:
    3. [S-13] Add JWT secret to AWS Secrets Manager + update Lambda to read from Secrets Manager (2 hr)

  Day 2-3:
    4. [S-8]  Add bcryptjs dependency + password verification logic with hashAlgorithm field (4 hr)

  Day 3-4:
    5. [S-9]  Create UserStore TypeScript interface + S3 schema (1 hr)
    6. [S-9]  Write migration script: scripts/migrate-users.sh (2 hr)
    7. [S-9]  User store S3 CRUD with ETag concurrency + in-memory cache (4 hr)

  Note: Tasks 1-2 are parallelizable with Tasks 3-7

Week 2:
  Day 6-7:
    8. [S-1, S-2, S-3] Auth middleware rewrite:
       - requireAuth() factory middleware
       - requireEmailMatch() middleware
       - Route composition for all affected endpoints
       (8 hr, critical path — must complete before Agent integration)

  Day 7-8:
    9. [S-7, S-16] Audit trail infrastructure:
       - AuditEntry TypeScript interfaces
       - Append-only S3 write function
       - Login success/failure logging
       - Admin action logging hooks
       (6 hr, can be parallelized with Task 8)

  Day 8-9:
    10. [S-24] Rate limiting:
        - API Gateway throttle config in serverless.yml
        - In-memory sliding window rate limit middleware
        - Per-endpoint configuration application
        (4 hr)

  Day 9-10:
    11. [S-1] Agent auth integration (be-agent changes):
        - Add agentToken storage to state.json
        - Add Authorization header to all pusher.ts HTTP calls
        - Update setup.ts to perform login and store agentToken
        - Handle 401 with re-login logic
        (6 hr, depends on Task 8)

  Day 10:
    12. Integration testing + grace period flag + deploy
        (4 hr, depends on all above)
```

### Critical Path

```
Task 4 (bcrypt) ─┐
Task 5-7 (S3 users) ─┼──> Task 8 (Auth middleware) ──> Task 11 (Agent integration) ──> Task 12 (Deploy)
Task 3 (Secrets) ─┘
```

Tasks 1, 2, and 9-10 are not on the critical path and can be done in parallel.

---

## 9. Acceptance Criteria & Test Strategy

### Phase 1 Complete When:

- [ ] All write endpoints (`POST /api/sync`, `POST /api/admin/*`, `POST /api/agent/commands/:id/ack`) return 401 for requests without Authorization header
- [ ] `GET /api/agent/commands?email=X` returns 403 when JWT email differs from query param email
- [ ] `POST /api/sync` returns 403 when JWT email differs from request body email
- [ ] `GET /health` returns only `{ status: "ok", timestamp: "..." }` — no bucket name, region, or environment
- [ ] `GET /api/agent/version` is publicly accessible without auth
- [ ] Zero bcrypt hashes have `sha256` as `hashAlgorithm` after running migration script
- [ ] `auth/users.json` exists in S3 and `lambda-server/src/data/users.json` is absent from repository
- [ ] Every `POST /api/admin/aggregate` call produces an audit entry in `audit/{year}-{month}.json`
- [ ] Login failure audit entries contain email, IP, and reason — but the HTTP response body contains only "Invalid credentials" (no email existence leak)
- [ ] API Gateway throttle config: burstLimit=100, rateLimit=50 visible in AWS Console
- [ ] Agent v0.5.0 successfully syncs with auth token from `~/.ccusage-agent/state.json`

### Test Strategy

| Test Type | Coverage | Tool |
|-----------|---------|------|
| Unit tests | Auth middleware role/token-type matrix; bcrypt verification; rate limit sliding window | Vitest |
| Integration tests | All endpoint auth scenarios (401, 403 responses); audit log writes | Vitest + local Lambda |
| Security tests | Unauthenticated requests to all endpoints; email mismatch attempts; JWT tampering | Custom test suite |
| Migration test | `scripts/migrate-users.sh` produces valid `UserStore` with bcrypt hashes | Manual + automated check |
| Agent integration test | Agent v0.5.0 full setup+sync flow with auth | Manual end-to-end |

---

## 10. References

### Brainstorm Items
- **S-1**: Authenticate sync endpoint
- **S-2**: Authenticate admin endpoints
- **S-3**: Authenticate agent endpoints
- **S-7**: Admin audit trail
- **S-8**: Replace SHA-256 with bcrypt
- **S-9**: Move users from source code to S3
- **S-13**: JWT secret in Secrets Manager (promoted from backlog, Decision 1)
- **S-16**: Login attempt logging
- **S-17**: Secure or remove register endpoint
- **S-24**: API rate limiting
- **S-33**: Remove infrastructure details from health endpoint

### Decision Log Entries
- **Decision 1**: S-13 (JWT Secret) included in Phase 1 — simple fix to eliminate hardcoded dev secret. S-14 deferred.
- **Decision 3** (listed as "Conflict 3" in decision log): Agent token type — adopted Architect's 90-day agent-specific token design over PM's JWT refresh token approach. Agents authenticate once during setup and use long-lived tokens appropriate for machine-to-machine communication.

### Source Documents
- `/Users/duongthao/data/sources/nghia/workflow-scout/ccusage-monitor/grooming-artifacts/planning-artifacts/prd-draft.md` — Phase 1 user stories (US-1.1 through US-1.10), MoSCoW, effort estimates
- `/Users/duongthao/data/sources/nghia/workflow-scout/ccusage-monitor/grooming-artifacts/planning-artifacts/analysis.md` — Phase 1 stakeholder analysis, compliance mapping, risk assessment, success metrics
- `/Users/duongthao/data/sources/nghia/workflow-scout/ccusage-monitor/grooming-artifacts/planning-artifacts/architecture.md` — Auth middleware design, bcrypt migration, S3 user store schema, audit trail schema, rate limiting strategy, implementation order, Phase 1 performance table
- `/Users/duongthao/data/sources/nghia/workflow-scout/ccusage-monitor/grooming-artifacts/planning-artifacts/ux-design.md` — Login page updates, Settings page seed design
- `/Users/duongthao/data/sources/nghia/workflow-scout/ccusage-monitor/grooming-artifacts/planning-artifacts/decision-log.md` — Decision 1 (S-13 placement), Conflict 3 (agent token type)

### Key Files to Modify
- `lambda-server/src/app.ts` — Auth middleware composition
- `lambda-server/src/routes/sync.ts` — Add auth middleware
- `lambda-server/src/routes/auth.ts` — Add bcrypt verification, agentToken response
- `lambda-server/src/lib/s3.ts` — Add user store helpers
- `lambda-server/src/lib/types.ts` — Add UserRecord, UserStore, AuditEntry interfaces
- `lambda-server/serverless.yml` — API Gateway throttle, env vars, IAM policy
- `lambda-server/src/data/users.json` — **DELETE** this file
- `be-agent/src/lib/pusher.ts` — Add Authorization header
- `be-agent/src/commands/setup.ts` — Add login step and agentToken storage
- `be-agent/src/lib/config.ts` — Add agentToken field to state schema

---

*This SRS/BRD synthesizes Phase 1 requirements from all four planning perspectives: product requirements (PM), business analysis (BA), technical architecture (Architect), and user experience (UX). All 11 items (S-1, S-2, S-3, S-7, S-8, S-9, S-13, S-16, S-17, S-24, S-33) are fully specified with acceptance criteria, TypeScript interfaces, API contracts, and implementation guidance.*
