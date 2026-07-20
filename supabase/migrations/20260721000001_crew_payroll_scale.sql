ALTER TABLE crew_payslips ADD COLUMN IF NOT EXISTS total_owner_billed NUMERIC NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_crew_payroll_periods_year_month ON crew_payroll_periods(year_month);
