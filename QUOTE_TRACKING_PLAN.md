# Quote Tracking System - Implementation Plan

## Overview

Track all quotes generated through the system, including:
- Quote generation (when "Pay Now" or "Send Quote via Email" is clicked)
- Email delivery status (if sent via email)
- Payment status (pending, paid, failed)
- Payment transaction details

## Data Structure

### Quote Record Schema

```json
{
  "id": "quote-20250115-abc123",  // Unique quote ID
  "quoteNumber": "Q-2025-001",     // Human-readable quote number
  "status": "pending",              // pending | emailed | paid | failed | expired
  "createdAt": "2025-01-15T10:30:00.000Z",
  "updatedAt": "2025-01-15T10:30:00.000Z",
  
  // Customer Information
  "customer": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "555-1234",
    "companyName": "Acme Corp",
    "address1": "123 Main St",
    "address2": "",
    "city": "New York",
    "state": "NY",
    "zip": "10001"
  },
  
  // Quote Details
  "services": [
    {
      "productName": "Tax Return (S-Corp)",
      "quantity": 1,
      "description": "Complete tax return preparation",
      "unitPrice": 2.01,
      "subtotal": 2.01,
      "isSubscription": false,
      "subscriptionInterval": null
    }
  ],
  "totals": {
    "oneTimeTotal": 2.01,
    "subscriptionMonthlyTotal": 0.00,
    "grandTotal": 2.01
  },
  
  // Delivery Method
  "deliveryMethod": "payment_link",  // payment_link | email
  "paymentLink": "https://...",      // If deliveryMethod is payment_link
  "emailSentAt": null,               // Timestamp if emailed
  "emailRecipient": null,            // Email address if emailed
  "emailMessageId": null,            // Resend message ID if emailed
  
  // Payment Information
  "payment": {
    "status": "pending",             // pending | paid | failed | refunded
    "transactionId": null,           // Authorize.net transaction ID
    "paidAt": null,                  // Payment timestamp
    "amount": 2.01,                  // Amount paid
    "paymentMethod": null,           // credit_card | etc.
    "last4": null,                   // Last 4 digits of card
    "authorizeNetResponse": null     // Full response for debugging
  },
  
  // Metadata
  "metadata": {
    "userAgent": "...",
    "ipAddress": "...",
    "referrer": "..."
  }
}
```

## Tracking Points

### 1. Quote Generation (quote-tool.html)

**When**: User clicks "Pay Now" or "Send Quote via Email"

**Action**: 
- Generate unique quote ID
- Create quote record with status "pending"
- Store in `data/quotes.json`
- If "Pay Now": Set `deliveryMethod: "payment_link"` and store payment link
- If "Send Quote via Email": Set `deliveryMethod: "email"` and status "emailed" (after email sent)

**Code Changes**:
- `quote-tool.html`: Add tracking call to `/api/quotes` when quote is generated
- Generate quote ID before redirecting or sending email

### 2. Email Sent (api/send-quote-email.js)

**When**: Email is successfully sent via Resend

**Action**:
- Update quote record:
  - Set `status: "emailed"`
  - Set `emailSentAt: <timestamp>`
  - Set `emailRecipient: <recipient email>`
  - Set `emailMessageId: <resend message ID>`

**Code Changes**:
- `api/send-quote-email.js`: After successful email send, update quote record
- Accept `quoteId` in request body
- Call `/api/quotes/:id` PUT endpoint to update

### 3. Payment Completed (api/process-payment-server.js)

**When**: Payment is successfully processed

**Action**:
- Find quote by customer email or transaction reference
- Update quote record:
  - Set `status: "paid"`
  - Set `payment.status: "paid"`
  - Set `payment.transactionId: <authnet transaction ID>`
  - Set `payment.paidAt: <timestamp>`
  - Set `payment.amount: <amount>`
  - Store payment details

**Code Changes**:
- `api/process-payment-server.js`: After successful payment, update quote record
- Match quote by email address (or include quoteId in payment request)
- Call `/api/quotes/:id` PUT endpoint to update

## Storage

### File-Based (Development)

- **File**: `data/quotes.json`
- **Structure**: 
  ```json
  {
    "quotes": [...],
    "lastQuoteNumber": 1
  }
  ```

### Database (Production)

Same limitation as products - file writes don't persist on Vercel. Need database for production:
- Vercel KV (Redis)
- Supabase (PostgreSQL)
- MongoDB Atlas
- Or another database service

## API Endpoints

### POST /api/quotes
**Purpose**: Create a new quote record

**Request Body**:
```json
{
  "customer": {...},
  "services": [...],
  "totals": {...},
  "deliveryMethod": "payment_link" | "email",
  "paymentLink": "...",  // Optional, if payment_link
  "metadata": {...}      // Optional
}
```

**Response**:
```json
{
  "success": true,
  "quote": {...},
  "quoteId": "quote-20250115-abc123"
}
```

### GET /api/quotes
**Purpose**: List all quotes with filters

