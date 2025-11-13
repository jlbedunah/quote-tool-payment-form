# Quote Email GHL Integration Plan

## Current State

**Quote emails do NOT notify GHL** - Only successful payments trigger GHL updates.

## Proposed Integration

Add GHL integration to quote email flow to:
1. Create/update GHL contact when quote is emailed
2. Add note about the quote
3. Tag contact with quote-related tags
4. Track quote activity in GHL

## Implementation Plan

### Option 1: Simple Integration (Recommended)

When a quote is emailed, sync to GHL:
- **Create/update contact** using customer email
- **Add note** with quote details (services, totals, quote number)
- **Add tags**: 
  - `quote-sent`
  - Product tags (from services)
  - Optional: `quote-pending` or `quote-emailed`

### Option 2: Full Integration

When a quote is emailed, sync to GHL:
- **Create/update contact** with full customer information
- **Add note** with detailed quote information
- **Add tags**: Quote-related tags + product tags
- **Update custom fields** (if configured):
  - Last Quote Date
  - Last Quote Amount
  - Quote Status
- **Create opportunity** (optional):
  - Link quote to opportunity
  - Set opportunity value to quote total
  - Set opportunity stage to "Quote Sent"

## Code Changes Required

### 1. Update `api/send-quote-email.js`

After successful email send, add GHL sync:

```javascript
// After email is sent successfully
if (resend && data.id) {
  // Sync to GHL
  try {
    await syncQuoteToGHL(quoteData, recipientEmail, data.id);
  } catch (error) {
    console.error('Failed to sync quote to GHL:', error);
    // Don't fail the email send if GHL sync fails
  }
}
```

### 2. Create `lib/quote-ghl-sync.js`

New utility function to sync quotes to GHL:

```javascript
export async function syncQuoteToGHL(quoteData, recipientEmail, emailMessageId) {
  // Create/update contact
  // Add note with quote details
  // Add tags
  // Update custom fields (optional)
  // Create opportunity (optional)
}
```

### 3. Update Quote Tracking

If quote tracking is implemented:
- Store GHL sync status in quote record
- Track when quote was synced to GHL
- Handle GHL sync errors gracefully

## Benefits

1. **Better CRM visibility**: All quote activity in GHL
2. **Contact tracking**: Know who received quotes
3. **Sales pipeline**: Track quotes through sales process
4. **Follow-up**: Easier to follow up on pending quotes
5. **Analytics**: Track quote-to-sale conversion

## Considerations

1. **Error handling**: GHL sync should not block email send
2. **Rate limiting**: GHL API has rate limits
3. **Duplicate contacts**: Use email to find/create contacts
4. **Tag management**: Avoid tag spam
5. **Custom fields**: May need to configure in GHL first

## Next Steps

1. ✅ Decide on integration approach (Simple vs Full)
2. ⏳ Create `lib/quote-ghl-sync.js` utility
3. ⏳ Update `api/send-quote-email.js` to call GHL sync
4. ⏳ Test GHL sync with quote emails
5. ⏳ Add error handling and logging
6. ⏳ Update quote tracking (if implemented) to store GHL sync status

## Questions to Answer

1. **What tags should be added?**
   - `quote-sent`
   - `quote-pending`
   - Product tags (from services)
   - Custom tags?

2. **Should we update custom fields?**
   - Last Quote Date
   - Last Quote Amount
   - Quote Status
   - Other fields?

3. **Should we create opportunities?**
   - Link quotes to opportunities?
   - Set opportunity value?
   - Set opportunity stage?

4. **Should we track quote views?**
   - When customer clicks payment link?
   - When customer views quote email?

5. **Should we add workflow triggers?**
   - GHL workflows triggered by tags?
   - Automated follow-up sequences?

