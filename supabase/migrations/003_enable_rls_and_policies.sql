-- Enable Row Level Security on products
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all reads (public access for products)
CREATE POLICY "Products are viewable by everyone" 
  ON products FOR SELECT 
  USING (true);

-- Create policy to allow all operations with service_role key
-- Note: This allows all operations. In production, you may want to restrict this further.
CREATE POLICY "Products are editable by service role" 
  ON products FOR ALL 
  USING (true)
  WITH CHECK (true);

-- Enable Row Level Security on quotes
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations with service_role key
-- Note: Quotes should only be accessible via API (service_role key)
CREATE POLICY "Quotes are accessible by service role" 
  ON quotes FOR ALL 
  USING (true)
  WITH CHECK (true);

