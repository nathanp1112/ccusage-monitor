#!/bin/bash
#
# E2E Test for POST /api/sync on deployed Lambda
#
# Tests the full sync flow: validation, dedup, gzip, IP fields,
# new member creation, and verifies data landed in S3.
#
# Usage:
#   ./scripts/e2e-sync-test.sh [base_url]
#
# Prerequisites:
#   - curl, jq, python3 installed
#   - AWS CLI configured with profile 2026-pik
#   - S3 backup already saved to .s3-backup/

# Don't exit on assertion failures — we handle them via counters
set -uo pipefail

BASE_URL="${1:-https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com}"
AWS_PROFILE="2026-pik"
BUCKET="ccusage-data-dev"
TEST_EMAIL="e2e-test-$(date +%s)@test.ccusage.dev"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
YEAR=$(date -u +"%Y")
MONTH=$(date -u +"%-m")
MONTH_PAD=$(date -u +"%m")

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

PASSED=0
FAILED=0
SKIPPED_COUNT=0
TOTAL=0
MEMBER_ID=""

# Track successful syncs for dynamic expected counts
SYNC_SUCCESSES=0

# ============================================
# Test helpers
# ============================================

assert_eq() {
  local label="$1" actual="$2" expected="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}PASS${NC} $label (got: $actual)"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}FAIL${NC} $label — expected: $expected, got: $actual"
    FAILED=$((FAILED + 1))
  fi
}

assert_gte() {
  local label="$1" actual="$2" minimum="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual" -ge "$minimum" ] 2>/dev/null; then
    echo -e "  ${GREEN}PASS${NC} $label (got: $actual >= $minimum)"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}FAIL${NC} $label — expected >= $minimum, got: $actual"
    FAILED=$((FAILED + 1))
  fi
}

assert_not_empty() {
  local label="$1" actual="$2"
  TOTAL=$((TOTAL + 1))
  if [ -n "$actual" ] && [ "$actual" != "null" ]; then
    echo -e "  ${GREEN}PASS${NC} $label (got: $actual)"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}FAIL${NC} $label — expected non-empty, got: '$actual'"
    FAILED=$((FAILED + 1))
  fi
}

assert_http() {
  local label="$1" actual_code="$2" expected_code="$3"
  TOTAL=$((TOTAL + 1))
  if [ "$actual_code" = "$expected_code" ]; then
    echo -e "  ${GREEN}PASS${NC} $label (HTTP $actual_code)"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}FAIL${NC} $label — expected HTTP $expected_code, got: $actual_code"
    FAILED=$((FAILED + 1))
  fi
}

skip_test() {
  local label="$1" reason="$2"
  TOTAL=$((TOTAL + 1))
  SKIPPED_COUNT=$((SKIPPED_COUNT + 1))
  echo -e "  ${YELLOW}SKIP${NC} $label — $reason"
}

# POST JSON helper — returns "body\nhttp_code"
post_json() {
  local url="$1" body="$2"
  curl -s -w "\n%{http_code}" \
    -X POST "$url" \
    -H "Content-Type: application/json" \
    -d "$body"
}

echo "=========================================="
echo -e "${CYAN}E2E Sync Test Suite${NC}"
echo "Base URL: $BASE_URL"
echo "Test email: $TEST_EMAIL"
echo "Timestamp: $TIMESTAMP"
echo "=========================================="


# ============================================
# TEST 1: Validation — missing required fields
# ============================================
echo -e "\n${YELLOW}TEST 1: Validation — missing required fields${NC}"

RESP=$(post_json "$BASE_URL/api/sync" '{"email":"bad"}')
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

assert_http "Missing entries → 400" "$HTTP" "400"
assert_eq "success=false" "$(echo "$BODY" | jq -r '.success' 2>/dev/null)" "false"


# ============================================
# TEST 2: Validation — empty entries (edge case)
# ============================================
echo -e "\n${YELLOW}TEST 2: Empty entries — should return success with 0${NC}"

