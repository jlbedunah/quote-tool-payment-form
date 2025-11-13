# Supabase Quick Start Guide

## Step-by-Step Setup Instructions

Follow these steps to connect Supabase with your Vercel project for products and quote tracking.

## Step 1: Create Supabase Account & Project (5 minutes)

1. Go to [supabase.com](https://supabase.com) and sign up
2. Click **"New Project"**
3. Fill in:
   - **Name**: `simple-cart-pages` (or your choice)
   - **Database Password**: Generate strong password (SAVE THIS!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier is fine
4. Click **"Create new project"**
5. Wait 2-3 minutes for provisioning

## Step 2: Get Your Supabase Credentials (2 minutes)

1. In Supabase dashboard, go to **Settings** → **API**
2. Copy these values:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **service_role key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` ⚠️ **Keep this secret!**

## Step 3: Create Database Tables (5 minutes)

1. In Supabase dashboard, go to **SQL Editor**
2. Click **"New Query"**
3. Copy and paste each migration file in order:
   
   **First Migration** (`001_create_products_table.sql`):
   ```sql
   -- Copy contents from supabase/migrations/001_create_products_table.sql
   ```
   Click **Run**
   
   **Second Migration** (`002_create_quotes_table.sql`):
   ```sql
   -- Copy contents from supabase/migrations/002_create_quotes_table.sql
   ```
   Click **Run**
   
   **Third Migration** (`003_enable_rls_and_policies.sql`):
   ```sql
   -- Copy contents from supabase/migrations/003_enable_rls_and_policies.sql
   ```
   Click **Run**
   
   **Fourth Migration** (`004_insert_initial_products.sql`):
   ```sql
   -- Copy contents from supabase/migrations/004_insert_initial_products.sql
   ```
   Click **Run**

4. Verify tables were created:
   - Go to **Table Editor** in Supabase dashboard
   - You should see `products` and `quotes` tables

## Step 4: Configure Vercel Environment Variables (3 minutes)

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add these variables for **Production**:

   ```
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

4. Repeat for **Preview** and **Development** environments

## Step 5: Configure Local Development (2 minutes)

1. Create/update `.env.local` file in your project root:
   ```env
   SUPABASE_URL=https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

2. Verify `.env.local` is in `.gitignore` (it should be)

## Step 6: Test the Integration (5 minutes)

1. Start local development server:
   ```bash
   vercel dev
   ```

2. Test products API:
   ```bash
   curl http://localhost:3000/api/products
   ```
   
   You should see your products returned from Supabase!

3. Test creating a product:
   ```bash
   curl -X POST http://localhost:3000/api/products \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test Product",
       "unitPrice": 10.00,
       "isSubscription": false
     }'
   ```

4. Verify in Supabase:
   - Go to **Table Editor** → **products**
   - You should see the new product

## Step 7: Deploy to Production (2 minutes)

1. Commit your changes:
   ```bash
   git add .
   git commit -m "Add Supabase integration"
   git push
   ```

2. Vercel will automatically deploy
3. Verify environment variables are set in Vercel dashboard
4. Test production API:
   ```bash
   curl https://your-domain.vercel.app/api/products
   ```

## Verification Checklist

- [ ] Supabase project created
- [ ] Credentials copied (URL, service_role key, anon key)
- [ ] Database tables created (products, quotes)
- [ ] Initial products inserted
- [ ] Environment variables set in Vercel (all environments)
- [ ] Local `.env.local` file created
- [ ] Local testing successful
- [ ] Production deployment successful
- [ ] Production API tested

## Next Steps

After completing the setup:

1. ✅ Update `api/products.js` to use Supabase (see implementation guide)
2. ✅ Create `api/quotes.js` for quote tracking (see implementation guide)
3. ✅ Update quote tool to track quotes
4. ✅ Update email handler to track email sends
5. ✅ Update payment handler to track payments
6. ✅ Create admin quotes dashboard

## Troubleshooting

### "Missing Supabase environment variables"
- Check that variables are set in Vercel dashboard
- Verify they're set for the correct environment
- Restart your local dev server after updating `.env.local`

### "Row Level Security policy violation"
- Check that you're using `service_role` key (not `anon` key)
- Verify RLS policies are set correctly in Supabase

### "Connection timeout"
- Check Supabase project status
- Verify region selection
- Check Vercel function timeout settings

### "Table does not exist"
- Verify migrations were run successfully
- Check Supabase dashboard → Table Editor
- Re-run migrations if needed

## Security Reminders

- ⚠️ **Never commit** `SUPABASE_SERVICE_ROLE_KEY` to git
- ⚠️ **Never share** `SUPABASE_SERVICE_ROLE_KEY` publicly
- ✅ Use environment variables for all credentials
- ✅ Use `service_role` key only in server-side code (API endpoints)
- ✅ Use `anon` key only in client-side code (if needed)

## Additional Resources

- [Full Setup Guide](./SUPABASE_SETUP.md) - Detailed documentation
- [Migration Files](./supabase/migrations/) - SQL migration files
- [Supabase Documentation](https://supabase.com/docs)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

## Need Help?

1. Check the [Full Setup Guide](./SUPABASE_SETUP.md) for detailed instructions
2. Review the [Migration Files](./supabase/migrations/README.md) for SQL setup
3. Check Supabase dashboard logs for errors
4. Check Vercel function logs for API errors

