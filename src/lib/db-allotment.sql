-- 송금/Allotment 관리 테이블
CREATE TABLE IF NOT EXISTS crew_allotments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  ship_id UUID REFERENCES ships(id) ON DELETE SET NULL,
  allotment_type TEXT NOT NULL CHECK (allotment_type IN ('monthly', 'bonus', 'one_time', 'advance')),
  beneficiary_name TEXT NOT NULL,
  beneficiary_relationship TEXT,
  bank_name TEXT NOT NULL,
  bank_branch TEXT,
  account_number TEXT NOT NULL,
  swift_code TEXT,
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  percentage_of_salary DECIMAL(5,2),
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS crew_remittances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  allotment_id UUID REFERENCES crew_allotments(id) ON DELETE CASCADE NOT NULL,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  remittance_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  exchange_rate DECIMAL(10,4),
  local_amount DECIMAL(12,2),
  local_currency TEXT,
  transaction_reference TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_allotments_crew ON crew_allotments(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_allotments_active ON crew_allotments(is_active);
CREATE INDEX IF NOT EXISTS idx_remittances_crew ON crew_remittances(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_remittances_date ON crew_remittances(remittance_date);

ALTER TABLE crew_allotments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_remittances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_allotments" ON crew_allotments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_remittances" ON crew_remittances FOR ALL USING (true) WITH CHECK (true);
