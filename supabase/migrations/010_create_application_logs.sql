-- Create application_logs table for centralized logging
CREATE TABLE IF NOT EXISTS application_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Log Classification
  level VARCHAR(20) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  source VARCHAR(255) NOT NULL, -- e.g., 'lib/authorize-net-sync.js', 'api/webhook-handler.js'
  function_name VARCHAR(255), -- e.g., 'syncAuthorizeNetTransaction', 'appendNoteToContact'
  
  -- Message
  message TEXT NOT NULL,
  
  -- Context Data (JSONB for flexible searching)
  metadata JSONB DEFAULT '{}',
  -- Example metadata structure:
  -- {
  --   "email": "customer@example.com",
  --   "transactionId": "abc123",
  --   "contactId": "contact_xyz",
  --   "invoiceNumber": "INV-123",
  --   "amount": 100.00,
  --   "quoteId": "quote_123"
  -- }
  
  -- Error Details (only for errors)
  error_details JSONB,
  -- Example error_details structure:
  -- {
  --   "name": "Error",
  --   "message": "API request failed",
  --   "stack": "...",
  --   "status": 500,
  --   "statusText": "Internal Server Error",
  --   "url": "https://api.example.com/endpoint",
  --   "responseBody": "..."
  -- }
  
  -- Environment
  environment VARCHAR(50) DEFAULT 'production', -- 'production', 'preview', 'development'
  deployment_url VARCHAR(255) -- Vercel deployment URL if available
);

-- Indexes for fast searching
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON application_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON application_logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_source ON application_logs(source);
CREATE INDEX IF NOT EXISTS idx_logs_environment ON application_logs(environment);

-- B-tree indexes for JSONB text field searching (->> extracts text, use B-tree not GIN)
CREATE INDEX IF NOT EXISTS idx_logs_metadata_email ON application_logs ((metadata->>'email'));
CREATE INDEX IF NOT EXISTS idx_logs_metadata_transaction_id ON application_logs ((metadata->>'transactionId'));
CREATE INDEX IF NOT EXISTS idx_logs_metadata_contact_id ON application_logs ((metadata->>'contactId'));
CREATE INDEX IF NOT EXISTS idx_logs_metadata_quote_id ON application_logs ((metadata->>'quoteId'));

-- Full-text search on message
CREATE INDEX IF NOT EXISTS idx_logs_message_search ON application_logs USING GIN (to_tsvector('english', message));

-- Enable Row Level Security
ALTER TABLE application_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Service role can do everything (for logging)
CREATE POLICY "Application logs are accessible by service role" 
  ON application_logs FOR ALL 
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated admin users can read logs
-- Note: Uses is_admin boolean field from user_profiles table
CREATE POLICY "Application logs are viewable by admins" 
  ON application_logs FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles 
      WHERE user_profiles.id = auth.uid() 
      AND user_profiles.is_admin = TRUE
      AND user_profiles.is_active = TRUE
    )
  );

-- Function to auto-delete logs older than 90 days
-- This will run daily via a cron job or scheduled task
CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM application_logs
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Create a comment on the table
COMMENT ON TABLE application_logs IS 'Centralized application logging table. Logs are retained for 90 days.';

