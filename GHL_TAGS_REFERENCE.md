# GoHighLevel Tags Reference

This document lists all tags that are automatically added to GoHighLevel contacts and when/why they are added.

## Tag Categories

### 1. Quote Creation Tags

#### `quote-created` (Generic)
- **When**: Added whenever a quote is created, regardless of delivery method
- **Where**: 
  - `api/quotes.js` (Build Link path)
  - `api/send-quote-email.js` (Email path)
- **Why**: Universal tag to identify all contacts who have received quotes
- **Always paired with**: Either `link-quote-created` or `email-quote-sent`

#### `link-quote-created`
- **When**: When a quote is created via "Build Link" button in the quote tool
- **Where**: `api/quotes.js` → `syncLinkQuoteToGHL()`
- **Why**: Identifies quotes created via payment link (not emailed)
- **Paired with**: `quote-created`

#### `email-quote-sent`
- **When**: When a quote is sent via email
- **Where**: `api/send-quote-email.js` → `syncQuoteToGHL()`
- **Why**: Identifies quotes that were emailed to customers
- **Paired with**: `quote-created`

---

### 2. Payment Tags

#### `quote-paid`
- **When**: When a quote payment status is successfully updated to "paid" in the database
- **Where**: `lib/authorize-net-sync.js` → `syncAuthorizeNetTransaction()`
- **Why**: Marks contacts whose quotes have been paid
- **Trigger**: Authorize.net webhook `net.authorize.payment.authcapture.created` that matches a pending quote
- **Note**: Only added if quote update is successful

#### `authorize.net`
- **When**: When any payment is successfully processed via Authorize.net
- **Where**: `lib/authorize-net-sync.js` → `buildProductTags()`
- **Why**: Identifies all contacts who have made payments through Authorize.net
- **Always included**: Yes, for all payment webhooks

#### `sold bookkeeping project`
- **When**: When any payment is successfully processed via Authorize.net
- **Where**: `lib/authorize-net-sync.js` → `buildProductTags()`
- **Why**: Business-specific tag indicating a sale was made
- **Always included**: Yes, for all payment webhooks

---

### 3. Product-Specific Tags (Dynamic)

#### Product Name Tags (Slugified)
- **Format**: Product names converted to lowercase, hyphenated tags
- **Examples**: 
  - `catch-up-bookkeeping`
  - `tax-return-llc`
  - `tax-return-s-corp`
  - `monthly-bookkeeping-subscription`
- **When**: When a payment includes line items with product names
- **Where**: `lib/authorize-net-sync.js` → `buildProductTags()` → `slugifyProductTag()`
- **Why**: Tags contacts with the specific products/services they purchased
- **How it works**:
  1. Extracts product names from payment line items
  2. Converts to lowercase
  3. Replaces non-alphanumeric characters with hyphens
  4. Removes leading/trailing hyphens
- **Multiple tags**: One tag per product/service in the payment

---

### 4. Subscription Tags

#### `subscription-created`
- **When**: When a subscription is created in Authorize.net
- **Where**: `lib/authorize-net-sync.js` → `syncAuthorizeNetSubscription()`
- **Why**: Identifies contacts who have active subscriptions
- **Trigger**: Authorize.net webhook `net.authorize.customer.subscription.created`
- **Note**: Requires subscription webhook events to be enabled in Authorize.net

---

## Tag Flow Summary

### Quote Creation Flow

**Build Link Path:**
1. User clicks "Build Link" → Quote saved to database
2. `api/quotes.js` → `syncLinkQuoteToGHL()`
3. Tags added: `link-quote-created`, `quote-created`

**Email Path:**
1. User sends quote via email → Quote saved to database
2. `api/send-quote-email.js` → `syncQuoteToGHL()`
3. Tags added: `email-quote-sent`, `quote-created`

### Payment Flow

1. Customer pays via Authorize.net
2. Webhook received: `net.authorize.payment.authcapture.created`
3. `lib/authorize-net-sync.js` → `syncAuthorizeNetTransaction()`
4. Tags added:
   - `authorize.net` (always)
   - `sold bookkeeping project` (always)
   - Product name tags (one per product/service)
   - `quote-paid` (if quote is found and updated to paid)

### Subscription Flow

1. Subscription created in Authorize.net
2. Webhook received: `net.authorize.customer.subscription.created`
3. `lib/authorize-net-sync.js` → `syncAuthorizeNetSubscription()`
4. Tag added: `subscription-created`

---

## Tag Examples

### Example 1: Quote Created via Email
- Tags: `email-quote-sent`, `quote-created`

### Example 2: Quote Created via Build Link
- Tags: `link-quote-created`, `quote-created`

### Example 3: Payment for "Catch-up Bookkeeping" ($2.19)
- Tags: `authorize.net`, `sold bookkeeping project`, `catch-up-bookkeeping`, `quote-paid`

### Example 4: Payment for Multiple Products
- Tags: `authorize.net`, `sold bookkeeping project`, `catch-up-bookkeeping`, `tax-return-llc`, `quote-paid`

### Example 5: Subscription Created
- Tags: `subscription-created`

---

## Code Locations

| Tag | File | Function |
|-----|------|----------|
| `quote-created` | `api/quotes.js`, `api/send-quote-email.js` | `syncLinkQuoteToGHL()`, `syncQuoteToGHL()` |
| `link-quote-created` | `api/quotes.js` | `syncLinkQuoteToGHL()` |
| `email-quote-sent` | `api/send-quote-email.js` | `syncQuoteToGHL()` |
| `quote-paid` | `lib/authorize-net-sync.js` | `syncAuthorizeNetTransaction()` |
| `authorize.net` | `lib/authorize-net-sync.js` | `buildProductTags()` |
| `sold bookkeeping project` | `lib/authorize-net-sync.js` | `buildProductTags()` |
| Product name tags | `lib/authorize-net-sync.js` | `buildProductTags()` → `slugifyProductTag()` |
| `subscription-created` | `lib/authorize-net-sync.js` | `syncAuthorizeNetSubscription()` |

---

## Notes

1. **Tag Formatting**: Product name tags are automatically slugified (lowercase, hyphenated, special characters removed)
2. **Multiple Tags**: Contacts can have multiple tags simultaneously
3. **Error Handling**: Tag addition failures are logged but don't fail the main operation
4. **Webhook Requirements**: Subscription tags require subscription webhook events to be enabled in Authorize.net
5. **Quote Matching**: `quote-paid` tag is only added if a matching pending quote is found by email address
6. **Tag Duplication**: Adding tags that already exist on a contact will not trigger "Tag Added" automations in GHL. Use "Contact Updated" trigger instead if you need automations to run every time.
