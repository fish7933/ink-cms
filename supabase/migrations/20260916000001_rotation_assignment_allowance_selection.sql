-- 수당 지급 조건 판정 결과를 발령 실행 시점이 아니라 결재 상신 시점에 저장해두기 위한 컬럼 —
-- 결재자가 승인 화면에서 어떤 수당이 적용될지 미리 보고 승인할 수 있게 하기 위함이다.
-- NULL = 아직 결정된 적 없음(이 기능 이전에 만들어진 계획 포함) — 실행 시점에 기존처럼
-- 조건 충족 항목만 자동 반영하는 하위호환 기본값으로 취급한다.
ALTER TABLE crew_rotation_assignments ADD COLUMN IF NOT EXISTS selected_allowance_item_ids UUID[];
