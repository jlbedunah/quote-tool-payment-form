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
CREATE INDEX IF NOT EXISTS idx_quotes_delivery_method ON quotes(delivery_method);

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

-- Add constraints
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check 
  CHECK (status IN ('pending', 'emailed', 'paid', 'failed', 'expired'));

ALTER TABLE quotes ADD CONSTRAINT quotes_delivery_method_check 
  CHECK (delivery_method IN ('payment_link', 'email'));

ALTER TABLE quotes ADD CONSTRAINT quotes_payment_status_check 
  CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));

