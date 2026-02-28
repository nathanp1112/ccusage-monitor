#!/bin/bash
# Deploy Lambda Server
# Usage: ./scripts/deploy-lambda.sh --stage <dev|jit>

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
echo "Deploy Lambda Server [${STAGE}]"
echo "=========================================="
echo "  Stage:    $STAGE"
echo "  Region:   $AWS_REGION"
echo "  Profile:  $AWS_PROFILE"
echo "  Bucket:   $S3_DATA_BUCKET"
echo "=========================================="
echo ""

cd "$ROOT_DIR/lambda-server"

# Build
echo "[1/2] Building..."
pnpm build

# Deploy
echo ""
echo "[2/2] Deploying to AWS..."
AWS_PROFILE=$AWS_PROFILE npx serverless deploy --stage "$STAGE" --region "$AWS_REGION"

echo ""
echo "=========================================="
echo "Lambda deployed [${STAGE}]"
echo "  API: $API_URL"
echo "=========================================="
