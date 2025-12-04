# Google Ads Conversion Tracking Setup

## Current Status

✅ **GA4 Purchase Tracking**: Implemented in `payment-success.html`
- Sends `purchase` event with transaction_id, value, currency, and items
- Uses gtag.js (Google Analytics 4)

❌ **Google Ads Conversion Tracking**: Not yet implemented
- No Google Ads conversion tracking code found in codebase
- No AW- conversion ID or conversion labels

## Two Approaches to Get Data into Google Ads

### Option A: Import GA4 Conversions (Recommended - Simpler)

**Pros:**
- ✅ No code changes needed
- ✅ Single source of truth (GA4)
- ✅ Automatic synchronization
- ✅ Less maintenance

**Cons:**
- ⚠️ Slight delay in data sync (usually within hours)
- ⚠️ Less granular control over attribution

**Steps:**
1. Link GA4 to Google Ads account
2. Mark `purchase` event as conversion in GA4
3. Import conversion from GA4 to Google Ads

### Option B: Direct Google Ads Conversion Tracking (More Accurate)

**Pros:**
- ✅ Real-time conversion tracking
- ✅ Enhanced conversions support (better attribution)
- ✅ More accurate attribution models
- ✅ Can track conversion value dynamically

**Cons:**
- ⚠️ Requires code changes
- ⚠️ Need to maintain two tracking systems (GA4 + Google Ads)
- ⚠️ More complex setup

**Steps:**
1. Create conversion action in Google Ads
2. Get conversion ID (AW-XXXXXXXXX) and conversion label
3. Add conversion tracking code to `payment-success.html`
4. Optionally implement enhanced conversions

## Recommended Approach

**Start with Option A (GA4 Import)** because:
- Your GA4 tracking is already working perfectly
- No code changes required
- Easier to maintain
- Google recommends this approach for most businesses

**Consider Option B (Direct Tracking)** if:
- You need real-time conversion data
- You want enhanced conversions (hashed customer data)
- You need more granular attribution control
- You're running high-value campaigns that need immediate optimization

## Implementation Tasks

### Phase 1: GA4 Import (Recommended First Step)

- [ ] **Task 1**: Link Google Analytics 4 to Google Ads
  - In GA4: Admin → Google Ads Links → Link your Google Ads account
  - In Google Ads: Tools & Settings → Linked accounts → Google Analytics (GA4)
  - Verify both accounts are linked

- [ ] **Task 2**: Mark Purchase Event as Conversion in GA4
  - In GA4: Admin → Events
  - Find the `purchase` event
  - Toggle "Mark as conversion"
  - Verify it appears in Conversions section

- [ ] **Task 3**: Import Conversion into Google Ads
  - In Google Ads: Tools & Settings → Conversions
  - Click "+" → Import → Google Analytics (GA4)
  - Select the `purchase` conversion
  - Configure attribution settings
  - Save

- [ ] **Task 4**: Verify Conversion Tracking
  - Make a test purchase
  - Wait 24-48 hours for data to sync
  - Check Google Ads → Conversions dashboard
  - Verify conversion appears with correct value

### Phase 2: Direct Google Ads Tracking (Optional - If Needed)

- [ ] **Task 5**: Create Conversion Action in Google Ads
  - In Google Ads: Tools & Settings → Conversions
  - Click "+ New conversion action"
  - Select "Website"
  - Category: Purchase/Sale
  - Conversion name: "Purchase - Quote Tool"
  - Value: Use different values for each conversion
  - Count: Every conversion
  - Click-through window: 30 days (or your preference)
  - Attribution model: Data-driven (recommended)
  - Click "Create and continue"

- [ ] **Task 6**: Get Conversion Tracking Code
  - Google Ads will provide:
    - Global site tag (gtag.js) - Already have this for GA4
    - Event snippet with conversion ID (AW-XXXXXXXXX) and label
  - Copy the conversion ID and label

