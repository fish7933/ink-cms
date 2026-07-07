-- 계약번호를 INK_{선주사명 앞 3글자}_{최초계약일:YYYYMMDD}_{일련번호} 형태로 자동 생성한다.
-- 갱신/발령(transfer) 계약은 root_contract_id가 가리키는 최초 계약의 시작일을 기준으로 하고,
-- 최초 계약 자신은 본인의 시작일을 기준으로 한다. contract_number를 명시적으로 지정해서
-- insert하는 경우(예: 데이터 이관)에는 그 값을 그대로 쓰고 자동 생성하지 않는다.
CREATE OR REPLACE FUNCTION generate_contract_number()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_prefix TEXT;
  v_first_date DATE;
  v_serial INT;
BEGIN
  IF NEW.contract_number IS NOT NULL AND NEW.contract_number <> '' THEN
    RETURN NEW;
  END IF;

  SELECT LEFT(c.name, 3) INTO v_owner_prefix
  FROM ships s JOIN companies c ON c.id = s.owner_id
  WHERE s.id = NEW.ship_id;

  IF v_owner_prefix IS NULL OR v_owner_prefix = '' THEN
    v_owner_prefix := 'XXX';
  END IF;

  v_first_date := NULL;
  IF NEW.root_contract_id IS NOT NULL THEN
    SELECT start_date INTO v_first_date FROM crew_contracts WHERE id = NEW.root_contract_id;
  END IF;
  IF v_first_date IS NULL THEN
    v_first_date := NEW.start_date;
  END IF;

  SELECT COUNT(*) + 1 INTO v_serial
  FROM crew_contracts cc
  JOIN ships s2 ON s2.id = cc.ship_id
  JOIN companies c2 ON c2.id = s2.owner_id
  WHERE LEFT(c2.name, 3) = v_owner_prefix
    AND COALESCE(
      (SELECT r.start_date FROM crew_contracts r WHERE r.id = cc.root_contract_id),
      cc.start_date
    ) = v_first_date;

  NEW.contract_number := 'INK_' || v_owner_prefix || '_' || TO_CHAR(v_first_date, 'YYYYMMDD') || '_' || LPAD(v_serial::TEXT, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_contract_number ON crew_contracts;
CREATE TRIGGER trg_generate_contract_number
  BEFORE INSERT ON crew_contracts
  FOR EACH ROW
  EXECUTE FUNCTION generate_contract_number();
