-- Insert initial products
-- This will only insert if they don't already exist (ON CONFLICT DO NOTHING)

INSERT INTO products (id, name, description, unit_price, category, is_subscription, subscription_interval, is_active)
VALUES
  (
    'catch-up-bookkeeping',
    'Catch-up Bookkeeping',
    'Comprehensive catch-up bookkeeping services to get your records up to date',
    2.19,
    'Bookkeeping',
    FALSE,
    NULL,
    TRUE
  ),
  (
    'tax-return-llc',
    'Tax Return (LLC)',
    'Complete tax return preparation for LLC entities',
    1.99,
    'Tax Services',
    FALSE,
    NULL,
    TRUE
  ),
  (
    'tax-return-s-corp',
    'Tax Return (S-Corp)',
    'Complete tax return preparation for S-Corporation entities',
    2.01,
    'Tax Services',
    FALSE,
    NULL,
    TRUE
  ),
  (
    'monthly-bookkeeping-subscription',
    'Monthly Bookkeeping Subscription',
    'Ongoing monthly bookkeeping services',
    2.19,
    'Bookkeeping',
    TRUE,
    'monthly',
    TRUE
  )
ON CONFLICT (id) DO NOTHING;

