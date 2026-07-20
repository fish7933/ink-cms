-- 수당(allowance) 체계를 공제(deduction)까지 포괄하도록 일반화한다. 새 테이블을 따로 만들지
-- 않고 기존 allowance_types/crew_contract_allowances에 kind를 추가 — 구조가 사실상 동일하고
-- (직급별 기준 금액 + 계약별 재정의) 아직 데이터가 거의 없어 마이그레이션 위험이 낮다.
ALTER TABLE allowance_types
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'allowance' CHECK (kind IN ('allowance', 'deduction'));

ALTER TABLE crew_contract_allowances
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'allowance' CHECK (kind IN ('allowance', 'deduction'));

CREATE INDEX IF NOT EXISTS idx_allowance_types_kind ON allowance_types(kind);
CREATE INDEX IF NOT EXISTS idx_contract_allowances_kind ON crew_contract_allowances(kind);
