-- Create support_tickets table for technical support requests
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  type VARCHAR(50) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own tickets"
  ON support_tickets FOR INSERT
  WITH CHECK (business_id = auth.uid());

CREATE POLICY "Users can view their own tickets"
  ON support_tickets FOR SELECT
  USING (business_id = auth.uid());
