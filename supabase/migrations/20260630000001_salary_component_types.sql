-- Add component_type and payment_type to salary_components
ALTER TABLE salary_components
  ADD COLUMN IF NOT EXISTS component_type TEXT NOT NULL DEFAULT 'earning'
    CHECK (component_type IN ('earning', 'deduction')),
  ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'monthly'
    CHECK (payment_type IN ('monthly', 'deferred'));

-- deduction components are always monthly (payment_type doesn't apply)
-- deferred means the earning is paid after disembarkation, not monthly
