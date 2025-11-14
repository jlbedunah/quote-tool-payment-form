-- Create initial admin user (Jason Bedunah)
-- IMPORTANT: This migration requires that the auth.users record exists first!
-- 
-- Steps to create initial admin:
-- 1. First, create the auth user in Supabase Dashboard:
--    - Go to Authentication → Users
--    - Click "Add user" → "Create new user"
--    - Email: jason@mybookkeepers.com
--    - Password: (set a secure password)
--    - Email Confirm: true (to skip email confirmation)
--    - Click "Create user"
--
-- 2. Then run this migration to create the profile with admin access
--
-- Note: The auth.users record must exist before this will work!
-- This migration will fail if the auth user doesn't exist.

-- Insert profile for Jason Bedunah (admin)
-- This assumes the auth.users record exists with email 'jason@mybookkeepers.com'
INSERT INTO user_profiles (id, first_name, last_name, email, is_admin, is_active)
SELECT 
  id,
  'Jason',
  'Bedunah',
  'jason@mybookkeepers.com',
  TRUE,
  TRUE
FROM auth.users
WHERE email = 'jason@mybookkeepers.com'
ON CONFLICT (id) DO UPDATE
SET 
  first_name = 'Jason',
  last_name = 'Bedunah',
  email = 'jason@mybookkeepers.com',
  is_admin = TRUE,
  is_active = TRUE;

-- Verify the admin user was created
-- Run this query after the migration to verify:
-- SELECT id, first_name, last_name, email, is_admin, is_active 
-- FROM user_profiles 
-- WHERE email = 'jason@mybookkeepers.com';

