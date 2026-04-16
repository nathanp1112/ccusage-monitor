# SRS/BRD Phase 4: ISMS Compliance

**Timeline**: Month 2-3
**Priority**: CRITICAL — Required for ISO 27001 certification
**Items**: S-4, S-12, S-18, S-20, S-21, S-22 (Should), S-25, S-28, A-20, P-29 (10 items)
**Note**: S-22 (non-repudiation) moved to "Should" per Decision #2 — implement if capacity allows, otherwise defer to Phase 6. Ed25519 payload signing (Architect's design) is defense-in-depth; JWT auth (Phase 1) + immutable audit logs (S-21) provide adequate provenance for ISO 27001.
**Estimated Effort**: 240–320 dev-hours (2–3 developers for 4–6 weeks)
**Dependencies**: Phase 1 (auth infrastructure for S-12, S-28), Phase 3 (RBAC for redaction/deletion tools, user management UI for erasure workflow)

---

## 1. Executive Summary

Phase 4 is the compliance-focused phase that addresses the formal requirements for ISMS (ISO 27001) certification. It covers data loss prevention for prompt content that may contain credentials or PII, the right to erasure for GDPR compliance, immutable audit logs that satisfy non-repudiation requirements, and network security controls (WAF, token revocation, secret rotation).

This phase is the "lock" to Phase 1's "door" — Phase 1 ensures only authorized users get in; Phase 4 ensures what happens inside is governed, auditable, and recoverable. Completing this phase positions the organization for a successful ISMS Stage 1 audit.

**Why this matters**: Prompt content routinely contains code with embedded credentials, database passwords, and API keys. Without DLP scanning, every developer sync is a potential data breach. Without right to erasure, the organization cannot comply with GDPR Article 17 or Vietnam's PDPD (Personal Data Protection Decree). Without immutable audit logs, no evidence chain exists for incident investigation.

**Audit readiness**: Completing Phase 4 satisfies an estimated 70–80% of ISO 27001 Annex A controls relevant to this system, saving 3–6 months of post-audit remediation.

---

## 2. Business Requirements

### 2.1 Problem Statement

The organization requires ISMS (Information Security Management System) certification. Several gaps exist:

- Prompt content may contain credentials or PII that is stored without scanning
- No mechanism exists to redact sensitive data after storage
- Sync logs can be modified or deleted (not tamper-proof)
- No proof of data provenance exists between developer machine and server
- No ability to comply with data subject access/erasure requests

These are not optional improvements — they are compliance requirements that block certification.

### 2.2 Stakeholder Analysis

| Stakeholder | Role | Interest Level | Impact |
|-------------|------|----------------|--------|
| Developers | Subject of DLP scanning and data erasure | LOW — Transparent unless their prompts are flagged | LOW — No workflow change |
| Engineering Managers | Health scorecard consumer; data erasure requester | MEDIUM | MEDIUM — New management metric |
| Security/Compliance Officers | **Primary beneficiary** — Every item maps to ISO 27001 controls | **CRITICAL** | **CRITICAL** — Audit readiness depends on this phase |
| System Administrators | Implement DLP, WAF, Object Lock, secret rotation | HIGH | **HIGH** — Significant infrastructure work |
| Finance/Budget Owners | WAF and Object Lock have AWS cost implications (~$15/month) | MEDIUM | MEDIUM |
| Legal/HR | Right to erasure has legal implications | HIGH | HIGH — Must be available for employee departure or data subject requests |

### 2.3 Business Value & ROI

**Quantifiable Benefits**:
- **Audit Readiness**: Satisfies 70–80% of relevant ISO 27001 Annex A controls. Saves $15,000–$30,000 in post-audit remediation (typical engagement fee) and 3–6 months of delay.
- **Data Breach Prevention**: S-4 (DLP) prevents storage of credentials. A single leaked API key could cost $10,000+ in unauthorized usage or breach notification costs.
- **Legal Compliance**: S-18/A-20 (right to erasure) is legally required under GDPR and Vietnam's PDPD. Non-compliance fines can reach 4% of annual revenue (GDPR) or VND 100 million (PDPD).
- **Security Posture**: S-25 (WAF) blocks an estimated 80–90% of automated attacks without custom configuration.
- **Non-repudiation**: S-22 provides an evidence chain from developer machine to stored data, critical for incident investigation.

**Investment**: ~240–320 dev-hours yielding an estimated avoidance of $50,000+ in audit remediation costs, legal exposure, and breach notification expenses.

### 2.4 Success Metrics

| KPI | Target | Measurement |
|-----|--------|-------------|
| DLP scanning coverage | 100% of prompts scanned at sync time | Scan log completeness |
| DLP detection rate | >95% of known secret patterns detected in test corpus | Run test prompts with embedded credentials, API keys, passwords |
| DLP false positive rate | <10% (tune iteratively) | Sample 1,000 stored prompts, verify flag accuracy |
| Erasure request fulfillment | <72 hours from request to completion | Erasure audit log |
| Erasure completeness | 100% of member data removed | Attempt to retrieve any data for erased member (expect 404 on all keys) |
| Log immutability | 0 successful modifications to Object Lock-protected logs | Attempt to overwrite or delete locked objects (expect access denied) |
| WAF coverage | All API endpoints behind WAF | AWS WAF dashboard |
| WAF block rate | >90% of automated/malicious requests blocked | Compare pre-WAF and post-WAF request patterns in CloudWatch |
| Token revocation latency | <5 minutes from revocation to enforcement | Revocation test |
| Secret rotation | JWT secret rotated at least quarterly with 0 service disruption | Monitor error rates during rotation window |
| Health scorecard coverage | Score computed for 100% of active members | Dashboard verification |

### 2.5 Compliance Mapping

#### ISO 27001 Controls Addressed

| Control | Standard | Requirement | Addressed By |
|---------|----------|-------------|-------------|
| A.8.2.3 | ISO 27001 | Handling of assets (data classification) | S-4 (DLP classifies prompt content) |
| A.10.1.1 | ISO 27001 | Policy on use of cryptographic controls | S-22 (payload signing), S-28 (secret rotation) |
| A.10.1.2 | ISO 27001 | Key management | S-28 (secret rotation via Secrets Manager) |
| A.12.4.2 | ISO 27001 | Protection of log information | S-21 (immutable sync logs via Object Lock) |
| A.12.4.3 | ISO 27001 | Administrator and operator logs | S-21 (immutable, extended retention) |
| A.13.1.1 | ISO 27001 | Network controls | S-25 (WAF protection) |
| A.18.1.4 | ISO 27001 | Privacy and protection of PII | S-4 (DLP), S-20 (redaction), S-18/A-20 (erasure) |

#### GDPR Controls Addressed

