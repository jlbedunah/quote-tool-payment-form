# How to Check if Hyros' Webhook is Firing

**Important:** Vercel logs only show webhooks sent to YOUR endpoint (`https://quotes.mybookkeepers.com/api/webhook-handler`). They won't show webhooks sent to Hyros' endpoint.

## Best Method: Check Hyros Dashboard

### Step 1: Log into Hyros
1. Go to your Hyros account dashboard
2. Log in with your credentials

### Step 2: Check for Your Transaction
1. Navigate to **Transactions**, **Sales**, or **Orders** section
2. Search for Transaction ID: **121332258200**
3. Or search by:
   - Date: 06-Nov-2025
   - Amount: $1.99
   - Customer: Bedunah, Jason

### Step 3: Interpret Results
- **✅ Transaction appears in Hyros:**
  - Hyros received the webhook successfully
  - Webhook is working correctly
  - Issue might be elsewhere (data format, etc.)

- **❌ Transaction doesn't appear in Hyros:**
  - Webhook likely didn't fire from Authorize.net
  - OR webhook was sent but Hyros didn't process it
  - Need to check Authorize.net webhook configuration

## Alternative Methods

### Method 1: Contact Hyros Support
**Ask them directly:**
- "Did you receive a webhook from Authorize.net for transaction 121332258200?"
- Provide transaction details (ID, date, amount)
- They can check their webhook logs

### Method 2: Check Authorize.net (If You Can Find Logs)
1. Go to Authorize.net → Account → Webhooks
2. Click on **Hyros' webhook** (click into it, don't just view the list)
3. Look for activity/logs/history sections
4. Check for delivery attempts for transaction `121332258200`

### Method 3: Check Transaction Details in Authorize.net
1. Go to **Transactions** → Search for **121332258200**
2. Click on the transaction
3. Look for webhook/notification information
4. See if Hyros' webhook is listed as sent

### Method 4: Contact Authorize.net Support
- Ask: "Can you check if webhooks were sent to Hyros for transaction 121332258200?"
- They can check backend logs even if UI doesn't show them

### Method 5: Make a Test Transaction
1. Process a small test transaction ($0.01 if possible)
2. **Immediately** check Hyros dashboard
3. If it appears quickly: ✅ Webhook working
4. If it doesn't appear: ❌ Webhook not firing

## What to Check in Authorize.net

### For Hyros' Webhook:
1. **Status:** Is it Active/Enabled?
2. **Event Types:** Is `net.authorize.payment.authcapture.created` subscribed?
3. **URL:** Is the webhook URL correct?
4. **Delivery Logs:** Are there any failed delivery attempts?

### Compare with Your Webhook:
- Your webhook was inactive (you fixed it)
- Hyros' webhook might also be inactive
- Check if both webhooks have the same status

## Quick Diagnostic

**To determine if Hyros' webhook is firing:**

1. **Check Hyros Dashboard** (easiest)
   - If transaction appears: ✅ Webhook working
   - If transaction doesn't appear: ❌ Check webhook config

2. **Make a test transaction**
   - Process a new transaction
   - Check Hyros immediately
   - Compare with transactions from other channels

3. **Contact Support**
   - Authorize.net: Check if webhook was sent
   - Hyros: Check if webhook was received

## Most Likely Scenario

Since your webhook was inactive, **Hyros' webhook might also be inactive**. 

**Check:**
1. Authorize.net → Webhooks → Click on Hyros' webhook
2. Verify status is "Active"
3. Verify event types are subscribed
4. Check if there are any error messages

## Summary

**To check if Hyros' webhook is firing:**
- ✅ **Best:** Check Hyros dashboard for transaction `121332258200`
- ✅ **Alternative:** Contact Hyros support to check their logs
- ✅ **Alternative:** Contact Authorize.net support to check if webhook was sent
- ✅ **Test:** Make a new transaction and check Hyros immediately

**Vercel logs won't help** - they only show webhooks sent to your endpoint, not Hyros'.

