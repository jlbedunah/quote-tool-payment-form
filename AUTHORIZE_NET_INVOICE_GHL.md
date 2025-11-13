# Authorize.net Invoice Events and GHL Integration

## Current State

**Invoice creation events do NOT notify GHL** - Only payment transaction events trigger GHL updates.

## Currently Handled Events

Looking at `api/webhook-handler.js`, the following Authorize.net events are handled:

1. ✅ **`net.authorize.payment.authcapture.created`** - Triggers GHL sync
   - This is when a payment is successfully processed
   - Creates/updates GHL contact
   - Adds note with transaction details
   - Adds tags (product tags, "sold bookkeeping project", "authorize.net")

2. ❌ **`net.authorize.payment.authcapture.failed`** - Logged but no GHL sync
   - Payment failed
   - No CRM action taken

3. ❌ **`net.authorize.payment.refund.created`** - Logged but no GHL sync
   - Refund created
   - No CRM action taken

4. ❌ **Invoice creation events** - NOT handled
   - Invoice created events are not currently processed
   - No GHL sync for invoice creation

## Authorize.net Invoice Events

Authorize.net supports webhook events for invoices, but they may have different event types. Common invoice-related events include:

- `net.authorize.invoice.created` (if available)
- `net.authorize.invoice.sent` (if available)
- `net.authorize.invoice.paid` (if available)
- `net.authorize.invoice.updated` (if available)

**Note**: The exact event types depend on Authorize.net's API version and webhook configuration. You'll need to check Authorize.net's webhook documentation for the exact event types available.

## How Authorize.net Invoices Work

In Authorize.net, invoices are typically:
1. **Created** when you generate an invoice for a customer
2. **Sent** to the customer (via email)
3. **Paid** when the customer makes a payment
4. **Updated** when invoice details change

## Current Payment Flow

Your current system processes payments directly (not through invoices):
1. Customer fills out payment form
2. Payment is processed via `api/process-payment-server.js`
3. Authorize.net processes payment
4. Authorize.net sends webhook: `net.authorize.payment.authcapture.created`
5. Webhook handler processes event
6. GHL sync is triggered

## Invoice vs Payment Transaction

**Payment Transaction** (currently handled):
- Direct payment processing
- Transaction is created and paid immediately
- Webhook: `net.authorize.payment.authcapture.created`
- ✅ Triggers GHL sync

**Invoice** (not currently handled):
- Invoice is created first
- Invoice is sent to customer
- Customer pays invoice later
- Separate webhook events for invoice creation and payment
- ❌ Does NOT trigger GHL sync (if invoice creation events exist)

## Questions to Answer

1. **Do you use Authorize.net invoices?**
   - Are you creating invoices in Authorize.net?
   - Or are you processing payments directly (current flow)?

2. **What invoice events do you want to track?**
   - Invoice created?
   - Invoice sent?
   - Invoice paid?
   - Invoice updated?

3. **Should invoice creation trigger GHL sync?**
   - Create/update GHL contact?
   - Add note about invoice?
   - Add tags?
   - Create opportunity?

4. **Should invoice payment trigger GHL sync?**
   - Similar to payment transaction sync?
   - Different handling than direct payments?

## Implementation Status

✅ **Invoice event handling has been implemented!**

### 1. Invoice Sync Function Created

✅ Created `lib/authorize-net-invoice-sync.js`:
- Handles invoice created, sent, paid, updated events
- Creates/updates GHL contact
- Adds note about invoice event
- Adds tags (invoice-created, invoice-sent, invoice-paid, invoice-updated, product tags)
- Fetches invoice details if email is missing (fallback)

### 2. Webhook Handler Updated

✅ Updated `api/webhook-handler.js`:
- Handles invoice events: `invoicing.customer.invoice.*`
- Calls `syncAuthorizeNetInvoice` for invoice events
- Handles errors gracefully (doesn't fail webhook)

### 3. Supported Invoice Events

✅ The following invoice events are now supported:
- `invoicing.customer.invoice.created` - Invoice created
- `invoicing.customer.invoice.send` - Invoice sent
- `invoicing.customer.invoice.paid` - Invoice paid
- `invoicing.customer.invoice.updated` - Invoice updated
- `invoicing.customer.invoice.partial-payment` - Partial payment
- `invoicing.customer.invoice.cancel` - Invoice cancelled
- `invoicing.customer.invoice.reminder` - Invoice reminder
- `invoicing.customer.invoice.overdue-reminder` - Overdue reminder

### 4. Configure Authorize.net Webhooks

⏳ **You need to configure Authorize.net webhooks**:
1. Go to **Account** → **Settings** → **Webhooks**
2. Add webhook endpoint: `https://your-domain.vercel.app/api/webhook-handler`
3. Select invoice events to subscribe to:
   - ☑ Invoice created
   - ☑ Invoice sent
   - ☑ Invoice paid
   - ☑ Invoice updated
   - ☑ (Optional) Partial payment, cancelled, reminders

## Current Behavior

**Invoice Events**:
- ✅ Invoice created → GHL sync (create contact, add note, add tags)
- ✅ Invoice sent → GHL sync (update contact, add note, add tags)
- ✅ Invoice paid → GHL sync (update contact, add note, add tags including "sold bookkeeping project")
- ✅ Invoice updated → GHL sync (update contact, add note, add tags)

**Payment Transactions** (still working):
- ✅ Payment successful → GHL sync (via `net.authorize.payment.authcapture.created`)
- ✅ Payment failed → Logged but no GHL sync
- ✅ Refund created → Logged but no GHL sync

## Next Steps

1. **Determine if you use Authorize.net invoices**
   - Check your Authorize.net dashboard
   - Review your payment flow
   - Determine if invoices are created separately from payments

2. **Check Authorize.net webhook events**
   - Review Authorize.net webhook documentation
   - Check your webhook configuration
   - Log incoming webhook events to see what's being sent

3. **Implement invoice event handling (if needed)**
   - Add invoice event handlers to webhook handler
   - Create invoice sync function
   - Test invoice event processing
   - Configure GHL sync for invoices

## Resources

- [Authorize.net Webhooks Documentation](https://developer.authorize.net/api/reference/features/webhooks.html)
- [Authorize.net Webhook Event Types](https://developer.authorize.net/api/reference/index.html#webhooks)
- [Authorize.net Invoice API](https://developer.authorize.net/api/reference/index.html#invoice-transactions)

