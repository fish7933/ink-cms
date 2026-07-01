-- 선원 사용자 계정 ↔ crew_members 레코드 연결
-- 선원이 시스템에 로그인하면 자신의 인사/이력/교육/고과 데이터에 접근할 수 있도록

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS crew_member_id UUID REFERENCES crew_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_crew_member_id ON users(crew_member_id);

COMMENT ON COLUMN users.crew_member_id IS '선원 사용자 계정과 crew_members 레코드 연결 (1:1). 선원이 직접 자신의 채용/이력/교육/고과를 조회할 때 사용';
