# Next Tasks

This document outlines the tasks that need to be completed to finish the Supabase integration and quote tracking system.

## Phase 1: Supabase Setup (User Tasks)

### 1. Complete Supabase Setup
- [ ] Create Supabase project at [supabase.com](https://supabase.com)
- [ ] Get credentials (Project URL, service_role key, anon key) from Settings → API
- [ ] Run database migrations in Supabase SQL Editor:
  - [ ] `supabase/migrations/001_create_products_table.sql`
  - [ ] `supabase/migrations/002_create_quotes_table.sql`
  - [ ] `supabase/migrations/003_enable_rls_and_policies.sql`
  - [ ] `supabase/migrations/004_insert_initial_products.sql`
- [ ] Verify tables created in Supabase Table Editor

### 2. Configure Environment Variables
- [ ] Set Vercel environment variables (Settings → Environment Variables):
  - [ ] `SUPABASE_URL` (Production, Preview, Development)
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` (Production, Preview, Development)
  - [ ] `SUPABASE_ANON_KEY` (Production, Preview, Development)
- [ ] Create/update `.env.local` file with Supabase credentials
- [ ] Verify `.env.local` is in `.gitignore`

### 3. Test Supabase Integration
- [ ] Start local dev server: `vercel dev`
- [ ] Test products API: `curl http://localhost:3000/api/products`
- [ ] Verify products are returned from Supabase
- [ ] Test creating a product via API
- [ ] Verify product appears in Supabase dashboard

## Phase 2: Update API Endpoints (Development Tasks)

### 4. Update Products API
- [ ] Update `api/products.js` to use Supabase instead of file-based storage
- [ ] Implement Supabase read operations (GET /api/products)
- [ ] Implement Supabase write operations (POST, PUT, DELETE /api/products)
- [ ] Add error handling for Supabase operations
- [ ] Add fallback to file-based storage if Supabase is not configured
- [ ] Test all CRUD operations

### 5. Create Quotes API
- [ ] Create `api/quotes.js` for quote tracking
- [ ] Implement POST /api/quotes (create quote)
- [ ] Implement GET /api/quotes (list quotes with filters)
- [ ] Implement GET /api/quotes/:id (get specific quote)
- [ ] Implement PUT /api/quotes/:id (update quote)
- [ ] Implement GET /api/quotes/stats (get statistics)
- [ ] Add quote ID generation utility
- [ ] Add quote number generation (sequential)
- [ ] Test all quote operations

## Phase 3: Tracking Integration (Development Tasks)

### 6. Update Quote Tool
- [ ] Update `quote-tool.html` to track quote generation
- [ ] Add quote tracking when "Pay Now" is clicked
- [ ] Add quote tracking when "Send Quote via Email" is clicked
- [ ] Generate quote ID before redirect/email
- [ ] Store quote data in Supabase
- [ ] Handle errors gracefully
- [ ] Test quote generation tracking

### 7. Update Email Handler
- [ ] Update `api/send-quote-email.js` to track email sends
- [ ] Accept `quoteId` in request body
- [ ] Update quote record after successful email send
- [ ] Store email message ID and recipient
- [ ] Update quote status to "emailed"
- [ ] Test email tracking

### 8. Update Payment Handler
- [ ] Update `api/process-payment-server.js` to track payments
- [ ] Accept `quoteId` in request body (or match by email)
- [ ] Update quote record after successful payment
- [ ] Store transaction ID and payment details
- [ ] Update quote status to "paid"
- [ ] Update payment status and amounts
- [ ] Test payment tracking

## Phase 4: Admin Dashboard (Development Tasks)

### 9. Create Quotes Admin Dashboard
- [ ] Create `admin-quotes.html` page
- [ ] Implement quote list table
- [ ] Add status badges (pending, emailed, paid, failed)
- [ ] Add filters (status, date range, customer email)
- [ ] Add search functionality
- [ ] Add pagination
- [ ] Implement quote detail modal
- [ ] Add statistics dashboard
- [ ] Test admin dashboard

### 10. Add Statistics
- [ ] Implement GET /api/quotes/stats endpoint
- [ ] Calculate total quotes count
- [ ] Calculate pending/emailed/paid/failed counts
- [ ] Calculate total revenue
- [ ] Calculate conversion rate
- [ ] Calculate average quote value
- [ ] Display statistics in admin dashboard
- [ ] Test statistics endpoint

## Phase 5: Testing & Refinement (Testing Tasks)

### 11. Test Product Management
- [ ] Test product creation via admin-products.html
- [ ] Test product updates via admin-products.html
- [ ] Test product deletion via admin-products.html
- [ ] Verify products appear in quote tool
- [ ] Verify products are stored in Supabase

### 12. Test Quote Tracking
- [ ] Test quote generation flow end-to-end
- [ ] Test email tracking integration
- [ ] Test payment tracking integration
- [ ] Verify quotes appear in admin dashboard
- [ ] Verify quote status updates correctly
- [ ] Test quote statistics

### 13. Test Admin Dashboards
- [ ] Test admin-products.html with Supabase
- [ ] Test admin-quotes.html with real data
- [ ] Test filters and search
- [ ] Test quote detail modal
- [ ] Test statistics dashboard
- [ ] Verify data accuracy

## Phase 6: Security & Production (Security Tasks)

### 14. Review Security
- [ ] Review RLS policies in Supabase
- [ ] Tighten RLS policies for production
- [ ] Verify service_role key is only used server-side
- [ ] Verify anon key is not exposed
- [ ] Review environment variable security
- [ ] Add rate limiting if needed

### 15. Add Authentication
- [ ] Add authentication to admin-products.html
- [ ] Add authentication to admin-quotes.html
- [ ] Implement API key authentication (or OAuth)
- [ ] Add Vercel password protection (optional)
- [ ] Test authentication flow
- [ ] Secure admin endpoints

## Phase 7: Documentation & Deployment (Documentation Tasks)

### 16. Update Documentation
- [ ] Update README.md with Supabase setup
- [ ] Update ADMIN_PRODUCTS_SETUP.md with Supabase instructions
- [ ] Create QUOTE_TRACKING_SETUP.md guide
- [ ] Document API endpoints
- [ ] Document database schema
- [ ] Add troubleshooting guide

### 17. Deploy to Production
- [ ] Verify all environment variables are set in Vercel
- [ ] Test production API endpoints
- [ ] Test production admin dashboards
- [ ] Verify Supabase connection in production
- [ ] Monitor for errors
- [ ] Test end-to-end flow in production

## Priority Order

1. **Phase 1** (User Tasks) - Must be completed first
2. **Phase 2** (API Updates) - Can be done in parallel with Phase 1
3. **Phase 3** (Tracking Integration) - After Phase 2
4. **Phase 4** (Admin Dashboard) - After Phase 3
5. **Phase 5** (Testing) - After Phase 4
6. **Phase 6** (Security) - Before production deployment
7. **Phase 7** (Documentation) - Ongoing

## Notes

- **Supabase Setup** must be completed before API endpoints can be updated
- **API Endpoints** can be developed with fallback to file-based storage
- **Tracking Integration** depends on Quotes API being ready
- **Admin Dashboard** depends on Quotes API being ready
- **Security** should be reviewed before production deployment
- **Testing** should be done at each phase

## Resources

- [Supabase Setup Guide](./SUPABASE_SETUP.md)
- [Supabase Quick Start](./SUPABASE_QUICK_START.md)
- [Supabase Setup Summary](./SUPABASE_SETUP_SUMMARY.md)
- [Quote Tracking Plan](./QUOTE_TRACKING_PLAN.md)
- [Admin Products Setup](./ADMIN_PRODUCTS_SETUP.md)

## Status

- ✅ Documentation created
- ✅ Migration files created
- ✅ Supabase client utility created
- ✅ Environment variables template updated
- ⏳ Waiting for Supabase setup completion
- ⏳ API endpoints need to be updated
- ⏳ Tracking integration needs to be implemented
- ⏳ Admin dashboard needs to be created

