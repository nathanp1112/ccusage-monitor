#!/bin/bash

# API Test Script for CCUsage Monitor
# Usage: ./scripts/test-api.sh [base_url]

BASE_URL="${1:-http://localhost:3003}"

echo "=========================================="
echo "CCUsage API Test Script"
echo "Base URL: $BASE_URL"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test function
test_endpoint() {
  local name="$1"
  local endpoint="$2"
  local method="${3:-GET}"

  echo -e "\n${YELLOW}[$method] $name${NC}"
  echo "Endpoint: $endpoint"
  echo "---"

  response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
    echo -e "Status: ${GREEN}$http_code OK${NC}"
  else
    echo -e "Status: ${RED}$http_code ERROR${NC}"
  fi

  # Pretty print JSON (first 500 chars)
  echo "$body" | jq -C '.' 2>/dev/null | head -c 1000
  echo ""
}

# 1. Health Check
test_endpoint "Health Check" "/health"

# 2. List Members
test_endpoint "List Members" "/api/members"

# 3. Get first member ID for detail tests
echo -e "\n${YELLOW}Extracting first member ID...${NC}"
MEMBER_ID=$(curl -s "$BASE_URL/api/members" | jq -r '.data[0].id // empty')

if [ -z "$MEMBER_ID" ]; then
  echo -e "${RED}No members found. Skipping member detail tests.${NC}"
else
  echo "Member ID: $MEMBER_ID"

  # 4. Member Detail (current month)
  test_endpoint "Member Detail (Current Month)" "/api/members/$MEMBER_ID"

  # 5. Member Detail (specific month)
  test_endpoint "Member Detail (Jan 2026)" "/api/members/$MEMBER_ID?year=2026&month=1"

  # 6. Check dailyUsage structure
  echo -e "\n${YELLOW}Checking dailyUsage structure...${NC}"
  echo "---"
  curl -s "$BASE_URL/api/members/$MEMBER_ID?year=2026&month=1" | jq -C '.data.dailyUsage[0]' 2>/dev/null
fi

# 7. Dashboard Summary
test_endpoint "Dashboard Summary" "/api/dashboard/summary"

echo -e "\n=========================================="
echo "Tests Complete"
echo "=========================================="
