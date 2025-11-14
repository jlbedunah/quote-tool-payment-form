# Dev vs Production Database Setup

## Overview
To separate dev and production data, use separate Supabase projects. The code automatically uses the correct database based on Vercel's environment variables.

## Setup Steps

### Option A: Using Vercel's Supabase Integration (Recommended)

#### 1. Connect Supabase to Vercel

1. Go to your Vercel project dashboard
2. Go to **Settings** → **Integrations**
3. Search for "Supabase" and click **Add Integration**
4. Authorize the connection
5. You can either:
   - **Create a new Supabase project** (for dev)
   - **Connect an existing Supabase project** (for production)

#### 2. Set Up Production Database

1. In Vercel → **Settings** → **Integrations** → **Supabase**
2. Connect your **production** Supabase project
3. Vercel will automatically set environment variables for **Production** environment:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`

#### 3. Set Up Dev Database

1. Create a new Supabase project for dev (either via Vercel integration or Supabase dashboard)
2. In Vercel → **Settings** → **Integrations** → **Supabase**
3. You may need to disconnect and reconnect, OR
4. Manually set environment variables for **Preview** and **Development** environments:
   - Go to **Settings** → **Environment Variables**
   - Add the dev Supabase credentials and select **Preview** and **Development** only

### Option B: Manual Setup (Alternative)

#### 1. Create Dev Supabase Project

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Click "New Project"
3. Name it something like "quote-tool-dev" or "mybookkeepers-dev"
4. Set a database password (save this!)
5. Choose a region close to you
6. Wait for the project to be created

### 2. Run Migrations on Dev Database

**Option A: Using Supabase CLI (Recommended)**

1. **Link your dev project to Supabase CLI:**
   ```bash
   supabase link --project-ref dwpohbuiangfgegefwgo
   ```
   (Replace `dwpohbuiangfgegefwgo` with your dev project's reference ID if different)
   
   You'll be prompted to:
   - Enter your database password (the one you set when creating the dev project)
   - Confirm the project

2. **Run all migrations:**
   ```bash
   supabase db push
   ```
   
   This will run all migrations in `supabase/migrations/` in order automatically.

**Option B: Using SQL Editor (Manual)**

1. In your dev Supabase project, go to **SQL Editor**
2. Run all migrations from `supabase/migrations/` in order:
   - `000_create_user_profiles_table.sql` (creates user_profiles table)
   - `001_create_products_table.sql`
   - `002_create_quotes_table.sql`
   - `003_enable_rls_and_policies.sql`
   - `004_insert_initial_products.sql`
   - `005_enable_user_profiles_rls.sql`
   - `006_update_quotes_rls_for_users.sql`
   - `007_add_user_id_to_quotes.sql`
   - `008_create_initial_admin.sql` (optional - only if you want a dev admin user)
   - `009_fix_user_profiles_rls_recursion.sql`

**Note:** The Supabase CLI connection is separate from Vercel's Supabase integration. Linking to your dev project with the CLI won't affect Vercel's connection to production.

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

### 4. Get Supabase Credentials (if not using Vercel integration)

If you're setting up manually or need to override the integration:

1. In your Supabase project, go to **Settings** → **API**
2. Copy:
   - **Project URL** (this is `SUPABASE_URL`)
   - **service_role key** (this is `SUPABASE_SERVICE_ROLE_KEY`) - **Keep this secret!**
   - **anon public key** (this is `SUPABASE_ANON_KEY`)

### 5. Configure Vercel Environment Variables

**Important:** Do NOT use `NEXT_PUBLIC_` prefix. This is not a Next.js project, and all environment variables are server-side only (accessed via API routes).

**If using Vercel Supabase Integration:**
- The integration automatically sets variables for the connected project
- You may need to manually set different values for Preview/Development if you want separate databases

**If setting up manually:**

1. Go to your Vercel project dashboard
2. Go to **Settings** → **Environment Variables**

#### For Production:
- Add/Update these variables and select **Production** only:
  - `SUPABASE_URL` = Your production Supabase project URL
  - `SUPABASE_SERVICE_ROLE_KEY` = Your production service_role key
  - `SUPABASE_ANON_KEY` = Your production anon key

#### For Preview/Development:
- Add/Update these variables with the **same names** but **different values**, and select **Preview** and **Development**:
  - `SUPABASE_URL` = Your dev Supabase project URL
  - `SUPABASE_SERVICE_ROLE_KEY` = Your dev service_role key
  - `SUPABASE_ANON_KEY` = Your dev anon key

**How it works:**
- Vercel uses the same variable names (`SUPABASE_URL`, etc.) but different values based on the deployment environment
- Production deployments automatically use Production environment variables
- Preview/Development deployments automatically use Preview/Development environment variables
- No prefix needed - Vercel handles environment separation automatically

**Note:** If you use Vercel's Supabase integration, it will set these automatically for the connected project. You can still override them manually for different environments if needed.

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

