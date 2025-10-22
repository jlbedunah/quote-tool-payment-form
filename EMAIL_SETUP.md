# Email Setup Instructions

## Vercel's Email Service: Resend

Vercel recommends **Resend** as their preferred email service provider. Resend is designed specifically for developers and integrates seamlessly with Vercel's serverless functions.

### Why Resend?

- **Vercel Integration**: Native integration with Vercel serverless functions
- **Free Tier**: 3,000 emails per month free
- **Developer Friendly**: Simple API and excellent documentation
- **High Deliverability**: Built for transactional emails
- **Templates**: Built-in email templates and analytics

## Setup Steps

### 1. Create Resend Account

1. Go to [resend.com](https://resend.com)
2. Sign up for a free account
3. Verify your email address

### 2. Get API Key

1. In your Resend dashboard, go to **API Keys**
2. Click **Create API Key**
3. Give it a name (e.g., "Quote Tool")
4. Copy the API key (starts with `re_`)

### 3. Add Domain (Required for Production)

1. In Resend dashboard, go to **Domains**
2. Click **Add Domain**
3. Add your domain (e.g., `yourdomain.com`)
4. Follow DNS setup instructions
5. Wait for verification

### 4. Configure Vercel Environment Variables

#### Option A: Using Vercel CLI
```bash
vercel env add RESEND_API_KEY
# Paste your API key when prompted
```

#### Option B: Using Vercel Dashboard
1. Go to your project in Vercel dashboard
2. Go to **Settings** → **Environment Variables**
3. Add new variable:
   - **Name**: `RESEND_API_KEY`
   - **Value**: Your Resend API key
   - **Environment**: Production, Preview, Development

### 5. Update Email Configuration

In `/api/send-quote-email.js`, update the `from` field:

```javascript
const data = await resend.emails.send({
  from: 'quotes@yourdomain.com', // Replace with your verified domain
  to: [recipientEmail],
  subject: subject || 'Your Quote Request',
  html: emailContent,
});
```

**Important**: Replace `yourdomain.com` with your actual verified domain.

### 6. Deploy to Vercel

```bash
vercel --prod
```

## Testing

### Test Email Functionality

1. Go to your deployed quote tool
2. Fill out the form with test data
3. Click **Send Quote via Email**
4. Enter a test email address
5. Check if the email is received

### Test API Endpoint Directly

```bash
curl -X POST https://your-vercel-app.vercel.app/api/send-quote-email \
  -H "Content-Type: application/json" \
  -d '{
    "recipientEmail": "test@example.com",
    "subject": "Test Quote",
    "message": "Test message",
    "quoteData": {
      "firstName": "Test",
      "lastName": "User",
      "email": "test@example.com",
      "services": [{
        "productName": "Test Service",
        "quantity": "1",
        "unitCost": "100",
        "subtotal": "100"
      }],
      "total": "100"
    }
  }'
```

## Troubleshooting

### Common Issues

1. **"Invalid API Key"**
   - Check that your API key is correct
   - Ensure environment variable is set in Vercel

2. **"Domain not verified"**
   - Verify your domain in Resend dashboard
   - Check DNS settings

3. **"Email not received"**
   - Check spam folder
   - Verify recipient email address
   - Check Resend dashboard for delivery logs

### Debug Mode

Add console logging to debug issues:

```javascript
console.log('Sending email to:', recipientEmail);
console.log('Email data:', emailData);
```

## Alternative Email Services

If you prefer other services:

### SendGrid
- More complex setup
- Higher free tier (100 emails/day)
- More features

### Mailgun
- Good deliverability
- 5,000 emails/month free
- More complex API

### Amazon SES
- Very cheap
- Requires AWS account
- More complex setup

## Security Notes

- Never commit API keys to git
- Use environment variables
- Validate all input data
- Rate limit email sending
- Monitor usage to avoid spam

## Next Steps

1. Set up your Resend account
2. Add your domain
3. Configure environment variables
4. Test the functionality
5. Deploy to production

The email feature is now ready to use! Customers can receive professional quote emails directly from your quote tool.
