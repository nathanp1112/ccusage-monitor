# SRS/BRD Phase 6: Scale & Real-time

**Timeline**: Month 4-6
**Priority**: MEDIUM — Growth enablement
**Items**: A-1, A-2, A-3, A-5, A-7, A-12, A-33 (7 items)
**MoSCoW Split**: Must (A-1, A-2, A-7), Should (A-3, A-5, A-33), Could (A-12)
**Estimated Effort**: 320–420 dev-hours (3 backend + 1 frontend for 8–12 weeks)
**Dependencies**: All previous phases stable (Phase 1 auth, Phase 2 analytics, Phase 3 platform, Phase 4 compliance, Phase 5 integrations)

**Note on Decisions from Decision Log**:
- Decision #4: Multi-tenancy (A-3) gets an architectural decision gate at Phase 3 start. If multi-org is confirmed needed, orgId prefix should be added to S3 keys in Phase 3 proactively. If not confirmed, A-3 should be deferred entirely.
- Decision #5: DynamoDB introduced only in Phase 6 (no earlier). S3 ETag approach continues through Phases 1–5.
- Decision #6: Streaming aggregation (A-7) stays in Phase 6. Do not pull into Phase 3; Phase 3 scope is already large.

---

## 1. Executive Summary

Phase 6 addresses the known architectural scaling limits of the platform. The first five phases establish security, analytics, platform features, compliance, and integrations. Phase 6 prepares the system for growth beyond 50 concurrent users, modernizes the data architecture, and adds real-time capabilities that deliver immediate feedback to dashboard viewers.

The phase is organized around five architectural improvements:

