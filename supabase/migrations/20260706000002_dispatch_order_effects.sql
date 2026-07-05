-- 승진/강등 발령이 결재 승인되면 계약관리에 새 계약을 생성하고, 승선경력에
-- 새 직급으로 레코드를 추가하며, 기존 승선경력은 하선사유(진급/강등)와 함께
-- 종료 처리한다.

-- 1. crew_dispatch_orders: 만료일 + 결재문서 연동 컬럼
ALTER TABLE crew_dispatch_orders
  ADD COLUMN IF NOT EXISTS expiry_date DATE,
  ADD COLUMN IF NOT EXISTS approval_document_id UUID REFERENCES approval_documents(id) ON DELETE SET NULL;

INSERT INTO approval_document_types (code, name)
VALUES ('dispatch_order', '승진/강등 발령 승인')
ON CONFLICT (code) DO NOTHING;

-- 2. 하선 사유 관리
CREATE TABLE IF NOT EXISTS sign_off_reasons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_system BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()) NOT NULL
);

INSERT INTO sign_off_reasons (name, is_system, display_order) VALUES
  ('계약만료', true, 1),
  ('자의하선', true, 2),
  ('강제하선', true, 3),
  ('상병하선', true, 4),
  ('진급', true, 5),
  ('강등', true, 6)
ON CONFLICT (name) DO NOTHING;

ALTER TABLE sign_off_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_sign_off_reasons" ON sign_off_reasons;
CREATE POLICY "allow_all_sign_off_reasons" ON sign_off_reasons FOR ALL USING (true) WITH CHECK (true);

-- 3. sea_service_records: 등급 + 하선사유 FK
ALTER TABLE sea_service_records
  ADD COLUMN IF NOT EXISTS rank_grade CHAR(1) CHECK (rank_grade IN ('A', 'B', 'C', 'D')),
  ADD COLUMN IF NOT EXISTS sign_off_reason_id UUID REFERENCES sign_off_reasons(id) ON DELETE SET NULL;

-- 4. execute_dispatch_order(): 계약 생성 + 승선경력 교체까지 확장
CREATE OR REPLACE FUNCTION execute_dispatch_order(order_id UUID)
RETURNS VOID AS $$
DECLARE
  o RECORD;
  v_new_rank_code TEXT;
  v_ship_name TEXT;
  v_open_record RECORD;
  v_reason_id UUID;
  v_prev_contract RECORD;
BEGIN
  SELECT * INTO o FROM crew_dispatch_orders WHERE id = order_id;

  IF o.status != 'approved' THEN
    RAISE EXCEPTION 'Dispatch order must be approved before execution';
  END IF;

  SELECT rank_code INTO v_new_rank_code FROM ranks WHERE id = o.new_rank_id;
  SELECT name INTO v_ship_name FROM ships WHERE id = o.ship_id;
  SELECT id INTO v_reason_id FROM sign_off_reasons
    WHERE name = (CASE WHEN o.dispatch_type = 'promotion' THEN '진급' ELSE '강등' END);

  -- crew_members 직급/Grade 업데이트
  UPDATE crew_members
  SET rank_id       = COALESCE(o.new_rank_id, rank_id),
      current_grade = COALESCE(o.new_grade, current_grade),
      updated_at    = NOW()
  WHERE id = o.crew_member_id;

  -- 현재 활성 승선기록(crew_embarkation_records)에도 반영
  IF o.ship_id IS NOT NULL THEN
    UPDATE crew_embarkation_records
    SET rank_id    = COALESCE(o.new_rank_id, rank_id),
        rank_grade = COALESCE(o.new_grade, rank_grade),
        updated_at = NOW()
    WHERE crew_member_id = o.crew_member_id
      AND ship_id = o.ship_id
      AND status = 'active';
  END IF;

  -- 기존 승선경력(진행중) 종료 처리 + 하선사유 자동 표기(진급/강등)
  SELECT * INTO v_open_record FROM sea_service_records
  WHERE crew_member_id = o.crew_member_id AND record_type = 'company_assignment' AND sign_off_date IS NULL
  ORDER BY sign_on_date DESC LIMIT 1;

  IF FOUND THEN
    UPDATE sea_service_records
    SET sign_off_date = o.effective_date,
        sign_off_reason_id = v_reason_id,
        updated_at = NOW()
    WHERE id = v_open_record.id;
  END IF;

  -- 새 승선경력 생성 (변경된 직급/등급으로), 선주사/선박관리사/매닝사 정보는 이전 기록 승계
  INSERT INTO sea_service_records (
    crew_member_id, record_type, ship_name, rank, rank_grade,
    sign_on_date, owner_company_name, ship_manager_name, manning_agency_name
  ) VALUES (
    o.crew_member_id, 'company_assignment', COALESCE(v_ship_name, v_open_record.ship_name), v_new_rank_code, o.new_grade,
    o.effective_date, v_open_record.owner_company_name, v_open_record.ship_manager_name, v_open_record.manning_agency_name
  );

  -- 기존 활성 계약(같은 선박) 종료 처리 후, 발효일~만료일로 신규 계약 생성
  SELECT * INTO v_prev_contract FROM crew_contracts
  WHERE crew_member_id = o.crew_member_id AND ship_id = o.ship_id
  ORDER BY start_date DESC LIMIT 1;

  UPDATE crew_contracts
  SET status = 'completed', updated_at = NOW()
  WHERE crew_member_id = o.crew_member_id AND ship_id = o.ship_id AND status = 'active';

  INSERT INTO crew_contracts (
    crew_member_id, ship_id, contract_type, root_contract_id, rank,
    start_date, end_date, status
  ) VALUES (
    o.crew_member_id, o.ship_id, 'transfer',
    COALESCE(v_prev_contract.root_contract_id, v_prev_contract.id), COALESCE(v_new_rank_code, ''),
    o.effective_date, COALESCE(o.expiry_date, o.effective_date), 'active'
  );

  -- 발령 완료 처리
  UPDATE crew_dispatch_orders
  SET status = 'executed', executed_at = NOW(), updated_at = NOW()
  WHERE id = order_id;
END;
$$ LANGUAGE plpgsql;
