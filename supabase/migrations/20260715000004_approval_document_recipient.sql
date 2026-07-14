-- 결재선(누가 승인하는지)/참조(누구에게 CC할지)와 별개로, 문서를 공식적으로 "수신"하는
-- 부서 개념이 시스템에 아예 없었다 — 시행문의 "수신"란이 "총무팀 (보존)"으로 하드코딩돼
-- 있었다. 문서유형별 기본 수신부서를 지정해두고, 문서마다 실제 수신부서를 고를 수 있게 한다.
ALTER TABLE approval_document_types ADD COLUMN IF NOT EXISTS default_recipient_org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL;
ALTER TABLE approval_documents ADD COLUMN IF NOT EXISTS recipient_org_unit_id UUID REFERENCES org_units(id) ON DELETE SET NULL;
