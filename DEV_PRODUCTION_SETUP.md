# Dev vs Production Database Setup

## Overview
To separate dev and production data, use separate Supabase projects. The code automatically uses the correct database based on Vercel's environment variables.

## Setup Steps

### 1. Create Dev Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click "New Project"
3. Name it something like "quote-tool-dev" or "mybookkeepers-dev"
4. Set a database password (save this!)
5. Choose a region close to you
6. Wait for the project to be created

### 2. Run Migrations on Dev Database

1. In your dev Supabase project, go to **SQL Editor**
2. Run all migrations from `supabase/migrations/` in order:
   - `001_create_products_table.sql`
   - `002_create_quotes_table.sql`
   - `003_enable_rls_and_policies.sql`
   - `004_insert_initial_products.sql`
   - `005_enable_user_profiles_rls.sql`
   - `006_update_quotes_rls_for_users.sql`
   - `007_add_user_id_to_quotes.sql`
   - `008_create_initial_admin.sql` (optional - only if you want a dev admin user)
   - `009_fix_user_profiles_rls_recursion.sql`

### 3. Create Admin User in Dev Database

1. In Supabase Dashboard → **Authentication** → **Users**
2. Click "Add user" → "Create new user"
3. Email: your dev email (e.g., `jason+dev@mybookkeepers.com`)
4. Password: (set a secure password)
5. Email Confirm: **true** (to skip email confirmation)
6. Click "Create user"
7. Copy the user's UUID (you'll need this)

8. In **SQL Editor**, run:
```sql
-- Replace 'USER_UUID_HERE' with the UUID from step 7
INSERT INTO user_profiles (id, first_name, last_name, email, is_admin, is_active)
VALUES (
  'USER_UUID_HERE',
  'Your',
  'Name',
  'your-dev-email@example.com',
  TRUE,
  TRUE
);
```

### 4. Get Dev Supabase Credentials

1. In your dev Supabase project, go to **Settings** → **API**
2. Copy:
   - **Project URL** (this is `SUPABASE_URL`)
   - **service_role key** (this is `SUPABASE_SERVICE_ROLE_KEY`) - **Keep this secret!**
   - **anon public key** (this is `SUPABASE_ANON_KEY`)

### 5. Configure Vercel Environment Variables

1. Go to your Vercel project dashboard
2. Go to **Settings** → **Environment Variables**

#### For Production:
- Add/Update these variables and select **Production** only:
  - `SUPABASE_URL` = Your production Supabase project URL
  - `SUPABASE_SERVICE_ROLE_KEY` = Your production service_role key
  - `SUPABASE_ANON_KEY` = Your production anon key

#### For Preview/Development:
- Add/Update these variables and select **Preview** and **Development**:
  - `SUPABASE_URL` = Your dev Supabase project URL
  - `SUPABASE_SERVICE_ROLE_KEY` = Your dev service_role key
  - `SUPABASE_ANON_KEY` = Your dev anon key

### 6. Redeploy

After setting environment variables:
1. Go to **Deployments** tab
2. Click the three dots on the latest deployment
3. Click "Redeploy"
4. Or push a new commit to trigger a new deployment

## How It Works

- **Production deployments** use the Production environment variables → Production Supabase
- **Preview/Development deployments** use the Preview/Development environment variables → Dev Supabase
- The code automatically uses the correct database based on which environment variables Vercel provides

## Verification

1. **Production**: Visit your production URL and create a quote → Check production Supabase
2. **Preview**: Create a preview deployment and create a quote → Check dev Supabase
3. Quotes should be completely separate between environments

## Notes

- Each environment has its own:
  - Users (you'll need to create users in each database)
  - Quotes
  - Products (you may want to copy products to dev)
  - Payment statuses

- The webhook handler will update quotes in whichever database the production environment is pointing to (since webhooks come to production)

- If you want to test webhooks in dev, you'd need to set up a separate webhook URL for dev (not recommended - just test in production)

