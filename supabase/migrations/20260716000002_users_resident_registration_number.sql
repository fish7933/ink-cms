-- 직원카드 관리에서 주민등록번호를 입력/보관할 수 있도록 컬럼 추가 (급여대장/세무 신고 등
-- 내부 인사 처리 목적). 목록 화면에서는 마스킹 표시하고, 수정 다이얼로그에서만 전체 값을 다룬다.
ALTER TABLE users ADD COLUMN IF NOT EXISTS resident_registration_number TEXT;
