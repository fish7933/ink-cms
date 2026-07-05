-- 결재선은 특정 회사 소유가 아니라 내부적으로 모든 결재 건에 공통 적용되는 경우가 있어
-- (예: admin이 만드는 전사 공통 결재선), company_id를 NULL 허용으로 변경한다.
-- NULL company_id는 "전체 회사 공통" 결재선을 의미하며, 조회 시 특정 회사 소유 결재선과
-- 함께 노출된다.

ALTER TABLE approval_lines
  ALTER COLUMN company_id DROP NOT NULL;
