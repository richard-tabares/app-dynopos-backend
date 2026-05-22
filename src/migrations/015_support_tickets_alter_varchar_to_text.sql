-- Change VARCHAR columns to TEXT for unlimited length
ALTER TABLE support_tickets
  ALTER COLUMN type TYPE TEXT,
  ALTER COLUMN subject TYPE TEXT,
  ALTER COLUMN status TYPE TEXT;
