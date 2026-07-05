-- 교대 발령(교대계획) 삭제 시 삭제자/삭제일시를 기록할 수 있도록 소프트 삭제 컬럼 추가.
-- 실행 완료(executed)된 발령까지 삭제 가능하게 열어주되, 완전히 지워버리면 누가 언제
-- 지웠는지 알 수 없으므로 하드 삭제 대신 deleted_at/deleted_by만 채우고 목록에서 제외한다.
ALTER TABLE crew_rotation_plans
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
