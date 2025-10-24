# Authorize.net Production Setup Guide

## Overview
This guide walks you through setting up your quote tool for production with Authorize.net.

## Environment Variables Required

### Current Sandbox Variables (Keep These)
```
AUTHORIZE_NET_LOGIN_ID=your_sandbox_login_id
AUTHORIZE_NET_TRANSACTION_KEY=your_sandbox_transaction_key
```

### New Production Variables (Add These)
```
AUTHORIZE_NET_LOGIN_ID_PROD=2ww69CxS9enB
AUTHORIZE_NET_TRANSACTION_KEY_PROD=your_production_transaction_key
AUTHORIZE_NET_ENVIRONMENT=production
```

## How Environment Detection Works

The system automatically detects the environment based on:
1. `NODE_ENV=production` (Vercel automatically sets this in production)
2. `AUTHORIZE_NET_ENVIRONMENT=production` (manual override)

### Environment Behavior:
- **Sandbox Mode**: Uses `AUTHORIZE_NET_LOGIN_ID` + `AUTHORIZE_NET_TRANSACTION_KEY` → `apitest.authorize.net`
- **Production Mode**: Uses `AUTHORIZE_NET_LOGIN_ID_PROD` + `AUTHORIZE_NET_TRANSACTION_KEY_PROD` → `api.authorize.net`

## Setup Steps

### 1. Get Production Transaction Key
- Log into your Authorize.net merchant account
- Go to Account → Security Settings → API Credentials
- Copy your production Transaction Key
- Add it to Vercel as `AUTHORIZE_NET_TRANSACTION_KEY_PROD`

### 2. Configure Vercel Environment Variables
```bash
# Add production credentials
vercel env add AUTHORIZE_NET_LOGIN_ID_PROD
# Enter: 2ww69CxS9enB

vercel env add AUTHORIZE_NET_TRANSACTION_KEY_PROD
# Enter: your_production_transaction_key

# Set environment to production
vercel env add AUTHORIZE_NET_ENVIRONMENT
# Enter: production
```

### 3. Test Production Setup
1. Deploy the updated code
2. Test with a small real transaction
3. Check Vercel logs to confirm "PRODUCTION" environment is detected

### 4. Switch Authorize.net Account to Live Mode
- Log into Authorize.net Merchant Interface
- Look for "Test Mode" banner
- Click to switch to "Live Mode"

## Security Features Added

### Enhanced Validation (Production Only)
- Card number format validation (Luhn algorithm)
- Expiration date validation
- CVV format validation

### Production Logging
- Environment detection logging
- Transaction success/failure logging (without sensitive data)
- Response status logging

### PCI Compliance
- ✅ Card data never stored
- ✅ HTTPS enforced
- ✅ No sensitive data in logs
- ✅ Server-side processing only

## Testing Checklist

### Before Going Live:
- [ ] Production credentials configured
- [ ] Environment detection working
- [ ] Small test transaction successful
- [ ] Error handling tested
- [ ] Logs showing "PRODUCTION" environment

### After Going Live:
- [ ] Monitor first transactions closely
- [ ] Check transaction reports in Authorize.net
- [ ] Verify line items are correct
- [ ] Test refund capabilities

## Rollback Plan

If issues occur:
1. Set `AUTHORIZE_NET_ENVIRONMENT=sandbox` in Vercel
2. Redeploy to switch back to sandbox mode
3. Switch Authorize.net account back to Test Mode

## Monitoring

### Vercel Logs to Watch:
- `Payment processing environment: PRODUCTION`
- `✅ PRODUCTION Transaction Approved:`
- `❌ PRODUCTION Transaction Failed:`

### Authorize.net Dashboard:
- Transaction reports
- Settlement reports
- Error logs

## Support

If you encounter issues:
1. Check Vercel function logs
2. Verify environment variables are set correctly
3. Confirm Authorize.net account is in Live Mode
4. Test with Authorize.net's test cards first

---

**Next Step**: Provide your production Transaction Key to complete the setup.

