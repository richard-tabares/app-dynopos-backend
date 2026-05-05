-- Add unit_cost to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT NULL;

-- Add unit_cost to salesItems
ALTER TABLE salesItems ADD COLUMN IF NOT EXISTS unit_cost NUMERIC DEFAULT NULL;

-- Drop and recreate inventory_movements with correct types
DROP TABLE IF EXISTS inventory_movements;

CREATE TABLE inventory_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL,
  product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost NUMERIC DEFAULT NULL,
  notes TEXT,
  created_at DATE DEFAULT CURRENT_DATE
);

ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert inventory_movements"
  ON inventory_movements FOR INSERT
  WITH CHECK (business_id = auth.uid());

CREATE POLICY "Users can view inventory_movements"
  ON inventory_movements FOR SELECT
  USING (business_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_inv_mov_product ON inventory_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_mov_business ON inventory_movements(business_id, created_at DESC);
