#!/bin/bash
# Stage Configuration — sourced by all deploy scripts
# Usage: source scripts/stage-config.sh <stage>

# Shared defaults
AWS_PROFILE="2026-pik"
AWS_REGION="ap-southeast-1"

load_stage_config() {
  local stage="$1"

  if [ -z "$stage" ]; then
    echo "Error: stage is required (dev, jit)"
    exit 1
  fi

  STAGE="$stage"
  S3_DATA_BUCKET="ccusage-data-${stage}"

  case "$stage" in
    dev)
      API_URL="https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com"
      DASHBOARD_S3_BUCKET="cc-usage-monitor-tvf"
      CLOUDFRONT_DIST_ID="E1W8WZ55TBZY1P"
      ;;
    jit)
      API_URL="https://eu9i1zr4x6.execute-api.ap-southeast-1.amazonaws.com"
      DASHBOARD_S3_BUCKET="cc-usage-monitor-jit"
      CLOUDFRONT_DIST_ID="E3W5CFHO5Z8UU2"
      ;;
    *)
      echo "Error: unknown stage '$stage'. Supported: dev, jit"
      exit 1
      ;;
  esac

  export STAGE S3_DATA_BUCKET API_URL DASHBOARD_S3_BUCKET CLOUDFRONT_DIST_ID AWS_PROFILE AWS_REGION
}