1. **Member registry bottleneck (A-1)**: Replace the single `members/index.json` file (which causes ETag retry storms at 50+ concurrent syncs) with DynamoDB for O(1) atomic member lookups.
2. **Data partitioning (A-2)**: Split monthly raw data files (which can reach 15MB+ for heavy users) into daily partitions, reducing read-modify-write latency by 60–80%.
3. **Multi-tenancy foundation (A-3)**: Add `orgId` prefix to all S3 keys and JWT claims to support multiple organizations sharing the same infrastructure. Gated on confirmed business need (Decision #4).
4. **WebSocket live dashboard (A-5)**: Push sync-completion events to the dashboard over API Gateway WebSocket, reducing view staleness from 65 minutes to under 5 minutes.
5. **Event-driven aggregation (A-7)**: Trigger incremental aggregation via SQS after each sync, eliminating the 60-minute batch aggregation delay.

Supporting items include SSO/SAML via AWS Cognito (A-12) for enterprise identity management, and a session trace viewer (A-33) that reconstructs full prompt/response conversation threads for audit and learning.

**Why this matters**: Without A-1 and A-2, the system will experience hard reliability failures as the team grows. Without A-7, the dashboard is essentially a historical report, not a live monitoring tool. Without A-12, the custom auth system (S-8/S-9 from Phase 1) becomes a long-term operational burden. Phase 6 transitions the platform from a proof-of-concept to a production-grade, growth-ready system.

**New AWS resources introduced**: DynamoDB (two tables), API Gateway WebSocket API, SQS queue, Cognito User Pool. Total additional cost: approximately $3–5/month.

---

## 2. Business Requirements

### 2.1 Problem Statement

The platform was designed for a team of 10–30 developers. At this scale, the current architecture works reliably. As the team grows toward 100+ users, four specific architectural limits will cause failures:

**Registry contention**: `members/index.json` is a single S3 object. Every sync request reads it, modifies it, and writes it back using ETag-based optimistic concurrency. At 50+ concurrent syncs, ETag conflicts generate retry storms. Empirically, the system handles ~30 concurrent syncs with 5 retries and exponential backoff. Beyond that, sync latency increases sharply and some syncs fail entirely.

**Large raw data files**: `raw/{memberId}/{year}-{month}.json` accumulates all entries for a member for an entire month. Heavy users can generate 15MB+ files. Every sync reads the entire file, appends new entries, and writes it back. This is a $O(n)$ read-write per sync, where $n$ grows through the month. Sync P99 latency for heavy users reaches 5+ seconds.

**Stale dashboard data**: The current architecture updates views once per hour (scheduled aggregator). Dashboard data is therefore 5–65 minutes stale. For managers making decisions based on current cost trends, this means they may not see the impact of team-wide guidance for over an hour.

**Custom credential management**: The custom JWT auth system (Phase 1) requires manual user management, password reset procedures, and periodic security audits of the custom auth code. Enterprise IT teams expect SSO integration.

### 2.2 Target Users

| Role | Benefit |
|------|---------|
| **System Architect** | Registry and partitioning fixes eliminate the performance cliff at 50+ users |
| **Engineering Manager** | Near-real-time dashboard for timely cost management decisions |
| **Enterprise Admin** | SSO integration eliminates custom credential management |
| **Developer** | Full conversation trace viewer for learning and debugging |
| **Security Officer** | Trace viewer enables full AI conversation audit trail; SSO eliminates custom auth risk |
| **Multi-org Admin** | (If A-3 implemented) Tenant isolation allows managing multiple teams on shared infrastructure |

### 2.3 Business Value

**Scalability**: A-1 and A-2 eliminate the performance cliff at 50+ users. Without these fixes, sync failures will increase linearly with user count, degrading data quality and requiring manual intervention.

**Freshness**: A-7 reduces dashboard staleness from ~65 minutes to ~2 minutes. Managers see cost optimization impact within minutes rather than waiting for the next hourly batch.

**Operational savings**: A-12 (SSO) eliminates custom password management. No more password reset requests, no more `users.json` maintenance, no more security audits of custom auth code. Estimated savings: 5–10 hours/month in admin time.

**Revenue potential**: A-3 (multi-tenancy) enables deploying CCUsage Monitor for multiple teams or organizations. If offered as an internal service to partner companies, potential revenue of $500–$2,000/month per tenant.

**Audit depth**: A-33 (trace viewer) enables full reconstruction of AI conversations for ISMS audit, security investigation, or quality review.

**ROI estimation**: ~320–420 dev-hours investment. Prevents system degradation at scale (value: $10,000+ in avoided rework). SSO saves 60–120 hours/year in admin time. Multi-tenancy opens revenue potential.

### 2.4 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Concurrent sync handling | 100 simultaneous syncs with < 1% error rate | Load test with 100 simulated agents |
| Registry contention | 0 ETag retry storms | CloudWatch metrics on ETag conflict retries |
| Sync endpoint P99 latency | < 500ms (currently ~2–5s for heavy users) | Lambda execution duration metrics |
| Dashboard data freshness | < 5 minutes from sync to view update | End-to-end timestamp comparison |
| SSO adoption | 100% of users migrated within 6 weeks of A-12 deployment | Auth system usage metrics |
| Multi-tenant isolation | 0 cross-tenant data leaks | Penetration test: attempt cross-org access |
| Trace viewer load time | < 3 seconds for a 50-request session | Dashboard performance metrics |

---

## 3. Functional Requirements

### 3.1 Member Registry Bottleneck Fix (A-1) — Must

**Problem**: `members/index.json` is a global S3 file with ETag-based optimistic concurrency. Every sync reads and writes this file. At 50+ concurrent syncs, contention causes retry storms.

**Solution**: Replace with DynamoDB. Email-to-member lookup becomes an O(1) DynamoDB query against a GSI. Member creation uses `ConditionExpression: 'attribute_not_exists(pk)'` for atomic creation with no race conditions.

#### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-6.1.1 | Deploy DynamoDB table `ccusage-members-{stage}` with email GSI |
| FR-6.1.2 | Sync endpoint uses DynamoDB for member lookup (query by email via GSI) |
| FR-6.1.3 | Sync endpoint uses DynamoDB conditional put for atomic member creation |
| FR-6.1.4 | Sync endpoint uses DynamoDB update for atomic member last-sync timestamp update |
| FR-6.1.5 | Migration script reads `members/index.json` and writes each member to DynamoDB |
| FR-6.1.6 | Backward compatibility: sync endpoint handles both old S3 registry and new DynamoDB during migration period (30 days) |
| FR-6.1.7 | Keep `members/index.json` as a read replica (updated after DynamoDB write) for 30 days, then deprecate |
| FR-6.1.8 | After migration, `GET /api/admin/status` reports member count from DynamoDB, not S3 |

#### DynamoDB Table Schema

```yaml
# serverless.yml addition
resources:
  Resources:
    MemberTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ccusage-members-${self:provider.stage}
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: pk
            AttributeType: S
          - AttributeName: email
            AttributeType: S
        KeySchema:
          - AttributeName: pk      # "MEMBER#{memberId}"
            KeyType: HASH
        GlobalSecondaryIndexes:
          - IndexName: email-index
            KeySchema:
              - AttributeName: email
                KeyType: HASH
            Projection:
              ProjectionType: ALL
```

#### TypeScript Interface: MemberDDBRecord

```typescript
interface MemberDDBRecord {
  pk: string;                        // "MEMBER#{memberId}"
  email: string;                     // GSI partition key for lookup-by-email
  memberId: string;
  name: string;
  role: 'admin' | 'member';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastSyncAt: string | null;
  lastSyncHostname: string | null;
  lastSyncAgentVersion: string | null;
}
```

#### Sync Endpoint Migration (Before / After)

```typescript
// BEFORE (S3 ETag with retry)
const registry = await readMemberRegistry();  // S3 GET with ETag
const member = findMemberByEmail(registry, email);
// ... update member ...
await writeMemberRegistry(registry);  // S3 PUT with ETag check, retry on 412

// AFTER (DynamoDB atomic)
const result = await ddb.query({
  TableName: MEMBER_TABLE,
  IndexName: 'email-index',
  KeyConditionExpression: 'email = :email',
  ExpressionAttributeValues: { ':email': email },
}).promise();

if (result.Items?.length === 0) {
  // Atomic creation — no race condition
  await ddb.put({
    TableName: MEMBER_TABLE,
    Item: {
      pk: `MEMBER#${newId}`,
      email,
      memberId: newId,
      name: derivedName,
      role: 'member',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastSyncAt: now,
      lastSyncHostname: hostname,
      lastSyncAgentVersion: agentVersion,
    },
    ConditionExpression: 'attribute_not_exists(pk)',
  }).promise();
} else {
  // Atomic update — no read-modify-write
  await ddb.update({
    TableName: MEMBER_TABLE,
    Key: { pk: result.Items[0].pk },
    UpdateExpression: 'SET lastSyncAt = :now, updatedAt = :now, lastSyncHostname = :host, lastSyncAgentVersion = :ver',
    ExpressionAttributeValues: {
      ':now': new Date().toISOString(),
      ':host': hostname,
      ':ver': agentVersion,
    },
  }).promise();
}
```

#### IAM Additions

```yaml
- Effect: Allow
  Action:
    - dynamodb:GetItem
    - dynamodb:PutItem
    - dynamodb:UpdateItem
    - dynamodb:Query
    - dynamodb:DeleteItem
  Resource:
    - arn:aws:dynamodb:${self:provider.region}:*:table/ccusage-members-${self:provider.stage}
    - arn:aws:dynamodb:${self:provider.region}:*:table/ccusage-members-${self:provider.stage}/index/*
```

#### Migration Strategy

1. Deploy DynamoDB table (empty)
2. Run migration script: read `members/index.json`, write each member to DynamoDB
3. Update sync endpoint to use DynamoDB for member lookup and update
4. Keep `members/index.json` as a read replica (updated after DynamoDB write) for backward compatibility during transition
5. After 30 days, deprecate `members/index.json` reads

**Cost**: DynamoDB PAY_PER_REQUEST pricing. 500 members × 100 syncs/day × 2 operations = 100,000 WCU/month ≈ $0.13/month. Negligible.

**Performance gain**: DynamoDB single-digit ms latency vs S3 ~50–100ms. Member lookup becomes -50ms faster per sync.

---

### 3.2 Data Partitioning (A-2) — Must

**Problem**: `raw/{memberId}/{year}-{month}.json` can reach 15MB+ for heavy users. Every sync reads the entire file, appends entries, and writes it back. This is a full monthly read-write per sync.

**Solution**: Split raw data by day instead of month. Daily files are typically 100KB–500KB, reducing read-write latency by 60–80%.

#### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-6.2.1 | New S3 key pattern: `raw/{memberId}/{year}-{month}/{day}.json` (one file per day) |
| FR-6.2.2 | Sync endpoint writes only to today's daily file |
| FR-6.2.3 | Aggregator reads all daily files for a month when computing monthly summaries |
| FR-6.2.4 | Migration script splits existing monthly raw files into daily files |
| FR-6.2.5 | Backward compatibility: aggregator handles both old monthly and new daily file formats during migration period |
| FR-6.2.6 | Deduplication index: separate lightweight file tracks seen `request_id`s per member per month (`raw/{memberId}/{year}-{month}/dedup.json`) |
| FR-6.2.7 | Sync endpoint P99 latency < 500ms after migration (previously ~2–5s for heavy users) |

#### S3 Key Layout Change

```
# Before
raw/{memberId}/{year}-{month}.json           (up to 15MB per month)

# After
raw/{memberId}/{year}-{month}/{day}.json      (typically 100KB-500KB per day)
raw/{memberId}/{year}-{month}/dedup.json      (lightweight deduplication index)
```

#### Sync Endpoint Write Path Change (Before / After)

```typescript
// BEFORE — full monthly file read-modify-write
const rawKey = `raw/${memberId}/${year}-${month}.json`;
const rawData = await readFromS3(rawKey);    // entire month, up to 15MB
rawData.records[date].entries.push(...newEntries);
await writeToS3(rawKey, rawData);

// AFTER — single-day file read-modify-write
const rawKey = `raw/${memberId}/${year}-${month}/${day}.json`;
const dayData = await readFromS3(rawKey);    // single day, 100KB-500KB
dayData.entries.push(...newEntries);
await writeToS3(rawKey, dayData);
```

#### Daily File Schema: RawDailyData

```typescript
interface RawDailyData {
  memberId: string;
  date: string;        // "2026-02-28"
  lastUpdated: string;
  totals: ModelStats;
  models: Record<string, ModelStats>;
  entries: UsageEntry[];
}
```

#### Migration Strategy (Phased)

```
Phase 6a: Update sync endpoint to write to daily partitions.
          Continue reading monthly files for backward compatibility.

Phase 6b: Run migration script to split existing monthly raw files
          into daily files. Run during off-hours.

Phase 6c: Update aggregator to read daily files.
          Remove monthly file support after all data is migrated.
```

**Performance gain**: Read/write 500KB vs 15MB → -200ms per sync on average. Daily deduplication index reduces dedup check from scanning 30 days to scanning one day's request IDs.

---

### 3.3 Multi-Tenancy Foundation (A-3) — Should

**Decision #4 Gate**: At Phase 3 kickoff, confirm with stakeholders whether multi-org deployment is needed. If confirmed, add `orgId` to S3 key patterns in Phase 3. If not confirmed, defer this item entirely. The A-3 specification below is written for implementation if the gate passes.

**Problem**: Flat S3 namespace assumes a single organization. All data shares the same bucket prefix.

**Target state**: Add `orgId` prefix to all S3 keys. Default org `"default"` for existing single-tenant data.

#### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-6.3.1 | All S3 keys prefixed with `{orgId}/`: e.g., `default/raw/{memberId}/...` |
| FR-6.3.2 | Org context extracted from JWT `orgId` claim |
| FR-6.3.3 | All S3 operations scoped to requesting org's prefix (no cross-tenant access) |
| FR-6.3.4 | Org-level configuration: budgets, retention policies, user management scoped per org |
| FR-6.3.5 | Super-admin API for org creation and management |
| FR-6.3.6 | Dashboard scoped to authenticated user's org |
| FR-6.3.7 | Agent config includes `orgId` (set during setup, stamped into all sync requests) |
| FR-6.3.8 | Default org `"default"` for all existing single-tenant data (backward compatibility) |

#### S3 Key Layout Change

```
# Before
raw/{memberId}/{year}-{month}/{day}.json

# After (A-2 + A-3 combined)
{orgId}/raw/{memberId}/{year}-{month}/{day}.json
```

#### JWT Payload Change

```typescript
interface JWTPayload {
  sub: string;
  email: string;
  role: 'admin' | 'member' | 'agent';
  type: 'dashboard' | 'agent';
  orgId: string;    // NEW: organization identifier (default: "default")
  jti: string;
  iat: number;
  exp: number;
}
```

#### S3 Key Helper Update

```typescript
// All S3 key functions updated to accept orgId parameter
function rawKey(
  orgId: string,
  memberId: string,
  year: number,
  month: number,
  day: number
): string {
  return `${orgId}/raw/${memberId}/${year}-${String(month).padStart(2,'0')}/${String(day).padStart(2,'0')}.json`;
}

function aggregatedKey(orgId: string, memberId: string, year: number, month: number): string {
  return `${orgId}/aggregated/${memberId}/${year}-${String(month).padStart(2,'0')}.json`;
}

function membersIndexKey(orgId: string): string {
  return `${orgId}/members/index.json`;
}

function viewsDashboardKey(orgId: string): string {
  return `${orgId}/views/dashboard.json`;
}
```

#### Migration Strategy

1. Create `default/` prefix directory structure via S3 Batch Operations
2. Move all existing S3 objects under `default/` (bulk rename)
3. Update all S3 key functions to include `orgId`
4. Update all JWT tokens to include `orgId: 'default'`
5. Update agent `setup` command to prompt for `orgId`

**Warning**: This is the most invasive change in the entire roadmap. It touches every S3 read/write operation in the lambda-server and every key helper in `src/lib/s3.ts`. S3 Batch Operations can rename millions of objects but should be run during off-hours with a 4–8 hour budget.

---

### 3.4 WebSocket Live Dashboard (A-5) — Should

**Problem**: Dashboard data can be up to 65 minutes stale (60-min aggregation + 5-min TanStack Query cache).

**Solution**: API Gateway WebSocket API. When the sync endpoint completes, it broadcasts a `views.updated` message to all connected dashboard clients. The dashboard invalidates affected TanStack Query cache entries, triggering immediate refetch.

**Alternative (recommended)**: Server-Sent Events (SSE) via Lambda Function URL. SSE is unidirectional (server-to-client), which matches the use case. It is simpler to implement on Lambda than WebSocket, which requires a persistent connection management DynamoDB table and separate connect/disconnect handlers. If 30-second polling with A-7 (event-driven aggregation) achieves acceptable freshness (<90 seconds), full WebSocket infrastructure may not be necessary.

#### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-6.4.1 | WebSocket or SSE connection from dashboard to API |
| FR-6.4.2 | When `POST /api/sync` completes, emit event with `memberId`, `entriesInserted`, `newTotalCost` |
| FR-6.4.3 | Dashboard updates affected components without full page refresh |
| FR-6.4.4 | Connection resilience: auto-reconnect with exponential backoff (max 30s interval) |
| FR-6.4.5 | Fallback: if WebSocket connection fails, revert to 30-second polling |
| FR-6.4.6 | Maximum 100 concurrent connections (API Gateway WebSocket API limit per account is much higher; 100 is the practical dashboard viewer limit) |
| FR-6.4.7 | WebSocket connection TTL: 24 hours (DynamoDB TTL auto-cleanup) |

#### API Gateway WebSocket Lambda Functions

```yaml
# serverless.yml addition
functions:
  websocket-connect:
    handler: src/websocket.connect
    events:
      - websocket:
          route: $connect

  websocket-disconnect:
    handler: src/websocket.disconnect
    events:
      - websocket:
          route: $disconnect

  websocket-default:
    handler: src/websocket.default
    events:
      - websocket:
          route: $default
```

#### WebSocket Connection Management: DynamoDB Table

```typescript
interface WebSocketConnection {
  connectionId: string;   // API Gateway connection ID
  userId: string;
  orgId: string;
  connectedAt: string;
  ttl: number;            // Unix epoch + 86400 (24 hours). DynamoDB TTL auto-deletes.
}
```

```yaml
# serverless.yml addition
WebSocketTable:
  Type: AWS::DynamoDB::Table
  Properties:
    TableName: ccusage-ws-${self:provider.stage}
    BillingMode: PAY_PER_REQUEST
    AttributeDefinitions:
      - AttributeName: connectionId
        AttributeType: S
    KeySchema:
      - AttributeName: connectionId
        KeyType: HASH
    TimeToLiveSpecification:
      AttributeName: ttl
      Enabled: true
```

#### WebSocket Message Types

```typescript
type WSMessage =
  | {
      type: 'sync.completed';
      memberId: string;
      memberName: string;
      inserted: number;
      newCostThisMonth: number;
    }
  | {
      type: 'alert.new';
      alert: BudgetAlert | AnomalyAlert;
    }
  | {
      type: 'views.updated';
      views: string[];    // which views were regenerated: 'dashboard', 'members', etc.
      orgId: string;
    }
  | {
      type: 'agent.status';
      memberId: string;
      status: 'online' | 'offline';
    };
```

#### Push Flow

```
Agent syncs data
  |
  v
[POST /api/sync: process entries, update S3/DynamoDB]
  |
  v
[Post-sync hook: query ccusage-ws table for active connections]
  |
  v
[For each connectionId: API Gateway Management API POST /{connectionId}]
  |
  v
[Dashboard: WebSocket onmessage fires, TanStack Query cache invalidated]
  |
  v
[Affected components refetch from API, display updated data]
```

#### Dashboard WebSocket Hook: use-websocket.ts

```typescript
// dashboard/src/hooks/use-websocket.ts
export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const reconnectDelay = useRef(1000);

  const connect = useCallback(() => {
    ws.current = new WebSocket(process.env.NEXT_PUBLIC_WS_URL!);

    ws.current.onopen = () => {
      setConnected(true);
      reconnectDelay.current = 1000;  // reset backoff
    };

    ws.current.onmessage = (event) => {
      const msg: WSMessage = JSON.parse(event.data);
      switch (msg.type) {
        case 'views.updated':
          // Invalidate affected queries to trigger refetch
          msg.views.forEach((view: string) => {
            queryClient.invalidateQueries({ queryKey: [view] });
          });
          break;
        case 'sync.completed':
          queryClient.invalidateQueries({ queryKey: ['members'] });
          break;
        case 'alert.new':
          queryClient.invalidateQueries({ queryKey: ['alerts'] });
          break;
      }
    };

    ws.current.onclose = () => {
      setConnected(false);
      // Exponential backoff reconnect (max 30s)
      reconnectTimeout.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
        connect();
      }, reconnectDelay.current);
    };
  }, [queryClient]);

  useEffect(() => {
    connect();
    return () => {
      ws.current?.close();
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
    };
  }, [connect]);

  return { connected };
}
```

---

### 3.5 Streaming / Event-Driven Aggregation (A-7) — Must

**Problem**: Hourly batch aggregation means views can be up to 60 minutes stale.

**Solution**: After each successful sync, publish a message to an SQS queue. The aggregator Lambda has a dual trigger: existing hourly schedule (full re-aggregation) and new SQS trigger (incremental re-aggregation for specific members). A 60-second SQS batching window prevents redundant re-computation when a member syncs multiple times within a minute.

#### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-6.5.1 | Sync endpoint publishes `{memberId, year, month, triggeredBy, triggeredAt}` to SQS queue after successful data storage |
| FR-6.5.2 | Aggregator Lambda triggered by SQS performs incremental update: re-compute only the affected member's monthly aggregated data |
| FR-6.5.3 | Incremental update is idempotent (processing the same event twice produces the same result) |
| FR-6.5.4 | Hourly full aggregation retained as a safety net (existing scheduled trigger preserved) |
| FR-6.5.5 | SQS batching window of 60 seconds: messages from the same member within one minute are batched into one aggregation run |
| FR-6.5.6 | Dashboard data freshness target: < 5 minutes from sync to view availability |

#### SQS Queue CloudFormation

```yaml
# serverless.yml addition
resources:
  Resources:
    AggregationQueue:
      Type: AWS::SQS::Queue
      Properties:
        QueueName: ccusage-aggregation-${self:provider.stage}
        VisibilityTimeout: 360    # 6 minutes (> Lambda timeout of 5 min)
        MessageRetentionPeriod: 86400

functions:
  aggregator:
    handler: src/aggregator.handler
    timeout: 300
    events:
      - schedule:
          rate: rate(1 hour)
          enabled: true
      - sqs:
          arn: !GetAtt AggregationQueue.Arn
          batchSize: 10
          maximumBatchingWindow: 60  # wait up to 60 seconds to batch messages
```

#### Sync Endpoint SQS Publish

```typescript
// After successful entry storage in sync endpoint:
await sqs.sendMessage({
  QueueUrl: AGGREGATION_QUEUE_URL,
  MessageBody: JSON.stringify({
    memberId,
    year,
    month,
    orgId,
    triggeredBy: 'sync',
    triggeredAt: new Date().toISOString(),
  }),
}).promise();
```

#### Aggregator Dual-Trigger Handler

```typescript
// src/aggregator.ts
export async function handler(event: ScheduledEvent | SQSEvent): Promise<void> {
  if ('Records' in event && event.Records.length > 0) {
    // SQS trigger: incremental aggregation for specific members only
    const messages = event.Records.map((r) => JSON.parse(r.body) as AggregationMessage);

    // Deduplicate by memberId (multiple syncs within the batching window)
    const uniqueMembers = [...new Set(messages.map((m) => m.memberId))];

    console.log(`SQS trigger: incremental aggregation for ${uniqueMembers.length} members`);
    await aggregateMembers(uniqueMembers);  // only these members' views are regenerated
  } else {
    // Scheduled trigger: full aggregation of all members
    console.log('Scheduled trigger: full aggregation');
    await aggregateAll();
  }
}
```

#### IAM Additions

```yaml
- Effect: Allow
  Action:
    - sqs:SendMessage
  Resource:
    - !GetAtt AggregationQueue.Arn
- Effect: Allow
  Action:
    - sqs:ReceiveMessage
    - sqs:DeleteMessage
    - sqs:GetQueueAttributes
  Resource:
    - !GetAtt AggregationQueue.Arn
```

**Cost**: SQS standard queue at $0.40/million messages. At 50 users syncing hourly: ~36,000 messages/month = $0.01/month.

---

### 3.6 SSO / SAML via Cognito (A-12) — Could

**Current state**: Custom auth with bcrypt password hashing, JWT issuing, and manual user management in `auth/users.json` (Phase 1).

**Target state**: AWS Cognito User Pool with SAML and OIDC federation support. Custom JWT auth retained for agents (machine-to-machine, not suitable for SSO redirect flow).

#### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-6.6.1 | Cognito User Pool deployed with email-based sign-in |
| FR-6.6.2 | SAML 2.0 federation configurable (Google Workspace, Azure AD, Okta) via Cognito identity providers |
| FR-6.6.3 | OIDC federation configurable (Google, GitHub) |
| FR-6.6.4 | Existing users migrated from `auth/users.json` to Cognito |
| FR-6.6.5 | User auto-provisioning: first SSO login creates a member record with `member` role |
| FR-6.6.6 | Role mapping: Cognito groups `ccusage-admin` / `ccusage-member` map to application roles |
| FR-6.6.7 | Dashboard uses Cognito hosted UI or custom OIDC flow for login |
| FR-6.6.8 | Lambda auth middleware verifies Cognito JWTs (RS256 with JWKS endpoint) |
| FR-6.6.9 | Backward compatibility: support both custom HS256 JWTs and Cognito RS256 JWTs during 30-day migration period |
| FR-6.6.10 | Agent authentication: agents continue to use 90-day agent tokens (not SSO redirect); Cognito device auth flow optional |

#### Cognito CloudFormation

```yaml
# serverless.yml addition
resources:
  Resources:
    UserPool:
      Type: AWS::Cognito::UserPool
      Properties:
        UserPoolName: ccusage-${self:provider.stage}
        AutoVerifiedAttributes:
          - email
        UsernameAttributes:
          - email
        Policies:
          PasswordPolicy:
            MinimumLength: 12
            RequireLowercase: true
            RequireUppercase: true
            RequireNumbers: true
            RequireSymbols: false

    UserPoolClient:
      Type: AWS::Cognito::UserPoolClient
      Properties:
        ClientName: ccusage-dashboard-${self:provider.stage}
        UserPoolId: !Ref UserPool
        ExplicitAuthFlows:
          - ALLOW_USER_SRP_AUTH
          - ALLOW_REFRESH_TOKEN_AUTH
        SupportedIdentityProviders:
          - COGNITO
        CallbackURLs:
          - https://${self:custom.dashboardDomain}/callback
          - http://localhost:3000/callback
        AllowedOAuthFlows:
          - code
        AllowedOAuthScopes:
          - openid
          - email
          - profile
```

#### Auth Middleware Change: JWKS Verification

```typescript
// src/lib/auth.ts — Cognito JWT verification
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL(
    `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}/.well-known/jwks.json`
  )
);

async function verifyCognitoToken(token: string) {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL_ID}`,
  });
  return payload;
}

// Dual-mode verification for migration period
async function verifyToken(token: string) {
  const header = JSON.parse(
    Buffer.from(token.split('.')[0], 'base64').toString()
  );

  if (header.alg === 'RS256') {
    // Cognito token
    return verifyCognitoToken(token);
  } else {
    // Legacy custom HS256 token
    return verifyCustomToken(token);
  }
}
```

#### Migration Path

1. Deploy Cognito User Pool (empty)
2. Migrate existing users from `auth/users.json` to Cognito (one-time migration script: create Cognito users with `FORCE_CHANGE_PASSWORD` status, send email invitations)
3. Update dashboard to use Cognito hosted UI or custom OIDC flow
4. Update Lambda auth middleware to accept both HS256 (legacy) and RS256 (Cognito) tokens
5. After 30-day migration window: disable legacy HS256 auth, require Cognito for all dashboard logins
6. Keep custom agent tokens (HS256) for agents — agents are not subject to SSO

**SAML Federation Note**: Once Cognito is in place, adding SAML identity providers (Google Workspace, Azure AD, Okta) is a configuration change in the AWS Console or CloudFormation, not a code change.

---

### 3.7 Prompt / Response Trace Viewer (A-33) — Should

**Current state**: No way to view the actual conversation flow (prompt/response sequence) for a given session. Prompt text is stored in `prompts/{memberId}/{year}-{month}.json` but is only accessible via raw S3 download.

**Target state**: A session trace viewer in the member detail dashboard showing the full conversation thread with token counts, cost per exchange, and DLP finding highlights.

#### Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-6.7.1 | New endpoint `GET /api/members/:id/sessions/:sessionId` returns `SessionTrace` |
| FR-6.7.2 | Session trace joins prompt content (`prompts/`) with usage entries (`raw/`) on `sessionId` and `timestamp` |
| FR-6.7.3 | Trace viewer accessible from Member Detail → Sessions tab → Click session row |
| FR-6.7.4 | Each trace entry shows: timestamp, role (user/assistant), content (truncated at 1000 chars with expand), model, token counts, cost, DLP findings if any |
| FR-6.7.5 | Access control: admin sees all members' traces; member sees only own traces |
| FR-6.7.6 | Admin can disable trace storage globally or per member via settings |
| FR-6.7.7 | Trace data retention follows prompt retention policy (default 6 months) |
| FR-6.7.8 | Search within session text (client-side, full text search across loaded trace) |
| FR-6.7.9 | Agent enhanced to capture assistant response content from JSONL logs (new data field in `collector.ts`) |

#### TypeScript Interface: SessionTrace

```typescript
interface SessionTrace {
  sessionId: string;
  memberId: string;
  memberName: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  totalCost: number;
  totalRequests: number;
  project: string | null;
  trace: Array<{
    timestamp: string;
    type: 'prompt' | 'response';
    content: string | null;      // null if not collected or redacted by DLP
    model: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    dlpFindings?: DLPFinding[];  // populated if DLP scanner found matches
  }>;
}
```

#### New Endpoint

```
GET /api/members/:id/sessions/:sessionId
Authorization: Bearer {token}   # Admin or self only

Response: SessionTrace (JSON)
```

**Implementation notes**:
- Response content (assistant messages) is not currently collected by the agent. The trace initially shows prompts (user messages) and response metadata (model, tokens, cost). Full assistant response capture requires changes to the agent's JSONL parser in `src/lib/collector.ts` — plan this as a separate agent release.
- Trace reconstruction: query `prompts/{memberId}/{year}-{month}.json` for prompt text, cross-reference with `raw/{memberId}/{year}-{month}/{day}.json` entries matching the `sessionId`, sort by `timestamp`.

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Requirement | Target | Rationale |
|-------------|--------|-----------|
| Sync endpoint P99 latency (post A-1 + A-2) | < 500ms | From current ~2–5s for heavy users |
| DynamoDB member lookup latency | < 10ms P99 | Single DynamoDB read with GSI |
| Dashboard view freshness (post A-7) | < 5 minutes | SQS batching window 60s + aggregation time ~2–3 min |
| WebSocket broadcast to 100 clients | < 2 seconds | API Gateway Management API parallel posts |
| Session trace load time | < 3 seconds for 50-request session | S3 read + join on session |
| DynamoDB migration script | Complete < 1 hour for 1,000 members | Batch write with retry |
| Daily partitioning migration | Complete < 4 hours for 12 months × 500 members | Parallel S3 copy + delete |

### 4.2 Scalability

| Dimension | Current Limit | Phase 6 Target |
|-----------|---------------|----------------|
| Concurrent syncs without errors | ~30 (ETag contention) | 100+ (DynamoDB atomic) |
| Raw data file size per sync | 15MB max (monthly) | 500KB max (daily) |
| Member registry operations/second | ~10 (S3 ETag retry) | 1,000+ (DynamoDB) |
| Dashboard concurrent viewers | Unlimited (polling) | 100 live WebSocket connections |
| Organizations (if A-3 implemented) | 1 | Unlimited (orgId prefix isolation) |

### 4.3 Reliability

- DynamoDB member table: Multi-AZ by default (PAY_PER_REQUEST provisioning)
- SQS queue: At-least-once delivery with `VisibilityTimeout: 360`. Aggregation is idempotent so duplicate messages are safe.
- WebSocket connection cleanup: DynamoDB TTL auto-deletes stale connections after 24 hours
- Cognito: AWS-managed service, 99.9% SLA
- Rollback procedure: Revert to S3-based member registry (keep as fallback for 30 days); close WebSocket API; revert to hourly aggregation only

### 4.4 Security

| Control | Mechanism |
|---------|-----------|
| DynamoDB access | IAM role scoped to specific table ARNs and index ARNs |
| WebSocket authentication | JWT validated on `$connect` route; connection rejected if invalid |
| Multi-tenant isolation | All S3 operations use `orgId` from JWT claim; no user-controlled `orgId` parameter |
| Cognito JWT verification | JWKS endpoint with key rotation; `issuer` claim verified |
| Trace viewer access | Admin or self-only via RBAC (Phase 3 RBAC middleware) |
| SQS message integrity | Messages contain `memberId` and `orgId` — aggregator validates against requester's org |

### 4.5 Cost

| New Resource | Monthly Estimate |
|--------------|-----------------|
| DynamoDB members table (PAY_PER_REQUEST) | ~$1/month |
| DynamoDB WebSocket connections table | ~$0.50/month |
| API Gateway WebSocket API | ~$1/month |
| SQS standard queue | ~$0.01/month |
| Cognito User Pool | Free (< 50,000 MAUs) |
| **Total Phase 6 addition** | **~$3–5/month** |

---

## 5. UX Requirements

### 5.1 Live Dashboard Indicators (A-5)

Subtle real-time indicators added to the existing Dashboard page header.

```
+------------------------------------------------------+
| Dashboard                           [* LIVE] 12:34 PM |
| Team usage overview for the current period            |
+------------------------------------------------------+
```

**Live indicator elements**:
1. **Pulsing green dot** in the page header with "LIVE" text when WebSocket is connected
2. **Last updated timestamp** showing when data was last refreshed
3. **Subtle animation** on stat cards when values change (number counter transition)
4. **Activity feed** at the bottom of the dashboard (optional, collapsed by default)

```
+-- Activity Feed (collapsed by default) ---------------+
| Recent Activity                             [Expand v] |
+------------------------------------------------------+
| When expanded:                                        |
| +---------------------------------------------------+|
| | 12:34  Alice synced 23 new entries                 ||
| | 12:31  Bob synced 5 new entries                    ||
| | 12:28  Cost alert: Charlie exceeded daily avg      ||
| | 12:15  Dave agent came online (v0.4.0)             ||
| +---------------------------------------------------+|
+------------------------------------------------------+
```

**Implementation**:
- `useWebSocket` hook manages connection lifecycle
- Falls back to 30-second polling if WebSocket connection fails
- Connection status shown via `LiveIndicator` component (`role="status"`, `aria-live="polite"`)
- Updates pushed via WebSocket trigger TanStack Query cache invalidation

### 5.2 Prompt / Response Trace Viewer (A-33)

Full-screen DataSheet accessible from Member Detail → Sessions tab → click session row.

```
+-- Trace Viewer (DataSheet, size="full") ---------------+
|                                                         |
| Session #a1b2c3 - Alice Johnson                         |
| Feb 28, 2026 10:15 AM - 10:45 AM (30 min)              |
| Project: workflow-scout | Model: Opus | Cost: $4.56    |
|                                                         |
| +------------------------------------------------------+|
| | [1] USER                                    10:15 AM ||
| | > "Fix the login form validation to handle..."      ||
| |                                                      ||
| | [1] ASSISTANT                               10:15 AM ||
| | > "I'll fix the login form validation. Let me..."   ||
| | Tokens: 1,234 in / 2,345 out | Cost: $0.34         ||
| |------------------------------------------------------||
| | [2] USER                                    10:18 AM ||
| | > "Also add error handling for the API call..."     ||
| |                                                      ||
| | [2] ASSISTANT                               10:19 AM ||
| | > "I'll add comprehensive error handling..."        ||
| | Tokens: 2,456 in / 3,567 out | Cost: $0.56         ||
| |------------------------------------------------------||
| | [3] USER                                    10:25 AM ||
| | > "Now write tests for the validation..."           ||
| |                                                      ||
| | [3] ASSISTANT                               10:26 AM ||
| | > "I'll create comprehensive tests..."              ||
| | Tokens: 4,567 in / 5,678 out | Cost: $0.89         ||
| +------------------------------------------------------+|
|                                                         |
| SESSION SUMMARY                                         |
| Total: 3 exchanges | $1.79 | 8,257 in / 11,590 out    |
| Cache: 67% hit rate | Avg response: 45s                |
+----------------------------------------------------------+
```

**Interaction design**:
- Accessible from Member Detail → Sessions tab → click session row
- Opens full-width DataSheet (`size="full"`) with conversation thread
- Collapsible message bodies for long prompts/responses (click to expand beyond 1,000 chars)
- Search within session text (client-side text filtering)
- Token and cost metrics per exchange
- DLP findings highlighted in amber if prompt was flagged

### 5.3 Phase 6 Component Inventory

| Component | Type | Location | Props |
|-----------|------|----------|-------|
| `LiveIndicator` | New | `components/shared/live-indicator.tsx` | `connected: boolean, lastUpdate: Date` |
| `ActivityFeed` | New | `components/dashboard/activity-feed.tsx` | `events: ActivityEvent[], collapsed: boolean` |
| `NumberTransition` | New | `components/shared/number-transition.tsx` | `value: number, duration: number` |
| `TraceViewer` | New | `components/members/trace-viewer.tsx` | `sessionId: string, memberId: string` |
| `TraceMessage` | New | `components/members/trace-message.tsx` | `role, content, tokens, cost, timestamp, dlpFindings?` |
| `SessionSummary` | New | `components/members/session-summary.tsx` | `session: SessionTrace` |
| `useWebSocket` | New hook | `hooks/use-websocket.ts` | Returns `{ connected: boolean }` |
| Enhanced `Navbar` | Update | `components/layout/navbar.tsx` | Add `LiveIndicator` when connected |

### 5.4 User Flows

#### Flow: Observe Live Dashboard Update

```
1. Manager opens dashboard
2. "LIVE" indicator shows green pulsing dot (WebSocket connected)
3. Developer (Alice) runs ccusage-agent sync on their machine
4. Sync completes; server broadcasts WSMessage{type: 'sync.completed', memberId: 'alice'}
5. Dashboard's useWebSocket hook receives message
6. TanStack Query invalidates ['members'] cache
7. Members list refetches; Alice's last sync timestamp updates
8. Within 2-5 minutes, aggregator runs (SQS trigger from sync)
9. views/dashboard.json updated; WSMessage{type: 'views.updated', views: ['dashboard']} broadcast
10. Dashboard stats refresh with Alice's new data
```

#### Flow: View Session Trace

```
1. Admin navigates to Members -> Alice Johnson
2. Member detail DataSheet opens
3. Admin clicks Sessions tab
4. Session list shows Feb 28 10:15 AM session ($4.56, 3 exchanges, 30 min)
5. Admin clicks session row
6. Full-screen TraceViewer opens
7. Conversation thread shows 3 USER/ASSISTANT exchange pairs
8. Admin can expand truncated messages (>1,000 chars)
9. SESSION SUMMARY shows totals, cache rate
10. Admin closes DataSheet
```

#### Flow: SSO Login (A-12)

```
1. New user navigates to dashboard
2. Clicks "Sign in with Google Workspace"
3. Redirected to Cognito hosted UI / Google OAuth
4. User authenticates with corporate credentials
5. Cognito issues RS256 JWT with orgId and role claims
6. Dashboard stores token in localStorage
7. If first-time user: Lambda auto-provisions member record with 'member' role
8. User lands on dashboard
```

---

## 6. Technical Architecture

### 6.1 New AWS Resources Overview

| Resource | Purpose | CloudFormation Resource Type | Monthly Cost |
|----------|---------|------------------------------|--------------|
| `ccusage-members-{stage}` DynamoDB | Member lookup (replaces `members/index.json`) | `AWS::DynamoDB::Table` | ~$1 |
| `ccusage-ws-{stage}` DynamoDB | WebSocket connection tracking | `AWS::DynamoDB::Table` | ~$0.50 |
| API Gateway WebSocket API | Push events to dashboard | `AWS::ApiGatewayV2::Api` | ~$1 |
| `ccusage-aggregation-{stage}` SQS | Incremental aggregation queue | `AWS::SQS::Queue` | ~$0.01 |
| `ccusage-{stage}` Cognito User Pool | SSO/SAML identity management | `AWS::Cognito::UserPool` | Free (< 50k MAU) |

### 6.2 S3 Key Changes

#### New Key Patterns (Phase 6)

| Key | Purpose |
|-----|---------|
| `raw/{memberId}/{year}-{month}/{day}.json` | Daily-partitioned raw data (replaces monthly) |
| `raw/{memberId}/{year}-{month}/dedup.json` | Per-month deduplication index |

#### Deprecated Keys (Phase 6)

| Deprecated Key | Replacement |
|----------------|-------------|
| `members/index.json` | DynamoDB `ccusage-members-{stage}` table |
| `raw/{memberId}/{year}-{month}.json` | `raw/{memberId}/{year}-{month}/{day}.json` |

#### With Multi-Tenancy (A-3 if implemented)

| Key Pattern | With orgId |
|-------------|-----------|
| `raw/{memberId}/...` | `{orgId}/raw/{memberId}/...` |
| `aggregated/{memberId}/...` | `{orgId}/aggregated/{memberId}/...` |
| `views/...` | `{orgId}/views/...` |
| `members/...` | `{orgId}/members/...` (kept only as a read replica) |

### 6.3 Data Model Changes

#### DynamoDB Tables

| Table Name | PK Schema | GSI | TTL Field |
|------------|-----------|-----|-----------|
| `ccusage-members-{stage}` | `pk: "MEMBER#{memberId}"` | `email-index` on `email` | None |
| `ccusage-ws-{stage}` | `pk: connectionId` | None | `ttl` (24h auto-delete) |

#### RawDailyData (new)

```typescript
interface RawDailyData {
  memberId: string;
  date: string;           // "2026-02-28"
  lastUpdated: string;
  totals: ModelStats;
  models: Record<string, ModelStats>;
  entries: UsageEntry[];  // typically 10-200 entries per day
}
```

### 6.4 New API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/members/:id/sessions/:sessionId` | Admin or self | Session trace viewer data |
| `POST` | `/api/agent/register-key` | Agent token | Register agent Ed25519 public key (Phase 4 S-22) |
| WebSocket | `$connect` | JWT in query param | Establish live connection |
| WebSocket | `$disconnect` | (auto) | Clean up connection |
| WebSocket | `$default` | JWT | Default message handler |

### 6.5 Component-Level Changes

| Component | Changes |
|-----------|---------|
| `lambda-server/src/routes/sync.ts` | Add SQS publish after successful sync; use DynamoDB for member lookup; write to daily raw partition |
| `lambda-server/src/aggregator.ts` | Add SQS trigger handler for incremental per-member aggregation |
| `lambda-server/src/lib/s3.ts` | Add `orgId` parameter to all key functions (if A-3); add daily partition key functions |
| `lambda-server/src/lib/types.ts` | Add `MemberDDBRecord`, `RawDailyData`, `WebSocketConnection`, `WSMessage`, `SessionTrace`, `AggregationMessage` |
| `lambda-server/src/websocket.ts` | New file: connect/disconnect/default WebSocket handlers |
| `lambda-server/serverless.yml` | Add DynamoDB tables, SQS queue, WebSocket API, Cognito User Pool |
| `be-agent/src/lib/collector.ts` | Enhanced to capture assistant response content from JSONL (for A-33 trace viewer) |
| `dashboard/src/hooks/use-websocket.ts` | New hook for WebSocket connection management and cache invalidation |
| `dashboard/src/components/members/trace-viewer.tsx` | New full-screen conversation thread viewer |
| `dashboard/src/components/shared/live-indicator.tsx` | New pulsing connection status indicator |

### 6.6 Performance Considerations

| Change | Latency Impact | Notes |
|--------|---------------|-------|
| DynamoDB member lookup vs S3 | -50ms per sync | DynamoDB P99 ~5ms vs S3 ~50–100ms |
| Daily raw data partitioning | -200ms per sync | Read/write 500KB vs 15MB |
| Event-driven aggregation | Views updated within 2 min of sync | 60s SQS batching + ~1–2 min aggregation |
| WebSocket push to dashboard | Dashboard updates within seconds | API Gateway Management API parallel sends |
| Cognito JWT verification | +10ms first call (JWKS fetch cached) | JWKS endpoint result cached in memory by `jose` |

---

## 7. Dependencies & Risks

### 7.1 Dependencies

| Dependency | Details |
|------------|---------|
| Phase 1 (auth) | JWT infrastructure required for WebSocket auth and Cognito migration |
| Phase 2–3 (analytics + platform) | Stable aggregated data model and RBAC system required before architectural changes |
| Phase 4 (compliance) | DLP findings surfaced in trace viewer (A-33 uses `DLPFinding[]` from Phase 4) |
| Agent release | A-33 trace viewer requires a new agent version to capture assistant response content from JSONL |
| A-7 before A-5 | Event-driven aggregation (A-7) provides the data freshness benefit that makes WebSocket (A-5) valuable. Implement A-7 first. |
| Decision #4 gate | A-3 (multi-tenancy) requires stakeholder confirmation at Phase 3 start. If not confirmed, skip A-3 entirely. |

### 7.2 Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| DynamoDB migration data inconsistency | HIGH | Run migration in dry-run mode first (compare DDB member count vs S3 index.json count). Keep S3 backup for 30 days. |
| Daily partitioning creates many small S3 objects | MEDIUM | 500 members × 365 days = 182,500 objects/year. Well within S3 limits. Use prefix-based listing with pagination. |
| WebSocket connection management complexity | MEDIUM | Use DynamoDB TTL for auto-cleanup. Handle `PostToConnection` errors gracefully (ignore stale connections — client has disconnected). |
| Cognito migration disrupts existing sessions | HIGH | Support dual auth (HS256 + RS256) for 30 days. Force re-login after migration cutover. Send 2-week advance notice. |
| Multi-tenancy prefix rename of millions of S3 objects | HIGH | Use S3 Batch Operations for bulk rename. Budget 4–8 hours. Run during off-hours. **Defer A-3 unless multi-tenancy is a confirmed requirement.** |
| SQS message ordering | LOW | Use standard queue (not FIFO). Aggregation is idempotent — duplicate or out-of-order messages produce the same result. |
| Trace viewer data volume | MEDIUM | Assistant responses are larger than prompts (10–100x tokens). Store compressed. Implement pagination. Use shorter retention for trace data (30 days vs 6 months). |
| Lambda WebSocket architecture mismatch | MEDIUM | Lambda is not ideal for persistent WebSocket connections. Consider SSE via Lambda Function URL as a simpler alternative. |

### 7.3 Rollback Procedures

| Item | Rollback Plan |
|------|---------------|
| A-1 (DynamoDB registry) | Revert sync endpoint to S3-based member lookup. `members/index.json` kept as fallback for 30 days. |
| A-2 (daily partitioning) | Aggregator maintains backward compatibility with monthly file format during transition. Revert sync endpoint to write monthly files. |
| A-3 (multi-tenancy) | S3 Batch Operations to remove `orgId` prefix (reverse rename). Revert JWT token generation. |
| A-5 (WebSocket) | Close API Gateway WebSocket API. Dashboard falls back to 30-second polling immediately. |
| A-7 (streaming aggregation) | Disable SQS trigger on aggregator. Hourly scheduled trigger continues. |
| A-12 (Cognito) | Re-enable legacy HS256 auth. Keep Cognito deployed but inactive. No user data is deleted. |

---

## 8. Implementation Plan

### 8.1 Phase 6 Implementation Order

```
Month 4, Week 3 — Registry and Partitioning (backend-only, no frontend impact):
  1. [A-1] DynamoDB member table + migration script (6 hr)
     - Deploy CloudFormation for ccusage-members table
     - Write migration script: read members/index.json → write to DDB
     - Test migration in dry-run mode
  2. [A-1] Update sync endpoint to use DynamoDB (6 hr, depends on #1)
     - Replace S3 ETag read-modify-write with DDB query/put/update
     - Add fallback to S3 for members not yet in DDB (during migration window)
  3. [A-2] Daily partitioning: sync endpoint write path (4 hr, parallelizable with #1)
     - Add new daily raw key function to s3.ts
     - Update sync to write to daily partition
     - Maintain monthly file compatibility for aggregator

Month 4, Week 4 — Partitioning migration and streaming aggregation:
  4. [A-2] Migration script: split monthly raw files to daily (4 hr, depends on #3)
     - Process: read monthly file, split by day, write daily files, verify counts
     - Run in parallel per member; target completion < 4 hours for 500 members
  5. [A-7] SQS queue + sync endpoint publish (6 hr, parallelizable with #4)
     - Add AggregationQueue CloudFormation resource
     - Add sqs.sendMessage call at end of sync endpoint
  6. [A-7] Aggregator SQS trigger handler (4 hr, depends on #5)
     - Add SQS event handling to aggregator Lambda
     - Implement aggregateMembers(memberIds[]) for incremental aggregation
     - Verify idempotency: run twice with same input, assert identical output

Month 5 — WebSocket and trace viewer:
  7. [A-5] WebSocket Lambda functions + DynamoDB connection table (8 hr)
     - Deploy API Gateway WebSocket API CloudFormation
     - Implement connect/disconnect/default handlers
     - Add broadcast logic to sync endpoint post-processing
  8. [A-5] Dashboard WebSocket integration (6 hr, depends on #7)
     - Implement useWebSocket hook
     - Add LiveIndicator to Navbar
     - Add ActivityFeed to Dashboard (collapsed by default)
     - Test WebSocket fallback to polling
  9. [A-33] Session trace API endpoint (4 hr, parallelizable with #7)
     - Implement GET /api/members/:id/sessions/:sessionId
     - Join prompts data with raw usage entries on sessionId
  10. [A-33] Trace viewer dashboard component (4 hr, depends on #9)
      - Implement TraceViewer, TraceMessage, SessionSummary components
      - Add to Member Detail Sessions tab

Month 5-6 — Cognito (if authorized):
  11. [A-12] Cognito User Pool setup + CloudFormation (8 hr)
      - Deploy Cognito resources
      - Test Cognito-issued JWT verification in auth middleware
  12. [A-12] Dual auth middleware + user migration (8 hr, depends on #11)
      - Update verifyToken to support both HS256 and RS256
      - Run user migration script (S3 users.json → Cognito)
      - Update dashboard login flow to Cognito hosted UI

Month 5-6 — Multi-tenancy (if A-3 confirmed by Decision #4 gate):
  13. [A-3] S3 key helper updates for orgId (8 hr)
      - Add orgId to all s3.ts key functions
      - Update JWT payload and auth middleware
  14. [A-3] S3 Batch Operations migration (4 hr, depends on #13)
      - Create S3 Batch Operations job to copy existing keys under default/ prefix
      - Verify data integrity after rename
      - Update agents (push new version with orgId support)
```

### 8.2 Effort Summary

| Story | MoSCoW | Size | Effort Estimate |
|-------|--------|------|----------------|
| US-6.1 A-1 Member Registry | Must | L | 12 hr |
| US-6.2 A-2 Data Partitioning | Must | L | 12 hr |
| US-6.5 A-7 Streaming Aggregation | Must | L | 10 hr |
| US-6.4 A-5 WebSocket | Should | XL | 14 hr |
| US-6.7 A-33 Trace Viewer | Should | L | 8 hr |
| US-6.6 A-12 SSO/Cognito | Could | XL | 16 hr |
| US-6.3 A-3 Multi-Tenancy | Should | XL | 12 hr |
| Integration testing + load testing | — | — | 16 hr |
| Migration scripts + dry-runs | — | — | 8 hr |
| **Total** | | | **~108 hr core + 24 hr overhead = ~132 hr (Must+Should)** |

**Full phase (all items)**: 320–420 dev-hours for 3 backend + 1 frontend over 8–12 weeks.

---

## 9. Acceptance Criteria & Test Strategy

### 9.1 Acceptance Criteria

#### US-6.1 Member Registry (A-1)

- [ ] DynamoDB table deployed and accessible from Lambda IAM role
- [ ] Migration script completes without error for existing `members/index.json`
- [ ] Member count in DynamoDB matches member count in `members/index.json` after migration
- [ ] Sync endpoint uses DynamoDB for lookup; no S3 ETag operations for member reads
- [ ] Load test: 100 concurrent syncs complete with < 1% error rate
- [ ] CloudWatch: zero ETag 412 errors after migration
- [ ] Backward compatibility: old agent versions that expect `members/index.json` continue to work during 30-day migration window

#### US-6.2 Data Partitioning (A-2)

- [ ] New S3 keys follow pattern `raw/{memberId}/{year}-{month}/{day}.json`
- [ ] Sync endpoint writes only to today's daily file
- [ ] Migration script: daily file entry counts sum to original monthly file entry counts (no data loss)
- [ ] Aggregator correctly reads daily files and produces same monthly summary as before
- [ ] Sync endpoint P99 latency < 500ms for a member with 12 months of history
- [ ] Deduplication still works: re-syncing the same entries produces no duplicate records

#### US-6.5 Streaming Aggregation (A-7)

- [ ] SQS message published to queue after every successful sync
- [ ] Message payload contains `memberId`, `year`, `month`, `orgId`, `triggeredBy: 'sync'`
- [ ] Aggregator processes SQS messages within the 60-second batching window
- [ ] After sync completes, `views/members/{memberId}/{year}.json` updated within 5 minutes
- [ ] Idempotency: processing the same SQS message twice produces identical `views/` output
- [ ] Hourly scheduled trigger still runs and performs full aggregation as fallback
- [ ] Dead letter queue: messages that fail 3 times go to DLQ; alert fires on DLQ depth > 0

#### US-6.4 WebSocket (A-5)

- [ ] WebSocket `$connect` handler validates JWT and stores connection in DynamoDB
- [ ] WebSocket `$disconnect` handler removes connection from DynamoDB
- [ ] After sync completion, broadcast fires to all active connections for the affected org
- [ ] Dashboard `useWebSocket` hook connects on page load and reconnects with exponential backoff
- [ ] Dashboard falls back to 30-second polling when WebSocket connection is unavailable
- [ ] `LiveIndicator` shows green when connected, grey when polling fallback
- [ ] DynamoDB TTL: connections older than 24 hours auto-deleted
- [ ] Load test: 100 concurrent WebSocket connections maintained without error

#### US-6.7 Trace Viewer (A-33)

- [ ] `GET /api/members/:id/sessions/:sessionId` returns `SessionTrace` with correct data
- [ ] Trace entries ordered by `timestamp` ascending
- [ ] Admin can view any member's trace; member can view only own traces (RBAC enforced)
- [ ] Trace viewer opens in full-screen DataSheet when session row is clicked
- [ ] Content longer than 1,000 chars is truncated with expand button
- [ ] Session summary shows correct totals (cost, exchanges, cache rate)
- [ ] DLP findings (if any) highlighted in trace entries

#### US-6.6 SSO/Cognito (A-12)

- [ ] Cognito User Pool deployed with email sign-in
- [ ] Existing users migrated to Cognito (all receive email invitation)
- [ ] Dashboard OIDC flow works end-to-end: login → Cognito → callback → dashboard
- [ ] Lambda auth middleware accepts both legacy HS256 and Cognito RS256 tokens during migration window
- [ ] After migration cutover: legacy HS256 tokens rejected; Cognito tokens accepted
- [ ] Agent tokens (HS256, 90-day) continue to work without interruption
- [ ] SSO: Google Workspace login tested with at least one real corporate account

#### US-6.3 Multi-Tenancy (A-3) — only if Decision #4 gate passes

- [ ] All S3 keys prefixed with `{orgId}/` — verified by listing bucket contents
- [ ] S3 operations scoped to requesting org's prefix (no cross-org key access)
- [ ] JWT `orgId` claim present and validated in all requests
- [ ] Penetration test: attempt to read `orgId: 'org-b'` data with `orgId: 'org-a'` token → 403
- [ ] Default `orgId: 'default'` used for all existing single-tenant data after migration
- [ ] Migration script: all existing keys renamed under `default/` prefix; no data loss

### 9.2 Test Strategy

| Type | Scope | Tools |
|------|-------|-------|
| DynamoDB migration validation | Compare member counts DDB vs S3 pre/post | Node.js script |
| Load testing | 100 concurrent agent syncs | Artillery or k6 |
| WebSocket connection lifecycle | Connect → receive messages → disconnect → auto-cleanup | Vitest integration test |
| SQS message handling | Publish to local SQS (ElasticMQ) → verify aggregation triggered | Vitest + ElasticMQ |
| Multi-tenancy isolation | Cross-tenant access attempt returns 403 | Vitest HTTP tests |
| Trace viewer rendering | Session with 50 exchanges renders in < 3s | Browser performance test |
| Cognito JWT verification | RS256 token from real Cognito verified in Lambda | Integration test |
| Data partitioning correctness | Monthly summary from daily files = monthly summary from monthly file | Golden file test |

### 9.3 Monitoring

| Metric | Alarm Threshold | Action |
|--------|----------------|--------|
| DynamoDB latency P99 | > 50ms | Investigate provisioned capacity |
| SQS queue depth | > 100 messages | Check aggregator Lambda errors |
| SQS dead letter queue depth | > 0 | Alert on-call immediately |
| WebSocket connection count | > 90 (approaching limit) | Alert for capacity planning |
| ETag retry errors | > 0 after migration | Verify DynamoDB migration completed |
| Cognito authentication failures | > 10/minute | Investigate auth issues |

---

## 10. References

### Source Planning Artifacts

- `grooming-artifacts/planning-artifacts/prd-draft.md` — Phase 6 section: US-6.1–US-6.7 user stories with acceptance criteria and MoSCoW prioritization
- `grooming-artifacts/planning-artifacts/architecture.md` — Sections 6.1–6.7: DynamoDB CloudFormation, DynamoDB record schemas, daily partition schema, WebSocket CloudFormation, SQS CloudFormation, Cognito CloudFormation, SessionTrace interface, and all TypeScript code samples
- `grooming-artifacts/planning-artifacts/analysis.md` — Section 7: Phase 6 stakeholder analysis, business value, risk assessment, compliance requirements, success metrics, dependencies, and recommendations
- `grooming-artifacts/planning-artifacts/ux-design.md` — Section 10: Phase 6 live indicator wireframes, activity feed wireframe, trace viewer full-screen DataSheet wireframe, Phase 6 component inventory
- `grooming-artifacts/planning-artifacts/decision-log.md` — Decision #4 (multi-tenancy gate), Decision #5 (DynamoDB in Phase 6 only), Decision #6 (streaming aggregation stays in Phase 6)

### Related SRS Documents

- `docs/srs/01-security-hardening.md` — Phase 1: Auth infrastructure (JWT, user store, agent tokens) that Phase 6 A-12 migrates
- `docs/srs/02-analytics-metrics.md` — Phase 2: Aggregated data model that Phase 6 partitions
- `docs/srs/03-platform-features.md` — Phase 3: RBAC system used by trace viewer access control
- `docs/srs/04-isms-compliance.md` — Phase 4: DLP findings (`DLPFinding[]`) surfaced in trace viewer
- `docs/srs/05-advanced-analytics.md` — Phase 5: Webhooks and integrations that receive `WSMessage` events

### Key Existing Files

- `lambda-server/src/lib/s3.ts` — S3 key helpers to be updated for daily partitioning and orgId prefix
- `lambda-server/src/lib/types.ts` — Type definitions to be extended with Phase 6 interfaces
- `lambda-server/src/routes/sync.ts` — Sync endpoint to add DynamoDB, SQS, and daily partition writes
- `lambda-server/src/aggregator.ts` — Aggregator to add SQS trigger and incremental aggregation
- `lambda-server/serverless.yml` — All CloudFormation resource additions for Phase 6
- `be-agent/src/lib/collector.ts` — JSONL parser to be enhanced for assistant response capture
- `dashboard/src/hooks/` — Location for new `use-websocket.ts` hook
- `dashboard/src/components/members/` — Location for `trace-viewer.tsx`, `trace-message.tsx`, `session-summary.tsx`

### AWS Documentation

- [DynamoDB PAY_PER_REQUEST pricing](https://aws.amazon.com/dynamodb/pricing/on-demand/)
- [API Gateway WebSocket APIs](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html)
- [Amazon SQS long polling and batching](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-long-polling.html)
- [Amazon Cognito User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools.html)
- [S3 Batch Operations](https://docs.aws.amazon.com/AmazonS3/latest/userguide/batch-ops.html)

---

*SRS document generated by synthesizing prd-draft.md, architecture.md, analysis.md, ux-design.md, and decision-log.md for Phase 6: Scale & Real-time. Decisions #4, #5, and #6 from the decision log are incorporated directly into the relevant requirement sections.*