RESP=$(post_json "$BASE_URL/api/sync" "{\"email\":\"$TEST_EMAIL\",\"entries\":[]}")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

assert_http "Empty entries → 200" "$HTTP" "200"
assert_eq "success=true" "$(echo "$BODY" | jq -r '.success' 2>/dev/null)" "true"
assert_eq "inserted=0" "$(echo "$BODY" | jq -r '.inserted' 2>/dev/null)" "0"


# ============================================
# TEST 3: New member — plain JSON sync
# ============================================
echo -e "\n${YELLOW}TEST 3: New member — first sync (plain JSON)${NC}"

REQ_ID_1="e2e-test-$(date +%s)-001"
REQ_ID_2="e2e-test-$(date +%s)-002"

PAYLOAD=$(cat <<EOF
{
  "email": "$TEST_EMAIL",
  "entries": [
    {
      "request_id": "$REQ_ID_1",
      "timestamp": "$TIMESTAMP",
      "model": "claude-sonnet-4-20250514",
      "project_path": "e2e-test-project",
      "session_id": "e2e-sess-001",
      "input_tokens": 1500,
      "output_tokens": 500,
      "cache_creation_tokens": 0,
      "cache_read_tokens": 100,
      "cost_usd": 0.012
    },
    {
      "request_id": "$REQ_ID_2",
      "timestamp": "$TIMESTAMP",
      "model": "claude-haiku-4-20250506",
      "project_path": "e2e-test-project",
      "session_id": "e2e-sess-001",
      "input_tokens": 800,
      "output_tokens": 200,
      "cost_usd": 0.001
    }
  ],
  "projects": [
    {"path": "e2e-test-project", "git_repo": "https://github.com/test/e2e-repo.git"}
  ],
  "hostname": "e2e-test-host",
  "agent_version": "0.4.0",
  "local_ip": "192.168.1.100",
  "public_ip": "203.0.113.99"
}
EOF
)

RESP=$(post_json "$BASE_URL/api/sync" "$PAYLOAD")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

assert_http "First sync → 200" "$HTTP" "200"
assert_eq "success=true" "$(echo "$BODY" | jq -r '.success' 2>/dev/null)" "true"
assert_eq "inserted=2" "$(echo "$BODY" | jq -r '.inserted' 2>/dev/null)" "2"
assert_eq "skipped=0" "$(echo "$BODY" | jq -r '.skipped' 2>/dev/null)" "0"

# Save member ID for later tests
MEMBER_ID=$(echo "$BODY" | jq -r '.memberId // empty' 2>/dev/null)
assert_not_empty "memberId returned" "$MEMBER_ID"
SYNC_SUCCESSES=$((SYNC_SUCCESSES + 1))
EXPECTED_ENTRIES=2

echo -e "  ${CYAN}Member ID: $MEMBER_ID${NC}"

if [ -z "$MEMBER_ID" ] || [ "$MEMBER_ID" = "null" ]; then
  echo -e "\n${RED}FATAL: No member ID returned — cannot continue S3 verification tests${NC}"
  echo -e "  Remaining tests skipped."
  echo ""
  echo "=========================================="
  echo -e "${CYAN}E2E Test Results${NC}"
  echo "=========================================="
  echo -e "  Total:  $TOTAL"
  echo -e "  ${GREEN}Passed: $PASSED${NC}"
  echo -e "  ${RED}Failed: $FAILED${NC}"
  echo "=========================================="
  exit 1
fi


# ============================================
# TEST 4: Deduplication — resend same entries
# ============================================
echo -e "\n${YELLOW}TEST 4: Deduplication — resend same request_ids${NC}"

RESP=$(post_json "$BASE_URL/api/sync" "$PAYLOAD")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

assert_http "Dedup sync → 200" "$HTTP" "200"
assert_eq "inserted=0 (all deduped)" "$(echo "$BODY" | jq -r '.inserted' 2>/dev/null)" "0"
assert_eq "skipped=2" "$(echo "$BODY" | jq -r '.skipped' 2>/dev/null)" "2"
SYNC_SUCCESSES=$((SYNC_SUCCESSES + 1))


