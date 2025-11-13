# Supabase Migrations

This directory contains SQL migration files for setting up the Supabase database.

## Running Migrations

### Option 1: Using Supabase SQL Editor (Recommended for Setup)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Copy and paste the contents of each migration file in order:
   - `001_create_products_table.sql`
   - `002_create_quotes_table.sql`
   - `003_enable_rls_and_policies.sql`
   - `004_insert_initial_products.sql`
5. Click **Run** to execute each migration

### Option 2: Using Supabase CLI (Advanced)

If you have the Supabase CLI installed:

```bash
# Install Supabase CLI (if not already installed)
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

## Migration Files

1. **001_create_products_table.sql**
   - Creates the `products` table
   - Adds indexes for faster queries
   - Creates trigger for auto-updating `updated_at`
   - Adds constraints for data validation

2. **002_create_quotes_table.sql**
   - Creates the `quotes` table
   - Adds indexes for faster queries
   - Creates trigger for auto-updating `updated_at`
   - Creates sequence and function for quote numbers
   - Adds constraints for data validation

3. **003_enable_rls_and_policies.sql**
   - Enables Row Level Security (RLS) on both tables
   - Creates policies for public read access to products
   - Creates policies for service_role access to all operations

4. **004_insert_initial_products.sql**
   - Inserts initial products from your existing data
   - Uses `ON CONFLICT DO NOTHING` to prevent duplicates

## Important Notes

- **Run migrations in order**: Execute the migration files in numerical order
- **Backup first**: Always backup your database before running migrations
- **Test locally**: Test migrations in a development environment first
- **RLS Policies**: The default policies allow all operations with service_role key. You may want to restrict these further in production.

## Troubleshooting

If you encounter errors:

1. **"relation already exists"**: The table already exists. You can skip that migration or drop the table first (be careful!)
2. **"permission denied"**: Check that you're using the correct database user (service_role key)
3. **"constraint violation"**: Check your data against the constraints (name length, description length, etc.)

## Next Steps

After running migrations:

1. Verify tables were created in Supabase dashboard → **Table Editor**
2. Verify RLS policies in Supabase dashboard → **Authentication** → **Policies**
3. Test the API endpoints to ensure they can read/write to the database
4. Update your API endpoints to use Supabase (see `SUPABASE_SETUP.md`)

