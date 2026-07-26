-- 공제 항목(component_type='deduction') 옵션: 승/하선으로 인한 부분월(일할계산 대상 달)에는
-- 이 항목을 공제하지 않고 0으로 처리할지 여부. 급여 구성 항목에는 의미가 없으므로 기본값 false.
ALTER TABLE salary_components
  ADD COLUMN IF NOT EXISTS skip_deduction_on_partial_month BOOLEAN NOT NULL DEFAULT false;
