# GA4 Server-Side Tracking Setup

## Overview

This implementation sends GA4 purchase events server-side for **all** Authorize.net transactions, including those that occur outside of your quote tool. This ensures complete eCommerce tracking regardless of where the payment originates.

## How It Works

1. **Authorize.net Webhook** → Receives payment notification
2. **Webhook Handler** → Processes transaction and syncs to GoHighLevel/Supabase
3. **GA4 Measurement Protocol** → Sends purchase event directly to GA4 (server-side)
4. **GA4** → Records purchase event with full transaction details

## Benefits

✅ **Complete Coverage**: Tracks all Authorize.net transactions, not just quote tool payments  
✅ **Server-Side Reliability**: Works even if customer doesn't visit a success page  
✅ **No Client Dependency**: Doesn't require browser JavaScript to fire  
✅ **Consistent Data**: Same purchase event format as client-side tracking  

## Setup Instructions

### Step 1: Get GA4 API Secret

1. Go to [Google Analytics](https://analytics.google.com)
2. Click **Admin** (gear icon) in the bottom left
3. Under **Property** column, click **Data Streams**
4. Click on your data stream (or create one if needed)
5. Scroll down to **Measurement Protocol API secrets**
6. Click **Create** to generate a new API secret
7. Give it a name (e.g., "Authorize.net Server Tracking")
8. **Copy the API secret** (you'll only see it once!)

### Step 2: Add Environment Variables

#### In Vercel:

1. Go to your project in [Vercel Dashboard](https://vercel.com)
2. Go to **Settings** → **Environment Variables**
3. Add the following variables:

**For Production:**
- **Name**: `GA4_MEASUREMENT_ID`
- **Value**: `G-8ZN40WHZ74` (or your GA4 Measurement ID)
- **Environment**: Production

- **Name**: `GA4_API_SECRET`
- **Value**: `[Your API Secret from Step 1]`
- **Environment**: Production

**For Preview/Development (Optional):**
- Add the same variables with **Environment**: Preview, Development

#### Using Vercel CLI:

```bash
vercel env add GA4_MEASUREMENT_ID
# Enter: G-8ZN40WHZ74
# Select: Production

vercel env add GA4_API_SECRET
# Paste your API secret
# Select: Production
```

### Step 3: Deploy

The code is already implemented! Just deploy:

```bash
git add .
git commit -m "Add GA4 server-side tracking for Authorize.net transactions"
git push
```

Or deploy directly:
```bash
vercel --prod
```

## What Gets Tracked

For each Authorize.net transaction, GA4 receives:

- ✅ **Transaction ID**: Authorize.net transaction ID
- ✅ **Transaction Value**: Total amount
- ✅ **Currency**: USD (or from transaction)
- ✅ **Items Array**: 
  - Item ID
  - Item name (product/service name)
  - Category (Bookkeeping Services)
  - Quantity
  - Price per item
- ✅ **Invoice Number**: If available from Authorize.net

## Testing

### Test with a Real Transaction:

1. **Make a test purchase** through Authorize.net (outside quote tool if possible)
2. **Check Vercel Logs**:
   - Go to Vercel Dashboard → Your Project → Logs
   - Look for: `"GA4 purchase event sent successfully"`
3. **Check GA4 Real-Time**:
   - Go to GA4 → Reports → Real-time
   - Look for purchase events (may take a few minutes)
4. **Check GA4 Events**:
   - Go to GA4 → Reports → Engagement → Events
   - Find `purchase` events with your transaction data

### Verify in Logs:

Look for these log messages in Vercel:

✅ **Success**: `"GA4 purchase event sent successfully for transaction: [ID]"`  
⚠️ **Skipped**: `"GA4 purchase event skipped: GA4_API_SECRET not configured"`  
❌ **Error**: `"Error sending GA4 purchase event"` (check error details)

## Troubleshooting

### GA4 Events Not Appearing

1. **Check API Secret**:
   - Verify `GA4_API_SECRET` is set in Vercel
   - Make sure it's the correct secret (not the Measurement ID)
   - Check environment scope (Production vs Preview)

2. **Check Logs**:
   - Look for error messages in Vercel logs
   - Check if events are being skipped or failing

3. **Verify Measurement ID**:
   - Ensure `GA4_MEASUREMENT_ID` matches your GA4 property
   - Default is `G-8ZN40WHZ74` (from your existing setup)

4. **Wait for Processing**:
   - GA4 may take a few minutes to show events
   - Check Real-time reports first, then Events reports

### API Secret Issues

- **Secret Not Working**: Generate a new one in GA4 and update Vercel
- **Secret Exposed**: Revoke the old one and create a new one
- **Wrong Environment**: Make sure secret is set for the correct Vercel environment

## Code Implementation

The implementation consists of:

1. **`lib/ga4-measurement-protocol.js`**: 
   - `sendGA4PurchaseEvent()` function
   - Handles GA4 Measurement Protocol API calls
   - Maps transaction data to GA4 format

2. **`lib/authorize-net-sync.js`**:
   - Calls `sendGA4PurchaseEvent()` after processing transaction
   - Maps Authorize.net line items to GA4 items format
   - Handles errors gracefully (doesn't break webhook processing)

## Data Flow

```
Authorize.net Transaction
    ↓
Webhook → /api/webhook-handler.js
    ↓
syncAuthorizeNetTransaction()
    ↓
[Sync to GoHighLevel]
[Update Supabase Quotes]
    ↓
sendGA4PurchaseEvent() ← NEW!
    ↓
GA4 Measurement Protocol API
    ↓
GA4 Purchase Event Recorded
```

## Important Notes

- ⚠️ **Non-Blocking**: GA4 tracking errors won't break webhook processing
- ⚠️ **Deduplication**: GA4 uses `transaction_id` to prevent duplicate events
- ⚠️ **Client ID**: Generated from email/transaction ID for server-side tracking
- ✅ **Works Everywhere**: Tracks transactions from any Authorize.net integration

## Next Steps

1. ✅ Set up GA4 API Secret
2. ✅ Add environment variables to Vercel
3. ✅ Deploy code
4. ✅ Test with a transaction
5. ✅ Verify in GA4 Real-time reports
6. ✅ Link GA4 to Google Ads (if not already done)

## Related Documentation

- [GA4 Measurement Protocol Documentation](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- [GOOGLE_ADS_SETUP_QUICK_START.md](./GOOGLE_ADS_SETUP_QUICK_START.md) - Link GA4 to Google Ads
- [Authorize.net Webhooks](https://developer.authorize.net/api/reference/features/webhooks.html)

