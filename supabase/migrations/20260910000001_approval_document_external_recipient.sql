-- 지금까지 "수신부서"(recipient_org_unit_id)는 내부 조직도만 가리킬 수 있었다 — 회사 밖으로
-- 나가는 문서(타 회사/기관 앞 공문)는 받을 조직도가 시스템 안에 없으므로 자유텍스트로
-- 수신처/참조처를 적을 수 있는 외부 모드를 추가한다. 외부 문서는 내부 결재는 그대로 받되
-- 시행문에는 내부 결재란(서명란)을 노출하지 않아야 하므로 recipient_type으로 분기한다.
ALTER TABLE approval_documents ADD COLUMN IF NOT EXISTS recipient_type TEXT NOT NULL DEFAULT 'internal' CHECK (recipient_type IN ('internal', 'external'));
ALTER TABLE approval_documents ADD COLUMN IF NOT EXISTS external_recipient_text TEXT;
ALTER TABLE approval_documents ADD COLUMN IF NOT EXISTS external_reference_text TEXT;