| Article | Requirement | Addressed By |
|---------|-------------|-------------|
| Article 5(1)(f) | Integrity and confidentiality | S-4, S-22, S-25 |
| Article 17 | Right to erasure | S-18, A-20 |
| Article 25 | Data protection by design | S-4 (DLP at ingest), S-20 (redaction capability) |
| Article 32 | Security of processing | S-25 (WAF), S-12 (token revocation), S-28 (secret rotation) |

#### SOC 2 Controls Addressed

| Criteria | Requirement | Addressed By |
|----------|-------------|-------------|
| CC6.6 | System boundaries | S-25 (WAF defines and protects system boundary) |
| CC6.7 | Restricting transmission | S-22 (signed payloads) |

---

## 3. Functional Requirements

### 3.1 User Stories with Acceptance Criteria

#### US-4.1: DLP Scanning on Prompts [S-4]

**As a** security officer,
**I want** all prompt content scanned for sensitive data patterns before storage,
**so that** credentials, API keys, and PII are detected and flagged before they become a data breach risk.

**Acceptance Criteria:**
- [ ] Pattern matching engine scans prompt text at POST /api/sync time (post-write, non-blocking — store first, scan second)
- [ ] Patterns detected: AWS access keys (AKIA prefix), JWT tokens (eyJ pattern), RSA/EC/OpenSSH private key blocks, GitHub personal/repo tokens (ghp_/ghs_ prefix), password assignments in common formats, email addresses, IP addresses, generic API key patterns
- [ ] Detection results stored as metadata alongside the prompt: `{ dlp_scan: { scanned_at, findings: [{ ruleId, ruleName, severity, category, matchOffset, matchLength, context }] } }`
- [ ] Prompts with `critical` severity findings are auto-redacted (matched text replaced with `[REDACTED:rule-id]`) during scan
- [ ] High-severity findings trigger an alert entry in `views/alerts.json`
- [ ] Scan does not add more than 100ms latency to the sync endpoint
- [ ] Admin can view all flagged prompts via a dedicated "DLP Findings" section in System Settings
- [ ] DLP patterns stored in S3 config (`config/dlp-rules.json`) for easy updates without redeployment

**Effort**: L
**MoSCoW**: Must

---

#### US-4.2: Token Revocation [S-12]

**As an** admin,
**I want** the ability to immediately revoke a user's JWT tokens,
**so that** compromised or stolen tokens are invalidated before their natural expiry.

**Acceptance Criteria:**
- [ ] Server-side token blocklist stored at S3 key `auth/revoked-tokens.json`
- [ ] All issued tokens include a `jti` (JWT ID) claim — a UUID unique per token
- [ ] POST /api/admin/tokens/revoke endpoint accepts `{ email, reason }` and adds all known active tokens for the user to the blocklist
- [ ] JWT middleware checks the blocklist after signature verification (cached in Lambda memory, 5-minute TTL)
- [ ] Revoked token returns 401 with `{ error: "token_revoked", code: "TOKEN_REVOKED" }`
- [ ] Agent handles `TOKEN_REVOKED` by clearing stored tokens and prompting re-authentication on next cycle
- [ ] Blocklist entries auto-expire when the original token would have expired (no unbounded growth)
- [ ] Aggregator prunes expired entries from the blocklist during hourly cycle
- [ ] Admin audit log records who revoked whose tokens and when

**Effort**: M
**MoSCoW**: Must

---

#### US-4.3: Right to Erasure [S-18, A-20]

**As a** developer (data subject),
**I want** the ability to request deletion of all my personal data from the system,
**so that** the organization complies with GDPR Article 17 and I can exercise my data rights.

**Acceptance Criteria:**
- [ ] `DELETE /api/admin/members/:id/data` endpoint (admin-only)
- [ ] Request body requires `{ confirmEmail, reason }` — `confirmEmail` must match the member's email (safety check)
- [ ] Deletes all data for the member across all S3 prefixes:
  - `raw/{memberId}/`
  - `aggregated/{memberId}/`
  - `prompts/{memberId}/`
  - `projects/{memberId}.json`
  - `sync-logs/*/{memberId}.json`
  - `commands/{memberId}/`
- [ ] Removes member from `members/index.json` registry
- [ ] Removes user account from user store (`auth/users.json`)
- [ ] Triggers re-aggregation of views (team totals must be recalculated without the deleted member)
- [ ] Creates an erasure audit log entry in the immutable audit bucket (retained for compliance even after data deletion)
- [ ] Returns a confirmation receipt with: member ID, data types deleted, file counts, timestamp, operator email
- [ ] For GDPR compliance with S3 versioning: deletion script iterates all object versions and delete markers, not just current versions
- [ ] Irreversible — no recovery mechanism after confirmation

**Effort**: L
**MoSCoW**: Must

---

#### US-4.4: Prompt Redaction [S-20]

**As an** admin,
**I want** the ability to redact specific content from stored prompts,
**so that** accidentally stored credentials or sensitive information can be removed without deleting the entire prompt record.

**Acceptance Criteria:**
- [ ] `POST /api/admin/prompts/redact` endpoint (admin-only)
- [ ] Request body: `{ memberId, year, month, promptUuid, redactionPattern?, reason }` — if `redactionPattern` is a regex, matches are replaced with `[REDACTED]`; if omitted, the entire prompt content is replaced with `[CONTENT REDACTED BY ADMIN]`
- [ ] Original content is permanently destroyed (overwritten in S3, not merely hidden)
- [ ] Redaction audit entry created: who redacted, what was redacted (metadata only — rule ID, category, byte offset — not original content), when, why
- [ ] Bulk redaction supported: redact all prompts matching a DLP finding pattern for a member/month
- [ ] Admin UI in System Settings: view flagged prompts from DLP, select, and redact with one click
- [ ] Redacted prompt records retain `redactedAt`, `redactedBy`, `redactionReason` fields

**Effort**: M
**MoSCoW**: Must

---

#### US-4.5: Immutable Sync Logs [S-21]

**As a** security officer,
**I want** sync logs to be immutable and retained for at least 12 months,
**so that** there is a tamper-proof record of all data submissions for audit purposes.

**Acceptance Criteria:**
- [ ] Dedicated S3 audit bucket (`ccusage-audit-${stage}`) created with Object Lock enabled at bucket creation
- [ ] Object Lock mode: GOVERNANCE (allows admin override with `s3:BypassGovernanceRetention`); can be escalated to COMPLIANCE after stabilization
- [ ] Default retention period: 7 years (configurable per compliance requirements)
- [ ] Sync logs written to audit bucket instead of main data bucket
- [ ] Sync log format includes: memberId, timestamp, hostname, IP, agent version, user agent, entry count, dedup count, S3 keys written, agent token JTI
- [ ] Lambda IAM role has `s3:PutObject` on audit bucket but NOT `s3:DeleteObject`
- [ ] Admin can query sync logs by member and date range via `GET /api/admin/sync-logs?memberId=&from=&to=`
- [ ] Audit bucket encrypted with SSE-KMS