- [ ] **Task 7**: Add Conversion Tracking to payment-success.html
  - Add conversion tracking code to `trackPurchaseEvent()` function
  - Include conversion ID and label
  - Pass transaction value dynamically
  - Test on payment success page

- [ ] **Task 8**: Implement Enhanced Conversions (Optional)
  - In Google Ads: Conversions → Enhanced conversions → Enable
  - Modify conversion code to hash and send customer email
  - Improves attribution accuracy, especially with iOS 14.5+ privacy changes

## Code Changes Needed (Only if doing Option B)

### File: `public/payment-success.html`

Add Google Ads conversion tracking to the `trackPurchaseEvent()` function:

```javascript
function trackPurchaseEvent(storedResult) {
    const transactionId = storedResult?.transactionId ?? getUrlParameter('transactionId');
    const amountValue = storedResult?.amount ?? getUrlParameter('amount');
    const amount = Number(amountValue);

    if (transactionId && Number.isFinite(amount) && amount > 0) {
        const items = getPurchaseItems(storedResult);
        
        // GA4 Purchase Event (Already implemented)
        gtag('event', 'purchase', {
            transaction_id: transactionId,
            value: amount,
            currency: 'USD',
            items
        });

        // Google Ads Conversion (NEW - if implementing Option B)
        gtag('event', 'conversion', {
            'send_to': 'AW-XXXXXXXXX/YYYYYYYYYYYY', // Replace with your conversion ID/label
            'value': amount,
            'currency': 'USD',
            'transaction_id': transactionId
        });

        console.log('GA4 Purchase event tracked:', {
            transaction_id: transactionId,
            value: amount,
            currency: 'USD'
        });
    }
}
```

**Note**: Replace `AW-XXXXXXXXX/YYYYYYYYYYYY` with your actual Google Ads conversion ID and label.

## Environment Variables (If Needed)

If you want to make the conversion ID configurable:

```bash
# .env.local (for local development)
GOOGLE_ADS_CONVERSION_ID=AW-XXXXXXXXX
GOOGLE_ADS_CONVERSION_LABEL=YYYYYYYYYYYY
```

Then in code:
```javascript
const conversionId = process.env.GOOGLE_ADS_CONVERSION_ID || 'AW-XXXXXXXXX';
const conversionLabel = process.env.GOOGLE_ADS_CONVERSION_LABEL || 'YYYYYYYYYYYY';
gtag('event', 'conversion', {
    'send_to': `${conversionId}/${conversionLabel}`,
    // ...
});
```

## Testing

1. **Test Purchase Flow**:
   - Complete a test purchase
   - Check browser console for tracking events
   - Verify both GA4 and Google Ads events fire

2. **Verify in Google Ads**:
   - Use Google Tag Assistant Chrome extension
   - Check Conversions dashboard in Google Ads
   - Wait 24-48 hours for data to appear

3. **Verify in GA4**:
   - Check Events → purchase
   - Verify transaction data is correct

## Monitoring

- **Google Ads**: Tools & Settings → Conversions → Check conversion count and value
- **GA4**: Reports → Monetization → Ecommerce purchases
- **Compare**: Both should show similar numbers (with slight timing differences)

## Next Steps

1. **Start with Phase 1** (GA4 Import) - No code changes needed
2. **Test and verify** conversion data is flowing
3. **Evaluate if Phase 2** (Direct Tracking) is needed based on:
   - Campaign performance requirements
   - Need for real-time data
   - Attribution accuracy needs

## Resources

- [Link Google Analytics to Google Ads](https://support.google.com/analytics/answer/1033981)
- [Import conversions from Google Analytics](https://support.google.com/google-ads/answer/7014069)
- [Set up Google Ads conversion tracking](https://support.google.com/google-ads/answer/1722054)
- [Enhanced conversions guide](https://support.google.com/google-ads/answer/9888156)

