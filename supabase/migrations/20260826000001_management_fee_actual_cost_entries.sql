-- 관리비 청구항목 중 "실비(수기입력)" 항목의 건별 기록 대장.
-- 실제 청구서 샘플(승하선 비용상세 시트)을 확인해 보니, actual_cost 항목은 승선 중인 선원
-- 전원에게 매달 자동으로 발생하는 게 아니라, 그 달에 실제로 발생한 건(승선공인 인지대,
-- 비자발급비, 파나마증서 발급비 등)만 선박당 필요한 만큼 수기로 쌓이는 구조다. 그래서
-- monthly/one_time 항목처럼 승선기록 기반 자동 계산 라인(management_fee_lines)을 쓰지 않고,
-- 이 별도 테이블에 건별로 직접 기록한다.
CREATE TABLE IF NOT EXISTS management_fee_actual_cost_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID REFERENCES management_fee_periods(id) ON DELETE CASCADE NOT NULL,
  fee_item_id UUID REFERENCES management_fee_items(id) ON DELETE CASCADE NOT NULL,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE SET NULL, -- 특정 선원 건이 아니면 NULL
  currency TEXT NOT NULL DEFAULT 'USD', -- 원 화폐 단위(WON/Rp/USD 등, 기록/비고용)
  unit_price NUMERIC(14,2), -- 원 화폐 단가(기록용 — 실제 청구 계산에는 amount_usd만 사용)
  quantity NUMERIC(10,2) DEFAULT 1, -- 개수/인원(기록용)
  amount_usd NUMERIC(12,2) NOT NULL, -- 실제 청구되는 USD 환산 금액
  remark TEXT, -- 관련 선원명 등 비고
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mgmt_fee_actual_cost_entries_period ON management_fee_actual_cost_entries(period_id);
CREATE INDEX IF NOT EXISTS idx_mgmt_fee_actual_cost_entries_fee_item ON management_fee_actual_cost_entries(fee_item_id);

ALTER TABLE management_fee_actual_cost_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_management_fee_actual_cost_entries" ON management_fee_actual_cost_entries;
CREATE POLICY "allow_all_management_fee_actual_cost_entries" ON management_fee_actual_cost_entries FOR ALL USING (true);

-- 실제 청구서 샘플(1785739851917_s7b4pm 1.xlsx, KSS 해운 2026-07분)의 "승하선 비용상세" 시트에서
-- 확인된, 기존 카탈로그(대리점비/통신비/선발비/사회보장기금/신체검사비)에 없는 실비 항목들.
-- KPI/SD Fee는 샘플상 금액이 전부 0이거나 항목명만으로 용도가 불명확해, 실사용 전 담당자 확인이
-- 필요하다는 설명을 남겨둔다.
INSERT INTO management_fee_items (name, description, display_order, default_billing_basis) VALUES
  ('승선공인 인지대', '승선 시 발생하는 공인 인지대(실비, 건별 수기입력)', 6, 'actual_cost'),
  ('위험물 적재 인지대', '위험물 적재 관련 인지대(실비, 건별 수기입력)', 7, 'actual_cost'),
  ('구명정수 인지대', '구명정수 관련 인지대(실비, 건별 수기입력)', 8, 'actual_cost'),
  ('당직부원증 인지대', '당직부원증 관련 인지대(실비, 건별 수기입력)', 9, 'actual_cost'),
  ('IGF Code 인지대', 'IGF Code 관련 인지대(실비, 건별 수기입력)', 10, 'actual_cost'),
  ('하선공인 인지대', '하선 시 발생하는 공인 인지대(실비, 건별 수기입력)', 11, 'actual_cost'),
  ('사진 현상비', '선원증 등 사진 현상비(실비, 건별 수기입력)', 12, 'actual_cost'),
  ('비자발급비 (VISA)', '선원 비자 발급 비용(실비, 건별 수기입력)', 13, 'actual_cost'),
  ('파나마증서 발급비 (PANAMA)', '파나마 선원수첩/증서 발급 비용(실비, 건별 수기입력)', 14, 'actual_cost'),
  ('해사법규 교육비 (KML)', '해사법규 교육 비용(실비, 건별 수기입력)', 15, 'actual_cost'),
  ('Ecdis Type Specific Training', 'ECDIS 기종별 교육 비용(실비, 건별 수기입력)', 16, 'actual_cost'),
  ('승·하선자 핸들링비', '승/하선 인원 핸들링 비용(실비, 건별 수기입력)', 17, 'actual_cost'),
  ('하선자급여 현찰수수료 및 송금수수료', '하선자 급여 지급 관련 현찰/송금 수수료(실비, 건별 수기입력)', 18, 'actual_cost'),
  ('기타 지급(ETC)', '위 항목에 속하지 않는 기타 발생 경비(실비, 건별 수기입력)', 19, 'actual_cost'),
  ('Refund of Crew Change Expense', '승하선 경비 정산 환급(실비, 건별 수기입력 — 환급이면 음수로 기록)', 20, 'actual_cost'),
  ('KPI', '실사용 전 담당자 확인 필요(샘플상 금액 전부 0, 용도 불명확)', 21, 'actual_cost'),
  ('SD Fee', '실사용 전 담당자 확인 필요(샘플상 항목명만으로 용도 불명확)', 22, 'actual_cost')
ON CONFLICT DO NOTHING;