**Effort**: M
**MoSCoW**: Must

---

#### US-4.6: Non-Repudiation for Submissions [S-22]

**As a** security officer,
**I want** cryptographic proof that sync data originated from a specific agent,
**so that** there is non-repudiation — a member cannot deny having submitted specific data.

**Acceptance Criteria:**
- [ ] Agent generates an Ed25519 key pair during `ccusage-agent setup`; private key stored at `~/.ccusage-agent/signing-key.pem`
- [ ] Agent registers public key with server via `POST /api/agent/register-key` (`{ publicKey: PEM, deviceId: SHA256(hostname+email) }`)
- [ ] Server stores public keys at `auth/agent-keys/{memberId}.json` with device ID, registration timestamp, last used timestamp
- [ ] Each sync request includes headers: `X-CCUsage-Signature` (Ed25519 signature over request body, base64-encoded) and `X-CCUsage-Device-Id`
- [ ] Server verifies signature against registered public key; invalid signatures return 403 `{ error: "Invalid signature", code: "SIGNATURE_INVALID" }`
- [ ] Signature verification result recorded in the sync log
- [ ] Rollout: verification is optional initially (agents without keys accepted with warning); becomes mandatory after full fleet update
- [ ] Key rotation: agent can generate new key pair and re-register; old key archived for historical verification
- [ ] Stale keys (no use in 90 days) pruned by aggregator

