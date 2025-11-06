# Authorize.net Webhook Debugging Guide

## Current Setup

**Webhook Endpoint:** `https://quotes.mybookkeepers.com/api/webhook-handler`
- ✅ Endpoint is accessible (returns HTTP 200)
- ✅ Endpoint is configured in `api/webhook-handler.js`
- ✅ Endpoint accepts POST requests and returns proper responses

## Why Webhooks Might Not Be Firing

### 1. **Webhook Not Configured in Authorize.net Merchant Interface**

**Most Common Issue:** Authorize.net webhooks must be explicitly enabled and configured in your merchant account.

**How to Check/Configure:**
1. Log into your Authorize.net Merchant Interface: https://account.authorize.net
2. Navigate to **Account → Webhooks** (or **Settings → Webhooks**)
3. Check if a webhook is configured for your URL
4. If not configured, you need to:
   - Click "Add Webhook" or "Create Webhook"
   - Enter URL: `https://quotes.mybookkeepers.com/api/webhook-handler`
   - Select event types to subscribe to:
     - `net.authorize.payment.authcapture.created` (Payment successful)
     - `net.authorize.payment.authcapture.failed` (Payment failed)
     - `net.authorize.payment.refund.created` (Refund processed)
   - Save the webhook

### 2. **Webhook URL Verification Failed**

Authorize.net may have tried to verify your webhook URL and failed.

**Requirements:**
- ✅ Must be HTTPS (you have this)
- ✅ Must return HTTP 200 status code (you have this)
- ✅ Must be publicly accessible (you have this)
- ⚠️ Must respond within 30 seconds (check your endpoint)
- ⚠️ Must accept POST requests (you have this)

**How to Verify:**
```bash
curl -X POST https://quotes.mybookkeepers.com/api/webhook-handler \
  -H "Content-Type: application/json" \
  -d '{"test": "verification"}'
```

### 3. **Webhook Disabled or Inactive**

**Check in Merchant Interface:**
- Go to **Account → Webhooks**
- Find your webhook (ID: `e1810d2b-a307-4cd0-adbf-8e35adbe4192`)
- Verify status is "Active" or "Enabled"
- Check if there are any error messages or delivery failures

### 4. **Event Types Not Subscribed**

**Required Event Types:**
- `net.authorize.payment.authcapture.created` - Fires when payment is successfully processed
- `net.authorize.payment.authcapture.failed` - Fires when payment fails

**How to Check:**
- In Authorize.net Merchant Interface → Webhooks
- Click on your webhook
- Verify these event types are selected/subscribed

### 5. **Webhook Delivery Failures**

Authorize.net may have tried to deliver but encountered errors.

**Check Delivery Logs:**
1. In Merchant Interface → Webhooks
2. Click on your webhook
3. Look for "Delivery History" or "Event Log"
4. Check for failed delivery attempts and error messages

**Common Delivery Failure Reasons:**
- Endpoint returned non-200 status code
- Endpoint took too long to respond (>30 seconds)
- SSL certificate issues
- Network connectivity problems
- Endpoint returned invalid response format

### 6. **Sandbox vs Production Environment**

**Important:** Webhooks must be configured separately for:
- **Sandbox/Test Environment** - Uses test transactions
- **Production Environment** - Uses live transactions

**If testing in sandbox:**
- Make sure webhook is configured in your **sandbox** merchant account
- Sandbox webhook URL might need to be different or same URL works for both

### 7. **Webhook Signature Verification**

Authorize.net may send webhooks with signature headers that need verification.

**Check Headers:**
- `X-Anet-Signature` - Webhook signature for verification
- `X-Anet-Request-Type` - Type of webhook request

**Current Implementation:**
- Your webhook handler doesn't verify signatures (this is OK for now, but should be added for security)

## Debugging Steps

### Step 1: Verify Webhook Configuration
1. Log into Authorize.net Merchant Interface
2. Go to Account → Webhooks
3. Check if webhook exists and is active
4. Verify URL matches: `https://quotes.mybookkeepers.com/api/webhook-handler`

### Step 2: Test Webhook Endpoint Manually
```bash
# Test if endpoint is accessible
curl -X POST https://quotes.mybookkeepers.com/api/webhook-handler \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "net.authorize.payment.authcapture.created",
    "payload": {
      "id": "test123",
      "type": "payment"
    }
  }'
```

Expected response: `{"success":true,"message":"Webhook processed successfully",...}`

### Step 3: Check Vercel Logs
1. Go to Vercel Dashboard → Your Project → Functions
2. Check logs for `/api/webhook-handler`
3. Look for any webhook delivery attempts
4. Check for errors or timeouts

### Step 4: Check Authorize.net Webhook Logs
1. In Merchant Interface → Webhooks
2. Click on your webhook
3. View "Delivery History" or "Event Log"
4. Look for:
   - Successful deliveries
   - Failed deliveries with error messages
   - Delivery timestamps

### Step 5: Test with Authorize.net Test Tool
1. In Merchant Interface → Webhooks
2. Find "Test Webhook" or "Send Test Event" button
3. Send a test webhook
4. Check if it arrives at your endpoint

