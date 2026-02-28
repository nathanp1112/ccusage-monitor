#!/bin/bash
#
# CCUsage Monitor - End-to-End Test Script
# Tests the deployed Lambda API with realistic scenarios
#
# Usage:
#   ./scripts/test-e2e.sh [API_ENDPOINT]
#
# Environment variables:
#   API_ENDPOINT - API Gateway endpoint URL
#   AWS_PROFILE - AWS profile to use (default: default)
#   AWS_REGION - AWS region (default: ap-southeast-1)
#

# set -e  # Disabled to see all test results

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_ENDPOINT="${1:-https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com}"
AWS_PROFILE="${AWS_PROFILE:-default}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
FUNCTION_NAME="ccusage-monitor-dev-aggregator"

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_error() {
    echo -e "${RED}[FAIL]${NC} $1"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_section() {
    echo ""
    echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  $1${NC}"
    echo -e "${YELLOW}════════════════════════════════════════════════════════════════${NC}"
}

# Generate random request ID
generate_request_id() {
    uuidgen | tr '[:upper:]' '[:lower:]'
}

# Generate ISO timestamp
now_iso() {
    date -u +"%Y-%m-%dT%H:%M:%S.000Z"
}

# Generate date for today
today_date() {
    date -u +"%Y-%m-%d"
}

# ============================================
# Test: Health Check
# ============================================
test_health_check() {
    log_section "Test: Health Check"

    log_info "Calling GET /health..."
    RESPONSE=$(curl -s -w "\n%{http_code}" "${API_ENDPOINT}/health")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "200" ]; then
        log_success "Health check returned 200"
        echo "$BODY" | jq .
    else
        log_error "Health check failed with status $HTTP_CODE"
        echo "$BODY"
        return 1
    fi
}

# ============================================
# Test: Sync Single User
# ============================================
test_sync_single_user() {
    log_section "Test: Sync Single User"

    local EMAIL="alice@example.com"
    local NAME="Alice Developer"
    local REQUEST_ID=$(generate_request_id)
    local TIMESTAMP=$(now_iso)

    log_info "Syncing usage data for $EMAIL..."

    PAYLOAD=$(cat <<EOF
{
  "email": "$EMAIL",
  "name": "$NAME",
  "hostname": "macbook-alice",
  "agent_version": "1.0.0",
  "entries": [
    {
      "request_id": "$REQUEST_ID",
      "timestamp": "$TIMESTAMP",
      "model": "claude-sonnet-4-20250514",
      "project_path": "/Users/alice/projects/webapp",
      "session_id": "session-001",
      "input_tokens": 1500,
      "output_tokens": 800,
      "cache_creation_tokens": 100,
      "cache_read_tokens": 50,
      "cost_usd": 0.0125,
      "claude_version": "1.0.0"
    }
  ]
}
EOF
)

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" \
        "${API_ENDPOINT}/api/sync")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "200" ]; then
        INSERTED=$(echo "$BODY" | jq -r '.inserted')
        if [ "$INSERTED" == "1" ]; then
            log_success "Sync inserted 1 record for $EMAIL"
        else
            log_success "Sync completed (inserted: $INSERTED, possibly duplicate)"
        fi
        echo "$BODY" | jq .

        # Save member ID for later tests
        ALICE_MEMBER_ID=$(echo "$BODY" | jq -r '.memberId // empty')
        if [ -n "$ALICE_MEMBER_ID" ]; then
            export ALICE_MEMBER_ID
            log_info "Alice member ID: $ALICE_MEMBER_ID"
        fi
    else
        log_error "Sync failed with status $HTTP_CODE"
        echo "$BODY"
        return 1
    fi
}

