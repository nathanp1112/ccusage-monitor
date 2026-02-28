#!/bin/bash
#
# Cleanup Mock Users from S3
# Removes test users created by test-e2e.sh
#
# Usage:
#   ./scripts/cleanup-mock-users.sh [--dry-run]
#
# Environment variables:
#   AWS_PROFILE - AWS profile to use (default: default)
#   AWS_REGION - AWS region (default: ap-southeast-1)
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
AWS_PROFILE="${AWS_PROFILE:-2026-pik}"
AWS_REGION="${AWS_REGION:-ap-southeast-1}"
BUCKET_NAME="ccusage-data-dev"
API_ENDPOINT="https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com"

# Mock user emails to remove
MOCK_EMAILS=(
    "alice@example.com"
    "bob@example.com"
    "charlie@example.com"
    "dave@example.com"
)

# Parse arguments
DRY_RUN=false
if [ "$1" == "--dry-run" ]; then
    DRY_RUN=true
    echo -e "${YELLOW}DRY RUN MODE - No changes will be made${NC}"
    echo ""
fi

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check AWS credentials
check_aws_credentials() {
    log_info "Checking AWS credentials..."
    if ! aws sts get-caller-identity --profile "$AWS_PROFILE" --region "$AWS_REGION" > /dev/null 2>&1; then
        log_error "AWS credentials expired or invalid"
        log_info "Run: aws sso login --profile $AWS_PROFILE"
        exit 1
    fi
    log_success "AWS credentials valid"
}

# Get member registry from S3
get_member_registry() {
    log_info "Fetching member registry from S3..."
    aws s3 cp "s3://${BUCKET_NAME}/members/index.json" /tmp/member-registry.json \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        2>/dev/null || echo '{"members":{}}' > /tmp/member-registry.json
}

# Find member ID by email
find_member_id() {
    local email="$1"
    jq -r --arg email "$email" '.members | to_entries[] | select(.value.email == $email) | .key' /tmp/member-registry.json
}

# Delete S3 objects with prefix
delete_s3_prefix() {
    local prefix="$1"
    local description="$2"

    # List objects
    local objects=$(aws s3 ls "s3://${BUCKET_NAME}/${prefix}" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --recursive 2>/dev/null || true)

    if [ -z "$objects" ]; then
        log_warn "  No objects found at ${prefix}"
        return
    fi

    echo "$objects" | while read -r line; do
        local key=$(echo "$line" | awk '{print $4}')
        if [ -n "$key" ]; then
            if [ "$DRY_RUN" == "true" ]; then
                log_info "  Would delete: s3://${BUCKET_NAME}/${key}"
            else
                aws s3 rm "s3://${BUCKET_NAME}/${key}" \
                    --profile "$AWS_PROFILE" \
                    --region "$AWS_REGION"
                log_success "  Deleted: ${key}"
            fi
        fi
    done
}

# Remove member from registry
remove_from_registry() {
    local member_id="$1"
    local email="$2"

    if [ "$DRY_RUN" == "true" ]; then
        log_info "  Would remove from registry: $email ($member_id)"
        return
    fi

    # Update registry JSON
    jq --arg id "$member_id" 'del(.members[$id])' /tmp/member-registry.json > /tmp/member-registry-updated.json
    mv /tmp/member-registry-updated.json /tmp/member-registry.json
}

# Main cleanup
main() {
    echo ""
    echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║     CCUsage Monitor - Mock User Cleanup                      ║${NC}"
    echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Bucket:      s3://${BUCKET_NAME}"
    echo "AWS Profile: ${AWS_PROFILE}"
    echo "AWS Region:  ${AWS_REGION}"
    echo ""
    echo "Mock users to remove:"
    for email in "${MOCK_EMAILS[@]}"; do
        echo "  - $email"
    done
    echo ""

    # Check credentials
    check_aws_credentials

    # Get current registry
    get_member_registry

    # Process each mock user
    REMOVED_COUNT=0
    for email in "${MOCK_EMAILS[@]}"; do
        echo ""
        log_info "Processing: $email"

        member_id=$(find_member_id "$email")

        if [ -z "$member_id" ]; then
            log_warn "  Member not found in registry, skipping"
            continue
        fi

        log_info "  Member ID: $member_id"

        # Delete raw data
        log_info "  Deleting raw data..."
        delete_s3_prefix "raw/${member_id}/" "raw data"

        # Delete member views
        log_info "  Deleting member views..."
        delete_s3_prefix "views/members/${member_id}/" "member views"

        # Delete sync logs
        log_info "  Deleting sync logs..."
        # Sync logs are organized by month, need to search
        for year in 2025 2026; do
            for month in $(seq -w 1 12); do
                delete_s3_prefix "sync-logs/${year}-${month}/${member_id}.json" "sync log"
            done
        done

        # Remove from registry
        log_info "  Removing from registry..."
        remove_from_registry "$member_id" "$email"

        log_success "  Cleaned up: $email"
        REMOVED_COUNT=$((REMOVED_COUNT + 1))
    done

    # Upload updated registry
    if [ "$DRY_RUN" == "false" ] && [ $REMOVED_COUNT -gt 0 ]; then
        echo ""
        log_info "Uploading updated member registry..."
        aws s3 cp /tmp/member-registry.json "s3://${BUCKET_NAME}/members/index.json" \
            --profile "$AWS_PROFILE" \
            --region "$AWS_REGION" \
            --content-type "application/json"
        log_success "Registry updated"

        # Trigger aggregator to regenerate views
        echo ""
        log_info "Triggering aggregator to regenerate views..."
        RESPONSE=$(curl -s -X POST "${API_ENDPOINT}/api/admin/aggregate")
        STATUS=$(echo "$RESPONSE" | jq -r '.status // "unknown"')

        if [ "$STATUS" == "ok" ]; then
            log_success "Aggregator completed successfully"
            echo "$RESPONSE" | jq .
        else
            log_warn "Aggregator response: $RESPONSE"
        fi
    fi

    # Summary
    echo ""
    echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
    echo ""
    if [ "$DRY_RUN" == "true" ]; then
        echo -e "${YELLOW}DRY RUN COMPLETE${NC}"
        echo "Would have removed $REMOVED_COUNT mock users"
        echo ""
        echo "Run without --dry-run to apply changes:"
        echo "  ./scripts/cleanup-mock-users.sh"
    else
        echo -e "${GREEN}CLEANUP COMPLETE${NC}"
        echo "Removed $REMOVED_COUNT mock users"
    fi
    echo ""
}

main "$@"