**Query Parameters**:
- `status`: Filter by status (pending, emailed, paid, failed)
- `email`: Filter by customer email
- `dateFrom`: Filter by date (ISO format)
- `dateTo`: Filter by date (ISO format)
- `limit`: Number of results (default: 50)
- `offset`: Pagination offset

**Response**:
```json
{
  "success": true,
  "quotes": [...],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

### GET /api/quotes/:id
**Purpose**: Get a specific quote by ID

**Response**:
```json
{
  "success": true,
  "quote": {...}
}
```

### PUT /api/quotes/:id
**Purpose**: Update a quote record

**Request Body**: Partial quote object with fields to update

**Response**:
```json
{
  "success": true,
  "quote": {...}
}
```

### GET /api/quotes/stats
**Purpose**: Get quote statistics

**Response**:
```json
{
  "success": true,
  "stats": {
    "total": 100,
    "pending": 25,
    "emailed": 30,
    "paid": 40,
    "failed": 5,
    "totalRevenue": 5000.00,
    "averageQuoteValue": 125.00,
    "conversionRate": 0.40  // paid / (pending + emailed)
  }
}
```

## Admin Dashboard Page

### Page: `admin-quotes.html`

**Features**:
1. **Quote List Table**
   - Quote number
   - Customer name & email
   - Quote total
   - Status badge (color-coded)
   - Delivery method
   - Created date
   - Payment status
   - Actions (view details, resend email, etc.)

2. **Filters**
   - Status filter (All, Pending, Emailed, Paid, Failed)
   - Date range picker
   - Customer email search
   - Quote number search

3. **Statistics Dashboard**
   - Total quotes
   - Pending quotes
   - Emailed quotes
   - Paid quotes
   - Total revenue
   - Conversion rate
   - Average quote value

4. **Quote Detail Modal**
   - Full customer information
   - All services/line items
   - Totals breakdown
   - Delivery method details
   - Payment information (if paid)
   - Timeline of events (created, emailed, paid)

5. **Export Functionality** (Optional)
   - Export to CSV
   - Export filtered results

## Implementation Steps

### Phase 1: Data Structure & Storage
1. ✅ Create `data/quotes.json` file structure
2. ✅ Create quote ID generation utility
3. ✅ Create quote number generation (sequential)

### Phase 2: API Endpoints
1. ✅ Create `api/quotes.js` with CRUD operations
2. ✅ Implement quote creation (POST)
3. ✅ Implement quote listing (GET with filters)
4. ✅ Implement quote retrieval (GET by ID)
5. ✅ Implement quote updates (PUT)
6. ✅ Implement statistics endpoint (GET /stats)

### Phase 3: Tracking Integration
1. ✅ Update `quote-tool.html` to track quote generation
2. ✅ Update `api/send-quote-email.js` to track email sends
3. ✅ Update `api/process-payment-server.js` to track payments

### Phase 4: Admin Dashboard
1. ✅ Create `admin-quotes.html` page
2. ✅ Implement quote list table
3. ✅ Implement filters and search
4. ✅ Implement statistics dashboard
5. ✅ Implement quote detail modal

### Phase 5: Testing & Refinement
1. ✅ Test quote creation flow
2. ✅ Test email tracking
3. ✅ Test payment tracking
4. ✅ Test admin dashboard
5. ✅ Add error handling and edge cases

## Code Changes Required

### 1. quote-tool.html
- Add quote tracking when "Pay Now" is clicked
- Add quote tracking when "Send Quote via Email" is clicked
- Generate quote ID before redirect/email

### 2. api/send-quote-email.js
- Accept `quoteId` in request
- Update quote record after successful email send
- Store email message ID and recipient

### 3. api/process-payment-server.js
- Accept `quoteId` in request (or match by email)
- Update quote record after successful payment
- Store transaction ID and payment details

### 4. New Files
- `api/quotes.js` - Quote management API
- `admin-quotes.html` - Admin dashboard
- `data/quotes.json` - Quote storage (initial empty structure)
- `lib/quote-utils.js` - Quote ID/number generation utilities

## Database Migration (Future)

When moving to database:
1. Create quotes table/collection
2. Migrate existing quotes from JSON file
3. Update `api/quotes.js` to use database instead of file
4. Keep same API interface (no frontend changes needed)

## Security Considerations

1. **Admin Access**: Protect admin dashboard with authentication
2. **Quote IDs**: Use UUIDs or cryptographically secure IDs
3. **Data Privacy**: Don't expose full payment details in list view
4. **Rate Limiting**: Prevent quote spam
5. **Input Validation**: Validate all quote data

## Future Enhancements

1. **Quote Expiration**: Auto-expire quotes after X days
2. **Email Reminders**: Send follow-up emails for pending quotes
3. **Quote PDF Generation**: Generate downloadable PDF quotes
4. **Customer Portal**: Let customers view their quotes
5. **Analytics**: Conversion funnel analysis
6. **Notifications**: Real-time notifications for new quotes/payments

