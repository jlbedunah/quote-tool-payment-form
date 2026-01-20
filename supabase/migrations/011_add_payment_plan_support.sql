-- Migration: Add payment plan support to quotes
-- This enables splitting a total amount into equal monthly installments

-- ============================================
-- 1. Add payment plan fields to quotes table
-- ============================================

-- Whether this quote uses a payment plan
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS is_payment_plan BOOLEAN DEFAULT false;

-- Total amount to be paid across all installments
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_plan_total_amount DECIMAL(10, 2);

-- Number of installments (e.g., 3 for 3 monthly payments)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_plan_installments INTEGER;

-- Amount per installment (calculated)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_plan_installment_amount DECIMAL(10, 2);

-- Number of payments completed so far (0, 1, 2, 3...)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_plan_completed_payments INTEGER DEFAULT 0;

-- Authorize.net ARB subscription ID for recurring payments
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_plan_subscription_id TEXT;

-- Payment plan status: pending, active, completed, cancelled, suspended
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment_plan_status TEXT DEFAULT 'pending';

-- Add constraint for valid payment plan status values
ALTER TABLE quotes ADD CONSTRAINT quotes_payment_plan_status_check
  CHECK (payment_plan_status IS NULL OR payment_plan_status IN ('pending', 'active', 'completed', 'cancelled', 'suspended'));

-- Index for efficient payment plan queries
CREATE INDEX IF NOT EXISTS idx_quotes_is_payment_plan ON quotes(is_payment_plan) WHERE is_payment_plan = true;
CREATE INDEX IF NOT EXISTS idx_quotes_payment_plan_subscription_id ON quotes(payment_plan_subscription_id) WHERE payment_plan_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_payment_plan_status ON quotes(payment_plan_status);

-- ============================================
-- 2. Create payment_plan_payments tracking table
-- ============================================

CREATE TABLE IF NOT EXISTS payment_plan_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to the quote
  quote_id TEXT NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,

  -- Payment sequence: 1, 2, 3, etc.
  payment_number INTEGER NOT NULL,

  -- Total number of installments (denormalized for easy display)
  total_payments INTEGER NOT NULL,

  -- Amount for this payment
  amount DECIMAL(10, 2) NOT NULL,

  -- Status: pending, paid, failed, retrying
  status TEXT NOT NULL DEFAULT 'pending',

  -- Authorize.net transaction ID when paid
  transaction_id TEXT,

  -- Subscription payment ID from Authorize.net webhook
  subscription_payment_id TEXT,

  -- When this payment was completed
  paid_at TIMESTAMP WITH TIME ZONE,

  -- When this payment failed (if applicable)
  failed_at TIMESTAMP WITH TIME ZONE,

  -- Number of retry attempts
  retry_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Additional metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  -- Constraints
  CONSTRAINT payment_plan_payments_status_check
    CHECK (status IN ('pending', 'paid', 'failed', 'retrying')),

  -- Each quote can only have one payment for each payment number
  CONSTRAINT payment_plan_payments_unique_payment
    UNIQUE (quote_id, payment_number)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_payment_plan_payments_quote_id ON payment_plan_payments(quote_id);
CREATE INDEX IF NOT EXISTS idx_payment_plan_payments_status ON payment_plan_payments(status);
CREATE INDEX IF NOT EXISTS idx_payment_plan_payments_transaction_id ON payment_plan_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_plan_payments_subscription_payment_id ON payment_plan_payments(subscription_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_plan_payments_paid_at ON payment_plan_payments(paid_at);

-- Trigger for auto-updating updated_at
CREATE TRIGGER update_payment_plan_payments_updated_at
  BEFORE UPDATE ON payment_plan_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 3. Row Level Security (RLS) for payment_plan_payments
-- ============================================

-- Enable RLS
ALTER TABLE payment_plan_payments ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for API operations)
CREATE POLICY "Service role full access to payment_plan_payments"
  ON payment_plan_payments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated users can view payments for quotes they created
CREATE POLICY "Users can view own quote payments"
  ON payment_plan_payments
  FOR SELECT
  TO authenticated
  USING (
    quote_id IN (
      SELECT id FROM quotes
      WHERE created_by_user_id = auth.uid()
    )
  );

-- Admins can view all payments
CREATE POLICY "Admins can view all payments"
  ON payment_plan_payments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- ============================================
-- 4. Comments for documentation
-- ============================================

COMMENT ON COLUMN quotes.is_payment_plan IS 'True if this quote uses a payment plan instead of single payment';
COMMENT ON COLUMN quotes.payment_plan_total_amount IS 'Total amount to be paid across all installments';
COMMENT ON COLUMN quotes.payment_plan_installments IS 'Number of monthly payments (e.g., 3 for 3-month plan)';
COMMENT ON COLUMN quotes.payment_plan_installment_amount IS 'Amount per installment (may vary for first payment due to rounding)';
COMMENT ON COLUMN quotes.payment_plan_completed_payments IS 'Number of payments successfully completed';
COMMENT ON COLUMN quotes.payment_plan_subscription_id IS 'Authorize.net ARB subscription ID for recurring payments';
COMMENT ON COLUMN quotes.payment_plan_status IS 'Payment plan status: pending, active, completed, cancelled, suspended';

COMMENT ON TABLE payment_plan_payments IS 'Tracks individual payment plan installments';
COMMENT ON COLUMN payment_plan_payments.payment_number IS 'Sequence number: 1 = first payment, 2 = second, etc.';
COMMENT ON COLUMN payment_plan_payments.status IS 'Payment status: pending (scheduled), paid (completed), failed, retrying';