# ============================================
# Test: Sync Multi-Device Same User
# ============================================
test_sync_multi_device() {
    log_section "Test: Sync Multi-Device Same User"

    local EMAIL="bob@example.com"
    local NAME="Bob Engineer"

    # Device 1: MacBook
    log_info "Syncing from Device 1 (MacBook)..."
    local REQUEST_ID_1=$(generate_request_id)
    local TIMESTAMP_1=$(now_iso)

    PAYLOAD_1=$(cat <<EOF
{
  "email": "$EMAIL",
  "name": "$NAME",
  "hostname": "macbook-bob",
  "agent_version": "1.0.0",
  "entries": [
    {
      "request_id": "$REQUEST_ID_1",
      "timestamp": "$TIMESTAMP_1",
      "model": "claude-opus-4-20250514",
      "project_path": "/Users/bob/work/api-service",
      "session_id": "session-mac-001",
      "input_tokens": 2000,
      "output_tokens": 1500,
      "cache_creation_tokens": 200,
      "cache_read_tokens": 100,
      "cost_usd": 0.0875,
      "claude_version": "1.0.0"
    }
  ]
}
EOF
)

    RESPONSE_1=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD_1" \
        "${API_ENDPOINT}/api/sync")

    HTTP_CODE_1=$(echo "$RESPONSE_1" | tail -n1)
    BODY_1=$(echo "$RESPONSE_1" | sed '$d')

    if [ "$HTTP_CODE_1" == "200" ]; then
        log_success "Device 1 sync successful"
        echo "$BODY_1" | jq .
    else
        log_error "Device 1 sync failed"
        echo "$BODY_1"
    fi

    # Device 2: Linux Desktop
    sleep 1
    log_info "Syncing from Device 2 (Linux Desktop)..."
    local REQUEST_ID_2=$(generate_request_id)
    local TIMESTAMP_2=$(now_iso)

    PAYLOAD_2=$(cat <<EOF
{
  "email": "$EMAIL",
  "name": "$NAME",
  "hostname": "linux-desktop-bob",
  "agent_version": "1.0.1",
  "entries": [
    {
      "request_id": "$REQUEST_ID_2",
      "timestamp": "$TIMESTAMP_2",
      "model": "claude-sonnet-4-20250514",
      "project_path": "/home/bob/projects/frontend",
      "session_id": "session-linux-001",
      "input_tokens": 1000,
      "output_tokens": 500,
      "cache_creation_tokens": 50,
      "cache_read_tokens": 25,
      "cost_usd": 0.0075,
      "claude_version": "1.0.1"
    }
  ]
}
EOF
)

    RESPONSE_2=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD_2" \
        "${API_ENDPOINT}/api/sync")

    HTTP_CODE_2=$(echo "$RESPONSE_2" | tail -n1)
    BODY_2=$(echo "$RESPONSE_2" | sed '$d')

    if [ "$HTTP_CODE_2" == "200" ]; then
        log_success "Device 2 sync successful"
        echo "$BODY_2" | jq .

        # Verify same member ID
        MEMBER_ID_1=$(echo "$BODY_1" | jq -r '.memberId')
        MEMBER_ID_2=$(echo "$BODY_2" | jq -r '.memberId')

        if [ "$MEMBER_ID_1" == "$MEMBER_ID_2" ]; then
            log_success "Both devices mapped to same member: $MEMBER_ID_1"
            export BOB_MEMBER_ID="$MEMBER_ID_1"
        else
            log_error "Devices have different member IDs: $MEMBER_ID_1 vs $MEMBER_ID_2"
        fi
    else
        log_error "Device 2 sync failed"
        echo "$BODY_2"
    fi
}

# ============================================
# Test: Sync Duplicate Detection
# ============================================
test_sync_duplicate_detection() {
    log_section "Test: Sync Duplicate Detection"

    local EMAIL="charlie@example.com"
    local NAME="Charlie Tester"
    local REQUEST_ID=$(generate_request_id)
    local TIMESTAMP=$(now_iso)

    log_info "First sync with request_id: $REQUEST_ID"

    PAYLOAD=$(cat <<EOF
{
  "email": "$EMAIL",
  "name": "$NAME",
  "hostname": "laptop-charlie",
  "agent_version": "1.0.0",
  "entries": [
    {
      "request_id": "$REQUEST_ID",
      "timestamp": "$TIMESTAMP",
      "model": "claude-haiku-3-20250514",
      "project_path": "/Users/charlie/test",
      "input_tokens": 500,
      "output_tokens": 250,
      "cost_usd": 0.0015
    }
  ]
}
EOF
)

    # First sync
    RESPONSE_1=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" \
        "${API_ENDPOINT}/api/sync")

    INSERTED_1=$(echo "$RESPONSE_1" | jq -r '.inserted')
    log_info "First sync: inserted=$INSERTED_1"

    # Second sync with same request_id (duplicate)
    log_info "Second sync with same request_id (should skip)..."
    RESPONSE_2=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" \
        "${API_ENDPOINT}/api/sync")

    INSERTED_2=$(echo "$RESPONSE_2" | jq -r '.inserted')
    SKIPPED_2=$(echo "$RESPONSE_2" | jq -r '.skipped')

    if [ "$SKIPPED_2" == "1" ] && [ "$INSERTED_2" == "0" ]; then
        log_success "Duplicate detection working: skipped=1, inserted=0"
    else
        log_error "Duplicate detection issue: inserted=$INSERTED_2, skipped=$SKIPPED_2"
    fi

    echo "$RESPONSE_2" | jq .
}

