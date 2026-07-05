-- 계약 갱신 이력을 하나의 사슬로 추적하기 위한 컬럼.
-- NULL이면 이 행 자체가 최초 계약. 값이 있으면 그 값이 가리키는 계약이 최초 계약이며,
-- 이 행은 그 계약의 갱신분이다 (salary_templates.root_template_id와 동일한 패턴).
ALTER TABLE crew_contracts
  ADD COLUMN IF NOT EXISTS root_contract_id UUID REFERENCES crew_contracts(id) ON DELETE SET NULL;
