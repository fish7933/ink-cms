-- 등급(Grade)을 A~D 고정에서 확장 가능하게 변경.
-- 급여 템플릿에서 직급별로 임의 개수의 등급(A, B, C, ...)을 정의할 수 있어야 하므로
-- 관련 컬럼들의 CHECK 제약을 제거하고 TEXT로 넓힌다.

ALTER TABLE crew_members ALTER COLUMN current_grade TYPE TEXT;
ALTER TABLE crew_members DROP CONSTRAINT IF EXISTS crew_members_current_grade_check;

ALTER TABLE crew_embarkation_records ALTER COLUMN rank_grade TYPE TEXT;
ALTER TABLE crew_embarkation_records DROP CONSTRAINT IF EXISTS crew_embarkation_records_rank_grade_check;

ALTER TABLE crew_rotation_assignments ALTER COLUMN on_rank_grade TYPE TEXT;
ALTER TABLE crew_rotation_assignments ALTER COLUMN off_rank_grade TYPE TEXT;
ALTER TABLE crew_rotation_assignments DROP CONSTRAINT IF EXISTS crew_rotation_assignments_on_rank_grade_check;
ALTER TABLE crew_rotation_assignments DROP CONSTRAINT IF EXISTS crew_rotation_assignments_off_rank_grade_check;

ALTER TABLE salary_template_items ALTER COLUMN rank_grade TYPE TEXT;
ALTER TABLE salary_template_items DROP CONSTRAINT IF EXISTS salary_template_items_rank_grade_check;

ALTER TABLE crew_dispatch_orders ALTER COLUMN previous_grade TYPE TEXT;
ALTER TABLE crew_dispatch_orders ALTER COLUMN new_grade TYPE TEXT;
ALTER TABLE crew_dispatch_orders DROP CONSTRAINT IF EXISTS crew_dispatch_orders_previous_grade_check;
ALTER TABLE crew_dispatch_orders DROP CONSTRAINT IF EXISTS crew_dispatch_orders_new_grade_check;
