-- Remove annual_price from subscription_plans and add quarterly billing frequency

ALTER TABLE subscription_plans DROP COLUMN annual_price;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_frequency_check;
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_billing_frequency_check
  CHECK (billing_frequency IN ('monthly', 'quarterly', 'annual'));

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_transactions_billing_frequency_check;
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_billing_frequency_check
  CHECK (billing_frequency IN ('monthly', 'quarterly', 'annual'));
