-- Fix infinite recursion in user_profiles RLS policies
-- The issue: Policies check admin status by querying user_profiles, which triggers RLS again
-- Solution: Create a security definer function that bypasses RLS to check admin status

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Admins can read all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can insert profiles" ON user_profiles;
DROP POLICY IF EXISTS "Admins can delete profiles" ON user_profiles;

-- Create a security definer function to check if current user is admin
-- This function bypasses RLS, so it won't cause recursion
CREATE OR REPLACE FUNCTION is_admin_user()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND is_admin = TRUE AND is_active = TRUE
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION is_admin_user() TO authenticated;

-- Recreate policies using the function (no recursion!)
-- Policy 1: Users can read their own profile (already exists, but keeping for clarity)
-- This policy already exists, so we don't need to recreate it

-- Policy 2: Admins can read all profiles
CREATE POLICY "Admins can read all profiles"
ON user_profiles FOR SELECT
USING (is_admin_user());

-- Policy 3: Admins can update profiles
CREATE POLICY "Admins can update profiles"
ON user_profiles FOR UPDATE
USING (is_admin_user())
WITH CHECK (is_admin_user());

-- Policy 4: Admins can insert profiles
CREATE POLICY "Admins can insert profiles"
ON user_profiles FOR INSERT
WITH CHECK (is_admin_user());

-- Policy 5: Admins can delete profiles (with safeguard to prevent deleting the last admin)
CREATE POLICY "Admins can delete profiles"
ON user_profiles FOR DELETE
USING (
  is_admin_user()
  AND (
    -- Prevent deleting if this is the last admin
    NOT (
      is_admin = TRUE AND
      (SELECT COUNT(*) FROM user_profiles WHERE is_admin = TRUE AND is_active = TRUE) <= 1
    )
  )
);

-- Note: The "Users can read own profile" policy should remain as is
-- It doesn't cause recursion because it only checks auth.uid() = id