# ============================================
# Test: Sync Bulk Data
# ============================================
test_sync_bulk_data() {
    log_section "Test: Sync Bulk Data"

    local EMAIL="dave@example.com"
    local NAME="Dave Heavy User"

    log_info "Syncing 3 records in one batch..."

    # Generate unique request IDs
    local REQ_ID_1=$(generate_request_id)
    local REQ_ID_2=$(generate_request_id)
    local REQ_ID_3=$(generate_request_id)
    local TS=$(now_iso)

    PAYLOAD=$(cat <<EOF
{
  "email": "$EMAIL",
  "name": "$NAME",
  "hostname": "workstation-dave",
  "agent_version": "1.0.0",
  "entries": [
    {
      "request_id": "$REQ_ID_1",
      "timestamp": "$TS",
      "model": "claude-sonnet-4-20250514",
      "project_path": "/Users/dave/project-1",
      "input_tokens": 500,
      "output_tokens": 250,
      "cost_usd": 0.01
    },
    {
      "request_id": "$REQ_ID_2",
      "timestamp": "$TS",
      "model": "claude-opus-4-20250514",
      "project_path": "/Users/dave/project-2",
      "input_tokens": 1000,
      "output_tokens": 500,
      "cost_usd": 0.05
    },
    {
      "request_id": "$REQ_ID_3",
      "timestamp": "$TS",
      "model": "claude-haiku-3-20250514",
      "project_path": "/Users/dave/project-3",
      "input_tokens": 1500,
      "output_tokens": 750,
      "cost_usd": 0.003
    }
  ]
}
EOF
)

    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$PAYLOAD" \
        "${API_ENDPOINT}/api/sync")

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "200" ]; then
        INSERTED=$(echo "$BODY" | jq -r '.inserted')
        if [ "$INSERTED" -ge "1" ]; then
            log_success "Bulk sync successful: inserted $INSERTED records"
        else
            log_warn "Bulk sync returned 0 inserted (may be duplicates)"
        fi
        echo "$BODY" | jq .
    else
        log_error "Bulk sync failed with status $HTTP_CODE"
        echo "$BODY"
    fi
}

# ============================================
# Test: Trigger Aggregator
# ============================================
test_trigger_aggregator() {
    log_section "Test: Trigger Aggregator Lambda"

    log_info "Invoking aggregator Lambda function..."

    # Check if AWS credentials are valid first
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" > /dev/null 2>&1; then
        log_warn "AWS credentials expired or invalid. Skipping aggregator test."
        log_info "Run 'aws sso login --profile $AWS_PROFILE' to refresh credentials"
        return 0
    fi

    RESPONSE=$(aws lambda invoke \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --function-name "$FUNCTION_NAME" \
        --payload '{"source": "e2e-test", "time": "'$(now_iso)'"}' \
        --cli-binary-format raw-in-base64-out \
        /tmp/aggregator-response.json 2>&1)

    if [ $? -eq 0 ]; then
        log_success "Aggregator invoked successfully"
        cat /tmp/aggregator-response.json | jq .

        # Check response
        STATUS=$(cat /tmp/aggregator-response.json | jq -r '.status')
        MEMBERS=$(cat /tmp/aggregator-response.json | jq -r '.membersProcessed')
        VIEWS=$(cat /tmp/aggregator-response.json | jq -r '.viewsGenerated | length')

        if [ "$STATUS" == "ok" ]; then
            log_success "Aggregator processed $MEMBERS members, generated $VIEWS views"
        else
            log_error "Aggregator returned status: $STATUS"
        fi
    else
        log_error "Failed to invoke aggregator"
        echo "$RESPONSE"
    fi
}