**Effort**: XL
**MoSCoW**: Should (implement if capacity allows; Decision #2 moved from Must)

**PM Note**: The core value (proof of origin) is partially achieved with existing JWT auth (Phase 1) + immutable sync logs (US-4.5). Full cryptographic non-repudiation adds defense-in-depth but is not strictly required for initial ISMS certification.

---

#### US-4.7: WAF Protection [S-25]

**As a** security officer,
**I want** AWS WAF deployed in front of the API Gateway,
**so that** the API is protected against common web attacks (SQLi, XSS, bot traffic) and oversized requests.

**Acceptance Criteria:**
- [ ] AWS WAF v2 WebACL associated with the API Gateway stage (REGIONAL scope)
- [ ] Managed rule groups enabled:
  - `AWSManagedRulesCommonRuleSet` (OWASP Top 10 — priority 1)
  - `AWSManagedRulesKnownBadInputsRuleSet` (priority 2)
- [ ] Rate-based rule: block IPs exceeding 2,000 requests per 5-minute window (priority 3)
- [ ] Request size limit rule: block requests with body > 10MB (matches API Gateway limit; priority 4)
- [ ] WAF logging enabled to S3 for incident investigation
- [ ] WAF metrics visible in CloudWatch (sampled requests enabled per rule)
- [ ] Deployment in "count" mode for first 2 weeks (log but don't block); switch to "block" mode after traffic validation
- [ ] Serverless Framework IaC includes WAF WebACL + association as CloudFormation resources

**Effort**: M
**MoSCoW**: Should

---

#### US-4.8: JWT Secret Rotation [S-28]

**As a** security officer,
**I want** the JWT signing secret stored in AWS Secrets Manager and rotated automatically,
**so that** a compromised secret can be recovered from and the blast radius of key compromise is limited.

**Acceptance Criteria:**
- [ ] JWT secret stored in AWS Secrets Manager at `ccusage/${stage}/jwt-secret` (64-character random string, no punctuation)
- [ ] Lambda reads the secret from Secrets Manager on cold start; cached in memory with 5-minute TTL
- [ ] `JWT_SECRET` environment variable removed from `serverless.yml`
- [ ] Dual-secret verification: Lambda fetches both `AWSCURRENT` and `AWSPREVIOUS` versions; tries current secret first, falls back to previous (grace period during rotation)
- [ ] Rotation schedule: every 90 days (configurable via Secrets Manager rotation schedule)
- [ ] During rotation, tokens signed with the old secret continue to work for their remaining lifetime (up to 90 days for agent tokens)
- [ ] New tokens are always signed with the current (newest) secret
- [ ] IAM policy grants Lambda `secretsmanager:GetSecretValue` on `ccusage/${stage}/*` path

**Effort**: M
**MoSCoW**: Should

---

#### US-4.9: GDPR Right to Erasure UI [A-20]

**As an** admin,
**I want** a user-friendly interface to process data erasure requests,
**so that** I can fulfill GDPR Article 17 requests efficiently and with proper documentation.

**Acceptance Criteria:**
- [ ] "Data Management" section in the admin Settings page (System tab)
- [ ] Erasure request flow: select member from dropdown, confirm scope (all data), provide justification
- [ ] Preview step: show what data will be deleted (file counts, size estimates, date range) before confirmation
- [ ] Two-step confirmation: admin must type the member's email to proceed
- [ ] Progress indicator during deletion (may take 10–60 seconds for large accounts)
- [ ] Completion receipt displayed and downloadable as PDF: includes member ID, data types deleted, timestamp, operator email
- [ ] Erasure history log visible to admins (who requested, when, what was deleted) — stored in audit bucket

**Effort**: M
**MoSCoW**: Should

**Note**: This is the UI for US-4.3 (backend endpoint). Can be developed in parallel by a separate developer.

---

#### US-4.10: Team Health Scorecard [P-29]

**As an** engineering manager,
**I want** a composite team health score (0–100) based on AI usage effectiveness metrics,
**so that** I can track overall team productivity with AI tools and identify areas for improvement in a single metric.

**Acceptance Criteria:**
- [ ] Score composed of 5 equally-weighted sub-scores (20% each):
  - Adoption (20%): 100 if >90% members active this month, linear scale down
  - Cache Efficiency (20%): 100 if team cache hit rate >70%, linear scale down
  - Cost Control (20%): 100 if cost is flat or decreasing month-over-month
  - Model Selection (20%): 100 if <20% of requests use premium models for simple tasks (output <2K tokens)
  - Sync Health (20%): 100 if all agents synced in last 24 hours, linear scale down
- [ ] Score displayed as a circular gauge (0–100) on the Dashboard page
- [ ] Color coding: green (70–100), yellow (40–69), red (0–39)
- [ ] Monthly trend line showing score evolution over the last 6 months
- [ ] Sub-score breakdown visible on hover or click, each with a `details` string explaining the score
- [ ] Aggregator computes and stores in `views/dashboard.json` as `healthScorecard`
- [ ] Benchmarks: initial benchmarks based on first month data; adjusted quarterly by admin

**Effort**: M
**MoSCoW**: Could

### 3.2 DLP Scanning Specification (S-4)

#### DLP Scanner Module: `src/lib/dlp-scanner.ts`

```typescript
interface DLPRule {
  id: string;
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: 'credential' | 'pii' | 'secret' | 'internal';
}

const DLP_RULES: DLPRule[] = [
  { id: 'aws-key',       name: 'AWS Access Key',          pattern: /AKIA[0-9A-Z]{16}/, severity: 'critical', category: 'credential' },
  { id: 'aws-secret',    name: 'AWS Secret Key',           pattern: /[A-Za-z0-9\/+=]{40}/, severity: 'critical', category: 'credential' },
  { id: 'jwt-token',     name: 'JWT Token',                pattern: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/, severity: 'high', category: 'secret' },
  { id: 'private-key',   name: 'Private Key Block',        pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/, severity: 'critical', category: 'credential' },
  { id: 'github-token',  name: 'GitHub Token',             pattern: /gh[ps]_[A-Za-z0-9_]{36,}/, severity: 'critical', category: 'credential' },
  { id: 'password-var',  name: 'Password Assignment',      pattern: /password\s*[:=]\s*['"][^'"]{4,}['"]/, severity: 'high', category: 'secret' },
  { id: 'email-addr',    name: 'Email Address',            pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, severity: 'low', category: 'pii' },
  { id: 'ip-address',    name: 'IP Address',               pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, severity: 'low', category: 'pii' },
  { id: 'api-key-gen',   name: 'Generic API Key',          pattern: /api[_-]?key\s*[:=]\s*['"][A-Za-z0-9_-]{16,}['"]/, severity: 'high', category: 'secret' },
];

interface DLPFinding {
  ruleId: string;
  ruleName: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  matchOffset: number;    // character offset in content
  matchLength: number;
  context: string;        // surrounding 20 chars with match replaced by [REDACTED]
}

function scanPrompt(content: string): DLPFinding[] {
  const findings: DLPFinding[] = [];
  for (const rule of DLP_RULES) {
    const matches = content.matchAll(new RegExp(rule.pattern, 'g'));
    for (const match of matches) {
      findings.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        category: rule.category,
        matchOffset: match.index!,
        matchLength: match[0].length,
        context: `...${content.slice(Math.max(0, match.index! - 10), match.index!)}[REDACTED]${content.slice(match.index! + match[0].length, match.index! + match[0].length + 10)}...`,
      });
    }
  }
  return findings;
}
```

#### Extended Prompt Record Schema

```typescript
interface PromptRecordWithDLP extends PromptRecord {
  dlpFindings: DLPFinding[];    // empty array if no findings
  dlpScannedAt: string;         // ISO timestamp
  autoRedacted: boolean;        // true if critical findings were auto-redacted
}
```

#### Scanning Pipeline (Post-Write, Non-Blocking)

1. Sync endpoint stores prompts to S3 (no latency impact to sync response)
2. DLP scanner runs on received prompt text
3. If `critical` findings: auto-redact matched text, store redacted version back to S3
4. Store DLP findings as metadata in the prompt record
5. If critical findings: append alert to `views/alerts.json`
6. Log DLP scan results to audit trail

**Performance constraint**: Maximum 10KB content scanned per prompt; prompts exceeding limit are stored as-is with a `dlp_skipped: true` flag and a warning. Total DLP overhead: ~5ms per prompt, ~2.5 seconds for a 500-prompt batch (within 29-second Lambda timeout).

### 3.3 Token Revocation (S-12)

#### Blocklist Schema

```typescript
// S3 key: auth/revoked-tokens.json
interface TokenBlocklist {
  version: 1;
  lastUpdated: string;
  tokens: Array<{
    jti: string;        // JWT ID claim
    revokedAt: string;
    revokedBy: string;  // admin email
    reason: string;
    expiresAt: string;  // original token expiry, used for cleanup
  }>;
}
```

#### Token Claim Addition

All issued tokens receive a `jti` (JWT ID) claim:

```typescript
const tokenPayload = {
  sub: memberId,
  email,
  role,
  type: 'access' | 'refresh' | 'agent',
  jti: crypto.randomUUID(),  // unique token identifier
  iat: now,
  exp: expiry,
};
```

#### Revocation Check in Auth Middleware

```
Request with Bearer token
  |
  v
[Verify JWT signature] --fail--> 401
  |
  v
[Load blocklist from memory cache (5-min TTL)]
  |
  v
[Check if token.jti in blocklist] --revoked--> 401 { error: "token_revoked" }
  |
  v
[Check role/permissions] --forbidden--> 403
  |
  v
[Route handler]
```

#### Revocation Endpoint

```
POST /api/admin/tokens/revoke
```

```typescript
interface RevokeTokenRequest {
  email: string;   // revoke all tokens for this user
  reason: string;
}

// Side effects:
// 1. Add all known token JTIs for user to blocklist
// 2. Send 'revoke-token' admin command to agent
// 3. Invalidate in-memory user cache
```

### 3.4 Right to Erasure / Data Deletion (S-18, A-20)

#### Deletion Endpoint

```
DELETE /api/admin/members/:id/data
```

```typescript
interface DataDeletionRequest {
  confirmEmail: string;  // must match member's email (safety check)
  reason: string;        // audit trail
}

interface DataDeletionResponse {
  success: true;
  deletedKeys: string[];        // list of S3 keys deleted
  deletedVersionCount: number;  // total object versions removed
  viewsRegenerated: boolean;
  auditEntryId: string;         // reference to immutable erasure audit record
}
```

#### Deletion Process (Sequential)

```
Admin confirms deletion (types member email to confirm)
  |
  v
[Validate: member exists, email matches]
  |
  v
[Delete S3 keys — all versions due to S3 versioning]:
  1. raw/{memberId}/*
  2. aggregated/{memberId}/*
  3. prompts/{memberId}/*
  4. projects/{memberId}.json
  5. commands/{memberId}/*
  6. Scan sync-logs/*/{memberId}.json and delete matching files
  |
  v
[Update members/index.json: remove member entry]
  |
  v
[Remove from auth/users.json user store]
  |
  v
[Trigger aggregator to regenerate views (without deleted member)]
  |
  v
[Write immutable erasure audit log entry to audit bucket]
  |
  v
[Return confirmation receipt with deleted key list]
```

#### S3 Versioning — Permanent Deletion

```typescript
async function permanentlyDelete(bucket: string, key: string) {
  const versions = await s3.listObjectVersions({ Bucket: bucket, Prefix: key });
  for (const version of versions.Versions || []) {
    await s3.deleteObject({ Bucket: bucket, Key: key, VersionId: version.VersionId });
  }
  for (const marker of versions.DeleteMarkers || []) {
    await s3.deleteObject({ Bucket: bucket, Key: key, VersionId: marker.VersionId });
  }
}
```

**IAM addition required**: `s3:ListBucketVersions`, `s3:DeleteObjectVersion`

### 3.5 Prompt Redaction (S-20)

#### Redaction Endpoint

```
POST /api/admin/prompts/redact
```

```typescript
interface RedactPromptRequest {
  memberId: string;
  year: number;
  month: number;
  promptUuid: string;        // specific prompt to redact
  redactionPattern?: string; // regex; if omitted, redacts entire content
  reason: string;
}

interface RedactPromptResponse {
  success: true;
  redactedContent: string;   // content after redaction (for preview)
  findingsRedacted: number;  // count of pattern matches replaced
}
```

#### Redaction Process

1. Load `prompts/{memberId}/{year}-{month}.json`
2. Find prompt by UUID
3. If `redactionPattern` provided: replace regex matches with `[REDACTED]`
4. If no pattern: replace entire content with `[CONTENT REDACTED BY ADMIN]`
5. Add `redactedAt`, `redactedBy`, `redactionReason` fields to the prompt record
6. Write back to S3 (overwrites original — destruction is intentional)
7. Write audit log entry: redactor email, prompt UUID, redaction type, reason, timestamp (original content NOT logged)

### 3.6 Immutable Audit Logs (S-21)

#### Audit Bucket CloudFormation (serverless.yml)

```yaml
AuditBucket:
  Type: AWS::S3::Bucket
  Properties:
    BucketName: ccusage-audit-${self:provider.stage}
    ObjectLockEnabled: true
    ObjectLockConfiguration:
      ObjectLockEnabled: Enabled
      Rule:
        DefaultRetention:
          Mode: GOVERNANCE
          Years: 7
    BucketEncryption:
      ServerSideEncryptionConfiguration:
        - ServerSideEncryptionByDefault:
            SSEAlgorithm: aws:kms
          BucketKeyEnabled: true
    PublicAccessBlockConfiguration:
      BlockPublicAcls: true
      BlockPublicPolicy: true
      IgnorePublicAcls: true
      RestrictPublicBuckets: true
```

**Mode choice**: GOVERNANCE (not COMPLIANCE) for initial rollout. GOVERNANCE allows admins with `s3:BypassGovernanceRetention` to override if needed (e.g., to correct a mistaken log entry). COMPLIANCE mode can be enabled after stabilization — at that point even the root account cannot delete objects.

**New environment variable**: `AUDIT_BUCKET_NAME: ccusage-audit-${self:provider.stage}`

**IAM**: Lambda has `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` on audit bucket. No `s3:DeleteObject`.

### 3.7 Non-Repudiation (S-22 — Should)

#### Key Pair Generation (Agent Side)

During `ccusage-agent setup`:

```typescript
// In be-agent/src/commands/setup.ts
import { generateKeyPairSync } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

// Store private key
await fs.writeFile(path.join(CONFIG_DIR, 'signing-key.pem'), privateKey, { mode: 0o600 });

// Register public key with server
await fetch(`${serverUrl}/api/agent/register-key`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${agentToken}` },
  body: JSON.stringify({
    publicKey,
    deviceId: createHash('sha256').update(`${hostname}:${email}`).digest('hex'),
  }),
});
```

#### Payload Signing (Agent Side)

```typescript
// In be-agent/src/lib/pusher.ts
import { sign } from 'node:crypto';

