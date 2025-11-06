# How to View Webhook Logs in Vercel

## Method 1: Vercel Dashboard (Web Interface) - **Easiest**

### Steps:
1. Go to [vercel.com](https://vercel.com) and log in
2. Navigate to your project: **"Simple Cart Pages"** (or whatever your project is named)
3. Click on the **"Functions"** tab (or **"Deployments"** → select a deployment → **"Functions"**)
4. Find **`/api/webhook-handler`** in the list
5. Click on it to see:
   - Function invocations
   - Request/response logs
   - Console.log output
   - Error messages
   - Execution time

### Real-time Monitoring:
- Logs update automatically
- You can filter by time range
- See all `console.log()` statements from your webhook handler

### What You'll See:
- **Webhook received:** Headers, body, timestamp
- **Processing webhook event:** Event type and payload
- **Payment authorized and captured:** Transaction details
- Any errors or warnings

---

## Method 2: Vercel CLI (Command Line) - **For Real-time Streaming**

### Get Your Deployment URL:
First, you need your deployment URL. You can find it:
- In Vercel Dashboard → Deployments → Copy the URL
- Or use: `vercel ls` to list deployments

### Basic Command:
```bash
# Replace DEPLOYMENT_URL with your actual deployment URL
vercel logs https://quotes.mybookkeepers.com
```

### Stream Logs in Real-time:
```bash
# This will show logs from now and stream for 5 minutes
vercel logs https://quotes.mybookkeepers.com
```

### Filter Logs:
```bash
# Filter by search term
vercel logs https://quotes.mybookkeepers.com | grep "webhook"
vercel logs https://quotes.mybookkeepers.com | grep "121332258200"
vercel logs https://quotes.mybookkeepers.com | grep "authcapture.created"
```

### JSON Output (for parsing):
```bash
vercel logs https://quotes.mybookkeepers.com --json | jq '.'
```

### Alternative: Use Vercel Dashboard Logs API
The CLI `logs` command shows runtime logs for a specific deployment. For better filtering, use the Dashboard.

---

## Method 3: Vercel Dashboard - Function Logs Tab

1. Go to your project in Vercel Dashboard
2. Click **"Deployments"** tab
3. Click on a specific deployment
4. Click **"Functions"** tab
5. Click on **`/api/webhook-handler`**
6. You'll see:
   - **Invocation History** - All requests to the function
   - **Logs** - Console output and errors
   - **Metrics** - Execution time, memory usage

---

## What to Look For in Webhook Logs

### Successful Webhook:
```
Webhook received: {
  headers: {...},
  body: {
    eventType: 'net.authorize.payment.authcapture.created',
    payload: {...}
  },
  timestamp: '2025-11-06T...'
}
Processing webhook event: net.authorize.payment.authcapture.created
Payment authorized and captured: { id: '121332258200', ... }
```

### Failed Webhook:
```
Webhook processing error: ...
```

### No Logs?
- Webhook might not be configured correctly in Authorize.net
- Webhook might not be active
- Check Authorize.net webhook delivery logs

---

## Quick Test Command

Test if logs are working:
```bash
# Send a test webhook
curl -X POST https://quotes.mybookkeepers.com/api/webhook-handler \
  -H "Content-Type: application/json" \
  -d '{"eventType": "test", "payload": {"test": true}}'

# Then check logs immediately
vercel logs --follow | grep "test"
```

---

## Tips

1. **Use Dashboard for Historical Logs** - Easy to browse and search
2. **Use CLI for Real-time Monitoring** - `vercel logs --follow` streams live
3. **Filter by Transaction ID** - Search for specific transactions
4. **Check Both Vercel and Authorize.net Logs** - Compare delivery times

---

## Troubleshooting

### "No logs found"
- Make sure you're looking at the right deployment (production vs preview)
- Check that the function was actually invoked
- Verify webhook is active in Authorize.net

### "Logs are delayed"
- Vercel logs can take a few seconds to appear
- Use `--follow` for real-time streaming

### "Can't see console.log output"
- Make sure your webhook handler uses `console.log()`
- Check that you're looking at the right function (`/api/webhook-handler`)

