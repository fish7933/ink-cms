-- 선원 카드 화면에서 이메일/연락처는 필수 입력이 아닌데 컬럼은 NOT NULL이라
-- 두 항목을 비워두면 저장이 실패하던 문제 수정.
ALTER TABLE crew_members ALTER COLUMN email DROP NOT NULL;
ALTER TABLE crew_members ALTER COLUMN phone DROP NOT NULL;
