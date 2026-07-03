-- salary_template_items의 UNIQUE(template_id, component_id, rank) 제약에 rank_grade가 빠져있어서
-- 한 직급에 등급을 2개 이상 추가하면(같은 rank, 다른 rank_grade) INSERT가 제약 위반으로 실패했다.
-- updateSalaryTemplate()는 기존 항목을 먼저 삭제하고 재삽입하는 구조라, 삽입 실패 시 롤백 없이
-- 기존 데이터가 그대로 삭제된 채 남는 심각한 데이터 유실 버그로 이어졌다.
-- rank_grade를 유니크 키에 포함시켜 등급별로 별개 행이 되도록 수정한다.

ALTER TABLE salary_template_items DROP CONSTRAINT IF EXISTS salary_template_items_template_id_component_id_rank_key;
ALTER TABLE salary_template_items ADD CONSTRAINT salary_template_items_template_component_rank_grade_key
  UNIQUE (template_id, component_id, rank, rank_grade);
