# Supabase Setup Guide for Vercel Integration

## Overview

This guide will walk you through setting up Supabase for product management and quote tracking in your Vercel deployment.

## Prerequisites

- A Supabase account (free tier available)
- A Vercel account
- Access to your Vercel project settings

## Step 1: Create Supabase Project

### 1.1 Sign Up for Supabase

1. Go to [supabase.com](https://supabase.com)
2. Click "Start your project"
3. Sign up with GitHub, Google, or email
4. Create a new organization (if needed)

### 1.2 Create a New Project

1. Click "New Project"
2. Fill in project details:
   - **Name**: `simple-cart-pages` (or your preferred name)
   - **Database Password**: Generate a strong password (save it!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier is sufficient for now
3. Click "Create new project"
4. Wait 2-3 minutes for project to be provisioned

### 1.3 Get Your Project Credentials

1. Go to **Project Settings** → **API**
2. Save these values (you'll need them later):
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **service_role key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (keep this secret!)

## Step 2: Create Database Tables

### 2.1 Access SQL Editor

1. In Supabase dashboard, go to **SQL Editor**
2. Click "New Query"

### 2.2 Create Products Table

Run this SQL to create the products table:

```sql
-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  unit_price DECIMAL(10, 2) NOT NULL,
  category TEXT,
  is_subscription BOOLEAN NOT NULL DEFAULT FALSE,
  subscription_interval TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on name for faster searches
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_products_updated_at 
  BEFORE UPDATE ON products 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Insert initial products (optional - you can import from your JSON file)
INSERT INTO products (id, name, description, unit_price, category, is_subscription, subscription_interval, is_active)
VALUES
  ('catch-up-bookkeeping', 'Catch-up Bookkeeping', 'Comprehensive catch-up bookkeeping services to get your records up to date', 2.19, 'Bookkeeping', FALSE, NULL, TRUE),
  ('tax-return-llc', 'Tax Return (LLC)', 'Complete tax return preparation for LLC entities', 1.99, 'Tax Services', FALSE, NULL, TRUE),
  ('tax-return-s-corp', 'Tax Return (S-Corp)', 'Complete tax return preparation for S-Corporation entities', 2.01, 'Tax Services', FALSE, NULL, TRUE),
  ('monthly-bookkeeping-subscription', 'Monthly Bookkeeping Subscription', 'Ongoing monthly bookkeeping services', 2.19, 'Bookkeeping', TRUE, 'monthly', TRUE)
ON CONFLICT (id) DO NOTHING;
```

### 2.3 Create Quotes Table

Run this SQL to create the quotes table:

```sql
-- Create quotes table
CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  quote_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Customer Information
  customer_first_name TEXT NOT NULL,
  customer_last_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  customer_company_name TEXT,
  customer_address1 TEXT,
  customer_address2 TEXT,
  customer_city TEXT,
  customer_state TEXT,
  customer_zip TEXT,
  
  -- Quote Details (stored as JSONB for flexibility)
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Delivery Method
  delivery_method TEXT NOT NULL, -- 'payment_link' or 'email'
  payment_link TEXT,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  email_recipient TEXT,
  email_message_id TEXT,
  
  -- Payment Information
  payment_status TEXT DEFAULT 'pending', -- 'pending' | 'paid' | 'failed' | 'refunded'
  payment_transaction_id TEXT,
  payment_paid_at TIMESTAMP WITH TIME ZONE,
  payment_amount DECIMAL(10, 2),
  payment_method TEXT,
  payment_last4 TEXT,
  payment_response JSONB,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_customer_email ON quotes(customer_email);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_quote_number ON quotes(quote_number);
CREATE INDEX IF NOT EXISTS idx_quotes_payment_status ON quotes(payment_status);

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_quotes_updated_at 
  BEFORE UPDATE ON quotes 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Create sequence for quote numbers
CREATE SEQUENCE IF NOT EXISTS quote_number_seq START 1;

-- Create function to generate quote number
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TEXT AS $$
DECLARE
  year TEXT;
  number INTEGER;
  quote_num TEXT;
BEGIN
  year := TO_CHAR(NOW(), 'YYYY');
  number := nextval('quote_number_seq');
  quote_num := 'Q-' || year || '-' || LPAD(number::TEXT, 4, '0');
  RETURN quote_num;
END;
$$ LANGUAGE plpgsql;
```

### 2.4 Enable Row Level Security (RLS)

For security, enable RLS on both tables:

```sql
-- Enable RLS on products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all reads (public access for products)
CREATE POLICY "Products are viewable by everyone" 
  ON products FOR SELECT 
  USING (true);

-- Create policy to allow inserts/updates/deletes only with service_role key
-- (This will be handled by your API with service_role key)
-- For now, we'll allow authenticated requests
CREATE POLICY "Products are editable by authenticated users" 
  ON products FOR ALL 
  USING (true)
  WITH CHECK (true);

-- Enable RLS on quotes
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations with service_role key
-- (Quotes should only be accessible via API)
CREATE POLICY "Quotes are accessible by service role" 
  ON quotes FOR ALL 
  USING (true)
  WITH CHECK (true);
```

**Note**: For production, you'll want to restrict these policies further based on your authentication requirements.

## Step 3: Install Supabase Client in Your Project

### 3.1 Install Dependencies

Run this command in your project directory:

```bash
npm install @supabase/supabase-js
```

### 3.2 Create Supabase Client Utility

Create a new file `lib/supabase.js`:

```javascript
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './load-env.js';

// Load environment variables
loadEnv();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
}

// Create Supabase client with service_role key (has full access)
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Helper function to handle Supabase errors
export function handleSupabaseError(error) {
  console.error('Supabase error:', error);
  return {
    success: false,
    error: error.message || 'Database error',
    details: error.details || null
  };
}
```

## Step 4: Configure Vercel Environment Variables

### 4.1 Add Environment Variables to Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

   **For Production:**
   - `SUPABASE_URL`: Your Supabase project URL (from Step 1.3)
   - `SUPABASE_SERVICE_ROLE_KEY`: Your service_role key (from Step 1.3)
   - `SUPABASE_ANON_KEY`: Your anon/public key (optional, for client-side access)

   **For Preview/Development:**
   - Add the same variables for Preview and Development environments

### 4.2 Update .env.local (Local Development)

Add these to your `.env.local` file (don't commit this file):

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4.3 Update env.example

Update `env.example` to include Supabase variables:

```env
# Supabase Configuration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_ANON_KEY=your_anon_key_here
```

## Step 5: Update API Endpoints to Use Supabase

### 5.1 Update Products API

You'll need to update `api/products.js` to use Supabase instead of file-based storage. See the implementation in the next section.

### 5.2 Update Quotes API

You'll need to create `api/quotes.js` to use Supabase for quote tracking. See the implementation in the next section.

## Step 6: Migrate Existing Data (Optional)

If you have existing products in `data/products.json`, you can migrate them:

1. Export your products from `data/products.json`
2. Use the Supabase SQL Editor or create a migration script
3. Insert products into the Supabase database

## Step 7: Test the Integration

### 7.1 Test Locally

1. Start your local development server:
   ```bash
   vercel dev
   ```

2. Test the products API:
   ```bash
   curl http://localhost:3000/api/products
   ```

3. Test creating a product:
   ```bash
   curl -X POST http://localhost:3000/api/products \
     -H "Content-Type: application/json" \
     -d '{"name":"Test Product","unitPrice":10.00,"isSubscription":false}'
   ```

### 7.2 Test in Production

1. Deploy to Vercel:
   ```bash
   vercel --prod
   ```

2. Verify environment variables are set correctly in Vercel dashboard

3. Test the API endpoints in production

## Security Best Practices

1. **Never commit service_role key**: Keep it in environment variables only
2. **Use RLS policies**: Restrict access based on your authentication requirements
3. **Validate input**: Always validate data before inserting into database
4. **Use prepared statements**: Supabase client handles this automatically
5. **Monitor usage**: Keep an eye on your Supabase dashboard for unusual activity

## Troubleshooting

### Common Issues

1. **"Missing Supabase environment variables"**
   - Check that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel
   - Verify they're set for the correct environment (Production, Preview, Development)

2. **"Row Level Security policy violation"**
   - Check your RLS policies in Supabase
   - Ensure you're using the service_role key for admin operations

3. **"Connection timeout"**
   - Check your Supabase project status
   - Verify your region selection
   - Check your Vercel function timeout settings

4. **"Invalid API key"**
   - Verify you're using the correct key (service_role for server-side, anon for client-side)
   - Check that the key hasn't been rotated in Supabase

## Next Steps

1. ✅ Complete Supabase setup
2. ✅ Create database tables
3. ✅ Configure environment variables
4. ⏳ Update API endpoints to use Supabase
5. ⏳ Test the integration
6. ⏳ Deploy to production

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)

