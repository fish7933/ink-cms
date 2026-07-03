-- 교대지를 국가+도시로 단순화 (항구명/UN-LOCODE 제거).
-- 직접 입력한 교대지는 ports 테이블에 저장되어 항상 port_id로 참조되므로
-- port_text 자유입력 폴백 컬럼도 함께 제거한다.

ALTER TABLE ports DROP COLUMN IF EXISTS port_name;
ALTER TABLE ports DROP COLUMN IF EXISTS unlocode;

ALTER TABLE crew_rotation_plans DROP COLUMN IF EXISTS port_text;
