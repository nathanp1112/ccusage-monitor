# RFC: Incremental Aggregation — Aggregate at the Source

**Status:** Draft / Brainstorming
**Date:** 2026-02-06
**Author:** Team discussion
**Component:** `lambda-server/src/routes/sync.ts`, `lambda-server/src/aggregator.ts`

---

## 1. Problem Statement

The current aggregator Lambda **recomputes everything from scratch** on every trigger. For a team of 10 users with 3 months of data, each invocation:

- Reads all 12 raw monthly files per user (120 S3 GETs) even though most are empty or frozen
- Re-aggregates past months that will never change
- Rewrites all output views from scratch
- Wastes Lambda execution time on redundant computation

Past months (e.g., January data when we're in March) are **frozen** — the agent only syncs data timestamped to the entry's actual date, and in practice past months stop receiving new data. Re-computing them every time is pure waste.

### Scale Impact

| Users | Months with data | Current S3 GETs per trigger | Compute |
|-------|-----------------|----------------------------|---------|
| 10 | 3 | 120 raw + 10 sync-logs + prev year | All months re-aggregated |
| 50 | 6 | 600 raw + 50 sync-logs + prev year | All months re-aggregated |
| 100 | 12 | 1200 raw + 100 sync-logs + prev year | All months re-aggregated |

---

## 2. Current Architecture Analysis

### 2.1 S3 Data Layout (Current)

```
S3 Bucket: ccusage-data-{env}
│
├── members/
│   └── index.json                              ← Member registry
│
├── raw/{memberId}/{year}-{month}.json          ← INPUT: Raw monthly data (large, has all entries)
│   Format: RawMonthlyData
│   Contains: records[date] → DailyRecord → entries[] (every UsageEntry with requestId)
│   Written by: POST /api/sync
│   Size: grows with usage — can be tens/hundreds of KB per active month
│
├── sync-logs/{year}-{month}/{memberId}.json    ← Sync audit trail
│
├── views/                                      ← OUTPUT: Pre-computed for dashboard
│   ├── dashboard.json                          ← Team-wide stats
│   ├── members.json                            ← Member list with month stats
│   └── members/{memberId}/{year}.json          ← Per-member yearly data
│
└── meta/
    └── last-processed.json                     ← Processing metadata
```

### 2.2 Current Data Flow

```
POST /api/sync (every ~20 min per user)
  │
  │ sync.ts:processMonthEntries()
  │   1. READ  raw/{memberId}/{year}-{month}.json    ← has complete month data in memory
  │   2. Dedup by request_id
  │   3. Append new entries to daily records
  │   4. WRITE raw/{memberId}/{year}-{month}.json    ← saves updated raw
  │   (done — raw data stored, nothing else computed)
  ▼

POST /api/admin/aggregate (manual trigger)
  │
  │ aggregator.ts
  │   1. Read members/index.json
  │   2. For EACH member × 12 months:
  │      READ raw/{id}/{year}-{month}.json           ← RE-READS everything sync already had
  │      COMPUTE aggregateMonthData()                ← RE-COMPUTES what sync could have done
  │   3. Generate views → WRITE to views/
  ▼

Dashboard reads views/
```

### 2.3 Key Insight: Sync Already Has the Data

Look at `sync.ts:processMonthEntries()` (lines 373-434):

```typescript
async function processMonthEntries(memberId, year, month, entries) {
  const key = getRawDataKey(memberId, year, month);
  let monthData = await getJsonFromS3<RawMonthlyData>(key);  // ← READS full month data
  // ... dedup, append entries ...
  await putJsonToS3(key, monthData);                          // ← WRITES updated raw
  // monthData is COMPLETE and IN MEMORY here
  // But we throw it away! The aggregator later re-reads and re-computes it.
}
```

**The solution should come from the input source.** The sync endpoint already has the complete raw data in memory after each write. It should produce the aggregation right there — not leave it for a separate Lambda to re-read and re-compute.

### 2.4 Internal vs Output Type Mismatch

The aggregator uses an internal `MonthAggregation` type that is **richer** than the output `MonthlyData`:

| Field | MonthAggregation (internal) | MonthlyData (output/view) |
|-------|----------------------------|--------------------------|
| `modelBreakdown` | `Record<string, ModelBreakdown>` (map) | `Array<{model, costUsd, percentage}>` (sorted array) |
| `projectBreakdown` | `Record<string, number>` (map) | `Array<{project, costUsd, percentage}>` (sorted, top 20) |
| `totals.cacheCreationTokens` | Present | Not present |
| `totals.cacheReadTokens` | Present | Not present |
| `dailyModelUsage` | Present | Present |

The aggregated files must store the **internal format** (`MonthAggregation`), not the dashboard format. The aggregator transforms internal → output when generating views.

---

## 3. Proposed Solution: Aggregate at the Source

### 3.1 Core Idea

**Move aggregation to the sync endpoint.** When `POST /api/sync` writes raw data, it also computes and writes a pre-aggregated summary for each affected month. The aggregator then reads these small summaries instead of large raw files.

```
BEFORE:                                     AFTER:
sync writes → raw only                      sync writes → raw + aggregated
aggregator reads ← raw (large, slow)        aggregator reads ← aggregated (small, fast)
```

### 3.2 New S3 Structure

```
S3 Bucket: ccusage-data-{env}
│
├── members/
│   └── index.json                              ← Member registry (unchanged)
│
├── raw/{memberId}/{year}-{month}.json          ← Raw data (unchanged, audit trail)
│   Written by: POST /api/sync
│   Contains: all individual UsageEntry records (for dedup + audit)
│   Size: large (grows with usage)
│
├── aggregated/{memberId}/{year}-{month}.json   ← NEW: Pre-computed month summary
│   Written by: POST /api/sync (at write time)
│   Format: MonthAggregation
│   Contains: totals, dailyUsage, dailyModelUsage, modelBreakdown, projectBreakdown
│   Size: small (~2-10 KB, no individual entries)
│
├── sync-logs/{year}-{month}/{memberId}.json    ← Sync audit trail (unchanged)
│
├── views/                                      ← Dashboard views (unchanged)
│   ├── dashboard.json
│   ├── members.json
│   └── members/{memberId}/{year}.json
│
└── meta/
    └── last-processed.json                     ← Processing metadata (unchanged)
```

### 3.3 New Data Flow

```
POST /api/sync (every ~20 min per user)
  │
  │ sync.ts:processMonthEntries()
  │   1. READ  raw/{memberId}/{year}-{month}.json
  │   2. Dedup, append new entries
  │   3. WRITE raw/{memberId}/{year}-{month}.json         ← raw (unchanged)
  │   4. COMPUTE aggregateMonthData(monthData)            ← NEW: aggregate in memory
  │   5. WRITE aggregated/{memberId}/{year}-{month}.json  ← NEW: write summary
  ▼

POST /api/admin/aggregate (manual trigger)
  │
  │ aggregator.ts (simplified)
  │   1. Read members/index.json
  │   2. For EACH member × months with data:
  │      READ aggregated/{id}/{year}-{month}.json         ← small pre-computed file
  │      (NO raw data read, NO re-computation)
  │   3. Combine into views → WRITE to views/
  ▼

Dashboard reads views/ (unchanged)
```

### 3.4 Why This Is Better Than a Cache Layer

| Aspect | Cache approach (RFC v1) | Aggregate at source (this RFC) |
|--------|------------------------|-------------------------------|
| Who aggregates? | Aggregator Lambda (on read) | Sync endpoint (on write) |
| Cache invalidation | Complex — HeadObject staleness check per month | None needed — sync updates aggregated file whenever raw changes |
| Extra S3 reads | HEAD per month for staleness | Zero — sync already has data in memory |
| Late sync / backdated data | Must detect stale cache | Automatically handled — sync updates both raw + aggregated |
| New infrastructure | Cache detection logic | One extra `putJsonToS3` call in sync |
| Aggregator complexity | High — cache hit/miss branching | Low — just reads pre-computed files |
| Race condition handling | Cache timestamp comparison | Natural — whoever writes last wins |

**Key advantage:** No cache invalidation problem at all. The sync endpoint is the **single writer** of both raw and aggregated data. Whenever raw changes, aggregated changes too. They are always in sync by construction.

---

## 4. Detailed Design

### 4.1 What Gets Stored in `aggregated/{memberId}/{year}-{month}.json`

The `MonthAggregation` type (currently defined in aggregator.ts, to be shared):

```typescript
interface MonthAggregation {
  year: number;
  month: number;
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    recordCount: number;
  };
  dailyUsage: DayAggregation[];          // sorted by date
  dailyModelUsage: DailyModelUsage[];    // per-day per-model breakdown
  modelBreakdown: Record<string, ModelBreakdown>;  // monthly model totals
  projectBreakdown: Record<string, number>;         // project → cost
}
```

**Size comparison:**

| File | Contains | Typical size |
|------|----------|-------------|
| `raw/{id}/2026-02.json` | Every `UsageEntry` with requestId, timestamps, individual records | 50-500 KB |
| `aggregated/{id}/2026-02.json` | Totals + daily breakdowns only, no individual entries | 2-10 KB |

The aggregator goes from reading 50-500 KB raw files to reading 2-10 KB summary files. **~50x smaller reads.**

### 4.2 Sync Endpoint Changes (`sync.ts`)

#### Current `processMonthEntries()`:

```typescript
async function processMonthEntries(memberId, year, month, entries) {
  const key = getRawDataKey(memberId, year, month);
  let monthData = await getJsonFromS3<RawMonthlyData>(key);
  // ... dedup, append ...
  await putJsonToS3(key, monthData);
  return { inserted, skipped };
}
```

#### New `processMonthEntries()`:

```typescript
async function processMonthEntries(memberId, year, month, entries) {
  const rawKey = getRawDataKey(memberId, year, month);
  const aggKey = getAggregatedDataKey(memberId, year, month);

  let monthData = await getJsonFromS3<RawMonthlyData>(rawKey);
  // ... dedup, append (unchanged) ...

  // Write raw data (unchanged)
  await putJsonToS3(rawKey, monthData);

  // NEW: Compute and write aggregation
  // monthData is ALREADY in memory — zero extra reads
  const aggregation = aggregateMonthData(monthData, year, month);
  await putJsonToS3(aggKey, aggregation);

  return { inserted, skipped };
}
```

**Cost of this change:**
- One extra `putJsonToS3()` call per month affected by the sync
- The `aggregateMonthData()` function runs in memory (fast, ~1ms for a month of data)
- Total: ~1 extra S3 PUT per sync, no extra S3 GETs

#### Shared Aggregation Logic

The `aggregateMonthData()` function currently lives in `aggregator.ts`. It must be **extracted to a shared module** so both `sync.ts` and `aggregator.ts` can use it:

```
lambda-server/src/
├── lib/
│   ├── s3.ts
│   ├── types.ts
│   └── aggregation.ts    ← NEW: shared aggregation logic
├── routes/
│   └── sync.ts           ← imports aggregateMonthData from aggregation.ts
└── aggregator.ts          ← imports aggregateMonthData from aggregation.ts
```

### 4.3 Aggregator Changes (`aggregator.ts`)

#### Current: reads raw files and aggregates

```typescript
// aggregator.ts — current
const rawDataResults = await Promise.all(
  monthNumbers.map((month) =>
    getJsonFromS3<RawMonthlyData>(getRawDataKey(memberId, year, month))  // 12 raw GETs
  )
);
for (let i = 0; i < 12; i++) {
  monthlyAggregations[String(i + 1)] = aggregateMonthData(rawDataResults[i], year, i + 1);
}
```

#### New: reads pre-aggregated files

```typescript
// aggregator.ts — new
const aggResults = await Promise.all(
  monthNumbers.map((month) =>
    getJsonFromS3<MonthAggregation>(getAggregatedDataKey(memberId, year, month))  // 12 small GETs
  )
);
for (let i = 0; i < 12; i++) {
  monthlyAggregations[String(i + 1)] = aggResults[i] || createEmptyMonthAggregation(year, i + 1);
}
```

**What changes:**
- Reads from `aggregated/` instead of `raw/`
- No call to `aggregateMonthData()` — data is already aggregated
- Reads are ~50x smaller (no individual entries)
- Past months that haven't changed still return the same pre-computed file (effectively cached by S3)

**What stays the same:**
- View generation logic (`generateDashboardView()`, `generateMembersView()`, `generateMemberYearlyView()`)
- Last 30 days calculation
- Previous year processing
- Sync log reading

### 4.4 New S3 Path Helper (`s3.ts`)

```typescript
/**
 * Get S3 key for pre-aggregated monthly data
 * Format: aggregated/{memberId}/{year}-{month}.json
 * Written by sync endpoint, read by aggregator
 */
export function getAggregatedDataKey(memberId: string, year: number, month: number): string {
  const monthStr = month.toString().padStart(2, '0');
  return `aggregated/${memberId}/${year}-${monthStr}.json`;
}
```

### 4.5 Admin Endpoint — Force Refresh (`admin.ts`)

Even though the normal flow doesn't need cache invalidation, we still want a `?force=true` option that tells the aggregator to **re-read raw files and re-aggregate** (bypassing `aggregated/`). This is useful for:

- Bug fixes to `aggregateMonthData()` logic
- Manual corrections to raw data
- Data migration / schema changes

```typescript
adminRoute.post('/aggregate', async (c) => {
  const url = new URL(c.req.url);
  const force = url.searchParams.get('force') === 'true';

  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'Event',
    Payload: JSON.stringify({
      source: 'api-trigger',
      force,  // aggregator reads raw + re-aggregates if true
    }),
  });
  // ...
});
```

When `force=true`, the aggregator:
1. Reads raw files (like today)
2. Re-computes `aggregateMonthData()` for every month
3. Writes updated `aggregated/` files
4. Generates views as normal

```bash
# Normal aggregation (reads pre-aggregated — fast)
curl -X POST ".../api/admin/aggregate"

# Force full re-aggregation from raw data (slow but rebuilds everything)
curl -X POST ".../api/admin/aggregate?force=true"
```

---

## 5. Performance Comparison

### Scenario: 10 users, current month is March 2026, data exists for Jan + Feb + Mar

#### Before (current — full recompute)

```
Aggregator per member:
  12 × GET raw/{id}/{year}-{month}.json    = 12 GETs (50-500 KB each)
  1 × GET sync-log                         = 1 GET
  Compute: aggregateMonthData() × 12

Total for 10 users:
  130 S3 GETs of large raw files
  120 aggregateMonthData() calls
  ~13 PUTs (views + meta)
```

#### After (reads pre-aggregated summaries)

```
Aggregator per member:
  12 × GET aggregated/{id}/{year}-{month}.json  = 12 GETs (2-10 KB each, 9 empty/null)
  1 × GET sync-log                               = 1 GET
  Compute: zero aggregation (already done at sync time)

Total for 10 users:
  130 S3 GETs of tiny aggregated files (~50x smaller)
  0 aggregateMonthData() calls
  ~13 PUTs (views + meta)
```

**Per-sync extra cost:**
```
  1 × aggregateMonthData() call (in-memory, ~1ms)
  1 × PUT aggregated/{id}/{year}-{month}.json (~2-10 KB)
```

#### Summary

| Metric | Before | After |
|--------|--------|-------|
| Aggregator S3 read volume | ~5-50 MB total | ~100-300 KB total |
| Aggregator compute | 120 aggregations | 0 aggregations |
| Sync extra cost | 0 | 1 small PUT per sync per affected month |
| Aggregator Lambda duration | Seconds | Milliseconds |
| Cache invalidation logic | N/A | N/A (not needed) |

---

## 6. Edge Cases

### 6.1 Late Sync / Backdated Data

**Scenario:** User syncs on March 5 with entries timestamped to February 28.

**What happens:**
1. `sync.ts:processMonthEntries()` processes February entries
2. Reads `raw/{id}/2026-02.json`, appends new entries, writes it back
3. **Also** re-computes `aggregateMonthData()` with updated raw data
4. Writes `aggregated/{id}/2026-02.json` with the new totals

**Result:** Both raw and aggregated are updated atomically in the same sync call. Next aggregation reads the updated aggregated file. **No stale data, no cache invalidation needed.**

### 6.2 Empty Months (No Data)

For months with no data:
- No raw file exists → `getJsonFromS3` returns `null`
- No aggregated file exists → `getJsonFromS3` returns `null`
- Aggregator uses `createEmptyMonthAggregation(year, month)` as fallback

**Optimization:** Use `ListObjectsV2` with prefix `aggregated/{memberId}/` to discover which months have data, then only read those. One list call replaces up to 12 GET calls that would return 404.

### 6.3 Multiple Syncs in Quick Succession (Every 20 Min)

**Scenario:** User's agent syncs at 10:00, 10:20, 10:40, each adding entries to the current month.

**What happens each time:**
1. Read raw → dedup → append → write raw
2. Compute aggregation from **full** updated raw → write aggregated

Each sync produces a **complete, accurate aggregation** for that month. The aggregated file is always consistent with the raw file because they're written in the same operation.

**No merging needed** — each aggregation is computed from the complete raw data, not incrementally patched.

### 6.4 First Deployment / Backfill

After deploying this change, existing raw data has no corresponding aggregated files. Two options:

**Option A: Run `force=true` once**
```bash
curl -X POST ".../api/admin/aggregate?force=true"
```
This reads all raw files, computes aggregations, writes aggregated files, then generates views. One-time cost, same as current behavior.

**Option B: Aggregator falls back to raw if aggregated doesn't exist**
The aggregator checks for `aggregated/` first. If missing, falls back to reading `raw/` and computing (like today). This is the safest option — zero-downtime migration.

**Recommendation:** Option B for migration safety. The fallback can be removed later once all data is populated.

### 6.5 Race Condition: Sync and Aggregator Running Simultaneously

**Scenario:** Sync is writing `aggregated/2026-02.json` while the aggregator is reading it.

**S3 behavior:** S3 provides read-after-write consistency since 2020. The aggregator either reads the old version or the new version — never a partial/corrupt file.

**Impact:** At worst, the aggregator uses slightly stale data for the current month. The next aggregation run picks up the latest. This is the same behavior as today (sync writes raw while aggregator reads raw).

### 6.6 Aggregation Logic Bug Fix

If a bug is found in `aggregateMonthData()`:
1. Fix the code
2. Deploy
3. Run `force=true` to re-aggregate all months from raw data
4. All aggregated files are rebuilt

Raw data is the **source of truth** — aggregated files can always be rebuilt.

### 6.7 Raw Data Is Still the Source of Truth

The `aggregated/` files are **derived data**, not primary data:
- `raw/` = source of truth (individual entries, dedup, audit trail)
- `aggregated/` = pre-computed summary (can be rebuilt from raw anytime)
- `views/` = dashboard output (can be rebuilt from aggregated anytime)

Deleting all `aggregated/` files and running `force=true` restores everything.

---

## 7. Implementation Plan

### 7.1 Files to Create/Modify

| File | Action | Changes |
|------|--------|---------|
| `lambda-server/src/lib/types.ts` | Modify | Add `MonthAggregation`, `DayAggregation`, `DailyModelUsage`, `DailyModelStats`, `ModelBreakdown` types |
| `lambda-server/src/lib/s3.ts` | Modify | Add `getAggregatedDataKey()` helper |
| `lambda-server/src/lib/aggregation.ts` | **Create** | Extract `aggregateMonthData()`, `createEmptyMonthAggregation()` from aggregator.ts |
| `lambda-server/src/routes/sync.ts` | Modify | Call `aggregateMonthData()` + `putJsonToS3()` after writing raw |
| `lambda-server/src/aggregator.ts` | Modify | Read from `aggregated/` instead of `raw/`, import from `aggregation.ts` |
| `lambda-server/src/routes/admin.ts` | Modify | Pass `force` query param to aggregator |

### 7.2 Step-by-Step Implementation

#### Step 1: Extract shared aggregation logic

Move these from `aggregator.ts` to new `lib/aggregation.ts`:
- `aggregateMonthData()`
- `createEmptyMonthAggregation()`
- Associated types: `MonthAggregation`, `DayAggregation`, `DailyModelUsage`, `DailyModelStats`, `ModelBreakdown`

Both `sync.ts` and `aggregator.ts` import from `lib/aggregation.ts`.

**Verification:** Existing behavior unchanged. Deploy this step alone to confirm no regressions.

#### Step 2: Add `getAggregatedDataKey()` to `s3.ts`

```typescript
export function getAggregatedDataKey(memberId: string, year: number, month: number): string {
  const monthStr = month.toString().padStart(2, '0');
  return `aggregated/${memberId}/${year}-${monthStr}.json`;
}
```

#### Step 3: Update sync endpoint to write aggregated data

In `sync.ts:processMonthEntries()`, after writing raw data:

```typescript
// After: await putJsonToS3(rawKey, monthData);

// Compute and write pre-aggregated summary
const aggregation = aggregateMonthData(monthData, year, month);
await putJsonToS3(getAggregatedDataKey(memberId, year, month), aggregation);
```

**Verification:** After deployment, every sync produces both `raw/` and `aggregated/` files. Check S3 for the new files.

#### Step 4: Update aggregator to read from `aggregated/`

Replace `getRawDataKey` with `getAggregatedDataKey` in the aggregator's data-fetching logic. Add fallback to raw for migration:

```typescript
// Try aggregated first, fall back to raw
let monthAgg = await getJsonFromS3<MonthAggregation>(getAggregatedDataKey(memberId, year, month));
if (!monthAgg) {
  // Fallback: read raw and compute (for months not yet re-synced)
  const rawData = await getJsonFromS3<RawMonthlyData>(getRawDataKey(memberId, year, month));
  monthAgg = aggregateMonthData(rawData, year, month);
}
```

#### Step 5: Add `?force=true` support

Update `admin.ts` to pass force flag. When force is true, aggregator reads from raw and re-writes aggregated files.

#### Step 6: Backfill existing data

```bash
curl -X POST ".../api/admin/aggregate?force=true"
```

This populates `aggregated/` files for all existing members/months.

#### Step 7: Remove raw fallback

After backfill is confirmed, remove the fallback logic from step 4. Aggregator reads exclusively from `aggregated/`.

---

## 8. S3 Folder Structure — Complete View

```
ccusage-data-{env}/
│
│  ╔══════════════════════════════════════════╗
│  ║  INPUT LAYER (written by sync endpoint)  ║
│  ╚══════════════════════════════════════════╝
│
├── members/
│   └── index.json                              ← Member registry
│       Written by: sync.ts (register/update)
│
├── raw/{memberId}/{year}-{month}.json          ← Raw records (source of truth)
│   Written by: sync.ts
│   Purpose: deduplication, audit trail, data recovery
│   Contains: all individual UsageEntry records with requestId
│   Read by: sync.ts (for dedup), admin (for debug/inspection)
│   Example: raw/abc-123/2026-02.json
│
├── aggregated/{memberId}/{year}-{month}.json   ← Pre-computed month summary
│   Written by: sync.ts (after writing raw)
│   Purpose: fast reads by aggregator
│   Contains: MonthAggregation (totals, daily, model, project breakdowns)
│   Read by: aggregator.ts
│   Example: aggregated/abc-123/2026-02.json
│
├── sync-logs/{year}-{month}/{memberId}.json    ← Sync audit trail
│   Written by: sync.ts
│   Read by: aggregator.ts (for recent syncs display)
│
│  ╔══════════════════════════════════════════╗
│  ║  OUTPUT LAYER (written by aggregator)    ║
│  ╚══════════════════════════════════════════╝
│
├── views/
│   ├── dashboard.json                          ← Team-wide dashboard
│   │   Read by: GET /api/dashboard
│   │
│   ├── members.json                            ← Member list with current/prev month stats
│   │   Read by: GET /api/members
│   │
│   └── members/{memberId}/{year}.json          ← Per-member yearly detail
│       Read by: GET /api/members/:id
│
│  ╔══════════════════════════════════════════╗
│  ║  META LAYER                              ║
│  ╚══════════════════════════════════════════╝
│
└── meta/
    └── last-processed.json                     ← Aggregation metadata
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  POST /api/sync  (every ~20 min per user)                       │
│                                                                 │
│  1. READ  raw/{id}/{Y}-{M}.json                                │
│  2. Dedup + append entries                                      │
│  3. WRITE raw/{id}/{Y}-{M}.json          ← source of truth     │
│  4. COMPUTE aggregateMonthData(monthData) ← in-memory, free    │
│  5. WRITE aggregated/{id}/{Y}-{M}.json   ← summary for aggr    │
│  6. WRITE sync-logs/...                                         │
│  7. UPDATE members/index.json                                   │
└────────────────────────────────────┬────────────────────────────┘
                                     │
                    aggregated/ files are now always up-to-date
                                     │
┌────────────────────────────────────▼────────────────────────────┐
│  POST /api/admin/aggregate  (manual or scheduled trigger)       │
│                                                                 │
│  1. READ members/index.json                                     │
│  2. For each member:                                            │
│     READ aggregated/{id}/{Y}-{M}.json × months     ← SMALL     │
│     (never reads raw/ — aggregated is pre-computed)             │
│  3. Combine into team-wide views                                │
│  4. WRITE views/dashboard.json                                  │
│  5. WRITE views/members.json                                    │
│  6. WRITE views/members/{id}/{Y}.json per member                │
│  7. WRITE meta/last-processed.json                              │
└────────────────────────────────────┬────────────────────────────┘
                                     │
┌────────────────────────────────────▼────────────────────────────┐
│  Dashboard (Next.js)                                            │
│                                                                 │
│  GET /api/dashboard    → reads views/dashboard.json             │
│  GET /api/members      → reads views/members.json               │
│  GET /api/members/:id  → reads views/members/{id}/{year}.json   │
└─────────────────────────────────────────────────────────────────┘
```

### Separation of Concerns

```
raw/           = "What happened"    (individual records, never modified after write)
aggregated/    = "What it means"    (computed from raw, updated on each sync)
views/         = "What to show"     (computed from aggregated, updated on trigger)
```

---

## 9. Type Definitions (Complete)

These types should be in `lib/types.ts` (moved from `aggregator.ts`):

```typescript
// ============================================
// Aggregation Types (shared by sync + aggregator)
// ============================================

export interface MonthAggregation {
  year: number;
  month: number;
  totals: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    recordCount: number;
  };
  dailyUsage: DayAggregation[];
  dailyModelUsage: DailyModelUsage[];
  modelBreakdown: Record<string, ModelBreakdown>;
  projectBreakdown: Record<string, number>;
}

export interface DayAggregation {
  date: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  recordCount: number;
}

export interface DailyModelUsage {
  date: string;
  models: DailyModelStats[];
}

export interface DailyModelStats {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface ModelBreakdown {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  recordCount: number;
}
```

---

## 10. Decision Log

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Where to aggregate | Sync endpoint (on write) | Already has raw data in memory; zero extra reads |
| 2 | Aggregated file location | `aggregated/{memberId}/{year}-{month}.json` | Mirrors raw/ structure; clear separation |
| 3 | Aggregated file format | `MonthAggregation` (internal type) | Richer than output format; aggregator can transform to views |
| 4 | Cache invalidation | Not needed | Sync writes both raw + aggregated atomically |
| 5 | Raw data retention | Keep raw/ unchanged | Source of truth, dedup, audit, data recovery |
| 6 | Force refresh | `?force=true` on aggregate endpoint | Rebuilds aggregated/ from raw/ for bug fixes/migrations |
| 7 | Migration strategy | Fallback to raw if aggregated missing | Zero-downtime deployment |
| 8 | Shared logic | New `lib/aggregation.ts` module | `aggregateMonthData()` used by both sync and aggregator |

---

## 11. Open Questions

1. **Should the aggregator skip months with no aggregated file?** Currently it reads all 12 months. Could use `ListObjectsV2` on `aggregated/{memberId}/` to discover which months have data, then only read those. Saves 9 null GETs for a user with 3 months of data.

2. **Should sync write aggregated file in parallel with raw?** Currently proposed as sequential (raw first, then aggregated). Could be parallel with `Promise.all()` for slightly faster sync response. Tradeoff: if aggregated write fails, raw still succeeds (acceptable since aggregated can be rebuilt).

3. **Aggregated file versioning?** If the `MonthAggregation` schema changes, old aggregated files may have the old format. Options: (a) always be backward compatible, (b) add a `version` field and handle migrations, (c) just run `force=true` after schema changes. Recommendation: (c) for simplicity.

4. **Event-driven aggregation (future)?** After sync writes aggregated files, could trigger the aggregator automatically via S3 event → EventBridge → Lambda. This would make the dashboard near-real-time. But adds infrastructure complexity — consider for later.

---

## 12. Summary

```
CURRENT:
  sync   → writes raw/ only
  trigger → aggregator reads raw/ (large), computes everything, writes views/

PROPOSED:
  sync   → writes raw/ + aggregated/ (pre-computed summary)
  trigger → aggregator reads aggregated/ (small), combines into views/

  trigger?force=true → aggregator reads raw/ (like today), rebuilds aggregated/ + views/
```

The optimization is **transparent to the dashboard** — output views remain identical. The aggregator becomes a lightweight **combiner** instead of a heavy **computer**. The heavy computation (aggregation) moves to the sync endpoint where the data is already in memory.

### Three-Layer Data Architecture

```
Layer 1: raw/          ← Written by sync, source of truth
Layer 2: aggregated/   ← Written by sync, pre-computed from raw
Layer 3: views/        ← Written by aggregator, combined from aggregated
```

Each layer can be rebuilt from the layer above it:
- `aggregated/` rebuilt from `raw/` via `force=true`
- `views/` rebuilt from `aggregated/` via normal aggregate trigger
