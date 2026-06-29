-- =============================================
-- 휴가 관리 테이블
-- =============================================
CREATE TABLE IF NOT EXISTS crew_leave_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual', 'sick', 'special', 'unpaid', 'compensatory', 'maternity')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_days INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'cancelled')) DEFAULT 'draft',
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  ship_id UUID REFERENCES ships(id) ON DELETE SET NULL,
  return_date DATE,
  actual_return_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_crew ON crew_leave_requests(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON crew_leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON crew_leave_requests(start_date, end_date);

ALTER TABLE crew_leave_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_leave" ON crew_leave_requests FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 선원 평가 테이블
-- =============================================
CREATE TABLE IF NOT EXISTS crew_evaluations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  evaluation_period_start DATE NOT NULL,
  evaluation_period_end DATE NOT NULL,
  ship_id UUID REFERENCES ships(id) ON DELETE SET NULL,
  evaluator_name TEXT,
  evaluator_rank TEXT,
  professional_knowledge INTEGER CHECK (professional_knowledge BETWEEN 1 AND 5),
  work_performance INTEGER CHECK (work_performance BETWEEN 1 AND 5),
  safety_awareness INTEGER CHECK (safety_awareness BETWEEN 1 AND 5),
  teamwork INTEGER CHECK (teamwork BETWEEN 1 AND 5),
  leadership INTEGER CHECK (leadership BETWEEN 1 AND 5),
  communication INTEGER CHECK (communication BETWEEN 1 AND 5),
  discipline INTEGER CHECK (discipline BETWEEN 1 AND 5),
  reliability INTEGER CHECK (reliability BETWEEN 1 AND 5),
  overall_rating DECIMAL(3,1),
  strengths TEXT,
  areas_for_improvement TEXT,
  recommendation TEXT CHECK (recommendation IN ('highly_recommend', 'recommend', 'neutral', 'not_recommend')),
  comments TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'acknowledged')) DEFAULT 'draft',
  acknowledged_by_crew BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evaluations_crew ON crew_evaluations(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_status ON crew_evaluations(status);
CREATE INDEX IF NOT EXISTS idx_evaluations_period ON crew_evaluations(evaluation_period_start, evaluation_period_end);

ALTER TABLE crew_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_evaluations" ON crew_evaluations FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- 송금/Allotment 관리 테이블
-- =============================================
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

-- =============================================
-- 계약 관리 테이블
-- =============================================
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
