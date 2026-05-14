-- Recurring payments: add payment source for subscription renewals
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS wompi_payment_source_id TEXT;
