#!/bin/bash
# Publish Agent Release to S3
# Usage: ./scripts/publish-agent.sh --stage <dev|jit>
#
# Builds, packs, and uploads the agent tgz to S3.
# Updates releases/version.json so agents can auto-update.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Parse args
STAGE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --stage) STAGE="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Load stage config
source "$SCRIPT_DIR/stage-config.sh"
load_stage_config "$STAGE"

cd "$ROOT_DIR/be-agent"

# Read version from package.json
VERSION=$(node -p "require('./package.json').version")
FILENAME="ccusage-agent-${VERSION}.tgz"

echo "=========================================="
echo "Publish Agent Release [${STAGE}]"
echo "=========================================="
echo "  Version:   $VERSION"
echo "  Filename:  $FILENAME"
echo "  S3 Bucket: $S3_DATA_BUCKET"
echo "=========================================="
echo ""

# 1. Build (inject SERVER_URL so the binary knows its target Lambda)
echo "[1/4] Building..."
echo "  Server URL: $API_URL"
SERVER_URL="$API_URL" pnpm build

# 2. Pack
echo ""
echo "[2/4] Packing..."
rm -f ccusage-agent-*.tgz
npm pack

if [ ! -f "$FILENAME" ]; then
  echo "Error: Pack failed - $FILENAME not found"
  exit 1
fi

SIZE=$(du -h "$FILENAME" | cut -f1)
echo "  ✓ $FILENAME ($SIZE)"

# 3. Upload tgz to S3
echo ""
echo "[3/4] Uploading to S3..."
aws s3 cp "$FILENAME" "s3://$S3_DATA_BUCKET/releases/$FILENAME" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION"

echo "  ✓ Uploaded releases/$FILENAME"

# 4. Update version.json
echo ""
echo "[4/4] Updating version manifest..."
echo "{\"version\":\"$VERSION\",\"filename\":\"$FILENAME\"}" | \
  aws s3 cp - "s3://$S3_DATA_BUCKET/releases/version.json" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --content-type "application/json"

echo "  ✓ Updated releases/version.json"

echo ""
echo "=========================================="
echo "Published ccusage-agent v$VERSION [${STAGE}]"
echo "=========================================="
echo ""
echo "Agents can now update with: ccusage-agent update"
