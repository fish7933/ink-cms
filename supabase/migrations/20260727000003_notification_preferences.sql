-- 결재 알림(Web Push)을 종류별로 켜고 끌 수 있게 하는 개인 설정. 둘 다 기본값 true(기존 동작
-- 유지) — 알림을 아예 켠 사용자는 두 종류 다 받다가, 필요하면 개별로 끌 수 있다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_approval_request BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_approval_complete BOOLEAN NOT NULL DEFAULT true;
