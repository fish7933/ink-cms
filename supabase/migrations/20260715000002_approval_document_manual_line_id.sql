-- 기안 시 전결규정 자동계산 대신 결재선 관리의 특정 라인을 직접 골라 쓴 경우, 그 라인을
-- 기억해둔다. 반려된 문서를 다시 상신할 때 이 값이 있으면 재상신 화면에서 "결재선 관리의
-- 라인 사용" 체크박스가 기본으로 체크되고 그 라인이 자동 선택되게 하기 위함 — 체크를
-- 해제하면 조직도 기준 자동계산 결재라인으로 전환할 수 있다.
ALTER TABLE approval_documents ADD COLUMN IF NOT EXISTS manual_line_id UUID REFERENCES approval_lines(id) ON DELETE SET NULL;
