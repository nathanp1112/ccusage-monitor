#!/bin/bash

# Deploy Dashboard to S3 Static Hosting
# Usage: ./scripts/deploy-dashboard-s3.sh [API_URL]
#
# Example:
#   ./scripts/deploy-dashboard-s3.sh https://api.example.com
#   ./scripts/deploy-dashboard-s3.sh http://192.168.0.193:3003

set -e

# Configuration
S3_BUCKET="cc-usage-monitor-tvf"
AWS_PROFILE="2026-pik"
AWS_REGION="ap-southeast-1"
CLOUDFRONT_DISTRIBUTION_ID="E1W8WZ55TBZY1P"
DASHBOARD_DIR="$(dirname "$0")/../dashboard"

# API URL (default: Lambda API)
API_URL="${1:-https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com}"

echo "=========================================="
echo "Deploy Dashboard to S3"
echo "=========================================="
echo "S3 Bucket:   $S3_BUCKET"
echo "CloudFront:  $CLOUDFRONT_DISTRIBUTION_ID"
echo "AWS Profile: $AWS_PROFILE"
echo "AWS Region:  $AWS_REGION"
echo "API URL:     $API_URL"
echo "=========================================="
echo ""

# Navigate to dashboard directory
cd "$DASHBOARD_DIR"

# Install dependencies
echo "[1/5] Installing dependencies..."
pnpm install

# Build for static export
echo ""
echo "[2/5] Building for static export..."
STATIC_EXPORT=true NEXT_PUBLIC_API_URL="$API_URL" pnpm build

# Check if build succeeded
if [ ! -d "out" ]; then
    echo "Error: Build failed - 'out' directory not found"
    exit 1
fi

# Sync to S3
echo ""
echo "[3/5] Uploading to S3..."
aws s3 sync out/ "s3://$S3_BUCKET/" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --exclude "*.html" \
    --exclude "_next/data/*"

# Upload HTML files with no-cache
aws s3 sync out/ "s3://$S3_BUCKET/" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --cache-control "no-cache, no-store, must-revalidate" \
    --include "*.html" \
    --content-type "text/html"

# Upload _next/data with short cache
if [ -d "out/_next/data" ]; then
    aws s3 sync out/_next/data/ "s3://$S3_BUCKET/_next/data/" \
        --profile "$AWS_PROFILE" \
        --region "$AWS_REGION" \
        --cache-control "public, max-age=60"
fi

echo ""
echo "[4/5] Setting bucket website configuration..."
aws s3 website "s3://$S3_BUCKET/" \
    --profile "$AWS_PROFILE" \
    --region "$AWS_REGION" \
    --index-document index.html \
    --error-document 404.html

echo ""
echo "[5/5] Invalidating CloudFront cache..."
aws cloudfront create-invalidation \
    --profile "$AWS_PROFILE" \
    --distribution-id "$CLOUDFRONT_DISTRIBUTION_ID" \
    --paths "/*" \
    --output text

# Get CloudFront domain name
CLOUDFRONT_DOMAIN=$(aws cloudfront list-distributions \
    --profile "$AWS_PROFILE" \
    --query "DistributionList.Items[?Id=='$CLOUDFRONT_DISTRIBUTION_ID'].DomainName" \
    --output text 2>/dev/null || echo "unknown")

echo ""
echo "=========================================="
echo "Deploy complete!"
echo "=========================================="
echo ""
echo "CloudFront:  https://$CLOUDFRONT_DOMAIN"
echo "S3 Direct:   http://$S3_BUCKET.s3-website-$AWS_REGION.amazonaws.com"
echo ""
