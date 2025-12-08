# Testing Webhooks Locally

## Automatic Solution (No Extra Steps!)

**Good news!** The payment form now **automatically syncs to GHL** when testing locally. No extra steps needed!

When you test with `vercel dev`:
1. Make a payment through the quote tool
2. The payment form detects you're on `localhost`
3. It automatically calls the direct sync endpoint
4. Tags and notes are added to GHL immediately
5. **Works exactly like production!**

### How It Works

- **Production**: Authorize.net sends webhooks → webhook handler syncs to GHL
- **Local Dev**: Payment form detects localhost → directly calls sync endpoint → syncs to GHL

Both paths result in the same outcome - tags and notes are added automatically!

## Manual Solutions (If Needed)

### Option 1: Test in Production

Simply test on your deployed site:
1. Go to `https://quotes.mybookkeepers.com/quote-tool.html`
2. Create a quote and pay it
3. Webhooks will be received and processed normally

### Option 2: Manually Sync After Local Test (Fallback)

After making a payment locally, manually sync the transaction:

1. **Get the transaction ID** from:
   - Authorize.net dashboard
   - Payment success page
   - Email confirmation

2. **Use the manual sync endpoint:**
```bash
curl -X POST https://quotes.mybookkeepers.com/api/manual-sync-transaction \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "transactionId": "TRANSACTION_ID_HERE",
    "email": "test@example.com"
  }'
```

3. **Or use the manual tag endpoint** if you just need to add tags:
```bash
curl -X POST https://quotes.mybookkeepers.com/api/manual-tag-contact \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "tags": ["authorize.net", "sold bookkeeping project"]
  }'
```

### Option 3: Use ngrok for Local Webhook Testing (Advanced)

If you need to test webhooks locally:

1. **Install ngrok:**
```bash
brew install ngrok  # macOS
# or download from https://ngrok.com
```

2. **Start vercel dev:**
```bash
vercel dev
```

3. **In another terminal, expose localhost:**
```bash
ngrok http 3000
```

4. **Copy the ngrok URL** (e.g., `https://abc123.ngrok.io`)

5. **Temporarily update Authorize.net webhook URL:**
   - Go to Authorize.net dashboard
   - Update webhook URL to: `https://abc123.ngrok.io/api/webhook-handler`
   - **Remember to change it back to production URL after testing!**

6. **Test the payment** - webhooks will now reach your local server

7. **Check ngrok dashboard** to see incoming webhook requests

## Important Notes

- **Always test in production** for final verification
- **Don't leave ngrok URL** in Authorize.net webhook settings
- **Manual sync endpoints** are available for fixing missed webhooks
- **Production webhooks** are the source of truth

## Checking if Webhook Was Received

1. **Check Vercel logs:**
   - Go to Vercel dashboard → Your project → Functions
   - Look for `/api/webhook-handler` function logs
   - Check for "Webhook received" messages

2. **Check application logs:**
   - Go to `/admin-logs.html`
   - Search for your email or transaction ID
   - Look for webhook-related logs

3. **Check Authorize.net dashboard:**
   - Go to Account → Webhooks
   - Check webhook delivery status
   - See if webhooks are being sent successfully

