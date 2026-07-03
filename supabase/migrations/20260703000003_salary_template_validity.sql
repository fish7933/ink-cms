-- 급여 템플릿 유효기간 + 갱신(연속 버전) 시스템
-- effective_from: 이 버전 적용 시작일
-- effective_until: NULL이면 현재 활성 버전, 값이 있으면 과거(종료된) 버전
-- root_template_id: 이 템플릿의 최초 원본 id (NULL이면 이 행 자체가 원본)

ALTER TABLE salary_templates ADD COLUMN IF NOT EXISTS effective_from DATE;
UPDATE salary_templates SET effective_from = created_at::date WHERE effective_from IS NULL;
ALTER TABLE salary_templates ALTER COLUMN effective_from SET NOT NULL;
ALTER TABLE salary_templates ALTER COLUMN effective_from SET DEFAULT CURRENT_DATE;

ALTER TABLE salary_templates ADD COLUMN IF NOT EXISTS effective_until DATE NULL;
ALTER TABLE salary_templates ADD COLUMN IF NOT EXISTS root_template_id UUID NULL
  REFERENCES salary_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_salary_templates_root ON salary_templates(root_template_id);
CREATE INDEX IF NOT EXISTS idx_salary_templates_current ON salary_templates(effective_until) WHERE effective_until IS NULL;
