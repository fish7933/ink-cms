-- 관리비 계산 결과 스냅샷 — 선원 급여명세(crew_payroll_periods/crew_payslips)와 동일하게
-- "선박×월" 단위 회차를 만들고, 그 안에 선원×청구항목별 계산 라인을 스냅샷으로 저장한다
-- (나중에 템플릿이 바뀌어도 과거 계산 결과는 불변). 아직 청구서 발행/결재 기능은 없으므로
-- status는 'draft' 하나만 두고, 승인/확정 상태 확장은 향후 청구서 기능을 붙일 때 별도
-- 마이그레이션으로 추가한다.

CREATE TABLE IF NOT EXISTS management_fee_periods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ship_id UUID REFERENCES ships(id) ON DELETE CASCADE NOT NULL,
  year_month TEXT NOT NULL, -- 'YYYY-MM'
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE (ship_id, year_month)
);

CREATE TABLE IF NOT EXISTS management_fee_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID REFERENCES management_fee_periods(id) ON DELETE CASCADE NOT NULL,
  embarkation_record_id UUID REFERENCES crew_embarkation_records(id) ON DELETE CASCADE NOT NULL,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE NOT NULL,
  rank_id UUID REFERENCES ranks(id) ON DELETE SET NULL,
  fee_item_id UUID REFERENCES management_fee_items(id) ON DELETE CASCADE NOT NULL,
  template_item_id UUID REFERENCES management_fee_template_items(id) ON DELETE SET NULL, -- 실제로 매칭된 템플릿 행
  billing_basis TEXT NOT NULL CHECK (billing_basis IN ('monthly', 'one_time', 'actual_cost')),
  period_start_date DATE, -- monthly만 사용, one_time/actual_cost는 NULL
  period_end_date DATE,
  days_served INTEGER,
  days_in_month INTEGER,
  standard_amount NUMERIC(12,2), -- 일할계산 전 기준액 (actual_cost는 NULL)
  amount NUMERIC(12,2), -- 계산된 실제 금액 (actual_cost는 NULL — 청구서 작성 시 수기 입력 대상)
  currency TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 상한(cap)이 걸린 청구항목만 한 행씩 — 상한 없는 항목은 management_fee_lines 합계가 곧
-- 청구액이라 별도 저장할 필요가 없다. currency까지 그룹 키에 넣는 이유는, 같은 항목이라도
-- 국적별로 통화가 다르면(예: 사회보장기금 IDR vs MMK) 환율 변환 없이 합산할 수 없어 통화별로
-- 별도 상한 그룹으로 취급하기 때문이다.
CREATE TABLE IF NOT EXISTS management_fee_ship_item_caps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID REFERENCES management_fee_periods(id) ON DELETE CASCADE NOT NULL,
  fee_item_id UUID REFERENCES management_fee_items(id) ON DELETE CASCADE NOT NULL,
  currency TEXT NOT NULL,
  cap_amount NUMERIC(12,2) NOT NULL,
  raw_total NUMERIC(12,2) NOT NULL, -- 상한 적용 전 전 선원 합계
  billed_total NUMERIC(12,2) NOT NULL, -- MIN(raw_total, cap_amount) — 실제 청구될 금액
  was_capped BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (period_id, fee_item_id, currency)
);

CREATE INDEX IF NOT EXISTS idx_management_fee_periods_ship ON management_fee_periods(ship_id);
CREATE INDEX IF NOT EXISTS idx_management_fee_lines_period ON management_fee_lines(period_id);
CREATE INDEX IF NOT EXISTS idx_management_fee_lines_crew ON management_fee_lines(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_management_fee_lines_fee_item ON management_fee_lines(fee_item_id);
CREATE INDEX IF NOT EXISTS idx_management_fee_ship_item_caps_period ON management_fee_ship_item_caps(period_id);

ALTER TABLE management_fee_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE management_fee_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE management_fee_ship_item_caps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_management_fee_periods" ON management_fee_periods;
CREATE POLICY "allow_all_management_fee_periods" ON management_fee_periods FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_management_fee_lines" ON management_fee_lines;
CREATE POLICY "allow_all_management_fee_lines" ON management_fee_lines FOR ALL USING (true);
DROP POLICY IF EXISTS "allow_all_management_fee_ship_item_caps" ON management_fee_ship_item_caps;
CREATE POLICY "allow_all_management_fee_ship_item_caps" ON management_fee_ship_item_caps FOR ALL USING (true);
