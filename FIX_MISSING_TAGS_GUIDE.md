# Fix Missing Tags Guide

## Quick Fix for neffbridget@gmail.com

### Option 1: Use Manual Tag Endpoint (Fastest)

Use the existing manual tag endpoint to add the missing tags:

```bash
curl -X POST https://quotes.mybookkeepers.com/api/manual-tag-contact \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "email": "neffbridget@gmail.com",
    "tags": ["authorize.net", "sold bookkeeping project"]
  }'
```

Or use the admin interface if available.

### Option 2: Check Logs First

1. Go to `/admin-logs.html`
2. Search for email: `neffbridget@gmail.com`
3. Look for:
   - Webhook received logs
   - Tag addition logs
   - Any errors

### Option 3: Manual Sync Transaction

If you have the transaction ID from Authorize.net:

```bash
curl -X POST https://quotes.mybookkeepers.com/api/manual-sync-transaction \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_AUTH_TOKEN" \
  -d '{
    "transactionId": "TRANSACTION_ID_HERE",
    "email": "neffbridget@gmail.com"
  }'
```

## Common Issues

### 1. Webhook Not Received
- Check Authorize.net webhook configuration
- Check Vercel logs for webhook endpoint
- Verify webhook URL is correct

### 2. Email Not Extracted
- Webhook payload might not include email
- Check logs for "missing customer email" warnings
- Transaction details lookup might have failed

### 3. Tags Failed to Add
- Check logs for "Failed to add tags" errors
- Verify GHL API key is correct
- Check if contact exists in GHL

## Prevention

The code now includes:
- Better logging for tag building
- Error handling for tag addition
- Logs written to Supabase for debugging

Check `/admin-logs.html` regularly to catch issues early.


