ALTER TABLE crew_payslip_items ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'immediate' CHECK (payment_type IN ('immediate', 'deferred_accrual', 'deferred_payout'));
ALTER TABLE crew_payslip_items ADD COLUMN IF NOT EXISTS accrued_to_date NUMERIC;
