-- 계약 관리 테이블
CREATE TABLE IF NOT EXISTS crew_contracts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  ship_id UUID REFERENCES ships(id) ON DELETE SET NULL,
  contract_number TEXT,
  contract_type TEXT NOT NULL CHECK (contract_type IN ('initial', 'renewal', 'extension', 'transfer')),
  rank TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  duration_months INTEGER,
  salary_amount DECIMAL(12,2),
  salary_currency TEXT DEFAULT 'USD',
  overtime_rate DECIMAL(10,2),
  leave_pay DECIMAL(10,2),
  terms_and_conditions TEXT,
  signing_port TEXT,
  repatriation_port TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'completed', 'terminated', 'renewed')) DEFAULT 'draft',
  terminated_reason TEXT,
  terminated_date DATE,
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contracts_crew ON crew_contracts(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON crew_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_dates ON crew_contracts(start_date, end_date);

ALTER TABLE crew_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_contracts" ON crew_contracts FOR ALL USING (true) WITH CHECK (true);
