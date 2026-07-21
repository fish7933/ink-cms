-- 상병(질병/부상) 하선 선원에게 하선일 다음날부터 발생하는 상병급여 — 선원 급여대장
-- (crew_payslips)에는 들어가지 않고 별도로 추적하되, 매월 발생 시점의 급여대장 화면
-- 말미와 전용 관리 메뉴에서 확인/수정/종결할 수 있게 한다.
CREATE TABLE crew_sick_pay_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_member_id UUID NOT NULL REFERENCES crew_members(id),
  ship_id UUID NOT NULL REFERENCES ships(id),
  rank_id UUID REFERENCES ranks(id),
  sea_service_record_id UUID REFERENCES sea_service_records(id),
  disembark_date DATE NOT NULL,
  start_date DATE NOT NULL, -- 상병급여 청구 시작일 = 하선일 다음날
  monthly_amount NUMERIC NOT NULL DEFAULT 0, -- 상병 하선 등록 시 입력한 기준 월액(매월 항목 생성 시 기본값)
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  closed_date DATE,
  memo TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 월별 실제 청구액 — 기준 월액을 기본값으로 매월 급여대장 화면에서 필요 시 수정한다.
CREATE TABLE crew_sick_pay_monthly_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sick_pay_record_id UUID NOT NULL REFERENCES crew_sick_pay_records(id) ON DELETE CASCADE,
  year_month TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sick_pay_record_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_crew_sick_pay_records_ship ON crew_sick_pay_records(ship_id, status);
CREATE INDEX IF NOT EXISTS idx_crew_sick_pay_records_crew ON crew_sick_pay_records(crew_member_id);

ALTER TABLE crew_sick_pay_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_sick_pay_monthly_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON crew_sick_pay_records FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all" ON crew_sick_pay_monthly_entries FOR ALL USING (true) WITH CHECK (true);

-- 교대계획에서 하선 시 하선사유(sign_off_reason_id)를 이미 sea_service_records에 저장하고
-- 있었지만(SeaServiceDialog 수동 편집 화면에서만), 로테이션 플랜 실행 흐름에서는 반영되지
-- 않고 있었다 — 상병급여 자동 등록에 필요하므로 여기서 강제하는 스키마 변경은 없고
-- (컬럼은 이미 존재) 애플리케이션 코드에서 채우도록 한다.
