-- 승진/강등 발령 실행(execute_dispatch_order) 시 새로 생성되는 계약(crew_contracts)에
-- salary_amount/salary_currency가 전혀 채워지지 않아, 계약 관리 화면에 새로 부여받은
-- 직급/등급에 맞는 급여가 반영되지 않고 비어 있던 문제를 수정한다.
-- 선박(→플릿→선주사 순)에 배정된 급여템플릿에서 새 직급명 기준 항목을 찾고,
-- 등급이 있으면 그 등급 항목을, 없으면 공통(등급 없음) 항목을 사용해 합산한다.
CREATE OR REPLACE FUNCTION execute_dispatch_order(order_id UUID)
RETURNS VOID AS $$
DECLARE
  o RECORD;
  v_new_rank_code TEXT;
  v_new_rank_name TEXT;
  v_ship_name TEXT;
  v_ship_owner_id UUID;
  v_ship_fleet_id UUID;
  v_open_record RECORD;
  v_reason_id UUID;
  v_prev_contract RECORD;
  v_template_id UUID;
  v_template_currency TEXT;
  v_salary_amount NUMERIC;
BEGIN
  SELECT * INTO o FROM crew_dispatch_orders WHERE id = order_id;

  IF o.status != 'approved' THEN
    RAISE EXCEPTION 'Dispatch order must be approved before execution';
  END IF;

  SELECT rank_code, name INTO v_new_rank_code, v_new_rank_name FROM ranks WHERE id = o.new_rank_id;
  SELECT name, owner_id, fleet_id INTO v_ship_name, v_ship_owner_id, v_ship_fleet_id FROM ships WHERE id = o.ship_id;
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

  -- 새 직급명이 포함된 급여템플릿을 선박 → 플릿 → 선주사 순으로 탐색
  v_template_id := NULL;
  IF o.ship_id IS NOT NULL AND v_new_rank_name IS NOT NULL THEN
    SELECT sa.template_id INTO v_template_id
    FROM ship_salary_assignments sa
    JOIN salary_template_items sti ON sti.template_id = sa.template_id AND sti.rank = v_new_rank_name
    WHERE sa.ship_id = o.ship_id
    LIMIT 1;

    IF v_template_id IS NULL AND v_ship_fleet_id IS NOT NULL THEN
      SELECT fa.template_id INTO v_template_id
      FROM fleet_salary_assignments fa
      JOIN salary_template_items sti ON sti.template_id = fa.template_id AND sti.rank = v_new_rank_name
      WHERE fa.fleet_id = v_ship_fleet_id
      LIMIT 1;
    END IF;

    IF v_template_id IS NULL AND v_ship_owner_id IS NOT NULL THEN
      SELECT oa.template_id INTO v_template_id
      FROM owner_salary_assignments oa
      JOIN salary_template_items sti ON sti.template_id = oa.template_id AND sti.rank = v_new_rank_name
      WHERE oa.owner_id = v_ship_owner_id
      LIMIT 1;
    END IF;
  END IF;

  v_salary_amount := NULL;
  v_template_currency := NULL;
  IF v_template_id IS NOT NULL THEN
    SELECT currency INTO v_template_currency FROM salary_templates WHERE id = v_template_id;

    SELECT SUM(picked.amount) INTO v_salary_amount FROM (
      SELECT DISTINCT ON (sti.component_id) sti.amount
      FROM salary_template_items sti
      WHERE sti.template_id = v_template_id
        AND sti.rank = v_new_rank_name
        AND (sti.rank_grade IS NULL OR sti.rank_grade = o.new_grade)
      ORDER BY sti.component_id, (sti.rank_grade = o.new_grade) DESC NULLS LAST
    ) picked;
  END IF;

  INSERT INTO crew_contracts (
    crew_member_id, ship_id, contract_type, root_contract_id, rank,
    start_date, end_date, status, salary_amount, salary_currency
  ) VALUES (
    o.crew_member_id, o.ship_id, 'transfer',
    COALESCE(v_prev_contract.root_contract_id, v_prev_contract.id), COALESCE(v_new_rank_code, ''),
    o.effective_date, COALESCE(o.expiry_date, o.effective_date), 'active',
    COALESCE(v_salary_amount, v_prev_contract.salary_amount),
    COALESCE(v_template_currency, v_prev_contract.salary_currency, 'USD')
  );

  UPDATE crew_dispatch_orders
  SET status = 'executed', executed_at = NOW(), updated_at = NOW()
  WHERE id = order_id;
END;
$$ LANGUAGE plpgsql;
