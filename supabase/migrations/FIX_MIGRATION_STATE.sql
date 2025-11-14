-- Fix migration state for dev database
-- Run this in Supabase SQL Editor if migrations partially failed

-- Step 1: Add the created_by_user_id column if it doesn't exist
ALTER TABLE quotes 
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Step 2: Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_quotes_created_by_user_id ON quotes(created_by_user_id);

-- Step 3: Drop the policy that failed (if it exists)
DROP POLICY IF EXISTS "Users can read own quotes" ON quotes;
DROP POLICY IF EXISTS "Admins can read all quotes" ON quotes;
DROP POLICY IF EXISTS "Users can create quotes" ON quotes;
DROP POLICY IF EXISTS "Admins can create quotes" ON quotes;
DROP POLICY IF EXISTS "Users can update own quotes" ON quotes;
DROP POLICY IF EXISTS "Admins can update quotes" ON quotes;
DROP POLICY IF EXISTS "Admins can delete quotes" ON quotes;

-- Step 4: Ensure RLS is enabled
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- Step 5: Drop the old policy if it exists
DROP POLICY IF EXISTS "Quotes are accessible by service role" ON quotes;

-- Step 6: Now create the user-based policies (from migration 007)
-- Policy 1: Users can read quotes they created
CREATE POLICY "Users can read own quotes"
ON quotes FOR SELECT
USING (
  created_by_user_id IS NOT NULL AND
  auth.uid() = created_by_user_id
);

-- Policy 2: Admins can read all quotes
CREATE POLICY "Admins can read all quotes"
ON quotes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  )
);

-- Policy 3: Users can create quotes (must set created_by_user_id to their user_id)
CREATE POLICY "Users can create quotes"
ON quotes FOR INSERT
WITH CHECK (
  created_by_user_id IS NOT NULL AND
  auth.uid() = created_by_user_id
);

-- Policy 4: Admins can create quotes
CREATE POLICY "Admins can create quotes"
ON quotes FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  )
);

-- Policy 5: Users can update quotes they created (if needed - optional)
CREATE POLICY "Users can update own quotes"
ON quotes FOR UPDATE
USING (
  created_by_user_id IS NOT NULL AND
  auth.uid() = created_by_user_id
)
WITH CHECK (
  created_by_user_id IS NOT NULL AND
  auth.uid() = created_by_user_id
);

-- Policy 6: Admins can update all quotes
CREATE POLICY "Admins can update quotes"
ON quotes FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  )
);

-- Policy 7: Admins can delete quotes
CREATE POLICY "Admins can delete quotes"
ON quotes FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_admin = TRUE
  )
);

-- Note: Service role key (used in API endpoints) bypasses RLS by default
-- So your API endpoints will still work for server-side operations
-- These policies control client-side/direct database access

