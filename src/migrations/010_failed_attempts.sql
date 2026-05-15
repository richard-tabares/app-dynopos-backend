-- Grace period: track failed renewal attempts before expiring subscription
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0;
