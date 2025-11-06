# How to View Authorize.net Webhook Delivery Logs

## Step-by-Step Instructions

### Step 1: Log into Authorize.net Merchant Interface
1. Go to **https://account.authorize.net**
2. Log in with your merchant account credentials

### Step 2: Navigate to Webhooks Section
1. Once logged in, follow this path:
   - Click on **Account** tab in the main toolbar
   - Under **Business Settings**, select **Webhooks**
   - This will show you all configured webhooks

### Step 3: View Your Webhooks
1. You should see a list of all configured webhooks
2. Each webhook will show:
   - Webhook name/description
   - Webhook URL
   - Status (Active/Inactive)
   - Event types subscribed

### Step 4: Access Webhook Delivery Logs

**If "Webhook History" is not visible, try these alternatives:**

**Option A: Click on Individual Webhook**
1. In the **Webhooks** list, **click on a specific webhook** (yours or Hyros')
2. This opens the webhook details/configuration page
3. Look for tabs or sections like:
   - **"Activity"**
   - **"Events"**
   - **"Logs"**
   - **"History"**
   - **"Delivery Status"**
   - **"Recent Activity"**
   - Or scroll down to see if logs appear below the configuration

**Option B: Check Transaction Details**
1. Go to **Transactions** or **Transaction Search**
2. Search for Transaction ID: **121332258200**
3. Click on the transaction to view details
4. Look for sections like:
   - **"Webhooks"**
   - **"Notifications"**
   - **"Events"**
   - This might show webhook delivery status for that specific transaction

**Option C: Check Webhook Status Column**
1. In the **Webhooks** list, look for a **"Status"** or **"Last Delivery"** column
2. This might show when webhooks were last sent
3. Click on status indicators to see more details

### Step 5: View Delivery Logs
Once you're in the **Webhook History** section, you should see a list with:
- **Event Type** - What event triggered it (e.g., `authcapture.created`)
- **Endpoint URL** - The URL the webhook was sent to
- **Status** - Success/Failed/Pending (indicates if webhook was successfully delivered)
- **Timestamp** - The date and time when the webhook was sent
- **Transaction ID** - The transaction that triggered it (if applicable)
- **Response Code** - HTTP response from your endpoint
- **Error Message** - If delivery failed, what went wrong

### Step 6: Filter/Search Logs
Most webhook log interfaces allow you to:
- **Filter by date range** - Look for logs around 09:06:36 on 06-Nov-2025
- **Search by Transaction ID** - Search for `121332258200`
- **Filter by status** - Show only failed deliveries
- **Filter by event type** - Show only `authcapture.created` events

## What to Look For

### For Your Transaction (121332258200):
1. **Check if webhook was sent:**
   - Look for entries around **09:06:36 on 06-Nov-2025**
   - Search for Transaction ID: **121332258200**
   - Check if there's a delivery attempt

2. **If webhook was sent:**
   - Check the **Status** column
   - **Success (200)** = Webhook was delivered successfully
   - **Failed** = Check the error message

3. **If webhook was NOT sent:**
   - Webhook might be inactive
   - Event type might not be subscribed
   - Transaction might not match webhook criteria

### For Hyros' Webhook:
1. Find Hyros' webhook in the list
2. Click on it to view details
3. Check delivery logs for transaction `121332258200`
4. See if Authorize.net attempted to send webhook to Hyros
5. Check status and any error messages

## Alternative: Transaction Details Page

Some Authorize.net interfaces also show webhook delivery status on the transaction details page:

1. Go to **Transactions** or **Transaction Search**
2. Search for Transaction ID: **121332258200**
3. Click on the transaction to view details
4. Look for a **"Webhooks"** or **"Notifications"** section
5. This might show webhook delivery status for that specific transaction

## If You Can't Find Delivery Logs

### Option 1: Click on Each Webhook Individually
- Click on your webhook (for `https://quotes.mybookkeepers.com/api/webhook-handler`)
- Click on Hyros' webhook
- Look for any logs, activity, or history sections within each webhook's details page
- Some interfaces hide logs until you click into the webhook

### Option 2: Check Transaction Details Page
- Go to **Transactions** → Search for **121332258200**
- View the transaction details
- Look for webhook/notification information on that specific transaction
- Some interfaces show webhook status per transaction

### Option 3: Check Vercel Logs Instead
Since you can't find Authorize.net logs, check if webhooks are arriving:
```bash
# Check Vercel logs for webhook deliveries
vercel logs https://quotes.mybookkeepers.com | grep "webhook"

# Or check in Vercel Dashboard → Functions → /api/webhook-handler
```
If webhooks are arriving in Vercel, then Authorize.net is sending them successfully.

### Option 4: Contact Authorize.net Support
- Call or chat with support
- Ask: "How do I view webhook delivery logs for transaction 121332258200?"
- They can check their backend logs even if the UI doesn't show them
- Support number: Usually found in Account → Support or Help section

### Option 5: Test Webhook Manually
- In the Webhooks section, look for a **"Test"** or **"Send Test"** button
- Click it to send a test webhook
- Check your Vercel logs to see if it arrives
- This confirms webhooks are working, even if you can't see historical logs

## Exact Navigation Path

**To View Webhooks:**
1. Log in to https://account.authorize.net
2. Click **Account** tab
3. Under **Business Settings**, click **Webhooks**
4. You should see a list of configured webhooks

**To Check Individual Webhook Logs:**
1. Follow steps 1-3 above
2. **Click on a specific webhook** from the list (don't just look at the list)
3. This opens the webhook details page
4. Look for logs/history/activity sections within that page
5. Some interfaces require clicking into each webhook to see its logs

**Alternative: Check Transaction Details**
1. Go to **Transactions** or **Transaction Search**
2. Search for Transaction ID: **121332258200**
3. Click on the transaction
4. Look for webhook/notification information

## Quick Checklist

- [ ] Logged into Authorize.net Merchant Interface
- [ ] Navigated to Account → Webhooks
- [ ] Found the webhook I want to check
- [ ] Clicked on the webhook to view details
- [ ] Found "Delivery History" or "Event Log" section
- [ ] Searched for transaction `121332258200`
- [ ] Checked logs around 09:06:36 on 06-Nov-2025
- [ ] Reviewed status (Success/Failed) and error messages

## Troubleshooting

### "I don't see a Webhooks section"
- Your account might not have webhooks enabled
- Contact Authorize.net support to enable webhooks
- Webhooks might be under a different menu name

### "I see webhooks but no delivery logs"
- Webhooks might not have fired yet
- Logs might only show recent activity (check date range)
- Webhook might be inactive

### "I see webhooks but can't click on them"
- You might need different permissions
- Contact your account administrator
- Try a different browser or clear cache

## Next Steps After Viewing Logs

1. **If webhook was sent successfully:**
   - Check your endpoint logs (Vercel) to see if it was received
   - Verify webhook handler processed it correctly

2. **If webhook failed to deliver:**
   - Check error message for details
   - Verify endpoint URL is correct
   - Check if endpoint is accessible
   - Verify endpoint returns HTTP 200

3. **If webhook was never sent:**
   - Check if webhook is active
   - Verify event types are subscribed
   - Check if transaction matches webhook criteria

