# GHL Tags Reference

## Overview

This document lists all tags that are applied to GoHighLevel (GHL) contact records when payments are processed via Authorize.net.

## Payment Transaction Tags

When a payment is successfully processed via Authorize.net (`net.authorize.payment.authcapture.created`):

### Static Tags (Always Applied)
- ✅ `authorize.net`
- ✅ `sold bookkeeping project`

### Product Tags (Based on Line Items)
- ✅ Product name tags (slugified)
  - Example: `tax-return-s-corp` (from "Tax Return (S-Corp)")
  - Example: `catch-up-bookkeeping` (from "Catch-up Bookkeeping")
  - Example: `monthly-bookkeeping-subscription` (from "Monthly Bookkeeping Subscription")

### Tag Examples

**Example 1: Single Product Purchase**
- Product: "Tax Return (S-Corp)"
- Tags Applied:
  - `authorize.net`
  - `sold bookkeeping project`
  - `tax-return-s-corp`

**Example 2: Multiple Products Purchase**
- Products: "Tax Return (S-Corp)", "Catch-up Bookkeeping"
- Tags Applied:
  - `authorize.net`
  - `sold bookkeeping project`
  - `tax-return-s-corp`
  - `catch-up-bookkeeping`

---

## Product Tag Format

### How Product Tags Are Created

Product tags are created by slugifying the product name:

1. **Convert to lowercase**: "Tax Return (S-Corp)" → "tax return (s-corp)"
2. **Replace special characters with hyphens**: "tax return (s-corp)" → "tax-return--s-corp"
3. **Remove multiple hyphens**: "tax-return--s-corp" → "tax-return-s-corp"
4. **Remove leading/trailing hyphens**: "tax-return-s-corp" → "tax-return-s-corp"

### Examples

- **"Tax Return (S-Corp)"** → `tax-return-s-corp`
- **"Tax Return (LLC)"** → `tax-return-llc`
- **"Catch-up Bookkeeping"** → `catch-up-bookkeeping`
- **"Monthly Bookkeeping Subscription"** → `monthly-bookkeeping-subscription`

### Product Tag Rules

- ✅ **No prefix** (removed `customer-product-` prefix)
- ✅ **Slugified** (lowercase, hyphens, alphanumeric only)
- ✅ **Multiple products** = Multiple tags (one per product)
- ✅ **Product tags are applied for payment transactions**

---

## Tag Summary

### Always Applied Tags

**For Payment Transactions:**
- ✅ `authorize.net` (always)
- ✅ `sold bookkeeping project` (always)

### Conditionally Applied Tags

**Product Tags:**
- ✅ Applied if line items are present
- ✅ One tag per product/service
- ✅ Based on product name (slugified)

---

## Complete Tag Examples

### Example 1: Single Product Payment

**Transaction:**
- Product: "Tax Return (S-Corp)"
- Amount: $2.01

**Tags Applied:**
```
authorize.net
sold bookkeeping project
tax-return-s-corp
```

---

### Example 2: Multiple Products Payment

**Transaction:**
- Products: "Tax Return (S-Corp)", "Catch-up Bookkeeping"
- Amount: $4.20

**Tags Applied:**
```
authorize.net
sold bookkeeping project
tax-return-s-corp
catch-up-bookkeeping
```

---

### Example 3: Subscription Payment

**Transaction:**
- Product: "Monthly Bookkeeping Subscription"
- Amount: $2.19

**Tags Applied:**
```
authorize.net
sold bookkeeping project
monthly-bookkeeping-subscription
```

---

## Tag Management

### Tag Naming Conventions

- **Static Tags**: Lowercase, hyphenated (e.g., `authorize.net`, `sold bookkeeping project`)
- **Product Tags**: Lowercase, hyphenated, slugified product names (e.g., `tax-return-s-corp`)

### Tag Limitations

- **GHL Tag Limits**: Check GHL documentation for tag limits per contact
- **Tag Length**: Tags should be reasonable length (GHL may have limits)
- **Tag Uniqueness**: Tags are applied to contacts, not replaced (additive)

### Tag Cleanup

- **Duplicate Tags**: GHL handles duplicate tags automatically
- **Tag Management**: Tags can be managed in GHL dashboard
- **Tag Removal**: Tags are not automatically removed (manual removal required)

---

## Notes

1. **Tag Application**: Tags are applied additively (not replaced)
2. **Tag Persistence**: Tags persist on contacts until manually removed
3. **Tag Format**: All tags are lowercase, hyphenated, alphanumeric
4. **Product Tags**: Product tags are based on product names (slugified)
5. **Payment Webhooks**: Tags are applied when payment webhook (`net.authorize.payment.authcapture.created`) is received

---

## Testing

To verify tags are being applied correctly:

1. **Check GHL Contact**: Search for contact by email
2. **View Tags**: Check contact tags in GHL dashboard
3. **Verify Tags**: Verify all expected tags are present
4. **Check Notes**: Verify note contains payment transaction details

---

## Troubleshooting

### Tags Not Appearing

1. **Check GHL API Credentials**: Verify `GHL_API_KEY` is set correctly
2. **Check GHL Location ID**: Verify `GHL_LOCATION_ID` is set correctly
3. **Check API Permissions**: Verify API key has tag permissions
4. **Check Vercel Logs**: Look for GHL API errors in logs

### Duplicate Tags

- **Expected Behavior**: Tags are applied additively (duplicates are OK)
- **GHL Behavior**: GHL handles duplicate tags automatically
- **Manual Cleanup**: Duplicate tags can be removed manually in GHL

### Missing Product Tags

1. **Check Line Items**: Verify line items are present in webhook payload
2. **Check Product Names**: Verify product names are present in line items
3. **Check Tag Format**: Verify product names are being slugified correctly
4. **Check GHL API Response**: Verify tags are being applied successfully

---

## Resources

- [GoHighLevel API Documentation](https://highlevel.stoplight.io/docs/integrations)
- [Authorize.net Webhooks Documentation](https://developer.authorize.net/api/reference/features/webhooks.html)
- [Tag Management in GHL](https://help.gohighlevel.com/support/solutions/articles/48001179628-tags)
