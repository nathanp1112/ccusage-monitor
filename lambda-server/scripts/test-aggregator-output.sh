#!/bin/bash

# Test script to verify Lambda aggregator API returns correct data structure
# with the new yearly API structure

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# API URL - use argument or default to Lambda endpoint
API_URL="${1:-https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com}"

# Current year and month
YEAR=$(date +%Y)
CURRENT_MONTH=$(date +%-m)  # Current month without leading zero

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Lambda Aggregator API Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "API URL: ${YELLOW}${API_URL}${NC}"
echo -e "Testing year: ${YEAR}, current month: ${CURRENT_MONTH}"
echo ""

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is required but not installed.${NC}"
    echo "Install with: brew install jq"
    exit 1
fi

# Step 1: Get list of members
echo -e "${BLUE}Step 1: Fetching members list...${NC}"
MEMBERS_RESPONSE=$(curl -s "${API_URL}/api/members")

if [ -z "$MEMBERS_RESPONSE" ]; then
    echo -e "${RED}Error: Failed to fetch members${NC}"
    exit 1
fi

# Check if response is valid JSON
if ! echo "$MEMBERS_RESPONSE" | jq -e . > /dev/null 2>&1; then
    echo -e "${RED}Error: Invalid JSON response from /api/members${NC}"
    echo "$MEMBERS_RESPONSE"
    exit 1
fi

# Get first member ID (response structure is .data.members[])
MEMBER_ID=$(echo "$MEMBERS_RESPONSE" | jq -r '.data.members[0].id // empty')

if [ -z "$MEMBER_ID" ]; then
    echo -e "${RED}Error: No members found${NC}"
    echo "$MEMBERS_RESPONSE" | jq .
    exit 1
fi

MEMBER_NAME=$(echo "$MEMBERS_RESPONSE" | jq -r '.data.members[0].name // "Unknown"')
TOTAL_MEMBERS=$(echo "$MEMBERS_RESPONSE" | jq '.data.members | length')

echo -e "${GREEN}Found ${TOTAL_MEMBERS} members${NC}"
echo -e "Using member: ${YELLOW}${MEMBER_NAME}${NC} (ID: ${MEMBER_ID})"
echo ""

# Step 2: Get member detail with year parameter
echo -e "${BLUE}Step 2: Fetching member detail (yearly API)...${NC}"
DETAIL_URL="${API_URL}/api/members/${MEMBER_ID}?year=${YEAR}"
echo -e "URL: ${DETAIL_URL}"
echo ""

DETAIL_RESPONSE=$(curl -s "$DETAIL_URL")

if [ -z "$DETAIL_RESPONSE" ]; then
    echo -e "${RED}Error: Failed to fetch member detail${NC}"
    exit 1
fi

# Check if response is valid JSON
if ! echo "$DETAIL_RESPONSE" | jq -e . > /dev/null 2>&1; then
    echo -e "${RED}Error: Invalid JSON response from member detail${NC}"
    echo "$DETAIL_RESPONSE"
    exit 1
fi

# Step 3: Validate yearly response structure
echo -e "${BLUE}Step 3: Validating yearly response structure...${NC}"
echo ""

ERRORS=0

# Check year
RESPONSE_YEAR=$(echo "$DETAIL_RESPONSE" | jq '.data.year')
if [ "$RESPONSE_YEAR" = "$YEAR" ]; then
    echo -e "${GREEN}✓ year: ${RESPONSE_YEAR}${NC}"
else
    echo -e "${RED}✗ year mismatch: expected ${YEAR}, got ${RESPONSE_YEAR}${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Check months object exists
MONTHS_EXISTS=$(echo "$DETAIL_RESPONSE" | jq '.data | has("months")')
if [ "$MONTHS_EXISTS" = "true" ]; then
    echo -e "${GREEN}✓ months object exists${NC}"
else
    echo -e "${RED}✗ months object missing${NC}"
    ERRORS=$((ERRORS + 1))
fi

