# Logging System & Admin Dashboard Plan

## Overview
Create a comprehensive logging system that:
1. Sends all logs to Supabase for persistent storage
2. Provides an admin dashboard to search and view logs
3. Sends email notifications on errors/failures

---

## Phase 1: Database Schema

### Table: `application_logs`

```sql
CREATE TABLE application_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Log Classification
  level VARCHAR(20) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  source VARCHAR(255) NOT NULL, -- e.g., 'lib/authorize-net-sync.js', 'api/webhook-handler.js'
  function_name VARCHAR(255), -- e.g., 'syncAuthorizeNetTransaction', 'appendNoteToContact'
  
  -- Message
  message TEXT NOT NULL,
  
  -- Context Data (JSONB for flexible searching)
  metadata JSONB DEFAULT '{}',
  -- Example metadata structure:
  -- {
  --   "email": "customer@example.com",
  --   "transactionId": "abc123",
  --   "contactId": "contact_xyz",
  --   "invoiceNumber": "INV-123",
  --   "amount": 100.00,
  --   "quoteId": "quote_123"
  -- }
  
  -- Error Details (only for errors)
  error_details JSONB,
  -- Example error_details structure:
  -- {
  --   "name": "Error",
  --   "message": "API request failed",
  --   "stack": "...",
  --   "status": 500,
  --   "statusText": "Internal Server Error",
  --   "url": "https://api.example.com/endpoint",
  --   "responseBody": "..."
  -- }
  
  -- Environment
  environment VARCHAR(50) DEFAULT 'production', -- 'production', 'preview', 'development'
  deployment_url VARCHAR(255), -- Vercel deployment URL if available
);

-- Indexes for fast searching
CREATE INDEX idx_logs_created_at ON application_logs(created_at DESC);
CREATE INDEX idx_logs_level ON application_logs(level);
CREATE INDEX idx_logs_source ON application_logs(source);
CREATE INDEX idx_logs_metadata_email ON application_logs USING GIN ((metadata->>'email'));
CREATE INDEX idx_logs_metadata_transaction_id ON application_logs USING GIN ((metadata->>'transactionId'));
CREATE INDEX idx_logs_metadata_contact_id ON application_logs USING GIN ((metadata->>'contactId'));
CREATE INDEX idx_logs_metadata_quote_id ON application_logs USING GIN ((metadata->>'quoteId'));
CREATE INDEX idx_logs_environment ON application_logs(environment);

-- Full-text search on message
CREATE INDEX idx_logs_message_search ON application_logs USING GIN (to_tsvector('english', message));
```

---

## Phase 2: Centralized Logging Library

### File: `lib/logger.js`

**Purpose**: Replace all `console.log/error/warn` calls with a centralized logger that:
- Writes to Supabase
- Still writes to console (for development)
- Handles errors gracefully (never breaks the app)
- Sends email notifications on errors

**Key Functions**:
```javascript
// Main logging function
export async function log(level, source, message, metadata = {}, errorDetails = null)

// Convenience functions
export async function logDebug(source, message, metadata)
export async function logInfo(source, message, metadata)
export async function logWarn(source, message, metadata)
export async function logError(source, message, metadata, error)

// Helper to extract function name from stack trace
function getFunctionName(error)
```

**Features**:
- **Async but non-blocking**: Logs are written asynchronously, but errors in logging don't break the app
- **Batch writing**: Option to batch multiple logs for performance
- **Email on errors**: Automatically sends email to jason@mybookkeepers.com when level is 'error'
- **Metadata extraction**: Automatically extracts common fields (email, transactionId, etc.) from metadata
- **Environment detection**: Automatically detects Vercel environment

**Error Email Template**:
- Subject: `[ERROR] ${source} - ${message.substring(0, 50)}`
- Body includes:
  - Timestamp
  - Source & Function
  - Error message
  - Stack trace (if available)
  - Metadata (formatted JSON)
  - Environment & Deployment URL

---

