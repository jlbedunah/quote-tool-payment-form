# Authorize.net Invoice Webhook Setup Guide

## Overview

This guide explains how to configure Authorize.net webhooks to send invoice events to your application, which will then sync to GoHighLevel (GHL).

## Supported Invoice Events

The following invoice events are now supported and will sync to GHL:

1. **Invoice Created** (`invoicing.customer.invoice.created`)
   - When an invoice is created in Authorize.net
   - Syncs: Contact created/updated, note added, tags applied

2. **Invoice Sent** (`invoicing.customer.invoice.send`)
   - When an invoice is sent to a customer
   - Syncs: Contact updated, note added, tags applied

3. **Invoice Paid** (`invoicing.customer.invoice.paid`)
   - When an invoice is paid
   - Syncs: Contact updated, note added, tags applied (including "sold bookkeeping project")

4. **Invoice Updated** (`invoicing.customer.invoice.updated`)
   - When an invoice is updated
   - Syncs: Contact updated, note added, tags applied

## Additional Events (Also Supported)

- **Partial Payment** (`invoicing.customer.invoice.partial-payment`)
- **Invoice Cancelled** (`invoicing.customer.invoice.cancel`)
- **Invoice Reminder** (`invoicing.customer.invoice.reminder`)
- **Overdue Reminder** (`invoicing.customer.invoice.overdue-reminder`)

## Setup Steps

### Step 1: Configure Webhook Endpoint in Authorize.net

1. Log in to your Authorize.net Merchant Interface
2. Navigate to **Account** → **Settings** → **Webhooks**
3. Click **Add Endpoint** or **Edit** existing endpoint
4. Configure webhook:
   - **Name**: "GHL Invoice Sync" (or your preferred name)
   - **Endpoint URL**: `https://your-domain.vercel.app/api/webhook-handler`
   - **Status**: **Active**
   - **Events**: Select the following invoice events:
     - ☑ `invoicing.customer.invoice.created`
     - ☑ `invoicing.customer.invoice.send`
     - ☑ `invoicing.customer.invoice.paid`
     - ☑ `invoicing.customer.invoice.updated`
     - ☑ `invoicing.customer.invoice.partial-payment` (optional)
     - ☑ `invoicing.customer.invoice.cancel` (optional)
     - ☑ `invoicing.customer.invoice.reminder` (optional)
     - ☑ `invoicing.customer.invoice.overdue-reminder` (optional)
5. Click **Save**

### Step 2: Verify Webhook Endpoint

1. Test the webhook endpoint by creating an invoice in Authorize.net
2. Check Vercel logs to verify webhook is received:
   ```bash
   vercel logs
   ```
3. Verify GHL contact is created/updated
4. Check GHL contact notes and tags

### Step 3: Test Each Event Type

1. **Test Invoice Created**:
   - Create an invoice in Authorize.net
   - Verify webhook is received
   - Verify GHL contact is created/updated
   - Verify note is added with "Invoice Created" message
   - Verify tags are applied (`invoice-created`, product tags)

2. **Test Invoice Sent**:
   - Send an invoice in Authorize.net
   - Verify webhook is received
   - Verify GHL contact is updated
   - Verify note is added with "Invoice Sent" message
   - Verify tags are applied (`invoice-sent`)

3. **Test Invoice Paid**:
   - Pay an invoice in Authorize.net
   - Verify webhook is received
   - Verify GHL contact is updated
   - Verify note is added with "Invoice Paid" message
   - Verify tags are applied (`invoice-paid`, `sold bookkeeping project`, product tags)

4. **Test Invoice Updated**:
   - Update an invoice in Authorize.net
   - Verify webhook is received
   - Verify GHL contact is updated
   - Verify note is added with "Invoice Updated" message
   - Verify tags are applied (`invoice-updated`)

## Webhook Payload Structure

Authorize.net invoice webhooks typically include:

```json
{
  "eventType": "invoicing.customer.invoice.created",
  "eventDate": "2025-01-15T10:30:00Z",
  "payload": {
    "id": "invoice-id",
    "invoiceId": "invoice-id",
    "invoiceNumber": "INV-001",
    "amount": 100.00,
    "status": "sent",
    "customer": {
      "email": "customer@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "company": "Acme Corp",
      "phoneNumber": "555-1234"
    },
    "billTo": {
      "firstName": "John",
      "lastName": "Doe",
      "address": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zip": "10001",
      "country": "US"
    },
    "lineItems": [
      {
        "itemId": "1",
        "name": "Tax Return (S-Corp)",
        "description": "Complete tax return preparation",
        "quantity": 1,
        "unitPrice": 100.00
      }
    ],
    "invoiceDate": "2025-01-15",
    "dueDate": "2025-02-15"
  }
}
```