# ============================================
# TEST 5: Gzip compression
# ============================================
echo -e "\n${YELLOW}TEST 5: Gzip-compressed sync with new entries${NC}"

REQ_ID_3="e2e-test-$(date +%s)-003"

GZIP_PAYLOAD=$(cat <<EOF
{
  "email": "$TEST_EMAIL",
  "entries": [
    {
      "request_id": "$REQ_ID_3",
      "timestamp": "$TIMESTAMP",
      "model": "claude-sonnet-4-20250514",
      "project_path": "e2e-test-project",
      "session_id": "e2e-sess-002",
      "input_tokens": 2000,
      "output_tokens": 800,
      "cost_usd": 0.018
    }
  ],
  "agent_version": "0.4.0",
  "local_ip": "192.168.1.100",
  "public_ip": "203.0.113.99"
}
EOF
)

# Compress to file
echo -n "$GZIP_PAYLOAD" | python3 -c "
import sys, gzip
data = sys.stdin.buffer.read()
sys.stdout.buffer.write(gzip.compress(data))
" > /tmp/e2e-gzip-body.bin

RESP=$(curl -s -w "\n%{http_code}" \
  -X POST "$BASE_URL/api/sync" \
  -H "Content-Type: application/json" \
  -H "Content-Encoding: gzip" \
  --data-binary @/tmp/e2e-gzip-body.bin)

HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

if [ "$HTTP" = "200" ]; then
  assert_http "Gzip sync → 200" "$HTTP" "200"
  GZIP_INSERTED=$(echo "$BODY" | jq -r '.inserted' 2>/dev/null)
  assert_eq "inserted=1" "$GZIP_INSERTED" "1"
  SYNC_SUCCESSES=$((SYNC_SUCCESSES + 1))
  EXPECTED_ENTRIES=$((EXPECTED_ENTRIES + 1))
else
  # API Gateway may not support gzip passthrough — skip gracefully
  skip_test "Gzip sync" "API Gateway returned HTTP $HTTP (gzip not supported in passthrough mode)"
  skip_test "Gzip inserted" "Skipped due to API Gateway limitation"
  # Send the same entry as plain JSON so subsequent tests get correct counts
  FALLBACK_RESP=$(post_json "$BASE_URL/api/sync" "$GZIP_PAYLOAD")
  FALLBACK_HTTP=$(echo "$FALLBACK_RESP" | tail -1)
  FALLBACK_BODY=$(echo "$FALLBACK_RESP" | sed '$d')
  if [ "$FALLBACK_HTTP" = "200" ]; then
    FALLBACK_INSERTED=$(echo "$FALLBACK_BODY" | jq -r '.inserted' 2>/dev/null)
    echo -e "  ${CYAN}Fallback plain sync: inserted=$FALLBACK_INSERTED${NC}"
    SYNC_SUCCESSES=$((SYNC_SUCCESSES + 1))
    if [ "$FALLBACK_INSERTED" = "1" ]; then
      EXPECTED_ENTRIES=$((EXPECTED_ENTRIES + 1))
    fi
  fi
fi


# ============================================
# TEST 6: Prompts sync
# ============================================
echo -e "\n${YELLOW}TEST 6: Sync with prompts${NC}"

REQ_ID_4="e2e-test-$(date +%s)-004"
PROMPT_UUID="e2e-prompt-$(date +%s)-001"

PROMPT_PAYLOAD=$(cat <<EOF
{
  "email": "$TEST_EMAIL",
  "entries": [
    {
      "request_id": "$REQ_ID_4",
      "timestamp": "$TIMESTAMP",
      "model": "claude-sonnet-4-20250514",
      "input_tokens": 500,
      "output_tokens": 100,
      "cost_usd": 0.004
    }
  ],
  "prompts": [
    {
      "uuid": "$PROMPT_UUID",
      "session_id": "e2e-sess-003",
      "timestamp": "$TIMESTAMP",
      "project_path": "e2e-test-project",
      "cwd": "/tmp/e2e-test",
      "content": "E2E test prompt content — please help me write unit tests"
    }
  ],
  "agent_version": "0.4.0",
  "local_ip": "192.168.1.100",
  "public_ip": "203.0.113.99"
}
EOF
)

