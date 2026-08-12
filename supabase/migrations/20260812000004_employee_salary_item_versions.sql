-- 직원별 급여표 갱신(선원 급여 템플릿의 effective_from/effective_until/버전 이력과 동일한 로직):
-- 급여 인상 등으로 항목/금액을 바꿀 때 기존 값을 덮어쓰는 대신 새 유효기간 버전을 만들고,
-- 이전 버전은 이력으로 남긴다.
ALTER TABLE employee_salary_items ADD COLUMN IF NOT EXISTS effective_from DATE;
ALTER TABLE employee_salary_items ADD COLUMN IF NOT EXISTS effective_until DATE;
ALTER TABLE employee_salary_items ADD COLUMN IF NOT EXISTS version_group_id UUID;

-- 기존 데이터 백필: 사용자별로 하나의 버전 그룹으로 묶고, 현행 버전은 2026-01-01부터 적용된 것으로 본다.
WITH user_groups AS (
  SELECT DISTINCT user_id, gen_random_uuid() AS gid FROM employee_salary_items WHERE version_group_id IS NULL
)
UPDATE employee_salary_items e
SET version_group_id = ug.gid, effective_from = '2026-01-01'
FROM user_groups ug
WHERE e.user_id = ug.user_id AND e.version_group_id IS NULL;

ALTER TABLE employee_salary_items ALTER COLUMN effective_from SET NOT NULL;
ALTER TABLE employee_salary_items ALTER COLUMN version_group_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS employee_salary_items_version_idx ON employee_salary_items(user_id, version_group_id);
