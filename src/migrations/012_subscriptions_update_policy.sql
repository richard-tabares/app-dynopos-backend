-- Allow users to update their own subscription (needed for auto_renew toggle)
CREATE POLICY "Users can update own subscription"
  ON subscriptions FOR UPDATE
  USING (business_id = auth.uid());
