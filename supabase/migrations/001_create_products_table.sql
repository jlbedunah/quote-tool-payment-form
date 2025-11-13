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

-- Add constraint to ensure name length is within Authorize.net limit (31 chars)
ALTER TABLE products ADD CONSTRAINT products_name_length CHECK (char_length(name) <= 31);

-- Add constraint to ensure description length is within Authorize.net limit (255 chars)
ALTER TABLE products ADD CONSTRAINT products_description_length CHECK (description IS NULL OR char_length(description) <= 255);

-- Add constraint to ensure subscription_interval is valid
ALTER TABLE products ADD CONSTRAINT products_subscription_interval_check 
  CHECK (
    (is_subscription = FALSE AND subscription_interval IS NULL) OR
    (is_subscription = TRUE AND subscription_interval IN ('monthly', 'quarterly', 'weekly', 'biweekly', 'annually'))
  );

