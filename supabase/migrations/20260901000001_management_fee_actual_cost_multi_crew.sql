-- 실비(수기입력) 기록 하나에 여러 선원이 관련될 수 있게 한다(예: 단체 항공권처럼 여러
-- 선원이 얽힌 비용 한 건을 각자 따로 입력하지 않고 하나의 기록으로 남기는 경우).
ALTER TABLE management_fee_actual_cost_entries ADD COLUMN IF NOT EXISTS crew_member_ids UUID[] NOT NULL DEFAULT '{}';

UPDATE management_fee_actual_cost_entries
SET crew_member_ids = ARRAY[crew_member_id]
WHERE crew_member_id IS NOT NULL AND crew_member_ids = '{}';

ALTER TABLE management_fee_actual_cost_entries DROP COLUMN IF EXISTS crew_member_id;
