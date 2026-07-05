-- 재고용 수당 등, 급여 구성항목과 별개로 계약에 붙는 수당 체계.
-- 급여표(salary_templates/salary_template_items)와는 별도 트랙 — 이건 "계약에 딸린" 수당으로,
-- 나중에 급여 명세표 생성 시 지급항목에 추가로 얹힌다.

-- 수당 유형 (예: 재고용수당). 여러 유형을 등록할 수 있도록 범용으로 설계.
CREATE TABLE IF NOT EXISTS allowance_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 직급별 수당 기준 금액 + 기본 지급방식/지급주체 (계약에 부여할 때 기본값으로 사용, 계약별로 재정의 가능)
CREATE TABLE IF NOT EXISTS allowance_rank_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  allowance_type_id UUID REFERENCES allowance_types(id) ON DELETE CASCADE NOT NULL,
  rank_id UUID REFERENCES ranks(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  default_payment_basis TEXT NOT NULL CHECK (default_payment_basis IN ('monthly', 'lump_sum')) DEFAULT 'monthly',
  default_payment_method TEXT NOT NULL CHECK (default_payment_method IN ('ship_direct', 'owner_billed')) DEFAULT 'owner_billed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(allowance_type_id, rank_id)
);

-- 계약 건별로 실제 부여된 수당 (기준에서 복사해 오되 금액/지급방식/지급주체는 계약마다 재정의 가능)
CREATE TABLE IF NOT EXISTS crew_contract_allowances (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id UUID REFERENCES crew_contracts(id) ON DELETE CASCADE NOT NULL,
  allowance_type_id UUID REFERENCES allowance_types(id) ON DELETE RESTRICT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  payment_basis TEXT NOT NULL CHECK (payment_basis IN ('monthly', 'lump_sum')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('ship_direct', 'owner_billed')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_allowance_rank_rates_type ON allowance_rank_rates(allowance_type_id);
CREATE INDEX IF NOT EXISTS idx_contract_allowances_contract ON crew_contract_allowances(contract_id);

ALTER TABLE allowance_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowance_rank_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_contract_allowances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_allowance_types" ON allowance_types;
CREATE POLICY "allow_all_allowance_types" ON allowance_types FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_allowance_rank_rates" ON allowance_rank_rates;
CREATE POLICY "allow_all_allowance_rank_rates" ON allowance_rank_rates FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_contract_allowances" ON crew_contract_allowances;
CREATE POLICY "allow_all_contract_allowances" ON crew_contract_allowances FOR ALL USING (true);

-- 대표 예시로 재고용수당 유형을 하나 등록
INSERT INTO allowance_types (code, name, description)
VALUES ('rehire', '재고용수당', '재승선(재고용) 시 지급하는 수당 — 직급별 기준액을 매월 또는 일시불로 지급')
ON CONFLICT (code) DO NOTHING;