# Count months with data
MONTHS_WITH_DATA=$(echo "$DETAIL_RESPONSE" | jq '[.data.months | to_entries[] | select(.value.totals.recordCount > 0)] | length')
echo -e "${GREEN}✓ months with data: ${MONTHS_WITH_DATA}${NC}"

# List which months have data
MONTHS_LIST=$(echo "$DETAIL_RESPONSE" | jq -r '[.data.months | to_entries[] | select(.value.totals.recordCount > 0) | .key] | join(", ")')
if [ -n "$MONTHS_LIST" ]; then
    echo -e "${GREEN}  months: ${MONTHS_LIST}${NC}"
fi

echo ""

# Step 4: Validate current month structure
echo -e "${BLUE}Step 4: Validating current month (${CURRENT_MONTH}) structure...${NC}"
echo ""

# Check current month has required fields
HAS_TOTALS=$(echo "$DETAIL_RESPONSE" | jq ".data.months[\"${CURRENT_MONTH}\"] | has(\"totals\")")
HAS_DAILY_USAGE=$(echo "$DETAIL_RESPONSE" | jq ".data.months[\"${CURRENT_MONTH}\"] | has(\"dailyUsage\")")
HAS_DAILY_MODEL=$(echo "$DETAIL_RESPONSE" | jq ".data.months[\"${CURRENT_MONTH}\"] | has(\"dailyModelUsage\")")
HAS_MODEL_BREAKDOWN=$(echo "$DETAIL_RESPONSE" | jq ".data.months[\"${CURRENT_MONTH}\"] | has(\"modelBreakdown\")")

if [ "$HAS_TOTALS" = "true" ]; then
    echo -e "${GREEN}✓ months[${CURRENT_MONTH}].totals exists${NC}"
else
    echo -e "${RED}✗ months[${CURRENT_MONTH}].totals missing${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ "$HAS_DAILY_USAGE" = "true" ]; then
    DAILY_USAGE_COUNT=$(echo "$DETAIL_RESPONSE" | jq ".data.months[\"${CURRENT_MONTH}\"].dailyUsage | length // 0")
    echo -e "${GREEN}✓ months[${CURRENT_MONTH}].dailyUsage exists (${DAILY_USAGE_COUNT} days)${NC}"
else
    echo -e "${RED}✗ months[${CURRENT_MONTH}].dailyUsage missing${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ "$HAS_DAILY_MODEL" = "true" ]; then
    DAILY_MODEL_COUNT=$(echo "$DETAIL_RESPONSE" | jq ".data.months[\"${CURRENT_MONTH}\"].dailyModelUsage | length // 0")
    echo -e "${GREEN}✓ months[${CURRENT_MONTH}].dailyModelUsage exists (${DAILY_MODEL_COUNT} days)${NC}"
else
    echo -e "${RED}✗ months[${CURRENT_MONTH}].dailyModelUsage missing${NC}"
    ERRORS=$((ERRORS + 1))
fi

if [ "$HAS_MODEL_BREAKDOWN" = "true" ]; then
    MODEL_BREAKDOWN_COUNT=$(echo "$DETAIL_RESPONSE" | jq ".data.months[\"${CURRENT_MONTH}\"].modelBreakdown | length // 0")
    echo -e "${GREEN}✓ months[${CURRENT_MONTH}].modelBreakdown exists (${MODEL_BREAKDOWN_COUNT} models)${NC}"
else
    echo -e "${RED}✗ months[${CURRENT_MONTH}].modelBreakdown missing${NC}"
    ERRORS=$((ERRORS + 1))
fi

echo ""