## Phase 3: Migration Strategy

### Step 1: Create Logger
- Create `lib/logger.js` with all functionality
- Test in isolation

### Step 2: Gradual Migration
Replace console calls in priority order:

**High Priority** (errors that need tracking):
1. `lib/authorize-net-sync.js` - All error logs
2. `lib/gohighlevel.js` - API errors
3. `api/webhook-handler.js` - Webhook processing errors
4. `api/send-quote-email.js` - Email sending errors

**Medium Priority** (important info logs):
5. `lib/authorize-net-sync.js` - Success logs (note appended, tags added)
6. `api/webhook-handler.js` - Webhook received logs
7. `lib/slack-notifications.js` - Notification logs

**Low Priority** (debug logs):
8. All other `console.log` calls

**Migration Pattern**:
```javascript
// Before
console.error('Failed to append note:', error);

// After
import { logError } from '../lib/logger.js';
await logError(
  'lib/authorize-net-sync.js',
  'Failed to append note to GHL contact',
  { contactId, transactionId, email },
  error
);
```

---

## Phase 4: Admin Dashboard

### File: `public/admin-logs.html`

**Features**:

1. **Search & Filter Panel** (Top of page)
   - **Date Range**: Start date / End date pickers
   - **Log Level**: Multi-select dropdown (Debug, Info, Warn, Error)
   - **Source**: Autocomplete dropdown (populated from existing sources)
   - **Email**: Text input (searches metadata.email)
   - **Transaction ID**: Text input (searches metadata.transactionId)
   - **Contact ID**: Text input (searches metadata.contactId)
   - **Quote ID**: Text input (searches metadata.quoteId)
   - **Message Search**: Full-text search on message field
   - **Environment**: Dropdown (Production, Preview, Development, All)
   - **Clear Filters** button
   - **Export Results** button (CSV/JSON)

2. **Results Table**
   - **Columns**:
     - Timestamp (human-readable: "2 hours ago", "Jan 15, 2025 3:45 PM")
     - Level (color-coded badge: 🟢 Info, 🟡 Warn, 🔴 Error, ⚪ Debug)
     - Source (truncated, full on hover)
     - Function (if available)
     - Message (truncated to 100 chars, expandable)
     - Email (from metadata, if available)
     - Transaction ID (from metadata, if available)
     - Actions (View Details button)
   
   - **Features**:
     - Pagination (50 logs per page)
     - Sortable columns
     - Row highlighting for errors
     - Responsive design (mobile-friendly)

3. **Detail Modal**
   - Opens when clicking "View Details" or a row
   - Shows:
     - Full message
     - Complete metadata (formatted JSON)
     - Error details (if error level)
     - Stack trace (if available, formatted)
     - Raw JSON view (collapsible)
   - Copy to clipboard buttons
   - Close button

4. **Statistics Dashboard** (Optional, below search panel)
   - Total logs (last 24 hours, 7 days, 30 days)
   - Error count (last 24 hours)
   - Most common sources
   - Recent errors (last 10)

**UI/UX**:
- Use Tailwind CSS (consistent with existing admin pages)
- Dark mode support (optional)
- Loading states
- Empty states ("No logs found")
- Error states ("Failed to load logs")

**API Endpoint**: `api/logs.js`
- GET `/api/logs` - Search/filter logs
  - Query params: `startDate`, `endDate`, `level[]`, `source`, `email`, `transactionId`, `contactId`, `quoteId`, `search`, `environment`, `page`, `limit`
  - Returns: `{ logs: [...], total: 100, page: 1, limit: 50 }`
- GET `/api/logs/stats` - Get statistics
  - Returns: `{ total24h, total7d, total30d, errors24h, topSources: [...] }`

---

## Phase 5: Error Email Notifications

### Implementation in `lib/logger.js`

**Email Function**:
```javascript
async function sendErrorEmail(logEntry) {
  // Only send if level is 'error'
  // Use Resend (already configured)
  // Include all error details
  // Format as HTML email
}
```

