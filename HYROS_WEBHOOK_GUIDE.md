# Hyros Webhook Configuration Guide

## How Authorize.net Webhooks Work

**Important:** If Hyros has a webhook configured in Authorize.net, it **SHOULD fire for ALL transactions** that match the webhook's event type criteria, regardless of:
- Where the transaction originated (API, payment form, other channels)
- How the transaction was processed
- What integration method was used

## Why Hyros' Webhook Should Fire for All Sales

Authorize.net webhooks are **transaction-based**, not **source-based**. This means:
- ✅ Webhooks fire based on **transaction events** (e.g., `authcapture.created`)
- ✅ They don't care about the **source** of the transaction
- ✅ If configured correctly, they fire for **every matching transaction**

## Why Hyros' Webhook Might Not Be Firing

### 1. **Webhook is Inactive** (Most Common)
- Just like your webhook was inactive, Hyros' webhook might be inactive too
- **Check:** Authorize.net → Account → Webhooks → Find Hyros' webhook → Verify status is "Active"

### 2. **Wrong Event Types Subscribed**
- Hyros' webhook might not be subscribed to `net.authorize.payment.authcapture.created`
- **Check:** Verify which event types are enabled for Hyros' webhook

### 3. **Webhook URL Issues**
- Hyros' webhook URL might be incorrect or unreachable
- **Check:** Authorize.net webhook delivery logs for Hyros' webhook

### 4. **Webhook Filtering** (Less Common)
- Some webhook configurations allow filtering by transaction properties
- **Check:** See if Hyros' webhook has any filters applied

### 5. **Transaction Processing Differences**
- If transactions are processed differently, they might not trigger webhooks
- **Check:** Compare transaction details between working and non-working transactions

## How to Check Hyros' Webhook Configuration

### Step 1: Log into Authorize.net Merchant Interface
1. Go to https://account.authorize.net
2. Log in with your merchant account

### Step 2: Navigate to Webhooks
1. Go to **Account → Webhooks** (or **Settings → Webhooks**)
2. You should see a list of all configured webhooks

### Step 3: Find Hyros' Webhook
Look for:
- Webhook URL pointing to Hyros' domain (e.g., `https://api.hyros.com/webhook/authorize-net`)
- Or a webhook with "Hyros" in the name/description
- Or check with Hyros support for their webhook URL

### Step 4: Verify Configuration
For Hyros' webhook, check:
- ✅ **Status:** Should be "Active" or "Enabled"
- ✅ **Event Types:** Should include `net.authorize.payment.authcapture.created`
- ✅ **URL:** Should be correct and accessible
- ✅ **Delivery Logs:** Check for successful/failed deliveries

## How to Verify Webhooks Are Being Sent to Hyros

**Important:** Vercel logs won't show Hyros' webhook data - they only show webhooks sent to YOUR endpoint.

### Option 1: Check Hyros Dashboard (Best Option)
1. Log into your **Hyros account**
2. Go to transactions/sales section
3. Search for transaction ID: **121332258200**
4. Check if the transaction appears in Hyros
5. **If transaction appears:** ✅ Hyros received the webhook
6. **If transaction doesn't appear:** ❌ Webhook likely didn't fire or wasn't received

### Option 2: Check Authorize.net Webhook Delivery Logs
**Since "Webhook History" isn't visible in your UI, try:**
1. In Authorize.net → Account → Webhooks
2. **Click on Hyros' webhook** (don't just look at the list)
3. Look for tabs/sections like:
   - "Activity", "Events", "Logs", "History", "Delivery Status"
   - Scroll down - logs might be below configuration
4. Look for delivery attempts for transaction `121332258200`
5. Check timestamps around 09:06:36 on 06-Nov-2025

### Option 3: Check Transaction Details in Authorize.net
1. Go to **Transactions** → Search for **121332258200**
2. Click on the transaction to view details
3. Look for sections like:
   - "Webhooks", "Notifications", "Events"