const bodyString = JSON.stringify(syncPayload);
const privateKey = await fs.readFile(path.join(CONFIG_DIR, 'signing-key.pem'), 'utf8');
const signature = sign('sha256', Buffer.from(bodyString), privateKey).toString('base64');

headers['X-CCUsage-Signature'] = signature;
headers['X-CCUsage-Device-Id'] = deviceId;
```

#### Server Verification Schema

```typescript
// S3 key: auth/agent-keys/{memberId}.json
interface AgentKeys {
  memberId: string;
  keys: Array<{
    deviceId: string;
    publicKey: string;   // PEM-encoded Ed25519 public key
    registeredAt: string;
    lastUsed: string;
  }>;
}
```

#### New Endpoint

```
POST /api/agent/register-key
```

```typescript
interface RegisterKeyRequest {
  publicKey: string;   // PEM-encoded Ed25519 public key
  deviceId: string;    // SHA-256 of hostname:email
}
```

### 3.8 WAF Protection (S-25)

#### WAF CloudFormation (serverless.yml)

```yaml
ApiWAF:
  Type: AWS::WAFv2::WebACL
  Properties:
    Name: ccusage-api-waf-${self:provider.stage}
    Scope: REGIONAL
    DefaultAction:
      Allow: {}
    Rules:
      - Name: AWSManagedRulesCommonRuleSet
        Priority: 1
        Statement:
          ManagedRuleGroupStatement:
            VendorName: AWS
            Name: AWSManagedRulesCommonRuleSet
        OverrideAction:
          None: {}
        VisibilityConfig:
          SampledRequestsEnabled: true
          CloudWatchMetricsEnabled: true
          MetricName: CommonRuleSetMetric

      - Name: AWSManagedRulesKnownBadInputsRuleSet
        Priority: 2
        Statement:
          ManagedRuleGroupStatement:
            VendorName: AWS
            Name: AWSManagedRulesKnownBadInputsRuleSet
        OverrideAction:
          None: {}
        VisibilityConfig:
          SampledRequestsEnabled: true
          CloudWatchMetricsEnabled: true
          MetricName: KnownBadInputsMetric

      - Name: RateLimit
        Priority: 3
        Statement:
          RateBasedStatement:
            Limit: 2000
            AggregateKeyType: IP
        Action:
          Block: {}
        VisibilityConfig:
          SampledRequestsEnabled: true
          CloudWatchMetricsEnabled: true
          MetricName: RateLimitMetric

      - Name: RequestSizeLimit
        Priority: 4
        Statement:
          SizeConstraintStatement:
            FieldToMatch:
              Body: {}
            ComparisonOperator: GT
            Size: 10485760
            TextTransformations:
              - Priority: 0
                Type: NONE
        Action:
          Block: {}
        VisibilityConfig:
          SampledRequestsEnabled: true
          CloudWatchMetricsEnabled: true
          MetricName: RequestSizeLimitMetric

    VisibilityConfig:
      SampledRequestsEnabled: true
      CloudWatchMetricsEnabled: true
      MetricName: ccusage-api-waf

ApiWAFAssociation:
  Type: AWS::WAFv2::WebACLAssociation
  Properties:
    ResourceArn: !Sub "arn:aws:apigateway:${AWS::Region}::/restapis/${HttpApi}/stages/$default"
    WebACLArn: !GetAtt ApiWAF.Arn