**Email Template**:
- Professional HTML email
- Includes all error context
- Links to admin dashboard (if available)
- Plain text fallback

**Rate Limiting**:
- Max 1 email per 5 minutes for same error (prevent spam)
- Track in memory or Supabase

**Configuration**:
- Email recipient: `jason@mybookkeepers.com` (hardcoded or env var)
- Can be disabled via env var: `DISABLE_ERROR_EMAILS=true`

---

## Phase 6: Security & Access Control

### Admin Page Access
- Use existing authentication system (`lib/auth-middleware.js`)
- Require admin role or specific permission
- Add to `vercel.json` rewrites if needed

### API Endpoint Security
- `api/logs.js` should require authentication
- Use same auth middleware as other admin endpoints
- Rate limiting (optional, for public endpoints)

### Database Security
- RLS policies on `application_logs` table
- Only authenticated admin users can read
- Service role can write (for logging)
- Consider log retention policy (auto-delete logs older than 90 days)

---

## Phase 7: Implementation Order

1. ✅ **Create database migration** (`supabase/migrations/010_create_application_logs.sql`)
2. ✅ **Create logger library** (`lib/logger.js`)
3. ✅ **Test logger** (unit tests or manual testing)
4. ✅ **Create API endpoint** (`api/logs.js`)
5. ✅ **Create admin dashboard** (`public/admin-logs.html`)
6. ✅ **Migrate high-priority logs** (errors in critical files)
7. ✅ **Test end-to-end** (create test logs, search, view details)
8. ✅ **Migrate medium-priority logs**
9. ✅ **Migrate low-priority logs** (optional, can be gradual)
10. ✅ **Add to navigation** (link from other admin pages)

---

## Phase 8: Testing Checklist

- [ ] Logger writes to Supabase successfully
- [ ] Logger handles Supabase failures gracefully (doesn't break app)
- [ ] Error emails are sent correctly
- [ ] Error email rate limiting works
- [ ] Admin dashboard loads logs
- [ ] All search filters work correctly
- [ ] Date range filtering works
- [ ] Pagination works
- [ ] Detail modal shows all information
- [ ] Export functionality works
- [ ] Authentication required for admin page
- [ ] Mobile responsive design works
- [ ] Performance is acceptable (large result sets)

---

## Phase 9: Future Enhancements (Optional)

1. **Log Aggregation**: Group similar errors together
2. **Alerting**: Slack notifications for critical errors
3. **Log Retention**: Auto-archive old logs
4. **Analytics**: Charts and graphs for log trends
5. **Real-time Updates**: WebSocket or polling for live log feed
6. **Log Export**: Scheduled exports to S3/Google Drive
7. **Error Tracking**: Integration with Sentry or similar
8. **Performance Monitoring**: Track slow operations

---

## Estimated Implementation Time

- **Phase 1** (Database): 30 minutes
- **Phase 2** (Logger): 2-3 hours
- **Phase 3** (Migration): 2-3 hours (gradual)
- **Phase 4** (Admin Dashboard): 4-5 hours
- **Phase 5** (Error Emails): 1 hour
- **Phase 6** (Security): 1 hour
- **Phase 7** (Testing): 2 hours

**Total**: ~12-15 hours

---

## Questions to Confirm

1. **Log Retention**: How long should logs be kept? (Recommendation: 90 days)
2. **Email Rate Limiting**: How many error emails per time period? (Recommendation: 1 per 5 minutes)
3. **Log Levels in Production**: Should we log 'debug' level in production? (Recommendation: No, only info/warn/error)
4. **Admin Access**: Should all authenticated users see logs, or only admins? (Recommendation: Only admins)
5. **Export Format**: CSV, JSON, or both? (Recommendation: Both)

---

## Next Steps

1. Review this plan
2. Confirm questions above
3. Approve to proceed with implementation
4. Start with Phase 1 (Database) and Phase 2 (Logger)

