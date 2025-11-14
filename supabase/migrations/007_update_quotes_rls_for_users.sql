-- First, ensure RLS is enabled on quotes table
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- Drop existing overly permissive policies if they exist
-- (We'll replace them with user-based policies)
DROP POLICY IF EXISTS "Quotes are accessible by service role" ON quotes;

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

