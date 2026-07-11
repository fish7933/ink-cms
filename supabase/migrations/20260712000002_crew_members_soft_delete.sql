-- 선원 삭제를 하드 삭제 대신 소프트 삭제로 전환. 삭제된 선원은 crew_members에 남아 있되
-- deleted_at이 채워지며, "삭제 선원 리스트" 탭에서 복구하거나(시스템관리자 이상은 영구 삭제) 할 수 있다.
ALTER TABLE crew_members
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_crew_members_deleted_at ON crew_members(deleted_at);
