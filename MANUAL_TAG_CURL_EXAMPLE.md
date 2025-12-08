# Manual Tag Contact - cURL Examples

## Add Tags to Contact

### Basic Example (requires authentication token)

```bash
curl -X POST https://quotes.mybookkeepers.com/api/manual-tag-contact \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "email": "neffbridget@gmail.com",
    "tags": ["authorize.net", "sold bookkeeping project"]
  }'
```

### Get Authentication Token

First, you need to get an authentication token. You can do this by:

1. **Using the login API:**
```bash
curl -X POST https://quotes.mybookkeepers.com/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-admin-email@example.com",
    "password": "your-password"
  }'
```

This will return a token that you can use in the Authorization header.

2. **Or use the browser:**
   - Log in to `/login.html` in your browser
   - Open browser DevTools → Application/Storage → Cookies
   - Find the `supabase_access_token` cookie value
   - Use that as your token

### Full Example with Token

```bash
# Step 1: Get token (replace with your credentials)
TOKEN=$(curl -s -X POST https://quotes.mybookkeepers.com/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-admin-email@example.com",
    "password": "your-password"
  }' | jq -r '.token')

# Step 2: Add tags
curl -X POST https://quotes.mybookkeepers.com/api/manual-tag-contact \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "email": "neffbridget@gmail.com",
    "tags": ["authorize.net", "sold bookkeeping project"]
  }'
```

### Common Tag Combinations

**For Authorize.net sales:**
```bash
curl -X POST https://quotes.mybookkeepers.com/api/manual-tag-contact \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "email": "customer@example.com",
    "tags": ["authorize.net", "sold bookkeeping project"]
  }'
```

**For subscription customers:**
```bash
curl -X POST https://quotes.mybookkeepers.com/api/manual-tag-contact \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "email": "customer@example.com",
    "tags": ["subscription-created", "monthly-bookkeeping-subscription"]
  }'
```

## Response Format

### Success Response
```json
{
  "success": true,
  "message": "Tags added successfully",
  "contact": {
    "id": "contact-id-here",
    "email": "neffbridget@gmail.com",
    "name": "Bridget Neff"
  },
  "tagsAdded": ["authorize.net", "sold bookkeeping project"]
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message here"
}
```