### Step 6: Verify Transaction Processing
- Make sure transactions are actually being processed successfully
- Webhooks only fire for completed transactions
- Check transaction logs in Authorize.net to confirm transactions are completing

## Common Issues and Solutions

### Issue: "Webhook URL not accessible"
**Solution:** 
- Verify endpoint is publicly accessible (not behind firewall)
- Check SSL certificate is valid
- Ensure endpoint returns HTTP 200

### Issue: "Webhook delivery timeout"
**Solution:**
- Ensure endpoint responds quickly (<30 seconds)
- Check for any blocking operations in webhook handler
- Consider making webhook handler async/non-blocking

### Issue: "Webhook signature verification failed"
**Solution:**
- Implement signature verification in webhook handler
- Check `X-Anet-Signature` header
- Verify webhook secret/key if configured

### Issue: "Webhook not configured for event type"
**Solution:**
- In Merchant Interface, ensure event types are subscribed:
  - `net.authorize.payment.authcapture.created`
  - `net.authorize.payment.authcapture.failed`

## Next Steps

1. **Check Authorize.net Merchant Interface** - Verify webhook is configured
2. **Review Webhook Delivery Logs** - Check for failed deliveries
3. **Test Webhook Manually** - Send test webhook from Authorize.net
4. **Check Vercel Logs** - See if webhooks are arriving but failing
5. **Verify Event Subscriptions** - Ensure correct event types are enabled

## Hyros Integration Note

**Current Setup:**
- Hyros tracking script is loaded on pages (client-side)
- This tracks page views and user behavior
- **Webhooks are separate** - they notify your server about transactions

**For Hyros to receive transaction data via webhook:**
- You would need to forward webhook data to Hyros API
- Or use Hyros server-side integration
- Currently, Hyros only tracks via the client-side script

**If you want Hyros to receive transaction notifications:**
1. Webhook receives transaction from Authorize.net
2. Webhook handler forwards data to Hyros API
3. This requires Hyros API credentials and integration

## Testing Checklist

- [ ] Webhook configured in Authorize.net Merchant Interface
- [ ] Webhook URL is correct: `https://quotes.mybookkeepers.com/api/webhook-handler`
- [ ] Webhook status is "Active" or "Enabled"
- [ ] Event types are subscribed (authcapture.created, etc.)
- [ ] Endpoint is publicly accessible (tested with curl)
- [ ] Endpoint returns HTTP 200 (verified)
- [ ] Check Authorize.net webhook delivery logs
- [ ] Check Vercel function logs for webhook attempts
- [ ] Test webhook manually from Authorize.net interface

## Specific Transaction Debugging

**Transaction Details:**
- Transaction ID: `121332258200`
- Invoice Number: `INV-1762448795794`
- Status: Captured/Pending Settlement
- Date: 06-Nov-2025 09:06:36
- Amount: $1.99

**Root Cause Found:**
✅ **Webhook was set to INACTIVE in Authorize.net Merchant Interface**
- This explains why webhooks weren't firing
- Solution: Activate the webhook in Account → Webhooks
- After activation, new transactions will trigger webhooks

**Why This Transaction Might Not Have Triggered Webhook:**

1. **Webhook Not Configured for This Endpoint**
   - Check if webhook URL in Authorize.net matches: `https://quotes.mybookkeepers.com/api/webhook-handler`
   - Other channels might use different webhook URLs
   - You may need to ADD a new webhook specifically for this endpoint

2. **Multiple Webhook Configurations**
   - Authorize.net allows multiple webhooks
   - Check if you have multiple webhooks configured
   - Verify which webhook URL is associated with which integration/channel

3. **Webhook Delivery Logs**
   - In Authorize.net Merchant Interface → Webhooks
   - Look for delivery attempts around 09:06:36 on 06-Nov-2025
   - Check if there were any failed delivery attempts
   - Look for error messages

4. **Event Type Subscription**
   - Verify `net.authorize.payment.authcapture.created` is subscribed
   - This event fires when payment is successfully captured
   - If not subscribed, webhook won't fire

5. **Webhook Filtering**
   - Some webhook configurations allow filtering by transaction source
   - Check if webhook is filtered to only certain transaction types
   - API transactions might be filtered differently than other channels

## Immediate Action Items

1. **Check Authorize.net Webhook Configuration:**
   - Log into Merchant Interface
   - Go to Account → Webhooks
   - List ALL configured webhooks
   - Check which URLs they point to
   - Verify if `https://quotes.mybookkeepers.com/api/webhook-handler` exists

2. **Check Webhook Delivery Logs:**
   - For transaction `121332258200`
   - Look for any webhook delivery attempts
   - Check timestamps around 09:06:36
   - Note any error messages

3. **Compare with Working Webhooks:**
   - Check what webhook URL your other channels use
   - See if it's different from this endpoint
   - If different, you may need to add this endpoint as a new webhook

4. **Test Webhook Manually:**
   - Use Authorize.net's "Test Webhook" feature
   - Send a test event to `https://quotes.mybookkeepers.com/api/webhook-handler`
   - Check Vercel logs to see if it arrives

