#!/bin/bash
# Deploy Dashboard to S3 + CloudFront
# Usage: ./scripts/deploy-dashboard.sh --stage <dev|jit>

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

echo "=========================================="
echo "Deploy Dashboard [${STAGE}]"
echo "=========================================="
echo "  S3 Bucket:   $DASHBOARD_S3_BUCKET"
echo "  CloudFront:  $CLOUDFRONT_DIST_ID"
echo "  API URL:     $API_URL"
echo "  Profile:     $AWS_PROFILE"
echo "=========================================="
echo ""

cd "$ROOT_DIR/dashboard"

# Install dependencies
echo "[1/5] Installing dependencies..."
pnpm install

# Build for static export
echo ""
echo "[2/5] Building for static export..."
STATIC_EXPORT=true NEXT_PUBLIC_API_URL="$API_URL" pnpm build

if [ ! -d "out" ]; then
  echo "Error: Build failed - 'out' directory not found"
  exit 1
fi

# Sync to S3 (assets with long cache)
echo ""
echo "[3/5] Uploading to S3..."
aws s3 sync out/ "s3://$DASHBOARD_S3_BUCKET/" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html" \
  --exclude "_next/data/*"

# Upload HTML with no-cache
aws s3 sync out/ "s3://$DASHBOARD_S3_BUCKET/" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --include "*.html" \
  --content-type "text/html"

# Upload _next/data with short cache
if [ -d "out/_next/data" ]; then
  aws s3 sync out/_next/data/ "s3://$DASHBOARD_S3_BUCKET/_next/data/" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --cache-control "public, max-age=60"
fi

# Set website config
echo ""
echo "[4/5] Setting bucket website configuration..."
aws s3 website "s3://$DASHBOARD_S3_BUCKET/" \
  --profile "$AWS_PROFILE" \
  --region "$AWS_REGION" \
  --index-document index.html \
  --error-document index.html

# Invalidate CloudFront
echo ""
echo "[5/5] Invalidating CloudFront cache..."
if [ -n "$CLOUDFRONT_DIST_ID" ]; then
  aws cloudfront create-invalidation \
    --profile "$AWS_PROFILE" \
    --distribution-id "$CLOUDFRONT_DIST_ID" \
    --paths "/*" \
    --output text
else
  echo "  Skipped (no CloudFront distribution configured)"
fi

echo ""
echo "=========================================="
echo "Dashboard deployed [${STAGE}]"
echo "  S3: http://$DASHBOARD_S3_BUCKET.s3-website-$AWS_REGION.amazonaws.com"
echo "=========================================="
