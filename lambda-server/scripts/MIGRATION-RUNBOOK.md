# Migration Runbook: PostgreSQL to S3

This document outlines the step-by-step process for migrating from the PostgreSQL-based server to the S3-based serverless architecture.

## Prerequisites

- [ ] AWS CLI configured with appropriate credentials
- [ ] Access to existing PostgreSQL database
- [ ] S3 bucket created via `serverless deploy`
- [ ] Lambda functions deployed and working

## Phase 1: Pre-Migration Setup

### 1.1 Deploy Serverless Infrastructure

```bash
cd lambda-server
pnpm install
pnpm build:lambda
serverless deploy --stage dev
```

Verify deployment:
```bash
serverless info --stage dev
# Note the API endpoint and S3 bucket name
```

### 1.2 Test API Health

```bash
curl https://{api-endpoint}/health
# Should return: {"status":"ok","timestamp":"...","environment":"production","bucket":"ccusage-data-dev"}
```

## Phase 2: Data Export

### 2.1 Run Migration (Dry Run)

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"
export BUCKET_NAME="ccusage-data-dev"
export AWS_REGION="ap-southeast-1"

npx tsx scripts/migrate-pg-to-s3.ts --dry-run
```

Review the output:
- Check member count
- Check record count per member
- Verify no errors

### 2.2 Run Migration (Execute)

```bash
npx tsx scripts/migrate-pg-to-s3.ts --execute
```

This will:
1. Export all members to `members/index.json`
2. Export usage records to `raw/{memberId}/{year}-{month}.json`
3. Export sync logs to `sync-logs/{year}-{month}/{memberId}.json`

## Phase 3: Verification

### 3.1 Run Verification Script

```bash
npx tsx scripts/verify-migration.ts
```

All checks must pass:
- [ ] Member count matches
- [ ] Total record count matches
- [ ] Total cost matches (within $0.01)
- [ ] Sync log count matches
- [ ] Records per member match
- [ ] Sample records verified

### 3.2 Trigger Aggregator

Generate pre-computed views:

```bash
npx tsx scripts/trigger-aggregator.ts
```

Or invoke directly:
```bash
serverless invoke --function aggregator --stage dev
```

### 3.3 Verify Dashboard API

```bash
# Dashboard endpoint
curl https://{api-endpoint}/api/dashboard

# Members endpoint
curl https://{api-endpoint}/api/members

# Member detail (use actual member ID)
curl https://{api-endpoint}/api/members/{member-id}
```

## Phase 4: Parallel Running

### 4.1 Configure Dual-Write (if needed)

For new syncs to go to both systems, update agent to POST to both endpoints:

```bash
# Update be-agent configuration
pnpm start setup --server https://{new-api-endpoint}
```

### 4.2 Monitor Both Systems

- Monitor new Lambda via CloudWatch Logs
- Monitor old PostgreSQL server
- Compare data periodically

### 4.3 Duration

Run in parallel for minimum 7 days to ensure:
- All agents have synced to new system
- No data discrepancies
- Dashboard works correctly

## Phase 5: Cutover

### 5.1 Pre-Cutover Checklist

- [ ] 7+ days of successful parallel running
- [ ] All verification checks pass
- [ ] Dashboard displays correct data
- [ ] All team members have synced to new system
- [ ] Rollback plan documented

### 5.2 Cutover Steps

1. **Update Dashboard Configuration**
   ```bash
   # In dashboard/.env.local
   API_SERVER_URL=https://{new-api-endpoint}
   ```

2. **Restart Dashboard**
   ```bash
   cd dashboard
   pnpm build && pnpm start
   ```

3. **Verify Dashboard**
   - Check all pages load correctly
   - Verify data matches expectations

4. **Stop Old Server** (optional, keep for rollback)
   ```bash
   # Keep PostgreSQL running for 7 days as fallback
   # Don't delete data yet
   ```

### 5.3 Update Agent Documentation

Update CLAUDE.md and any agent setup documentation with new API URL.

## Phase 6: Post-Cutover

### 6.1 Monitor (7 days)

- CloudWatch alarms are in OK state
- No sync failures
- Dashboard loads correctly
- Aggregator runs hourly without errors

### 6.2 Cleanup (after 7 days)

- [ ] Verify all data accessible
- [ ] Delete old PostgreSQL database (optional)
- [ ] Remove old server deployment

## Rollback Procedure

If issues occur, rollback is simple:

### Immediate Rollback

1. **Revert Dashboard Configuration**
   ```bash
   # In dashboard/.env.local
   API_SERVER_URL=http://old-server:3003
   ```

2. **Restart Dashboard**

3. **Agents continue working** (they don't care which backend)

### Data Recovery

PostgreSQL retains all data synced during parallel running.
No data loss possible if parallel running was done correctly.

## Troubleshooting

### Migration Script Fails

- Check DATABASE_URL is correct
- Check AWS credentials have S3 write permissions
- Check network connectivity to both PG and S3

### Verification Fails

- Record count mismatch: Re-run migration
- Cost mismatch: Check floating point precision
- Sample check fails: Investigate specific records

### Aggregator Fails

- Check CloudWatch Logs for errors
- Verify S3 permissions
- Check raw data files are valid JSON

### Dashboard Shows Empty Data

- Verify aggregator has run
- Check `views/dashboard.json` exists in S3
- Check API endpoint is correct

## Support

For issues during migration:
1. Check CloudWatch Logs
2. Run verification script
3. Review this runbook
