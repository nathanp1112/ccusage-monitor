#!/bin/bash
# Deployment Orchestrator
# Usage:
#   ./scripts/deploy.sh --stage dev                         # Deploy ALL modules
#   ./scripts/deploy.sh --stage jit --only lambda           # Lambda only
#   ./scripts/deploy.sh --stage dev --only dashboard        # Dashboard only
#   ./scripts/deploy.sh --stage jit --only agent            # Agent only
#   ./scripts/deploy.sh --stage dev --only lambda,dashboard # Multiple modules

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Parse args
STAGE=""
ONLY=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --stage) STAGE="$2"; shift 2 ;;
    --only) ONLY="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [ -z "$STAGE" ]; then
  echo "Usage: ./scripts/deploy.sh --stage <dev|jit> [--only lambda,dashboard,agent]"
  exit 1
fi

# Determine which modules to deploy
if [ -z "$ONLY" ]; then
  DEPLOY_LAMBDA=true
  DEPLOY_DASHBOARD=true
  DEPLOY_AGENT=true
else
  DEPLOY_LAMBDA=false
  DEPLOY_DASHBOARD=false
  DEPLOY_AGENT=false
  IFS=',' read -ra MODULES <<< "$ONLY"
  for mod in "${MODULES[@]}"; do
    case "$mod" in
      lambda) DEPLOY_LAMBDA=true ;;
      dashboard) DEPLOY_DASHBOARD=true ;;
      agent) DEPLOY_AGENT=true ;;
      *) echo "Unknown module: $mod (valid: lambda, dashboard, agent)"; exit 1 ;;
    esac
  done
fi

echo "=========================================="
echo "Deploy Orchestrator [${STAGE}]"
echo "=========================================="
echo "  Lambda:    $DEPLOY_LAMBDA"
echo "  Dashboard: $DEPLOY_DASHBOARD"
echo "  Agent:     $DEPLOY_AGENT"
echo "=========================================="
echo ""

FAILED=0

if [ "$DEPLOY_LAMBDA" = true ]; then
  echo ">>> Deploying Lambda..."
  echo ""
  if "$SCRIPT_DIR/deploy-lambda.sh" --stage "$STAGE"; then
    echo ""
    echo ">>> Lambda: OK"
  else
    echo ""
    echo ">>> Lambda: FAILED"
    FAILED=1
  fi
  echo ""
fi

if [ "$DEPLOY_DASHBOARD" = true ]; then
  echo ">>> Deploying Dashboard..."
  echo ""
  if "$SCRIPT_DIR/deploy-dashboard.sh" --stage "$STAGE"; then
    echo ""
    echo ">>> Dashboard: OK"
  else
    echo ""
    echo ">>> Dashboard: FAILED"
    FAILED=1
  fi
  echo ""
fi

if [ "$DEPLOY_AGENT" = true ]; then
  echo ">>> Publishing Agent..."
  echo ""
  if "$SCRIPT_DIR/publish-agent.sh" --stage "$STAGE"; then
    echo ""
    echo ">>> Agent: OK"
  else
    echo ""
    echo ">>> Agent: FAILED"
    FAILED=1
  fi
  echo ""
fi

echo "=========================================="
if [ $FAILED -eq 0 ]; then
  echo "All deployments succeeded [${STAGE}]"
else
  echo "Some deployments failed [${STAGE}]"
  exit 1
fi
echo "=========================================="
