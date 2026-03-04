#!/bin/bash
set -e

API_URL="https://eu9i1zr4x6.execute-api.ap-southeast-1.amazonaws.com"

echo "Fetching latest ccusage-agent version..."
RESPONSE=$(curl -s "$API_URL/api/agent/version")
DOWNLOAD_URL=$(echo "$RESPONSE" | python3 -c "import sys,json;print(json.load(sys.stdin)['downloadUrl'])")
VERSION=$(echo "$RESPONSE" | python3 -c "import sys,json;print(json.load(sys.stdin)['version'])")

echo "Installing ccusage-agent v$VERSION..."
TMP=$(mktemp -d)
curl -fsSL "$DOWNLOAD_URL" -o "$TMP/ccusage-agent.tgz"
npm install -g "$TMP/ccusage-agent.tgz"
rm -rf "$TMP"

echo ""
echo "Done! Run: ccusage-agent setup --email your@jitera.com"
