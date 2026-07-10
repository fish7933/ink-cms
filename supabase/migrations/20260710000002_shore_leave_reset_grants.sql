-- 초기화 시 회사 부여(grant) 연차도 함께 초기화할 수 있도록 옵션 플래그 추가.
-- true인 초기화 건이 있으면, 그 시점 이전에 생성된 회사 부여 내역은 잔여 계산에서 제외한다.
ALTER TABLE shore_leave_resets ADD COLUMN IF NOT EXISTS reset_grants BOOLEAN NOT NULL DEFAULT false;