4. This might show which webhooks were sent for this transaction
5. Check if Hyros' webhook is listed

### Option 4: Contact Authorize.net Support
- Call or chat with support
- Ask: "Can you check if webhooks were sent to Hyros for transaction 121332258200?"
- Provide:
  - Transaction ID: 121332258200
  - Hyros' webhook URL (if you know it)
  - Transaction date/time: 06-Nov-2025 09:06:36
- They can check their backend logs even if UI doesn't show them

### Option 5: Contact Hyros Support
- Log into Hyros and contact their support
- Ask: "Did you receive a webhook from Authorize.net for transaction 121332258200?"
- Provide:
  - Transaction ID: 121332258200
  - Transaction date/time: 06-Nov-2025 09:06:36
  - Amount: $1.99
- They can check their webhook logs and tell you if they received it

### Option 6: Make a Test Transaction and Monitor
1. Process a small test transaction through your quote tool
2. **Immediately check Hyros dashboard** to see if it appears
3. **Compare timing:**
   - If transaction appears in Hyros within seconds/minutes: ✅ Webhook working
   - If transaction doesn't appear: ❌ Webhook not firing or not being received
4. This gives you real-time feedback

## Testing Hyros' Webhook

### Test 1: Use Authorize.net Test Feature
1. In Authorize.net → Webhooks → Hyros' webhook
2. Click "Test Webhook" or "Send Test Event"
3. Send a test event
4. Check if Hyros receives it

### Test 2: Make a Small Test Transaction
1. Process a small test transaction through your quote tool
2. Check Authorize.net webhook delivery logs for Hyros' webhook
3. Check Hyros dashboard to see if transaction appears
4. Compare with transactions from other channels

## Common Issues and Solutions

### Issue: "Hyros webhook is inactive"
**Solution:**
- Activate the webhook in Authorize.net
- Verify it stays active (sometimes webhooks get deactivated automatically)

### Issue: "Hyros webhook fires for other channels but not quote tool"
**Possible Causes:**
1. **Different Transaction Properties:** Your quote tool transactions might have different properties
2. **Webhook Filtering:** Hyros' webhook might be filtered to only certain transaction types
3. **Timing:** Webhook might be delayed or queued

**Solution:**
- Compare transaction details between working and non-working transactions
- Check if there are any differences in:
  - Transaction type
  - Payment method
  - Customer data format
  - Line items structure

### Issue: "Hyros webhook delivery fails"
**Solution:**
- Check Authorize.net webhook delivery logs for error messages
- Verify Hyros' webhook URL is correct and accessible
- Contact Hyros support if URL has changed

## What to Check Right Now

1. **Authorize.net Webhook Status:**
   - Is Hyros' webhook active?
   - What event types is it subscribed to?
   - What's the webhook URL?

2. **Delivery Logs:**
   - Check delivery logs for transaction `121332258200`
   - See if Authorize.net attempted to send webhook to Hyros
   - Check for any error messages

3. **Compare with Working Transactions:**
   - Look at a transaction from another channel that Hyros received
   - Compare transaction properties with your quote tool transaction
   - See if there are any differences

## Next Steps

1. **Check Authorize.net:** Verify Hyros' webhook is active and configured correctly
2. **Check Delivery Logs:** See if webhooks are being sent to Hyros
3. **Contact Hyros:** Ask them to verify their webhook configuration and check their logs
4. **Test:** Make a test transaction and verify webhook fires

## Summary

**Yes, Hyros' webhook SHOULD fire for all sales** if:
- ✅ Webhook is active in Authorize.net
- ✅ Webhook is subscribed to the correct event types
- ✅ Webhook URL is correct and accessible
- ✅ Transaction matches the webhook's criteria

If it's not firing, the most likely causes are:
1. Webhook is inactive (same issue you had)
2. Wrong event types subscribed
3. Webhook delivery failures
4. Webhook filtering (less common)

The fact that it works for other channels suggests the webhook is configured, but might be inactive or have delivery issues.