```

**Cost estimate**: ~$5/month per WebACL + $4/month for 4 rule groups + ~$3/month for 500M requests = ~$12/month.

### 3.9 JWT Secret Rotation (S-28)

#### Secrets Manager Configuration

```yaml
JWTSecret:
  Type: AWS::SecretsManager::Secret
  Properties:
    Name: ccusage/${self:provider.stage}/jwt-secret
    Description: JWT signing secret for CCUsage Monitor
    GenerateSecretString:
      PasswordLength: 64
      ExcludePunctuation: true
```

#### Dual-Secret Verification

```typescript
async function verifyToken(token: string): Promise<JWTPayload | null> {
  const secrets = await getJWTSecrets();  // returns [current, previous]
  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret) as JWTPayload;
    } catch {
      continue;
    }
  }
  return null;
}

async function getJWTSecrets(): Promise<string[]> {
  const secret = await secretsManager.getSecretValue({
    SecretId: `ccusage/${stage}/jwt-secret`,
  });
  const current = secret.SecretString!;
  try {
    const previous = await secretsManager.getSecretValue({
      SecretId: `ccusage/${stage}/jwt-secret`,
      VersionStage: 'AWSPREVIOUS',
    });
    return [current, previous.SecretString!];
  } catch {
    return [current];
  }
}
```

#### IAM

```yaml
- Effect: Allow
  Action:
    - secretsmanager:GetSecretValue
  Resource:
    - arn:aws:secretsmanager:${self:provider.region}:*:secret:ccusage/${self:provider.stage}/*
```

### 3.10 API Specifications

#### New Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/admin/tokens/revoke` | admin | Revoke all tokens for a user |
| `DELETE` | `/api/admin/members/:id/data` | admin | GDPR right to erasure — purge all member data |
| `POST` | `/api/admin/prompts/redact` | admin | Redact content from stored prompts |
| `GET` | `/api/admin/sync-logs` | admin | Query immutable sync logs (`?memberId=&from=&to=`) |
| `POST` | `/api/agent/register-key` | agent | Register Ed25519 public key for non-repudiation |
| `GET` | `/api/dashboard` | admin, member | Extended with `healthScorecard` field |

#### TypeScript Interfaces — Extended View Schemas

```typescript
// Added to views/dashboard.json
interface HealthScorecard {
  overallScore: number;    // 0-100
  lastUpdated: string;
  dimensions: {
    adoption:         { score: number; details: string };
    cacheEfficiency:  { score: number; details: string };
    costControl:      { score: number; details: string };
    modelSelection:   { score: number; details: string };
    syncHealth:       { score: number; details: string };
  };
}

// Added to views/alerts.json (created in Phase 3)
interface DLPAlert {
  id: string;
  type: 'dlp_finding';
  severity: 'critical' | 'high';
  memberId: string;
  memberName: string;
  promptUuid: string;
  ruleId: string;
  ruleName: string;
  category: string;
  detectedAt: string;
  autoRedacted: boolean;
}
```

### 3.11 Data Model Changes

#### New S3 Keys

| Key | Purpose | Written By |
|-----|---------|------------|
| `auth/revoked-tokens.json` | Token revocation blocklist | Admin token revoke endpoint |
| `auth/agent-keys/{memberId}.json` | Ed25519 public keys per member | Agent key registration endpoint |
| `config/dlp-rules.json` | DLP pattern rules (overrides default) | Admin (optional, for updates without redeploy) |
| Audit bucket: `sync-logs/{year}-{month}/{memberId}.json` | Immutable sync logs | Sync endpoint |
| Audit bucket: `erasure-log/{timestamp}-{memberId}.json` | GDPR erasure receipts | Data deletion endpoint |
| Audit bucket: `redaction-log/{year}-{month}.json` | Prompt redaction audit trail | Prompt redaction endpoint |

---

## 4. Non-Functional Requirements

### 4.1 Security

| Requirement | Target |
|-------------|--------|
| DLP scanning latency | <100ms per sync request |
| Token revocation propagation | <5 minutes from revocation to enforcement (cache TTL) |
| Object Lock integrity | 0 modifications possible (GOVERNANCE mode; COMPLIANCE after stabilization) |
| WAF false positive rate | <1% of legitimate traffic blocked |
| Secret rotation disruption | 0 service errors during JWT secret rotation |
| Data erasure completeness | 100% of data removed including all S3 object versions |

### 4.2 Performance (DLP Scanning Latency Impact)

DLP scanning is designed as a post-write, non-blocking operation. Scanning does not add to the sync endpoint's response time. Performance considerations:

| Change | Sync Endpoint Impact | Notes |
|--------|---------------------|-------|
| DLP scanning | +0ms (async post-write) | Scan runs after HTTP response is returned |
| Auto-redaction (critical findings) | +30ms (S3 write-back) | Rare; only for critical severity |
| Token revocation check | +1ms (in-memory cache) | Negligible |
| Secrets Manager cold start | +100ms first invocation | Cached; subsequent calls: +0ms |

### 4.3 Data Integrity (Object Lock Guarantees)

- S3 Object Lock in GOVERNANCE mode prevents accidental deletion or modification
- Encryption: SSE-KMS ensures data at rest is encrypted with a customer-managed key
- Versioning on main data bucket ensures GDPR erasure can remove all versions
- Audit bucket has NO versioning (Object Lock makes versioning unnecessary — once written, the object is immutable)

---

## 5. UX Requirements

### 5.1 Team Health Scorecard (P-29)

Location: Dashboard page, added below the existing StatsGrid.

```
+-- Team Health Scorecard ------------------------------+
|                                                        |
| Team Health Score                                      |
|                                                        |
|              [ 73 ]                                    |
|        (circular gauge)                                |
|          out of 100                                    |
|                                                        |
| +----------------------------------------------------+ |
| | Category        Score  Status                       | |
| |-----------------------------------------------------| |
| | Adoption         80   [====----]  Good              | |
| | Cache Efficiency  65   [===-----]  Needs Work       | |
| | Cost Efficiency   72   [====----]  Good              | |
| | Model Selection   70   [===-----]  Fair              | |
| | Consistency       78   [====----]  Good              | |
| +----------------------------------------------------+ |
|                                                        |
| Trend: +5 pts vs last month                            |
+--------------------------------------------------------+
```

**Score composition**:

| Category | Weight | Metric | 100-point calculation |
|----------|--------|--------|----------------------|
| Adoption | 20% | % of members active this month | 100 if >90%, linear scale |
| Cache Efficiency | 20% | Team average cache hit rate | 100 if >70% cache rate, linear scale |
| Cost Control | 20% | Month-over-month cost direction | 100 if flat/decreasing |
| Model Selection | 20% | % requests using appropriate tier | 100 if <20% premium for simple tasks |
| Sync Health | 20% | % agents synced in last 24h | 100 if all online, linear scale |

**Chart type**: Custom SVG circular gauge (speedometer style). Each category shown as a horizontal progress bar with green/amber/red color coding.

**Components**:
- `TeamHealthScorecard` — `components/dashboard/team-health-scorecard.tsx`
- `CircularGauge` — `components/shared/circular-gauge.tsx` (reusable, props: `value`, `max`, `size`, `colorStops`)

### 5.2 System Settings Tab (`/settings?tab=system`)

Location: Settings page, "System" tab. Admin-only.

```
+------------------------------------------------------+
| Settings > System                                     |
+------------------------------------------------------+
| [Users] [Security] [System*]                          |
+------------------------------------------------------+
|                                                       |
| SYSTEM HEALTH                                         |
| +---------------------------------------------------+|
| | S3 Connectivity:    [OK]    Last check: 2m ago    ||
| | Last Aggregation:   [OK]    2 hours ago           ||
| | Lambda Memory:      [OK]    128MB / 256MB         ||
| | Stale Members:      [WARN]  2 members > 24h      ||
| +---------------------------------------------------+|
|                                                       |
| DATA MANAGEMENT                                       |
| +---------------------------------------------------+|
| | [Trigger Aggregation]  [Force Full Rebuild]        ||
| |                                                    ||
| | Data Retention Policy:                             ||
| | Raw data:    90 days    [Edit]                     ||
| | Sync logs:   90 days    [Edit]                     ||
| | Prompts:     30 days    [Edit]                     ||
| +---------------------------------------------------+|
|                                                       |
| ADMIN TOOLS                                           |
| +---------------------------------------------------+|
| | Data Erasure (GDPR)                                ||
| | Member: [Select... v]    [Start Erasure Process]   ||
| |                                                    ||
| | Erasure History:                                   ||
| | alice@tvf (Feb 28) - completed  [Receipt PDF]      ||
| +---------------------------------------------------+|
|                                                       |
+------------------------------------------------------+
```

**Components**:
- `SystemHealthTab` — `components/settings/system-health-tab.tsx`
- `HealthCheckList` — `components/settings/health-check-list.tsx` (`checks: HealthCheck[]`)
- `DataRetentionConfig` — `components/settings/data-retention-config.tsx` (`policies: RetentionPolicy[]`)

### 5.3 Prompt Redaction Admin Tool

Embedded within the System Settings tab or as a dedicated "Security" tab.

```
+-- Prompt Redaction Tool ------------------------------+
|                                                        |
| PROMPT REDACTION                                       |
| Search member prompts for sensitive content            |
|                                                        |
| Member: [alice@tvf.co.jp  v]  Month: [Feb 2026  v]   |
| Search: [_______________]     [Search Prompts]         |
|                                                        |
| DLP FINDINGS (3 results):                              |
| +----------------------------------------------------+ |
| | [CRITICAL] AWS Access Key — Feb 28 10:15 AM        | |
| | "...config where AKIA4EXAMPLE... needs to be..."   | |
| |                      [View Full] [Redact] [Ignore] | |
| |----------------------------------------------------| |
| | [HIGH] Password Assignment — Feb 27 3:22 PM        | |
| | "...the password='[REDACTED]' in the config..."    | |  <-- auto-redacted
| |                                     [Auto-redacted] | |
| |----------------------------------------------------| |
| | [HIGH] GitHub Token — Feb 25 11:48 AM              | |
| | "...token ghp_EXAMPLE... should be rotated..."     | |
| |                      [View Full] [Redact] [Ignore] | |
| +----------------------------------------------------+ |
|                                                        |
| Redact selected: [Redact All Critical] [Redact Selected]|
+--------------------------------------------------------+
```

**Component**: `PromptRedactionTool` — `components/settings/prompt-redaction-tool.tsx`

---

## 6. Technical Architecture

### 6.1 DLP Pipeline Design

```
POST /api/sync
  |
  v
[Receive entries, prompts, projects]
  |
  v
[Store entries to S3 (raw/, aggregated/)] ← synchronous, on the critical path
  |
  v
[Store prompts to S3 (prompts/)]           ← synchronous
  |
  v
[HTTP 200 response returned to agent]
  |                                          ← agent receives response, DLP runs after
  v
[DLP scanner: scan each prompt content]     ← post-response, non-blocking
  |
  +-[critical findings] ──> [auto-redact content, write back to S3]
  |
  +-[any findings] ──────> [write dlpFindings metadata to prompt record]
  |
  +-[critical/high] ─────> [append alert to views/alerts.json]
  |
  v
[Audit log: DLP scan summary]
```

### 6.2 Object Lock Bucket Setup

The audit bucket must be created with Object Lock enabled **at bucket creation** — this cannot be retrofitted on an existing bucket.

New environment variable: `AUDIT_BUCKET_NAME`

Migration: Existing sync logs in the main data bucket remain in place. New sync logs are written to the audit bucket. Historical sync logs (pre-Phase 4) are not migrated (acceptable per compliance — Object Lock applies from the date of setup forward).

### 6.3 WAF Configuration

**Rollout strategy**:

1. Week 1: Deploy WAF in COUNT mode (all rules log but do not block). Monitor CloudWatch for false positives.
2. Week 2: Review logged traffic. Identify any legitimate requests that would be blocked.
3. Week 3: Switch to BLOCK mode after confirming no legitimate traffic affected.
4. Optional: Add geo-restriction rule to allow only Vietnam + office IP ranges (configurable, off by default).

### 6.4 Secret Rotation Mechanism

```
Normal operation:
  Lambda reads AWSCURRENT version of jwt-secret
  Tokens signed with current secret
  Verified against current secret only

During rotation:
  AWS Secrets Manager rotates the secret (generates new value)
  AWSPREVIOUS = old secret, AWSCURRENT = new secret
  Lambda tries current first, falls back to previous
  Tokens signed with old secret still work during grace period (up to 90 days for agent tokens)

After rotation:
  Old tokens gradually expire (max 90 days for agent tokens)
  AWSPREVIOUS eventually expires in Secrets Manager
  Lambda only has AWSCURRENT
```

### 6.5 Infrastructure Changes (New AWS Resources)

| Resource | Purpose | Cost Estimate |
|----------|---------|---------------|
| `ccusage-audit-${stage}` S3 bucket | Immutable audit logs (Object Lock) | ~$2/month (storage) |
| AWS WAF v2 WebACL | API protection | ~$12/month |
| AWS Secrets Manager secret | JWT secret rotation | ~$0.40/month |
| **Total new cost** | | **~$15/month** |

#### serverless.yml Summary of Changes

- Add `AuditBucket` S3 resource with Object Lock (GOVERNANCE, 7 years)
- Add `ApiWAF` WebACL resource + `ApiWAFAssociation`
- Add `JWTSecret` Secrets Manager resource
- Add IAM: `secretsmanager:GetSecretValue`, `s3:PutObject`/`GetObject`/`ListBucket` on audit bucket, `s3:ListBucketVersions`/`DeleteObjectVersion` on main bucket
- Remove `JWT_SECRET` environment variable
- Add `AUDIT_BUCKET_NAME` environment variable

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Type | Phase |
|------------|------|-------|
| JWT authentication infrastructure (S-1) | Hard | Phase 1 |
| Token revocation (S-12) requires `jti` claim added to tokens | Hard | Phase 1 (token format) |
| JWT secret rotation (S-28) requires JWT infrastructure | Hard | Phase 1 |
| Data retention policies (S-6) must be in place before immutable logs (S-21) | Hard | Phase 3 |
| User management UI (A-15) should be in place before erasure UI (A-20) | Soft | Phase 3 |
| Health scorecard (P-29) requires Phase 2 metrics (P-1 cost, P-2 cache, P-19 adoption) | Hard | Phase 2 |
| Prompt redaction and DLP UI requires RBAC (S-10) | Hard | Phase 3 |

### 7.2 Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| DLP false positives block legitimate prompts | HIGH | MEDIUM | Post-write scan (non-blocking). Alert but do not reject sync data. Admin review queue for flagged content. |
| DLP scanning increases sync latency | MEDIUM | LOW | Post-write async scan — sync response is not blocked by DLP. |
| Object Lock prevents data correction | MEDIUM | HIGH | Use GOVERNANCE mode (allows admin override). Compliance mode after stabilization. |
| Non-repudiation key management complexity | HIGH | MEDIUM | S-22 is "Should" — defer if capacity is insufficient. HMAC could replace Ed25519 for simpler implementation. |
| WAF blocks legitimate traffic from developer networks | MEDIUM | HIGH | Start in COUNT mode for 2 weeks. Never block without traffic validation period. |
| Right to erasure incomplete (orphaned data) | MEDIUM | HIGH | Pre-erasure audit lists all S3 keys for member. Admin reviews list before confirming. |
| JWT secret rotation causes service disruption | LOW | HIGH | Dual-validation grace period. Test rotation in dev stage first. Monitor error rates during production rotation. |
| Permanent deletion with S3 versioning misses some versions | MEDIUM | HIGH | Pagination: iterate all pages of `ListObjectVersions`. Test on staging with version-heavy objects. |

---

## 8. Implementation Plan

```
Month 2, Week 3:
  1. [S-25] WAF configuration + IaC deployment (4h, standalone)
  2. [S-28] Secrets Manager setup + dual-secret verification in auth middleware (6h, standalone)
  3. [S-4]  DLP scanner module + integration with sync endpoint (8h)

  Parallelizable: #1, #2, #3 are independent

Month 2, Week 4:
  4. [S-12] Token revocation: add jti claim + blocklist + admin endpoint (6h)
  5. [S-20] Prompt redaction endpoint + admin UI integration (4h)
  6. [S-21] Audit bucket with Object Lock + update log write paths (6h)

  Parallelizable: #4, #5, #6 are independent

Month 3, Week 1:
  7. [S-18, A-20] Data deletion endpoint + GDPR erasure UI (8h)
  8. [S-22] Non-repudiation: agent key pair + payload signing (8h, agent + server)

  Note: #8 requires agent update deployment (be-agent v0.6.0)

Month 3, Week 2:
  9. [P-29] Health scorecard computation + CircularGauge dashboard widget (5h)
  10. Integration testing + compliance checklist verification (6h)
  11. WAF: switch from COUNT to BLOCK mode after traffic validation (1h)
```

---

## 9. Acceptance Criteria & Test Strategy

### Acceptance Criteria Summary

| Story | Primary Acceptance Test |
|-------|------------------------|
| US-4.1 DLP | Sync 100 test prompts with known credentials; verify >95% detected and flagged |
| US-4.2 Token revocation | Revoke a token; next request with that token returns 401 within 5 minutes |
| US-4.3 Right to erasure | Delete a member; verify GET requests for all their S3 keys return 404 |
| US-4.4 Prompt redaction | Redact a specific prompt; verify redacted content is permanently replaced |
| US-4.5 Immutable logs | Attempt to delete or overwrite an Object Lock–protected sync log; expect AccessDenied |
| US-4.6 Non-repudiation | Submit sync with invalid signature; server rejects with 403 SIGNATURE_INVALID |
| US-4.7 WAF | Run automated OWASP test suite against API; verify attack payloads are blocked |
| US-4.8 JWT rotation | Rotate secret via Secrets Manager; verify existing tokens still work during grace period |
| US-4.9 Erasure UI | Admin completes erasure workflow end-to-end; download PDF receipt |
| US-4.10 Scorecard | Aggregate runs; verify scorecard dimensions are computed for all active members |

### Test Strategy

| Type | Coverage | Notes |
|------|----------|-------|
| Unit tests | DLP scanner regex accuracy (test corpus with 50+ known patterns) | Golden test file |
| Unit tests | Token revocation middleware | Verify revoked JTI returns 401 |
| Integration tests | Data deletion completeness (with S3 versioning) | Verify all versions removed |
| Integration tests | Object Lock enforcement | Expect `AccessDenied` on delete attempts |
| Security tests | WAF rule effectiveness | OWASP ZAP automated scan |
| Performance tests | DLP scan latency | 500-prompt batch within 5s |
| Compliance tests | GDPR erasure audit trail | Verify audit log entry persists after data deletion |

---

## 10. References

- Decision Log, Decision #2: S-22 (Non-repudiation) moved to "Should"
- Decision Log, Conflict #2: Separate S3 audit bucket with Object Lock (Architect's design adopted)
- PRD Draft: Phase 4 (US-4.1–US-4.10), `grooming-artifacts/planning-artifacts/prd-draft.md`
- Business Analysis: Phase 4 (Section 5), `grooming-artifacts/planning-artifacts/analysis.md`
- Architecture: Phase 4, `grooming-artifacts/planning-artifacts/architecture.md`
- UX Design: Phase 4 (Section 8), `grooming-artifacts/planning-artifacts/ux-design.md`
- ISO 27001:2022 Annex A controls: A.8.2.3, A.10.1.1, A.10.1.2, A.12.4.2, A.12.4.3, A.13.1.1, A.18.1.4
- GDPR Articles 5(1)(f), 17, 25, 32
- SOC 2 Trust Service Criteria: CC6.6, CC6.7
- AWS Documentation: S3 Object Lock, WAF v2 Managed Rules, Secrets Manager rotation
