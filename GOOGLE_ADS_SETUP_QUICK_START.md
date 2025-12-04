# Google Ads Conversion Setup - Quick Start Guide

## Option A: Import GA4 Conversions (No Code Changes Required)

Follow these steps to get your eCommerce data from GA4 into Google Ads.

---

## Step 1: Link Google Analytics 4 to Google Ads

### In Google Analytics 4:

1. Go to [Google Analytics](https://analytics.google.com)
2. Click **Admin** (gear icon) in the bottom left
3. Under **Property** column, click **Google Ads Links**
4. Click **Link** button (or **+ New Link** if you see existing links)
5. Select your Google Ads account(s) from the list
6. Give it a name (e.g., "Main Google Ads Account")
7. Click **Next**
8. Configure:
   - **Enable Personalized Advertising**: ✅ Checked (recommended)
   - **Enable Google Signals data**: ✅ Checked (recommended)
9. Click **Next** → **Submit**

### In Google Ads (Alternative Method):

1. Go to [Google Ads](https://ads.google.com)
2. Click **Tools & Settings** (wrench icon) → **Linked accounts**
3. Under **Google Analytics (GA4)**, click **Details**
4. Find your GA4 property and click **Link**
5. Review settings and confirm

**✅ Verification**: You should see "Linked" status in both dashboards

---

## Step 2: Mark Purchase Event as Conversion in GA4

### Method 1: Direct Conversion Event Creation (Easiest)

1. In Google Analytics 4, click **Admin** (gear icon) in the bottom left
2. Under **Property** column, look for **Conversions** or **Data collection**
3. Click **Conversions** (or **Data collection** → **Events** → scroll to Conversions)
4. Click **New conversion event** (or the **+** button)
5. Type: **`purchase`** (exactly as shown, lowercase)
6. Click **Save**
7. Verify it appears in the Conversions list

**✅ Verification**: You should see `purchase` in the Conversions list

### Method 2: Via Events Report (Alternative)

1. In Google Analytics 4, go to **Reports** → **Engagement** → **Events**
2. Find the **`purchase`** event in the list
3. Click on the **`purchase`** event name
4. Toggle the **"Mark as conversion"** switch to ON
5. Or click the three dots menu (⋮) next to the event and select "Mark as conversion"

### Method 3: Via Events Settings (If Available)

1. In Google Analytics 4, click **Admin** (gear icon)
2. Under **Property** column, click **Data collection** → **Events** (if available)
3. Find the **`purchase`** event in the list
4. Toggle the **"Mark as conversion"** switch to ON

### Method 4: Via Data Display (If Events is Hidden)

1. In Google Analytics 4, click **Admin** (gear icon)
2. Under **Property** column, click **Data Display** (if you see it)
3. Click **Events** from the expanded list
4. Find the **`purchase`** event
5. Toggle the **"Mark as conversion"** switch to ON

**✅ Verification**: You should see `purchase` with a conversion icon (checkmark) in the Events list or in Admin → Conversions

**💡 Recommended**: If you can't find Events anywhere, use **Method 1** (Direct Conversion Event Creation) - it's the most reliable way and works in all GA4 interfaces!

---

## Step 3: Import Conversion into Google Ads

1. Go to [Google Ads](https://ads.google.com)
2. Click **Tools & Settings** (wrench icon) → **Conversions**
3. Click the **+** button (or **+ New conversion action**)
4. Select **Import**
5. Select **Google Analytics (GA4)**
6. Find and select **Purchase** (or the name of your purchase conversion)
7. Click **Continue**
8. Review the conversion settings:
   - **Conversion name**: "Purchase - Quote Tool" (or your preferred name)
   - **Category**: Purchase/Sale
   - **Value**: Use different values for each conversion ✅
   - **Count**: Every conversion ✅
   - **Attribution model**: Data-driven (recommended) or your preference
9. Click **Import and continue**
10. Click **Done**

**✅ Verification**: You should see the conversion in your Conversions list with "Google Analytics (GA4)" as the source

---

## Step 4: Verify Conversion Tracking

### Test the Setup:

1. **Make a Test Purchase**:
   - Go to your quote tool and create a test quote
   - Complete the payment flow
   - You should land on the payment success page

2. **Check GA4** (within a few minutes):
   - Go to GA4 → **Reports** → **Monetization** → **Ecommerce purchases**
   - You should see your test purchase appear

3. **Check Google Ads** (24-48 hours):
   - Go to Google Ads → **Tools & Settings** → **Conversions**
   - Click on your imported conversion
   - Check the "Conversion summary" - conversions should appear after 24-48 hours

### Using Google Tag Assistant (Optional):

1. Install [Google Tag Assistant Companion](https://chrome.google.com/webstore/detail/google-tag-assistant-compa/gbceahbcgmkjkjjcdfabjclgcljfcljm) Chrome extension
2. Visit your payment success page
3. Click the extension icon
4. Verify:
   - ✅ GA4 `purchase` event fires
   - ✅ Conversion value is correct

---

## What Gets Tracked

Once set up, Google Ads will receive:
- ✅ **Conversion count**: Number of purchases
- ✅ **Conversion value**: Dollar amount of each purchase
- ✅ **Transaction ID**: For deduplication
- ✅ **Item details**: Products/services purchased
- ✅ **Customer data**: For enhanced attribution

---

## Troubleshooting

### Conversions Not Showing in Google Ads:

- **Wait 24-48 hours**: There's a delay for imported conversions
- **Check GA4**: Verify the purchase event is marked as conversion
- **Check Link Status**: Ensure GA4 and Google Ads are properly linked
- **Check Date Range**: Google Ads may only show conversions from linked date onward

### Purchase Event Not Appearing in GA4:

- **Check Implementation**: Verify `gtag('event', 'purchase', ...)` is in `payment-success.html`
- **Test Purchase**: Complete a test transaction
- **Check Real-time**: Go to GA4 → Reports → Real-time to see immediate events
- **Check Browser Console**: Look for "GA4 Purchase event tracked" log message

### Need Help?

- **GA4 Help**: [Analytics Help Center](https://support.google.com/analytics)
- **Google Ads Help**: [Ads Help Center](https://support.google.com/google-ads)
- **Conversion Import Guide**: [Import conversions from Google Analytics](https://support.google.com/google-ads/answer/7014069)

---

## Next Steps

Once conversions are flowing:

1. ✅ Set up conversion-based bidding strategies
2. ✅ Optimize campaigns based on conversion data
3. ✅ Create conversion-based audiences
4. ✅ Monitor conversion value vs. ad spend (ROAS)

---

**Status**: No code changes needed - this is all dashboard configuration! 🎉

GA4_API_SECRET=QdGP9nufSv-fn6f4rBOT4w