# Step 5: Validate dailyModelUsage structure for current month
DAILY_MODEL_COUNT=$(echo "$DETAIL_RESPONSE" | jq ".data.months[\"${CURRENT_MONTH}\"].dailyModelUsage | length // 0")
if [ "$DAILY_MODEL_COUNT" -gt 0 ]; then
    echo -e "${BLUE}Step 5: Validating dailyModelUsage structure...${NC}"
    echo ""
    
    # Check first item has required fields
    FIRST_ITEM=$(echo "$DETAIL_RESPONSE" | jq ".data.months[\"${CURRENT_MONTH}\"].dailyModelUsage[0]")
    HAS_DATE=$(echo "$FIRST_ITEM" | jq 'has("date")')
    HAS_MODELS=$(echo "$FIRST_ITEM" | jq 'has("models")')
    
    if [ "$HAS_DATE" = "true" ]; then
        echo -e "${GREEN}✓ dailyModelUsage[].date exists${NC}"
    else
        echo -e "${RED}✗ dailyModelUsage[].date missing${NC}"
        ERRORS=$((ERRORS + 1))
    fi
    
    if [ "$HAS_MODELS" = "true" ]; then
        echo -e "${GREEN}✓ dailyModelUsage[].models exists${NC}"
        
        # Check models array structure
        MODELS_COUNT=$(echo "$FIRST_ITEM" | jq '.models | length')
        if [ "$MODELS_COUNT" -gt 0 ]; then
            FIRST_MODEL=$(echo "$FIRST_ITEM" | jq '.models[0]')
            HAS_MODEL_NAME=$(echo "$FIRST_MODEL" | jq 'has("model")')
            HAS_INPUT_TOKENS=$(echo "$FIRST_MODEL" | jq 'has("inputTokens")')
            HAS_OUTPUT_TOKENS=$(echo "$FIRST_MODEL" | jq 'has("outputTokens")')
            
            if [ "$HAS_MODEL_NAME" = "true" ]; then
                echo -e "${GREEN}  ✓ models[].model exists${NC}"
            else
                echo -e "${RED}  ✗ models[].model missing${NC}"
                ERRORS=$((ERRORS + 1))
            fi
            
            if [ "$HAS_INPUT_TOKENS" = "true" ]; then
                echo -e "${GREEN}  ✓ models[].inputTokens exists${NC}"
            else
                echo -e "${RED}  ✗ models[].inputTokens missing${NC}"
                ERRORS=$((ERRORS + 1))
            fi
            
            if [ "$HAS_OUTPUT_TOKENS" = "true" ]; then
                echo -e "${GREEN}  ✓ models[].outputTokens exists${NC}"
            else
                echo -e "${RED}  ✗ models[].outputTokens missing${NC}"
                ERRORS=$((ERRORS + 1))
            fi
        fi
    else
        echo -e "${RED}✗ dailyModelUsage[].models missing${NC}"
        ERRORS=$((ERRORS + 1))
    fi
    
    echo ""
    echo -e "${BLUE}Sample dailyModelUsage[0] for month ${CURRENT_MONTH}:${NC}"
    echo "$FIRST_ITEM" | jq '.'
else
    echo -e "${YELLOW}Step 5: Skipping structure validation - no dailyModelUsage data for month ${CURRENT_MONTH}${NC}"
fi

echo ""

# Step 6: Show sample month data
echo -e "${BLUE}Step 6: Sample month totals...${NC}"
echo ""
echo "$DETAIL_RESPONSE" | jq ".data.months[\"${CURRENT_MONTH}\"].totals // \"No data for month ${CURRENT_MONTH}\""

echo ""

# Step 7: Summary
echo -e "${BLUE}========================================${NC}"
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}SUCCESS: All validations passed!${NC}"
    echo -e "${GREEN}The yearly API structure is correct.${NC}"
    echo -e "${GREEN}  - Year: ${YEAR}${NC}"
    echo -e "${GREEN}  - Months with data: ${MONTHS_WITH_DATA}${NC}"
else
    echo -e "${RED}FAILED: ${ERRORS} validation error(s) found${NC}"
    echo -e "${RED}The yearly API structure may be missing required fields.${NC}"
fi
echo -e "${BLUE}========================================${NC}"

# Optional: Show full response structure (commented out by default)
# echo ""
# echo -e "${BLUE}Full response structure:${NC}"
# echo "$DETAIL_RESPONSE" | jq '.data | keys'

exit $ERRORS
