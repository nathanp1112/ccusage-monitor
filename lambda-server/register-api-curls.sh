BASE="https://5kvqadz4mc.execute-api.ap-southeast-1.amazonaws.com"

# 1. List all items (GET)
curl -s "$BASE/api/register"

# 2. Replace entire list (PUT)
curl -s -X PUT "$BASE/api/register" \
  -H "Content-Type: application/json" \
  -d '[
    {"email": "alice@example.com", "link": "https://alice.dev", "data": "abc"},
    {"email": "bob@example.com", "link": "https://bob.dev", "data": "xyz"}
  ]'

# 3. Get link by email (GET)
curl -s "$BASE/api/register/link?email=alice@example.com"

# 4. Update item by data field (POST)
curl -s -X POST "$BASE/api/register/update" \
  -H "Content-Type: application/json" \
  -d '{"data": "abc", "link": "https://alice-new.dev"}'