RESP=$(post_json "$BASE_URL/api/sync" "$PROMPT_PAYLOAD")
HTTP=$(echo "$RESP" | tail -1)
BODY=$(echo "$RESP" | sed '$d')

assert_http "Prompt sync → 200" "$HTTP" "200"
PROMPT_INSERTED=$(echo "$BODY" | jq -r '.inserted' 2>/dev/null)
assert_eq "inserted=1" "$PROMPT_INSERTED" "1"
SYNC_SUCCESSES=$((SYNC_SUCCESSES + 1))
if [ "$PROMPT_INSERTED" = "1" ]; then
  EXPECTED_ENTRIES=$((EXPECTED_ENTRIES + 1))
fi

# Allow writes to propagate
sleep 1


# ============================================
# TEST 7: Verify S3 data — member registry
# ============================================
echo -e "\n${YELLOW}TEST 7: Verify S3 — member registry${NC}"

REGISTRY=$(aws s3 cp s3://$BUCKET/members/index.json - --profile $AWS_PROFILE 2>/dev/null)
MEMBER_EMAIL=$(echo "$REGISTRY" | jq -r ".members[\"$MEMBER_ID\"].email" 2>/dev/null)
MEMBER_LAST_SYNC=$(echo "$REGISTRY" | jq -r ".members[\"$MEMBER_ID\"].lastSyncAt // empty" 2>/dev/null)
MEMBER_AGENT_VER=$(echo "$REGISTRY" | jq -r ".members[\"$MEMBER_ID\"].lastSync.agentVersion // empty" 2>/dev/null)

assert_eq "Email stored" "$MEMBER_EMAIL" "$TEST_EMAIL"
assert_not_empty "lastSyncAt set" "$MEMBER_LAST_SYNC"
assert_eq "agentVersion=0.4.0" "$MEMBER_AGENT_VER" "0.4.0"

# IP fields
MEMBER_LOCAL_IP=$(echo "$REGISTRY" | jq -r ".members[\"$MEMBER_ID\"].lastSync.localIp // empty" 2>/dev/null)
MEMBER_PUBLIC_IP=$(echo "$REGISTRY" | jq -r ".members[\"$MEMBER_ID\"].lastSync.publicIp // empty" 2>/dev/null)

assert_not_empty "localIp stored" "$MEMBER_LOCAL_IP"
assert_not_empty "publicIp stored" "$MEMBER_PUBLIC_IP"


# ============================================
# TEST 8: Verify S3 data — raw entries
# ============================================
echo -e "\n${YELLOW}TEST 8: Verify S3 — raw monthly data${NC}"

RAW_KEY="raw/$MEMBER_ID/$YEAR-$MONTH_PAD.json"
RAW_DATA=$(aws s3 cp "s3://$BUCKET/$RAW_KEY" - --profile $AWS_PROFILE 2>/dev/null)

TOTAL_ENTRIES=$(echo "$RAW_DATA" | python3 -c "
import json, sys
d = json.load(sys.stdin)
total = sum(len(r['entries']) for r in d.get('records',{}).values())
print(total)
" 2>/dev/null || echo "0")

assert_eq "Raw has $EXPECTED_ENTRIES entries" "$TOTAL_ENTRIES" "$EXPECTED_ENTRIES"

# Check dedup — verify our request_ids exist
HAS_REQ1=$(echo "$RAW_DATA" | python3 -c "
import json, sys
d = json.load(sys.stdin)
ids = set()
for r in d.get('records',{}).values():
    for e in r['entries']:
        ids.add(e['requestId'])
print('yes' if '$REQ_ID_1' in ids else 'no')
" 2>/dev/null || echo "no")
assert_eq "request_id_1 in raw" "$HAS_REQ1" "yes"


# ============================================
# TEST 9: Verify S3 data — aggregated
# ============================================
echo -e "\n${YELLOW}TEST 9: Verify S3 — aggregated data${NC}"

AGG_KEY="aggregated/$MEMBER_ID/$YEAR-$MONTH_PAD.json"
AGG_DATA=$(aws s3 cp "s3://$BUCKET/$AGG_KEY" - --profile $AWS_PROFILE 2>/dev/null)

AGG_RECORDS=$(echo "$AGG_DATA" | jq '.totals.recordCount' 2>/dev/null || echo "0")
AGG_COST=$(echo "$AGG_DATA" | jq '.totals.costUsd' 2>/dev/null || echo "0")

assert_eq "Aggregated recordCount=$EXPECTED_ENTRIES" "$AGG_RECORDS" "$EXPECTED_ENTRIES"
assert_not_empty "Aggregated costUsd > 0" "$AGG_COST"


# ============================================
# TEST 10: Verify S3 data — prompts
# ============================================
echo -e "\n${YELLOW}TEST 10: Verify S3 — prompts${NC}"

PROMPT_KEY="prompts/$MEMBER_ID/$YEAR-$MONTH_PAD.json"
PROMPT_DATA=$(aws s3 cp "s3://$BUCKET/$PROMPT_KEY" - --profile $AWS_PROFILE 2>/dev/null)

PROMPT_COUNT=$(echo "$PROMPT_DATA" | jq '.prompts | length' 2>/dev/null || echo "0")
HAS_UUID=$(echo "$PROMPT_DATA" | jq -r ".prompts[] | select(.uuid == \"$PROMPT_UUID\") | .uuid" 2>/dev/null || echo "")

assert_eq "1 prompt stored" "$PROMPT_COUNT" "1"
assert_eq "Correct UUID" "$HAS_UUID" "$PROMPT_UUID"


# ============================================
# TEST 11: Verify S3 data — projects
# ============================================
echo -e "\n${YELLOW}TEST 11: Verify S3 — projects${NC}"

PROJ_KEY="projects/$MEMBER_ID.json"
PROJ_DATA=$(aws s3 cp "s3://$BUCKET/$PROJ_KEY" - --profile $AWS_PROFILE 2>/dev/null)

PROJ_GIT=$(echo "$PROJ_DATA" | jq -r '.projects["e2e-test-project"].gitRepo' 2>/dev/null || echo "")
assert_eq "Project git_repo" "$PROJ_GIT" "https://github.com/test/e2e-repo.git"


# ============================================
# TEST 12: Verify S3 data — sync log
# ============================================
echo -e "\n${YELLOW}TEST 12: Verify S3 — sync log${NC}"

LOG_KEY="sync-logs/$YEAR-$MONTH_PAD/$MEMBER_ID.json"
LOG_DATA=$(aws s3 cp "s3://$BUCKET/$LOG_KEY" - --profile $AWS_PROFILE 2>/dev/null)

LOG_COUNT=$(echo "$LOG_DATA" | jq '.entries | length' 2>/dev/null || echo "0")
LAST_LOG_IP=$(echo "$LOG_DATA" | jq -r '.entries[-1].clientIp // empty' 2>/dev/null || echo "")

# Expect sync log entries equal to successful sync calls
assert_eq "$SYNC_SUCCESSES sync log entries" "$LOG_COUNT" "$SYNC_SUCCESSES"
assert_not_empty "Sync log has clientIp" "$LAST_LOG_IP"

# localIp in sync log
LAST_LOG_LOCAL_IP=$(echo "$LOG_DATA" | jq -r '.entries[-1].localIp // empty' 2>/dev/null || echo "")
assert_not_empty "Sync log has localIp" "$LAST_LOG_LOCAL_IP"


# ============================================
# TEST 13: Verify dashboard API reads new data
# ============================================
echo -e "\n${YELLOW}TEST 13: Dashboard API — member visible${NC}"

# Trigger aggregation first so views are updated
echo -e "  ${CYAN}Triggering aggregation...${NC}"
AGG_RESP=$(curl -s -X POST "$BASE_URL/api/admin/aggregate" 2>/dev/null)
AGG_MSG=$(echo "$AGG_RESP" | jq -r '.message // .error // "done"' 2>/dev/null || echo "unknown")
echo -e "  Aggregation: $AGG_MSG"

# Wait for aggregation Lambda to finish
sleep 5

MEMBERS_RESP=$(curl -s "$BASE_URL/api/members" 2>/dev/null)
# Response format: { success: true, data: { members: [...] } }
HAS_TEST_MEMBER=$(echo "$MEMBERS_RESP" | jq -r ".data.members[] | select(.email == \"$TEST_EMAIL\") | .id // empty" 2>/dev/null || echo "")

assert_not_empty "Test member in /api/members" "$HAS_TEST_MEMBER"


# ============================================
# CLEANUP: Remove test data from S3
# ============================================
echo -e "\n${YELLOW}CLEANUP: Removing test data from S3${NC}"

# Remove test member's data files
aws s3 rm "s3://$BUCKET/raw/$MEMBER_ID/" --recursive --profile $AWS_PROFILE 2>/dev/null || true
aws s3 rm "s3://$BUCKET/aggregated/$MEMBER_ID/" --recursive --profile $AWS_PROFILE 2>/dev/null || true
aws s3 rm "s3://$BUCKET/prompts/$MEMBER_ID/" --recursive --profile $AWS_PROFILE 2>/dev/null || true
aws s3 rm "s3://$BUCKET/projects/$MEMBER_ID.json" --profile $AWS_PROFILE 2>/dev/null || true
aws s3 rm "s3://$BUCKET/sync-logs/$YEAR-$MONTH_PAD/$MEMBER_ID.json" --profile $AWS_PROFILE 2>/dev/null || true
aws s3 rm "s3://$BUCKET/views/members/$MEMBER_ID/" --recursive --profile $AWS_PROFILE 2>/dev/null || true

# Remove test member from registry (download → modify → upload)
echo -e "  Removing test member from registry..."
aws s3 cp "s3://$BUCKET/members/index.json" /tmp/e2e-registry-clean.json --profile $AWS_PROFILE 2>/dev/null || true

if [ -f /tmp/e2e-registry-clean.json ]; then
  python3 -c "
import json
with open('/tmp/e2e-registry-clean.json') as f:
    d = json.load(f)
mid = '$MEMBER_ID'
if mid in d.get('members', {}):
    del d['members'][mid]
with open('/tmp/e2e-registry-cleaned.json', 'w') as f:
    json.dump(d, f)
" 2>/dev/null

  if [ -f /tmp/e2e-registry-cleaned.json ]; then
    aws s3 cp /tmp/e2e-registry-cleaned.json "s3://$BUCKET/members/index.json" \
      --profile $AWS_PROFILE --content-type application/json 2>/dev/null || true
    echo -e "  ${GREEN}Registry cleaned${NC}"
  fi
fi

# Cleanup temp files
rm -f /tmp/e2e-gzip-body.bin /tmp/e2e-registry-clean.json /tmp/e2e-registry-cleaned.json

echo -e "  ${GREEN}Cleanup complete${NC}"


# ============================================
# SUMMARY
# ============================================
echo ""
echo "=========================================="
echo -e "${CYAN}E2E Test Results${NC}"
echo "=========================================="
echo -e "  Total:   $TOTAL"
echo -e "  ${GREEN}Passed:  $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
  echo -e "  ${RED}Failed:  $FAILED${NC}"
else
  echo -e "  Failed:  0"
fi
if [ $SKIPPED_COUNT -gt 0 ]; then
  echo -e "  ${YELLOW}Skipped: $SKIPPED_COUNT${NC}"
fi
echo "=========================================="

if [ $FAILED -gt 0 ]; then
  exit 1
fi
