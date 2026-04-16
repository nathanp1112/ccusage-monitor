#!/bin/bash
# Delete all S3 data for a member
# Usage: ./scripts/delete-member.sh --stage <dev|jit> --member-id <uuid> [--dry-run]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/stage-config.sh"

MEMBER_ID=""
DRY_RUN=false
STAGE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --stage) STAGE="$2"; shift 2 ;;
    --member-id) MEMBER_ID="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -z "$STAGE" ]]; then
  echo "Error: --stage is required (dev, jit)"
  exit 1
fi

if [[ -z "$MEMBER_ID" ]]; then
  echo "Error: --member-id is required"
  exit 1
fi

load_stage_config "$STAGE"

echo "=== Delete Member Data ==="
echo "Stage:     $STAGE"
echo "Bucket:    $S3_DATA_BUCKET"
echo "Member ID: $MEMBER_ID"
echo "Dry run:   $DRY_RUN"
echo ""

# Collect all keys to delete
KEYS=()

# 1. raw/{memberId}/*
while IFS= read -r key; do
  [[ -n "$key" ]] && KEYS+=("$key")
done < <(aws s3 ls "s3://$S3_DATA_BUCKET/raw/$MEMBER_ID/" --profile "$AWS_PROFILE" 2>/dev/null | awk '{print "raw/'"$MEMBER_ID"'/"$4}')

# 2. aggregated/{memberId}/*
while IFS= read -r key; do
  [[ -n "$key" ]] && KEYS+=("$key")
done < <(aws s3 ls "s3://$S3_DATA_BUCKET/aggregated/$MEMBER_ID/" --profile "$AWS_PROFILE" 2>/dev/null | awk '{print "aggregated/'"$MEMBER_ID"'/"$4}')

# 3. prompts/{memberId}/*
while IFS= read -r key; do
  [[ -n "$key" ]] && KEYS+=("$key")
done < <(aws s3 ls "s3://$S3_DATA_BUCKET/prompts/$MEMBER_ID/" --profile "$AWS_PROFILE" 2>/dev/null | awk '{print "prompts/'"$MEMBER_ID"'/"$4}')

# 4. projects/{memberId}.json
KEYS+=("projects/$MEMBER_ID.json")

# 5. commands/{memberId}/queue.json
KEYS+=("commands/$MEMBER_ID/queue.json")

# 6. views/members/{memberId}/*
while IFS= read -r key; do
  [[ -n "$key" ]] && KEYS+=("$key")
done < <(aws s3 ls "s3://$S3_DATA_BUCKET/views/members/$MEMBER_ID/" --profile "$AWS_PROFILE" 2>/dev/null | awk '{print "views/members/'"$MEMBER_ID"'/"$4}')

# 7. sync-logs/*/{memberId}.json (scan all year-month folders)
while IFS= read -r key; do
  [[ -n "$key" ]] && KEYS+=("$key")
done < <(aws s3 ls "s3://$S3_DATA_BUCKET/sync-logs/" --recursive --profile "$AWS_PROFILE" 2>/dev/null | grep "$MEMBER_ID" | awk '{print $4}')

echo "Found ${#KEYS[@]} S3 objects to delete:"
for key in "${KEYS[@]}"; do
  echo "  s3://$S3_DATA_BUCKET/$key"
done
echo ""

if $DRY_RUN; then
  echo "[DRY RUN] No objects deleted."
  echo ""
  echo "Additionally, the member entry would be removed from members/index.json"
  exit 0
fi

# Confirm
read -p "Proceed with deletion? (yes/no): " CONFIRM
if [[ "$CONFIRM" != "yes" ]]; then
  echo "Aborted."
  exit 0
fi

# Delete S3 objects
DELETED=0
ERRORS=0
for key in "${KEYS[@]}"; do
  if aws s3 rm "s3://$S3_DATA_BUCKET/$key" --profile "$AWS_PROFILE" 2>/dev/null; then
    echo "  Deleted: $key"
    ((DELETED++))
  else
    echo "  Skipped (not found): $key"
    ((ERRORS++))
  fi
done

# Remove member from registry
echo ""
echo "Removing member from members/index.json..."
TMPFILE=$(mktemp)
aws s3 cp "s3://$S3_DATA_BUCKET/members/index.json" "$TMPFILE" --profile "$AWS_PROFILE"
python3 -c "
import json, sys
with open('$TMPFILE', 'r') as f:
    data = json.load(f)
mid = '$MEMBER_ID'
if mid in data.get('members', {}):
    name = data['members'][mid].get('name', 'unknown')
    email = data['members'][mid].get('email', 'unknown')
    del data['members'][mid]
    data['lastUpdated'] = '$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'
    with open('$TMPFILE', 'w') as f:
        json.dump(data, f, indent=2)
    print(f'  Removed: {name} ({email})')
else:
    print(f'  Member {mid} not found in registry (already removed?)')
    sys.exit(1)
"
aws s3 cp "$TMPFILE" "s3://$S3_DATA_BUCKET/members/index.json" --profile "$AWS_PROFILE" --content-type "application/json"
rm -f "$TMPFILE"

echo ""
echo "=== Done ==="
echo "Deleted: $DELETED objects"
echo "Skipped: $ERRORS objects"
echo ""
echo "Next step: rebuild views"
echo "  curl -X POST '$API_URL/api/admin/aggregate?force=true'"