## GHL Sync Behavior

### Invoice Created
- **Contact**: Created/updated in GHL
- **Note**: "Invoice Created (Authorize.net)" with invoice details
- **Tags**: `invoice-created`, `authorize.net`, product tags

### Invoice Sent
- **Contact**: Updated in GHL
- **Note**: "Invoice Sent (Authorize.net)" with invoice details
- **Tags**: `invoice-sent`, `authorize.net`, product tags

### Invoice Paid
- **Contact**: Updated in GHL
- **Note**: "Invoice Paid (Authorize.net)" with invoice details
- **Tags**: `invoice-paid`, `sold bookkeeping project`, `authorize.net`, product tags

### Invoice Updated
- **Contact**: Updated in GHL
- **Note**: "Invoice Updated (Authorize.net)" with invoice details
- **Tags**: `invoice-updated`, `authorize.net`, product tags

## Troubleshooting

### Webhook Not Received

1. **Check Webhook Configuration**:
   - Verify webhook endpoint URL is correct
   - Verify webhook is active
   - Verify events are selected

2. **Check Vercel Logs**:
   ```bash
   vercel logs
   ```
   - Look for webhook requests
   - Check for errors

3. **Check Authorize.net Webhook Logs**:
   - Go to **Account** → **Settings** → **Webhooks**
   - Check webhook delivery status
   - Review failed deliveries

### Email Missing in Webhook

If customer email is missing from webhook payload:
- The system will attempt to fetch invoice details from Authorize.net API
- If API is not available, webhook will be skipped (logged as warning)
- **Solution**: Ensure invoices are created with customer email in Authorize.net

### GHL Sync Failing

1. **Check GHL Credentials**:
   - Verify `GHL_API_KEY` is set correctly
   - Verify `GHL_LOCATION_ID` is set correctly
   - Verify API key has necessary permissions

2. **Check GHL API Logs**:
   - Review Vercel logs for GHL API errors
   - Check GHL API response codes
   - Verify contact creation/update is working

3. **Check Contact Email**:
   - Verify customer email is present in webhook payload
   - Verify email format is valid
   - Check if contact already exists in GHL

## Testing

### Manual Testing

1. **Create Test Invoice**:
   - Create an invoice in Authorize.net
   - Use a test email address
   - Verify webhook is received

2. **Check GHL Contact**:
   - Search for contact by email in GHL
   - Verify contact is created/updated
   - Verify note is added
   - Verify tags are applied

3. **Test Each Event**:
   - Test invoice created
   - Test invoice sent
   - Test invoice paid
   - Test invoice updated

### Automated Testing

You can test webhooks locally using:

```bash
# Start local dev server
vercel dev

# Send test webhook
curl -X POST http://localhost:3000/api/webhook-handler \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "invoicing.customer.invoice.created",
    "eventDate": "2025-01-15T10:30:00Z",
    "payload": {
      "id": "test-invoice-123",
      "invoiceNumber": "TEST-001",
      "amount": 100.00,
      "customer": {
        "email": "test@example.com",
        "firstName": "Test",
        "lastName": "User"
      },
      "lineItems": [
        {
          "name": "Test Product",
          "quantity": 1,
          "unitPrice": 100.00
        }
      ]
    }
  }'
```

## Next Steps

1. ✅ Configure webhook endpoint in Authorize.net
2. ✅ Test invoice creation webhook
3. ✅ Test invoice sent webhook
4. ✅ Test invoice paid webhook
5. ✅ Test invoice updated webhook
6. ✅ Verify GHL sync for all events
7. ✅ Monitor webhook delivery in Authorize.net
8. ✅ Monitor GHL sync in Vercel logs

## Notes

- **Webhook Payload**: Authorize.net invoice webhook payload structure may vary
- **Invoice API**: Authorize.net Invoice API may not be available or may use a different format
- **Fallback**: System uses webhook payload data primarily, only fetches details if email is missing
- **Error Handling**: GHL sync errors are logged but don't fail the webhook (returns 200)
- **Rate Limiting**: GHL API has rate limits - be mindful of high-volume invoice creation

## Resources

- [Authorize.net Webhooks Documentation](https://developer.authorize.net/api/reference/features/webhooks.html)
- [Authorize.net Invoice API](https://developer.authorize.net/api/reference/index.html#invoice-transactions)
- [GoHighLevel API Documentation](https://highlevel.stoplight.io/docs/integrations)

