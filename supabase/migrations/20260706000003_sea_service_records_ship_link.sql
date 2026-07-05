-- 회사 배치(company_assignment) 승선경력은 실제 등록된 선박을 참조할 수 있어야
-- 선주사/선박관리사/매닝사, 직급/등급을 매번 자유입력하지 않고 실제 데이터
-- (ships, 급여템플릿)에서 가져와 채울 수 있다.
ALTER TABLE sea_service_records
  ADD COLUMN IF NOT EXISTS ship_id UUID REFERENCES ships(id) ON DELETE SET NULL;

-- execute_dispatch_order()가 생성하는 신규 승선경력에도 선박 참조를 남긴다.
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

  UPDATE crew_members
  SET rank_id       = COALESCE(o.new_rank_id, rank_id),
      current_grade = COALESCE(o.new_grade, current_grade),
      updated_at    = NOW()
  WHERE id = o.crew_member_id;

  IF o.ship_id IS NOT NULL THEN
    UPDATE crew_embarkation_records
    SET rank_id    = COALESCE(o.new_rank_id, rank_id),
        rank_grade = COALESCE(o.new_grade, rank_grade),
        updated_at = NOW()
    WHERE crew_member_id = o.crew_member_id
      AND ship_id = o.ship_id
      AND status = 'active';
  END IF;

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

  INSERT INTO sea_service_records (
    crew_member_id, record_type, ship_id, ship_name, rank, rank_grade,
    sign_on_date, owner_company_name, ship_manager_name, manning_agency_name
  ) VALUES (
    o.crew_member_id, 'company_assignment', o.ship_id, COALESCE(v_ship_name, v_open_record.ship_name), v_new_rank_code, o.new_grade,
    o.effective_date, v_open_record.owner_company_name, v_open_record.ship_manager_name, v_open_record.manning_agency_name
  );

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

  UPDATE crew_dispatch_orders
  SET status = 'executed', executed_at = NOW(), updated_at = NOW()
  WHERE id = order_id;
END;
$$ LANGUAGE plpgsql;