# ============================================
# Test: Dashboard API
# ============================================
test_dashboard_api() {
    log_section "Test: Dashboard API"

    # GET /api/dashboard
    log_info "Calling GET /api/dashboard..."
    RESPONSE=$(curl -s -w "\n%{http_code}" "${API_ENDPOINT}/api/dashboard")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "200" ]; then
        SUCCESS=$(echo "$BODY" | jq -r '.success')
        if [ "$SUCCESS" == "true" ]; then
            log_success "Dashboard API returned success"

            # Show summary stats
            TOTAL_COST=$(echo "$BODY" | jq -r '.data.summary.totalCost // 0')
            TOTAL_MEMBERS=$(echo "$BODY" | jq -r '.data.summary.totalMembers // 0')
            ACTIVE_MEMBERS=$(echo "$BODY" | jq -r '.data.summary.activeMembers // 0')

            echo "  Total Cost:     \$${TOTAL_COST}"
            echo "  Total Members:  ${TOTAL_MEMBERS}"
            echo "  Active Members: ${ACTIVE_MEMBERS}"
        else
            log_warn "Dashboard returned success=false (aggregator may not have run)"
            echo "$BODY" | jq .
        fi
    else
        log_error "Dashboard API failed with status $HTTP_CODE"
        echo "$BODY"
    fi

    # GET /api/dashboard/meta
    log_info "Calling GET /api/dashboard/meta..."
    META_RESPONSE=$(curl -s "${API_ENDPOINT}/api/dashboard/meta")
    LAST_PROCESSED=$(echo "$META_RESPONSE" | jq -r '.data.lastProcessedAt // "never"')
    log_info "Last aggregator run: $LAST_PROCESSED"
}

# ============================================
# Test: Members API
# ============================================
test_members_api() {
    log_section "Test: Members API"

    # GET /api/members
    log_info "Calling GET /api/members..."
    RESPONSE=$(curl -s -w "\n%{http_code}" "${API_ENDPOINT}/api/members")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "200" ]; then
        SUCCESS=$(echo "$BODY" | jq -r '.success')
        if [ "$SUCCESS" == "true" ]; then
            log_success "Members API returned success"

            MEMBER_COUNT=$(echo "$BODY" | jq -r '.data.members | length')
            echo "  Found $MEMBER_COUNT members"

            # List members
            echo "$BODY" | jq -r '.data.members[] | "  - \(.name) (\(.email)): $\(.currentMonth.costUsd // 0)"'

            # Get first member ID for detail test
            FIRST_MEMBER_ID=$(echo "$BODY" | jq -r '.data.members[0].id // empty')
            if [ -n "$FIRST_MEMBER_ID" ]; then
                export FIRST_MEMBER_ID
            fi
        else
            log_warn "Members returned success=false"
        fi
    else
        log_error "Members API failed with status $HTTP_CODE"
        echo "$BODY"
    fi
}

# ============================================
# Test: Member Detail API
# ============================================
test_member_detail_api() {
    log_section "Test: Member Detail API"

    if [ -z "$FIRST_MEMBER_ID" ]; then
        log_warn "No member ID available, skipping detail test"
        return
    fi

    # GET /api/members/:id
    log_info "Calling GET /api/members/$FIRST_MEMBER_ID..."
    RESPONSE=$(curl -s -w "\n%{http_code}" "${API_ENDPOINT}/api/members/${FIRST_MEMBER_ID}")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "200" ]; then
        SUCCESS=$(echo "$BODY" | jq -r '.success')
        if [ "$SUCCESS" == "true" ]; then
            log_success "Member detail API returned success"

            NAME=$(echo "$BODY" | jq -r '.data.member.name')
            COST=$(echo "$BODY" | jq -r '.data.currentMonth.totals.costUsd // 0')
            RECORDS=$(echo "$BODY" | jq -r '.data.currentMonth.totals.recordCount // 0')

            echo "  Name:    $NAME"
            echo "  Cost:    \$$COST"
            echo "  Records: $RECORDS"
        else
            log_warn "Member detail returned success=false"
        fi
    else
        log_error "Member detail API failed with status $HTTP_CODE"
        echo "$BODY"
    fi

    # GET /api/members/:id/raw
    log_info "Calling GET /api/members/$FIRST_MEMBER_ID/raw..."
    RAW_RESPONSE=$(curl -s -w "\n%{http_code}" "${API_ENDPOINT}/api/members/${FIRST_MEMBER_ID}/raw")
    RAW_HTTP_CODE=$(echo "$RAW_RESPONSE" | tail -n1)
    RAW_BODY=$(echo "$RAW_RESPONSE" | sed '$d')

    if [ "$RAW_HTTP_CODE" == "200" ]; then
        TOTAL_ENTRIES=$(echo "$RAW_BODY" | jq -r '.data.totalEntries // 0')
        log_success "Raw data API returned $TOTAL_ENTRIES entries"
    else
        log_error "Raw data API failed with status $RAW_HTTP_CODE"
    fi
}

