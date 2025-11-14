-- Add created_by_user_id column to quotes table to track who created each quote
ALTER TABLE quotes 
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_quotes_created_by_user_id ON quotes(created_by_user_id);

-- Update existing quotes to set created_by_user_id to NULL (for historical quotes)
-- This is safe since foreign key allows NULL
-- Historical quotes will show as created by "Unknown" or "System"

