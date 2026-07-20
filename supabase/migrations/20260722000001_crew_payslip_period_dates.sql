ALTER TABLE crew_payslips ADD COLUMN IF NOT EXISTS period_start_date DATE;
ALTER TABLE crew_payslips ADD COLUMN IF NOT EXISTS period_end_date DATE;