# ============================================
# Test: Invalid UUID Validation
# ============================================
test_uuid_validation() {
    log_section "Test: UUID Validation"

    log_info "Calling GET /api/members/invalid-uuid..."
    RESPONSE=$(curl -s -w "\n%{http_code}" "${API_ENDPOINT}/api/members/invalid-uuid")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "400" ]; then
        ERROR_CODE=$(echo "$BODY" | jq -r '.code')
        if [ "$ERROR_CODE" == "VALIDATION_ERROR" ]; then
            log_success "Invalid UUID correctly rejected with 400"
        else
            log_warn "Got 400 but unexpected error code: $ERROR_CODE"
        fi
    else
        log_error "Invalid UUID not rejected (got $HTTP_CODE, expected 400)"
        echo "$BODY"
    fi
}

# ============================================
# Test: Sync Validation Errors
# ============================================
test_sync_validation() {
    log_section "Test: Sync Validation Errors"

    # Test: Missing email
    log_info "Testing missing email..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"entries": []}' \
        "${API_ENDPOINT}/api/sync")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" == "400" ]; then
        log_success "Missing email correctly rejected with 400"
    else
        log_error "Missing email not rejected (got $HTTP_CODE)"
    fi

    # Test: Invalid email format
    log_info "Testing invalid email format..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"email": "not-an-email", "entries": []}' \
        "${API_ENDPOINT}/api/sync")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)

    if [ "$HTTP_CODE" == "400" ]; then
        log_success "Invalid email correctly rejected with 400"
    else
        log_error "Invalid email not rejected (got $HTTP_CODE)"
    fi

    # Test: Empty entries (should succeed)
    log_info "Testing empty entries (should succeed with 0 inserted)..."
    RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"email": "test@example.com", "entries": []}' \
        "${API_ENDPOINT}/api/sync")
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | sed '$d')

    if [ "$HTTP_CODE" == "200" ]; then
        INSERTED=$(echo "$BODY" | jq -r '.inserted')
        if [ "$INSERTED" == "0" ]; then
            log_success "Empty entries handled correctly (inserted=0)"
        else
            log_warn "Empty entries returned inserted=$INSERTED"
        fi
    else
        log_error "Empty entries failed (got $HTTP_CODE)"
    fi
}

# ============================================
# Main Test Runner
# ============================================
main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     CCUsage Monitor - End-to-End Test Suite                  ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "API Endpoint: $API_ENDPOINT"
    echo "AWS Profile:  $AWS_PROFILE"
    echo "AWS Region:   $AWS_REGION"
    echo ""

    # Run all tests
    test_health_check
    test_sync_single_user
    test_sync_multi_device
    test_sync_duplicate_detection
    test_sync_bulk_data
    test_sync_validation
    test_trigger_aggregator
    sleep 2  # Wait for views to be written
    test_dashboard_api
    test_members_api
    test_member_detail_api
    test_uuid_validation

    # Summary
    log_section "Test Summary"

    TOTAL=$((TESTS_PASSED + TESTS_FAILED))
    echo ""
    echo -e "  ${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "  ${RED}Failed: $TESTS_FAILED${NC}"
    echo -e "  Total:  $TOTAL"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "${RED}Some tests failed.${NC}"
        exit 1
    fi
}

# Run main
main "$@"
