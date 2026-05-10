-- Wompi Payment Gateway Integration
-- Tablas para manejo de suscripciones y pagos

-- 1. Pending signups: almacena datos temporalmente mientras se procesa el pago
CREATE TABLE IF NOT EXISTS pending_signups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  signup_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  business_name TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  encrypted_password TEXT NOT NULL,
  billing_frequency TEXT NOT NULL CHECK (billing_frequency IN ('monthly', 'annual')),
  payment_method TEXT CHECK (payment_method IN ('card', 'pse', 'transfer')),
  wompi_transaction_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'expired')),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pending_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view pending_signups by token"
  ON pending_signups FOR SELECT
  USING (true);

-- 2. Subscription plans: catálogo de planes disponibles
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  monthly_price NUMERIC NOT NULL,
  annual_price NUMERIC NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  features JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans"
  ON subscription_plans FOR SELECT
  USING (status = 'active');

-- Plan Emprendedor por defecto
INSERT INTO subscription_plans (name, description, monthly_price, annual_price, features)
VALUES (
  'Plan Emprendedor',
  'Perfecto para empezar tu negocio con facturación electrónica y control de inventario',
  39900,
  430920,
  '["Facturación POS", "Control de inventario", "Reportes básicos", "1 usuario", "Soporte email"]'
);

-- 3. Subscriptions: suscripciones activas (vinculadas al negocio después del pago)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id UUID REFERENCES subscription_plans(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'trial')),
  billing_frequency TEXT NOT NULL CHECK (billing_frequency IN ('monthly', 'annual')),
  current_period_start DATE NOT NULL,
  current_period_end DATE NOT NULL,
  wompi_transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (business_id = auth.uid());

-- 4. Payment transactions: historial completo de transacciones
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  pending_signup_id UUID REFERENCES pending_signups(id),
  business_id UUID REFERENCES auth.users(id),
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'COP',
  payment_method TEXT CHECK (payment_method IN ('card', 'pse', 'transfer')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'error', 'refunded')),
  billing_frequency TEXT NOT NULL CHECK (billing_frequency IN ('monthly', 'annual')),
  wompi_transaction_id TEXT,
  wompi_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON payment_transactions FOR SELECT
  USING (business_id = auth.uid());

-- Indices
CREATE INDEX IF NOT EXISTS idx_pending_signups_token ON pending_signups(signup_token);
CREATE INDEX IF NOT EXISTS idx_pending_signups_status ON pending_signups(status);
CREATE INDEX IF NOT EXISTS idx_pending_signups_expires ON pending_signups(expires_at);
CREATE INDEX IF NOT EXISTS idx_subscriptions_business ON subscriptions(business_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference ON payment_transactions(reference);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_business ON payment_transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_pending_signup ON payment_transactions(pending_signup_id);
