-- 선원 급여명세 시스템 — 선박별 월 급여 회차, 회차 안의 선원별 명세서, 명세서 항목.
-- 기준 금액은 선박에 배정된 급여 템플릿(salary_templates/salary_template_items)에서,
-- 수당/공제는 선원 개인 계약(crew_contract_allowances)에서 가져와 승선일수 기준으로
-- 일할계산해 스냅샷으로 저장한다(템플릿/계약이 나중에 바뀌어도 과거 명세서는 불변).

CREATE TABLE IF NOT EXISTS crew_payroll_periods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ship_id UUID REFERENCES ships(id) NOT NULL,
  year_month TEXT NOT NULL, -- 'YYYY-MM'
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'confirmed')),
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_date DATE,
  confirmed_at TIMESTAMP WITH TIME ZONE,
  confirmed_by UUID REFERENCES users(id),
  approval_document_id UUID REFERENCES approval_documents(id) ON DELETE SET NULL,
  memo TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE (ship_id, year_month)
);

CREATE TABLE IF NOT EXISTS crew_payslips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID REFERENCES crew_payroll_periods(id) ON DELETE CASCADE NOT NULL,
  crew_member_id UUID REFERENCES crew_members(id) NOT NULL,
  embarkation_record_id UUID REFERENCES crew_embarkation_records(id),
  rank_id UUID REFERENCES ranks(id),
  rank_grade TEXT,
  days_served INT NOT NULL,
  days_in_month INT NOT NULL,
  base_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_allowance NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  memo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS crew_payslip_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payslip_id UUID REFERENCES crew_payslips(id) ON DELETE CASCADE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('template', 'contract')),
  category TEXT NOT NULL CHECK (category IN ('earning', 'deduction')),
  name TEXT NOT NULL,
  -- source='contract'이고 category='earning'(수당)일 때만 의미 있음 — owner_billed는
  -- 선주에게 별도 청구되는 금액이라 net_amount(실지급액) 합산에서 제외한다.
  payment_method TEXT CHECK (payment_method IN ('ship_direct', 'owner_billed')),
  standard_amount NUMERIC(12,2) NOT NULL, -- 일할계산 적용 전 월 기준액
  amount NUMERIC(12,2) NOT NULL,          -- 일할계산 적용 후 실제 반영 금액
  display_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_crew_payroll_periods_ship ON crew_payroll_periods(ship_id);
CREATE INDEX IF NOT EXISTS idx_crew_payslips_period ON crew_payslips(period_id);
CREATE INDEX IF NOT EXISTS idx_crew_payslips_crew ON crew_payslips(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_crew_payslip_items_payslip ON crew_payslip_items(payslip_id);

ALTER TABLE crew_payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_payslip_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_crew_payroll_periods" ON crew_payroll_periods;
CREATE POLICY "allow_all_crew_payroll_periods" ON crew_payroll_periods FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_crew_payslips" ON crew_payslips;
CREATE POLICY "allow_all_crew_payslips" ON crew_payslips FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_crew_payslip_items" ON crew_payslip_items;
CREATE POLICY "allow_all_crew_payslip_items" ON crew_payslip_items FOR ALL USING (true);
