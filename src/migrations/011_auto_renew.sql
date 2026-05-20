-- Auto-renew toggle: separate subscription status from auto-renewal preference
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN DEFAULT true;
