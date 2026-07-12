-- 문서유형별로 전결 기준 직급 외에, 기안 시 자동으로 참조(통보) 지정될 기본 참조부서를 설정할 수 있게 한다.
-- 예: 지출결의서는 기본적으로 총무팀을 참조부서로 지정해두면 기안할 때마다 매번 수동으로 체크할 필요가 없다.
ALTER TABLE approval_document_types ADD COLUMN IF NOT EXISTS default_cc_org_unit_ids JSONB;
